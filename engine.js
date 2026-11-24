// Pose analysis engine: MediaPipe Pose (full) in the browser, serve detection, metrics.
import { FilesetResolver, PoseLandmarker } from './vision_bundle.mjs';
import { L } from './i18n.js';

export const EDGES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
let fileset = null, landmarker = null, TS = 0;

const idbOpen = () => new Promise((res, rej) => {
  const r = indexedDB.open('serve-coach-models', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('m');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function idbGet(k) { const db = await idbOpen(); return new Promise((res, rej) => { const q = db.transaction('m').objectStore('m').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbSet(k, v) { const db = await idbOpen(); return new Promise((res, rej) => { const t = db.transaction('m', 'readwrite'); t.objectStore('m').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }

// ---- engine loading with visible progress ----
const WASM_BYTES = 14665716, MODEL_BYTES = 9398198;
export const engineState = { phase: 'idle', loaded: 0, total: WASM_BYTES + MODEL_BYTES, error: null, t: Date.now() };
const subs = new Set();
export function onEngine(fn) { subs.add(fn); fn(engineState); return () => subs.delete(fn); }
function emit(patch) { Object.assign(engineState, patch, { t: Date.now() }); subs.forEach(f => { try { f(engineState); } catch {} }); }

async function fetchBytes(url, base) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split('/').pop()}`);
  if (!r.body || !r.body.getReader) { const u = new Uint8Array(await r.arrayBuffer()); emit({ loaded: base + u.length }); return u; }
  const rd = r.body.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; emit({ loaded: base + n }); }
  const u = new Uint8Array(n); let o = 0; for (const p of parts) { u.set(p, o); o += p.length; } return u;
}
async function modelBytes(base) {
  const KEY = 'pose_full_v1';
  try { const hit = await idbGet(KEY); if (hit) { emit({ loaded: base + MODEL_BYTES }); return hit; } } catch {}
  let u;
  try { u = await fetchBytes(new URL('models/pose_landmarker_full.task', location.href).href, base); }
  catch { // artifact hosting cannot serve .task; fall back to base64 copy
    const txt = new TextDecoder().decode(await fetchBytes(new URL('models/pose_landmarker_full.b64.txt', location.href).href, base));
    const bin = atob(txt.trim()); u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  }
  try { await idbSet(KEY, u); } catch {}
  return u;
}

let loading = null;
export function loadEngine() { return loading || (loading = _load().catch(e => { loading = null; emit({ phase: 'error', error: e.message || String(e) }); throw e; })); }
async function _load() {
  if (landmarker) return landmarker;
  emit({ phase: 'download', loaded: 0, error: null });
  // warm the HTTP/service-worker cache for the wasm so MediaPipe's own fetch is instant, with progress
  let warm = false; try { warm = localStorage.getItem('sc_wasm_v1') === '1'; } catch {}
  if (!warm) { await fetchBytes(new URL('wasm/vision_wasm_internal.wasm', location.href).href, 0); try { localStorage.setItem('sc_wasm_v1', '1'); } catch {} }
  else emit({ loaded: WASM_BYTES });
  const buf = await modelBytes(WASM_BYTES);
  emit({ phase: 'init', loaded: engineState.total });
  fileset = fileset || await FilesetResolver.forVisionTasks(new URL('wasm', location.href).href);
  try {
    landmarker = await PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: buf, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 });
  } catch {
    landmarker = await PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: buf, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1 });
  }
  emit({ phase: 'ready' });
  return landmarker;
}

export function seek(v, t) {
  return new Promise(res => {
    let done = false; const fin = () => { if (!done) { done = true; v.removeEventListener('seeked', fin); res(); } };
    v.addEventListener('seeked', fin); v.currentTime = t;
    setTimeout(fin, 2000); // never hang on a missed seeked event
  });
}

export function ang(p, a, b, c) {
  const A = p[a], B = p[b], C = p[c];
  if (!A || !B || !C) return NaN;
  const ux = A.x - B.x, uy = A.y - B.y, vx = C.x - B.x, vy = C.y - B.y;
  const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) + 1e-9);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}
const vis = (p, i, t = 0.5) => p && p[i] && p[i].v >= t;
function rollMed(x, w) {
  return x.map((_, i) => { const s = x.slice(Math.max(0, i - (w >> 1)), i + (w >> 1) + 1).filter(v => !isNaN(v)).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; });
}
const median = a => { const s = a.filter(v => !isNaN(v)).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; };

// Create the video element synchronously inside the user gesture (iOS needs this), then wait until frames are decodable.
export function makeVideo(file) {
  const v = document.createElement('video');
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', '');
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none';
  document.body.appendChild(v);
  v.src = URL.createObjectURL(file);
  v.load();
  return v;
}
export async function openVideo(v, timeoutMs = 20000) {
  if (v.readyState >= 2) return v;
  await new Promise((res, rej) => {
    let done = false; const ok = () => { if (!done) { done = true; res(); } };
    v.addEventListener('loadeddata', ok, { once: true });
    v.addEventListener('canplay', ok, { once: true });
    v.addEventListener('error', () => { if (!done) { done = true; rej(new Error(L('動画を開けません(形式未対応の可能性)', '영상을 열 수 없어요(지원하지 않는 형식일 수 있어요)'))); } }, { once: true });
    // iOS Safari may not decode until playback starts: a muted inline play/pause forces it
    v.addEventListener('loadedmetadata', () => { const p = v.play(); if (p && p.then) p.then(() => { v.pause(); ok(); }).catch(() => {}); }, { once: true });
    setTimeout(() => { if (!done) { done = true; rej(new Error(L('動画の読み込みが止まりました。別の動画で試すか、ページを再読み込みしてください。', '영상 불러오기가 멈췄어요. 다른 영상으로 해 보거나 페이지를 새로고침해 주세요.'))); } }, timeoutMs);
  });
  v.pause();
  // recordings made in the browser can report an unknown length: jumping far ahead makes the browser work it out
  if (!Number.isFinite(v.duration)) {
    await new Promise(res => { const fin = () => { v.removeEventListener('durationchange', chk); res(); }, chk = () => { if (Number.isFinite(v.duration)) fin(); }; v.addEventListener('durationchange', chk); v.currentTime = 1e7; setTimeout(fin, 4000); });
    await seek(v, 0);
  }
  if (!Number.isFinite(v.duration) || !(v.duration > 0)) throw new Error(L('動画の長さを読み取れませんでした。「動画を選ぶ」から撮影した動画でお試しください。', '영상 길이를 읽지 못했어요. 「영상 고르기」로 찍은 영상으로 해 보세요.'));
  return v;
}

// Live camera frame → landmarks in 0..1 picture coordinates (shares the timestamp clock with the offline analysis).
export function detectLive(video) {
  if (!landmarker || !video.videoWidth) return null;
  TS = Math.max(TS + 1, Math.round(performance.now()));
  try { const r = landmarker.detectForVideo(video, TS); return r.landmarks && r.landmarks[0] ? r.landmarks[0].map(q => ({ x: q.x, y: q.y, v: q.visibility ?? 1 })) : null; } catch { return null; }
}

// Run pose on every frame. Returns per-frame landmark arrays (pixel coords + visibility).
export async function trackPose(video, fps, onProgress) {
  const det = landmarker;
  const dur = video.duration, n = Math.floor(dur * fps), W = video.videoWidth, H = video.videoHeight;
  const frames = []; let found = 0;
  for (let i = 0; i < n; i++) {
    await seek(video, Math.min(dur - 0.001, (i + 0.5) / fps));
    TS += Math.round(1000 / fps);
    const r = det.detectForVideo(video, TS);
    const p = r.landmarks && r.landmarks[0] ? r.landmarks[0].map(q => ({ x: q.x * W, y: q.y * H, v: q.visibility ?? 1 })) : null;
    if (p) found++;
    frames.push(p);
    if (i % 6 === 0) { onProgress && onProgress(i / n); await new Promise(r => setTimeout(r)); }
  }
  return { frames, n, W, H, fps, dur, detectRate: n ? found / n : 0 };
}

// Serve detection (v3) + per-serve metrics.
// hand: 'r' | 'l' from the profile (toss arm = the other arm). Times are video time, so slow-motion clips are flagged.
const len2 = (p, a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
const pct = (a, q) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : NaN; };
export function findServes(t, hand = 'r') {
  const { frames, n, fps } = t;
  const leg = (p, h, k, a) => p && vis(p, h, .6) && vis(p, k, .6) && vis(p, a, .6) ? ang(p, h, k, a) : NaN;
  // knee: mean of both legs, drop only wild values (>25° off a 9-frame median), light 3-frame median so a fast bend keeps its bottom
  let knee = frames.map(p => { const l = leg(p, 23, 25, 27), r = leg(p, 24, 26, 28); return isNaN(l) ? r : isNaN(r) ? l : (l + r) / 2; });
  const med9 = rollMed(knee, 9); knee = knee.map((v, i) => Math.abs(v - med9[i]) > 25 ? NaN : v); knee = rollMed(knee, 3);
  const shY = frames.map(p => p ? (p[11].y + p[12].y) / 2 : NaN), hipY = frames.map(p => p ? (p[23].y + p[24].y) / 2 : NaN);
  const torso = median(frames.map((p, i) => hipY[i] - shY[i]));
  const bodyH = median(frames.map(p => p && vis(p, 0) && vis(p, 27) && vis(p, 28) ? ((p[27].y + p[28].y) / 2 - p[0].y) * 1.08 : NaN));
  const wh = w => frames.map((p, i) => p && vis(p, w) ? (shY[i] - p[w].y) / torso : NaN);
  const lw = wh(15), rw = wh(16);
  const cnt = a => a.filter(v => v > 0.3).length;
  // toss arm: the profile decides; the video overrules it only when the other arm is clearly up far more often
  let leftToss = hand !== 'l', swapped = false;
  const cT = cnt(leftToss ? lw : rw), cO = cnt(leftToss ? rw : lw);
  if (cO >= 2 * Math.max(cT, 3)) { leftToss = !leftToss; swapped = true; }
  const th = leftToss ? lw : rw, tossW = leftToss ? 15 : 16, tossS = leftToss ? 11 : 12, tossE = leftToss ? 13 : 14;
  const racket = leftToss ? [12, 14, 16] : [11, 13, 15];
  const armLen = pct(frames.map(p => p && vis(p, tossS) && vis(p, tossE) && vis(p, tossW) ? len2(p, tossS, tossE) + len2(p, tossE, tossW) : NaN), 0.9);
  const high = th.map(v => v > 0.3);
  const gap = Math.max(1, Math.round(0.15 * fps)), minLen = 0.2 * fps;
  const serves = [];
  for (let i = 0; i < n; i++) {
    if (!high[i]) continue;
    let j = i;
    for (;;) { let k = 0; for (let g = 1; g <= gap && j + g < n; g++) if (high[j + g]) k = g; if (!k) break; j += k; }
    if (j - i >= minLen) {
      let tro = -1, km = Infinity, peakF = i, peak = -9;
      for (let f = i; f <= j; f++) if (th[f] > peak) { peak = th[f]; peakF = f; }
      // trophy = deepest knee while the toss arm is up (from just before the toss peak to the end of the toss)
      for (let f = Math.max(i, peakF - Math.round(0.25 * fps)); f <= j; f++) if (knee[f] < km) { km = knee[f]; tro = f; }
      if (tro < 0) tro = peakF;
      // near-top time: how long the toss hand stays within 80% of its highest point
      let a = peakF, b = peakF; while (a > i && th[a - 1] >= 0.8 * peak) a--; while (b < j && (th[b + 1] >= 0.8 * peak || (b + 2 <= j && th[b + 2] >= 0.8 * peak))) b++;
      serves.push({ toss: i, end: j, tro, peakF, top: (b - a + 1) / fps });
    }
    i = j;
  }
  // slow-motion clips stretch every duration: a toss arm that stays up > 2.5 s (video time) is not real time
  const slow = median(serves.map(s => (s.end - s.toss) / fps)) > 2.5;
  const ratio = median(frames.map((p, i) => p && vis(p, 11) && vis(p, 12) ? Math.abs(p[11].x - p[12].x) / torso : NaN));
  // hitting direction, once per video: hips travel forward after each serve + the face points forward at the toss peak
  let vote = 0; const B = bodyH || 1;
  for (const s of serves) {
    const p = frames[s.tro], pe = frames[Math.min(n - 1, s.end + Math.round(0.6 * fps))], pk = frames[s.peakF];
    if (p && pe && vis(p, 23) && vis(p, 24) && vis(pe, 23) && vis(pe, 24)) { const d = ((pe[23].x + pe[24].x) - (p[23].x + p[24].x)) / 2 / B; if (Math.abs(d) > 0.03) vote += Math.sign(d); }
    if (pk && vis(pk, 0) && vis(pk, 7) && vis(pk, 8)) { const d = (pk[0].x - (pk[7].x + pk[8].x) / 2) / B; if (Math.abs(d) > 0.01) vote += Math.sign(d) * 0.8; }
  }
  let dirSure = vote !== 0;
  if (!dirSure) for (const s of serves) { const pk = frames[s.peakF]; if (pk && vis(pk, tossW) && vis(pk, 11) && vis(pk, 12)) vote += Math.sign(pk[tossW].x - (pk[11].x + pk[12].x) / 2); }
  const dir = Math.sign(vote) || 1;
  // side-view check: seen from the side the hips move clearly across the picture after the hit
  const travel = median(serves.map(s => { const p = frames[s.tro], pe = frames[Math.min(n - 1, s.end + Math.round(0.6 * fps))]; return p && pe ? Math.abs((pe[23].x + pe[24].x) - (p[23].x + p[24].x)) / 2 / B : NaN; }));
  const view = dirSure && !(travel < 0.04) ? 'side' : 'unsure';
  const ctx = { kind: 'serve', knee, bodyH, tossW, tossS, tossE, racket, leftToss, swapped, torso, armLen, view, ratio, dir, dirSure, slow };
  serves.forEach(s => Object.assign(s, measure(t, ctx, s)));
  return { serves, ctx, knee, view };
}

export function measure(t, ctx, s) {
  const { frames } = t;
  const p = frames[s.tro], pk = frames[s.peakF], dir = ctx.dir;
  // trophy knee: lowest value within ±1 frame of the chosen frame (already lightly smoothed)
  const kn = [ctx.knee[s.tro - 1], ctx.knee[s.tro], ctx.knee[s.tro + 1]].filter(Number.isFinite);
  const knee = kn.length ? Math.min(...kn) : NaN;
  const elbow = p && ctx.racket.every(q => vis(p, q)) ? ang(p, ...ctx.racket) : NaN;
  // toss reach: how far above the shoulder the toss hand gets, as a share of the arm's length (1 = straight up)
  const tossH = pk && vis(pk, ctx.tossW) && vis(pk, ctx.tossS) && ctx.armLen > 0 ? Math.min(1, (pk[ctx.tossS].y - pk[ctx.tossW].y) / ctx.armLen) : NaN;
  // toss position: toss hand at its highest point vs the front ankle, along the hitting direction (+ = in front), in body heights
  let tossPos = NaN;
  if (ctx.dirSure && pk && vis(pk, ctx.tossW) && vis(pk, 27, 0.3) && vis(pk, 28, 0.3) && ctx.bodyH > 0) {
    const front = dir > 0 ? Math.max(pk[27].x, pk[28].x) : Math.min(pk[27].x, pk[28].x);
    tossPos = (pk[ctx.tossW].x - front) * dir / ctx.bodyH;
  }
  const hold = ctx.slow ? NaN : s.top;
  return { knee, elbow, tossH, tossPos, hold, dir };
}

// Approximate frames for the six phases of one serve (ready, release, trophy, racket drop, impact, follow-through).
export function phaseFrames(t, ctx, s) {
  const f = t.fps, n = t.n - 1, cl = x => Math.max(0, Math.min(n, Math.round(x)));
  // impact: racket hand at its highest between the trophy and shortly after the toss arm comes down
  let imp = cl(s.end + 0.05 * f), best = Infinity; const rw = ctx.racket[2];
  for (let i = s.tro; i <= cl(s.end + 0.4 * f); i++) { const p = t.frames[i]; if (p && vis(p, rw) && p[rw].y < best) { best = p[rw].y; imp = i; } }
  if (imp <= s.tro) imp = cl(s.end + 0.05 * f);
  return [cl(s.toss - 0.5 * f), cl(s.toss), s.tro, cl((s.tro + imp) / 2), imp, cl(imp + 0.45 * f)];
}

// ---------- ground strokes (forehand / backhand), side view ----------
// One stroke = one fast forward swing of the racket hand. Key frames: tb (hand furthest back), c (fastest forward moment ≈ contact), fin (hand highest after contact).
function kneeSeries(frames) {
  const leg = (p, h, k, a) => p && vis(p, h, .6) && vis(p, k, .6) && vis(p, a, .6) ? ang(p, h, k, a) : NaN;
  let knee = frames.map(p => { const l = leg(p, 23, 25, 27), r = leg(p, 24, 26, 28); return isNaN(l) ? r : isNaN(r) ? l : (l + r) / 2; });
  const med9 = rollMed(knee, 9); knee = knee.map((v, i) => Math.abs(v - med9[i]) > 25 ? NaN : v); return rollMed(knee, 3);
}
export function findStrokes(t, hand = 'r', kind = 'forehand') {
  const { frames, n, fps } = t;
  const R = hand === 'l' ? [11, 13, 15] : [12, 14, 16], O = hand === 'l' ? [12, 14, 16] : [11, 13, 15], rw = R[2];
  const knee = kneeSeries(frames);
  const torso = median(frames.map(p => p ? (p[23].y + p[24].y) / 2 - (p[11].y + p[12].y) / 2 : NaN));
  // body height: one visible ankle is enough (the far ankle is often hidden from the side); fall back to the torso
  let bodyH = median(frames.map(p => { if (!p || !vis(p, 0)) return NaN; const a = [27, 28].filter(i => vis(p, i)).map(i => p[i].y); return a.length ? (Math.max(...a) - p[0].y) * 1.08 : NaN; }));
  if (!(bodyH > 0)) bodyH = torso * 3.3;
  // racket-hand x with short gaps filled (low visibility bar: the hand blurs during the swing, an estimated position is enough for timing)
  const x = frames.map(p => p && vis(p, rw, 0.15) ? p[rw].x : NaN);
  for (let i = 1; i < n - 1; i++) if (isNaN(x[i])) { let a = i - 1, b = i + 1; while (b < n && isNaN(x[b]) && b - a <= 10) b++; if (!isNaN(x[a]) && b < n && !isNaN(x[b]) && b - a <= 10) x[i] = x[a] + (x[b] - x[a]) * (i - a) / (b - a); }
  let vx = x.map((_, i) => i > 0 && i < n - 1 ? (x[i + 1] - x[i - 1]) * fps / 2 / (bodyH || 1) : NaN);
  vx = vx.map((_, i) => { const w = [vx[i - 1], vx[i], vx[i + 1]].filter(Number.isFinite); return w.length ? w.reduce((a, b) => a + b, 0) / w.length : NaN; });
  const hipX = i => { const p = frames[i]; return p && vis(p, 23) && vis(p, 24) ? (p[23].x + p[24].x) / 2 : NaN; };
  // hitting direction, first from the face (the player looks where the ball goes: from the side the nose sits ahead of the ears) ...
  const face = median(frames.map(p => p && vis(p, 0) && vis(p, 7) && vis(p, 8) ? (p[0].x - (p[7].x + p[8].x) / 2) / (bodyH || 1) : NaN));
  // ... then from the hand: the forward swing is normally the fastest hand movement
  const sp = vx.map(Math.abs), top = pct(sp, 0.97), fast = vx.filter(v => Math.abs(v) >= top && Number.isFinite(v));
  const pos = fast.filter(v => v > 0).length, handDir = pos * 2 >= fast.length ? 1 : -1, agree = fast.length ? Math.max(pos, fast.length - pos) / fast.length : 0;
  const faceDir = Math.abs(face) >= 0.004 ? Math.sign(face) : 0;
  const dir = faceDir || handDir;
  const f = vx.map(v => v * dir), gap = Math.round(1.2 * fps);
  // a swing must be clearly faster than walking or getting ready, and at least half as fast as the fastest swing in the video
  const TH = Math.max(1.2, 0.5 * pct(f, 0.995));
  const peaks = [];
  for (let i = 1; i < n - 1; i++) if (f[i] > TH && f[i] >= f[i - 1] && f[i] >= f[i + 1]) {
    // shape check: before a real swing the hand goes back behind the hips (takeback)
    let back = false; for (let k = Math.max(0, i - Math.round(1.2 * fps)); k < i && !back; k++) if ((x[k] - hipX(k)) * dir < -0.05 * bodyH) back = true;
    if (!back) continue;
    const last = peaks[peaks.length - 1];
    if (last !== undefined && i - last < gap) { if (f[i] > f[last]) peaks[peaks.length - 1] = i; } else peaks.push(i);
  }
  // is the racket hand actually visible around contact? (hidden = filmed from the wrong side)
  const handVis = median(peaks.map(c => { const p = frames[c]; return p ? p[rw].v : NaN; }));
  // why the video cannot be judged, if so: 'front' (not from the side), 'dir' (direction unclear), 'side' (racket arm hidden), '' = fine
  const problem = !faceDir ? 'front' : (peaks.length && faceDir !== handDir && agree >= 0.75) ? 'dir' : (peaks.length && handVis < 0.5) ? 'side' : '';
  const dirSure = !problem && peaks.length > 0;
  const ctx = { kind, knee, bodyH, torso, racket: R, tossS: O[0], tossE: O[1], tossW: O[2], dir, dirSure, view: problem ? 'unsure' : 'side', problem, slow: false, x, f };
  const serves = peaks.map(c => { const s = { tro: c, peak: f[c] }; Object.assign(s, measureStroke(t, ctx, s)); return s; });
  return { serves, ctx, knee, view: ctx.view };
}
export function measureStroke(t, ctx, s) {
  const { frames, fps, n } = t, c = s.tro, dir = ctx.dir, rw = ctx.racket[2], B = ctx.bodyH || NaN;
  const hipX = i => { const p = frames[i]; return p && vis(p, 23) && vis(p, 24) ? (p[23].x + p[24].x) / 2 : NaN; };
  // takeback: racket hand furthest back within 1.2 s before contact
  let tb = Math.max(0, c - Math.round(0.4 * fps)), far = Infinity;
  for (let i = Math.max(0, c - Math.round(1.2 * fps)); i < c; i++) { const v = (ctx.x[i] - hipX(i)) * dir; if (v < far) { far = v; tb = i; } }
  // finish: racket hand highest within 0.7 s after contact (estimated positions count: the hand often wraps behind the body)
  let fin = Math.min(n - 1, c + Math.round(0.35 * fps)), hi = Infinity;
  for (let i = c + 1; i <= Math.min(n - 1, c + Math.round(0.7 * fps)); i++) { const p = frames[i]; if (p && vis(p, rw, 0.15) && p[rw].y < hi) { hi = p[rw].y; fin = i; } }
  let kf = c, km = Infinity; for (let i = tb; i <= c; i++) if (ctx.knee[i] < km) { km = ctx.knee[i]; kf = i; }
  const pf = frames[fin];
  // contact (reference only): racket hand vs hips at the chosen frame
  const contact = Number.isFinite(ctx.x[c]) ? (ctx.x[c] - hipX(c)) * dir / B : NaN;
  // where the hips end up between the feet: 0 = over the back foot, 1 = over the front foot (independent of camera distance and of walking)
  let weight = NaN;
  if (pf && vis(pf, 27, 0.3) && vis(pf, 28, 0.3)) {
    const a = pf[27].x * dir, b = pf[28].x * dir, back = Math.min(a, b), front = Math.max(a, b);
    if (front - back > 0.08 * B) weight = (hipX(fin) * dir - back) / (front - back);
  }
  const knee = Number.isFinite(km) ? km : NaN;
  const finish = pf && vis(pf, rw, 0.15) && vis(pf, 11) && vis(pf, 12) && ctx.torso > 0 ? ((pf[11].y + pf[12].y) / 2 - pf[rw].y) / ctx.torso : NaN;
  // forehand or backhand? at the takeback the shoulder away from the racket hand points to the net on a forehand, the racket-side shoulder on a backhand
  const pt = frames[tb]; let type = '';
  if (pt && vis(pt, 11) && vis(pt, 12)) { const o = ctx.racket[0] === 12 ? 11 : 12, d = (pt[o].x - pt[ctx.racket[0]].x) * dir / B; type = d > 0.03 ? 'forehand' : d < -0.03 ? 'backhand' : ''; }
  return { tb, fin, kf, contact, weight, knee, finish, dir, type };
}
// Which frame shows an item best (for the "how to fix" picture).
export function frameOf(ctx, s, k) { return ctx.kind === 'serve' ? s.tro : k === 'knee' ? s.kf : k === 'finish' || k === 'weight' ? s.fin : s.tro; }

// Re-measure when the user moves the key frame by hand.
export function remeasure(t, ctx, s, newTro) { const s2 = { ...s, tro: newTro }; Object.assign(s2, ctx.kind === 'serve' ? measure(t, ctx, s2) : measureStroke(t, ctx, s2)); return s2; }

export function drawFrame(canvas, video, p, opts = {}) {
  const W = video.videoWidth, H = video.videoHeight;
  let sx = 0, sy = 0, sw = W, sh = H;
  if (opts.crop && p) { // crop to person, 9:16 box
    const xs = p.filter(q => q.v >= .5).map(q => q.x), ys = p.filter(q => q.v >= .5).map(q => q.y);
    if (xs.length > 4) {
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, top = Math.min(...ys), bot = Math.max(...ys);
      sh = Math.min(H, (bot - top) * 1.9); sw = Math.min(W, sh * 9 / 16); sh = sw * 16 / 9;
      sx = Math.max(0, Math.min(W - sw, cx - sw / 2)); sy = Math.max(0, Math.min(H - sh, (top + bot) / 2 - sh * 0.45));
    }
  }
  const cw = opts.w || sw, ch = opts.h || sh;
  canvas.width = cw; canvas.height = ch;
  const c = canvas.getContext('2d');
  c.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
  if (!p || opts.noSkel) { if (p && opts.after) { const k0 = cw / sw; opts.after(c, q => [(q.x - sx) * k0, (q.y - sy) * k0], k0); } return canvas; }
  const k = cw / sw, tx = q => (q.x - sx) * k, ty = q => (q.y - sy) * k, lw = Math.max(3, cw / 110);
  c.lineCap = 'round';
  for (const [a, b] of EDGES) if (vis(p, a) && vis(p, b)) {
    const bad = opts.highlight && opts.highlight.includes(a) && opts.highlight.includes(b);
    c.strokeStyle = bad ? '#F08A3C' : '#7BE0A3'; c.lineWidth = bad ? lw * 1.6 : lw;
    c.beginPath(); c.moveTo(tx(p[a]), ty(p[a])); c.lineTo(tx(p[b]), ty(p[b])); c.stroke();
  }
  c.fillStyle = '#FFFFFF';
  for (const j of [0, ...new Set(EDGES.flat())]) if (vis(p, j)) { c.beginPath(); c.arc(tx(p[j]), ty(p[j]), lw * 1.1, 0, 7); c.fill(); }
  if (opts.after) opts.after(c, q => [tx(q), ty(q)], k);
  return canvas;
}
