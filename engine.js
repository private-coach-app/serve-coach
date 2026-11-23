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
  return v;
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

// Serve detection (v2 rules) + per-serve metrics.
export function findServes(t) {
  const { frames, n, fps } = t;
  const leg = (p, h, k, a) => p && vis(p, h, .6) && vis(p, k, .6) && vis(p, a, .6) ? ang(p, h, k, a) : NaN;
  let knee = frames.map(p => { const l = leg(p, 23, 25, 27), r = leg(p, 24, 26, 28); return isNaN(l) ? r : isNaN(r) ? l : (l + r) / 2; });
  const med = rollMed(knee, 9); knee = knee.map((v, i) => Math.abs(v - med[i]) > 15 ? NaN : v); knee = rollMed(knee, 5);
  const shY = frames.map(p => p ? (p[11].y + p[12].y) / 2 : NaN), hipY = frames.map(p => p ? (p[23].y + p[24].y) / 2 : NaN);
  const torso = median(frames.map((p, i) => hipY[i] - shY[i]));
  const bodyH = median(frames.map(p => p && vis(p, 0) && vis(p, 27) && vis(p, 28) ? ((p[27].y + p[28].y) / 2 - p[0].y) * 1.08 : NaN));
  const wh = w => frames.map((p, i) => p && vis(p, w) ? (shY[i] - p[w].y) / torso : NaN);
  const lw = wh(15), rw = wh(16);
  const cnt = a => a.filter(v => v > 0.3).length;
  const leftToss = cnt(lw) >= cnt(rw);
  const th = leftToss ? lw : rw, tossW = leftToss ? 15 : 16;
  const racket = leftToss ? [12, 14, 16] : [11, 13, 15];
  const high = th.map(v => v > 0.3);
  const serves = [];
  for (let i = 0; i < n; i++) {
    if (!high[i]) continue;
    let j = i; while (j + 1 < n && (high[j + 1] || (j + 2 < n && high[j + 2]))) j++;
    if ((j - i) / fps >= 0.3) {
      let tro = -1, km = Infinity, peakF = i, peak = -9;
      for (let f = i; f <= j; f++) if (th[f] > peak) { peak = th[f]; peakF = f; }
      // trophy = deepest knee while the toss arm is up (from just before the toss peak to the end of the toss)
      for (let f = Math.max(i, peakF - Math.round(0.25 * fps)); f <= j; f++) if (knee[f] < km) { km = knee[f]; tro = f; }
      if (tro < 0) tro = peakF;
      serves.push({ toss: i, end: j, tro, peakF });
    }
    i = j;
  }
  const ratio = median(frames.map((p, i) => p && vis(p, 11) && vis(p, 12) ? Math.abs(p[11].x - p[12].x) / torso : NaN));
  const view = ratio < 0.45 ? 'side' : ratio < 0.75 ? 'oblique' : 'front';
  const ctx = { knee, bodyH, tossW, racket, leftToss, torso, view, ratio };
  serves.forEach(s => Object.assign(s, measure(t, ctx, s)));
  return { serves, ctx, knee, view };
}

export function measure(t, ctx, s) {
  const { frames, fps } = t;
  const p = frames[s.tro], pk = frames[s.peakF];
  const knee = ctx.knee[s.tro];
  const elbow = p && ctx.racket.every(q => vis(p, q)) ? ang(p, ...ctx.racket) : NaN;
  const ank = pk && vis(pk, 27) && vis(pk, 28) ? (pk[27].y + pk[28].y) / 2 : NaN;
  const tossH = pk && vis(pk, ctx.tossW) ? (ank - pk[ctx.tossW].y) / ctx.bodyH : NaN;
  // toss position: wrist x at peak vs front foot, along hitting direction (+ = in front)
  let tossPos = NaN, dir = 0;
  const pe = frames[Math.min(frames.length - 1, s.end + Math.round(0.6 * fps))];
  // hitting direction: vote of (a) hip travel after the serve, (b) toss hand vs shoulders at the peak, (c) nose vs ears at the peak
  let vote = 0; const B = ctx.bodyH || 1;
  if (p && pe && vis(p, 23) && vis(p, 24) && vis(pe, 23) && vis(pe, 24)) { const d = ((pe[23].x + pe[24].x) - (p[23].x + p[24].x)) / 2 / B; if (Math.abs(d) > 0.03) vote += Math.sign(d) * 1.0; }
  if (pk && vis(pk, ctx.tossW) && vis(pk, 11) && vis(pk, 12)) { const d = (pk[ctx.tossW].x - (pk[11].x + pk[12].x) / 2) / B; if (Math.abs(d) > 0.02) vote += Math.sign(d) * 1.2; }
  if (pk && vis(pk, 0) && vis(pk, 7) && vis(pk, 8)) { const d = (pk[0].x - (pk[7].x + pk[8].x) / 2) / B; if (Math.abs(d) > 0.01) vote += Math.sign(d) * 0.8; }
  dir = Math.sign(vote);
  if (dir && pk && vis(pk, ctx.tossW) && vis(pk, 27) && vis(pk, 28)) {
    const front = dir > 0 ? Math.max(pk[27].x, pk[28].x) : Math.min(pk[27].x, pk[28].x);
    tossPos = (pk[ctx.tossW].x - front) * dir / ctx.bodyH;
  }
  return { knee: isFinite(knee) ? knee : NaN, elbow, tossH, tossPos, hold: (s.end - s.toss) / fps, dir: dir || 1 };
}

// Approximate frames for the six phases of one serve (ready, release, trophy, racket drop, impact, follow-through).
export function phaseFrames(t, s) {
  const f = t.fps, n = t.n - 1, cl = x => Math.max(0, Math.min(n, Math.round(x)));
  const imp = cl(s.end + 0.05 * f);
  return [cl(s.toss - 0.35 * f), cl(s.toss), s.tro, cl((s.tro + imp) / 2), imp, cl(imp + 0.45 * f)];
}
// User's angles at a frame, comparable with the ideal model.
export function anglesAt(t, ctx, i) {
  const p = t.frames[i]; if (!p) return {};
  const lk = vis(p, 23) && vis(p, 25) && vis(p, 27) ? ang(p, 23, 25, 27) : NaN, rk = vis(p, 24) && vis(p, 26) && vis(p, 28) ? ang(p, 24, 26, 28) : NaN;
  const knee = isNaN(lk) ? rk : isNaN(rk) ? lk : Math.min(lk, rk);
  const elbow = ctx.racket.every(q => vis(p, q)) ? ang(p, ...ctx.racket) : NaN;
  const sIdx = ctx.tossW === 15 ? 11 : 12;
  const toss = vis(p, sIdx) && vis(p, ctx.tossW) ? Math.atan2(Math.abs(p[ctx.tossW].x - p[sIdx].x), p[ctx.tossW].y - p[sIdx].y) * 180 / Math.PI : NaN;
  return { knee, elbow, toss };
}

// Re-measure when the user moves the trophy frame by hand.
export function remeasure(t, ctx, s, newTro) { const s2 = { ...s, tro: newTro }; Object.assign(s2, measure(t, ctx, s2)); return s2; }

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
  if (!p) return canvas;
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
