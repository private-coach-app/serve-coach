// In-app camera: live framing guide (foot line, body frame, live skeleton) and a serve counter (1/3 → 3/3).
// The recording never leaves the device; it is handed to the normal analysis as a Blob.
import { L } from './i18n.js';
import { loadEngine, detectLive, engineState, EDGES } from './engine.js';

const TARGET = 3, MAX_SEC = 120;
const GUIDE = { top: 0.06, head: 0.30, foot: 0.88, left: 0.22, right: 0.78 };   // fractions of the picture

let ac = null;
function beep(freq = 880, ms = 140, times = 1) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
    for (let i = 0; i < times; i++) {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * (ms + 90) / 1000;
      o.frequency.value = freq; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.start(t); o.stop(t + ms / 1000 + 0.02);
    }
  } catch {}
}
const pickMime = () => (window.MediaRecorder ? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) : null);
export const cameraSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

// Serve counter on live landmarks: an arm goes clearly above the shoulders (toss, then the swing) and both come back down = one serve.
export function makeCounter() {
  let upSince = 0, downSince = 0, active = false, count = 0;
  return {
    get count() { return count; },
    feed(p, now) {                       // p: landmarks with x,y in 0..1 and v; returns true when a serve was just counted
      if (!p) return false;
      const ok = i => p[i] && p[i].v >= 0.5;
      if (!(ok(11) && ok(12) && ok(23) && ok(24))) return false;
      const shY = (p[11].y + p[12].y) / 2, torso = (p[23].y + p[24].y) / 2 - shY; if (!(torso > 0.02)) return false;
      const h = i => ok(i) ? (shY - p[i].y) / torso : -9, top = Math.max(h(15), h(16));
      if (top > 0.3) { downSince = 0; if (!upSince) upSince = now; if (!active && now - upSince >= 350) active = true; }
      else if (top < 0.1) { upSince = 0; if (!downSince) downSince = now; if (active && now - downSince >= 350) { active = false; count++; return true; } }
      return false;
    },
  };
}
// Stroke counter (forehand / backhand): one fast sideways sweep of the racket hand = one swing.
export function makeSwingCounter(hand, aspect) {
  const rw = hand === 'l' ? 15 : 16; let px = NaN, pt = 0, last = 0, count = 0, hot = 0;
  return {
    get count() { return count; },
    feed(p, now) {
      if (!p || !(p[rw] && p[rw].v >= 0.4 && p[0] && p[0].v >= 0.5 && p[27] && p[28])) { px = NaN; return false; }
      const H = ((p[27].y + p[28].y) / 2 - p[0].y) * 1.08; if (!(H > 0.1)) { px = NaN; return false; }
      const x = p[rw].x * aspect / H;                       // in body heights
      let hit = false;
      if (Number.isFinite(px) && now > pt) {
        const v = Math.abs(x - px) / ((now - pt) / 1000);
        hot = v > 2.2 ? hot + 1 : 0;                        // two fast readings in a row, then wait before counting again
        if (hot >= 2 && now - last > 900) { last = now; count++; hit = true; }
      }
      px = x; pt = now; return hit;
    },
  };
}
// Is the whole body inside the guide, with room above the head for the toss?
export function framing(p) {
  if (!p) return 'none';
  const ok = i => p[i] && p[i].v >= 0.5;
  if (!(ok(0) && (ok(27) || ok(28)))) return 'part';
  const foot = Math.max(ok(27) ? p[27].y : 0, ok(28) ? p[28].y : 0), head = p[0].y, hgt = foot - head;
  if (foot > 0.96 || head < 0.20) return 'close';
  if (hgt < 0.38) return 'far';
  return 'ok';
}

export async function openCamera({ onDone, kind = 'serve', hand = 'r', name = '', unit = '' }) {
  const isS = kind === 'serve', newCounter = () => isS ? makeCounter() : makeSwingCounter(hand, (v.videoWidth || 9) / (v.videoHeight || 16));
  const ov = document.createElement('div'); ov.className = 'camov';
  ov.innerHTML = `<div class="stage"><div class="flip" id="cFlip"><video id="cV" playsinline webkit-playsinline muted autoplay></video><canvas id="cC"></canvas></div>
    <div class="camtop"><button id="cX" aria-label="close">✕</button><div id="cMsg" class="cmsg"></div><button id="cSw" aria-label="switch">⟲</button></div>
    <div id="cCnt" class="ccnt hide"></div>
    <div class="cambot"><div id="cHint" class="chint"></div><button id="cGo" class="btn ball"></button><button id="cUse" class="btn ball hide"></button><button id="cRe" class="btn ghost w hide"></button></div></div>`;
  document.body.appendChild(ov);
  const $ = s => ov.querySelector(s), v = $('#cV'), cv = $('#cC'), g = cv.getContext('2d');
  let stream = null, facing = 'environment', raf = 0, state = 'frame', rec = null, chunks = [], blob = null, counter = { count: 0, feed: () => false }, t0 = 0, stopAt = 0, lock = null, timer = 0, lastDet = 0, lastP = null, closed = false;

  const stopStream = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
  const close = () => { closed = true; cancelAnimationFrame(raf); clearInterval(timer); try { if (rec && rec.state !== 'inactive') rec.stop(); } catch {} stopStream(); try { lock && lock.release(); } catch {} ov.remove(); };
  async function start() {
    stopStream();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
    } catch (e) {
      $('#cMsg').textContent = L('カメラを使えませんでした。カメラの許可を確認するか、「動画を選ぶ」から撮影してください。', '카메라를 쓸 수 없었어요. 카메라 권한을 확인하거나 「영상 고르기」에서 촬영해 주세요.');
      $('#cGo').classList.add('hide'); return;
    }
    v.srcObject = stream; await v.play().catch(() => {});
    $('#cFlip').classList.toggle('mir', facing === 'user');
    try { lock = await navigator.wakeLock.request('screen'); } catch {}
  }
  function ui() {
    const go = $('#cGo'), use = $('#cUse'), re = $('#cRe'), cnt = $('#cCnt'), hint = $('#cHint');
    go.classList.toggle('hide', state === 'done' || state === 'count'); use.classList.toggle('hide', state !== 'done'); re.classList.toggle('hide', state !== 'done');
    $('#cSw').classList.toggle('hide', state !== 'frame'); cnt.classList.toggle('hide', state === 'frame');
    if (state === 'frame') { go.textContent = L('● 撮影スタート(5秒後に開始)', '● 촬영 시작 (5초 뒤 시작)'); hint.textContent = L(`スマホを真横に固定して、足を下の線に合わせて立ってください。${name}を3${unit}打つと自動で止まります。`, `폰을 바로 옆에 고정하고, 발을 아래 선에 맞춰 서 주세요. ${name} 3${unit}를 치면 자동으로 멈춰요.`); }
    if (state === 'rec') { go.textContent = L('■ ここで終了する', '■ 여기서 끝내기'); hint.textContent = L(`${name}を打ってください。音が鳴ったら1${unit}カウントです。`, `${name}를 쳐 주세요. 소리가 나면 1${unit}로 센 거예요.`); }
    if (state === 'done') { use.textContent = L('この動画を分析する', '이 영상 분석하기'); re.textContent = L('撮り直す', '다시 찍기'); hint.textContent = counter.count ? L(`${name}を${counter.count}${unit}撮れました。`, `${name} ${counter.count}${unit}를 찍었어요.`) : L('数えられませんでしたが、このまま分析することもできます。', '세지는 못했지만, 이대로 분석할 수도 있어요.'); }
  }
  const showCount = () => { $('#cCnt').innerHTML = `<b>${Math.min(counter.count, TARGET)}</b><span>/ ${TARGET}</span>`; };
  function beginRec() {
    const mime = pickMime(); chunks = []; blob = null; counter = newCounter(); stopAt = 0;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5e6 } : undefined); }
    catch { rec = new MediaRecorder(stream); }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { blob = new Blob(chunks, { type: rec.mimeType || mime || 'video/mp4' }); blob.recSeconds = (performance.now() - t0) / 1000; state = 'done'; beep(660, 160, 2); ui(); };
    rec.start(1000); t0 = performance.now(); state = 'rec'; showCount(); ui(); beep(1040, 300);
  }
  const endRec = () => { try { if (rec && rec.state !== 'inactive') rec.stop(); } catch {} };

  $('#cX').onclick = close;
  $('#cSw').onclick = async () => { facing = facing === 'user' ? 'environment' : 'user'; await start(); };
  $('#cGo').onclick = () => {
    if (state === 'frame') {
      beep(600, 80); state = 'count'; ui(); let n = 5; const c = $('#cCnt'); c.classList.remove('hide'); c.innerHTML = `<b>${n}</b>`;
      timer = setInterval(() => { n--; if (n > 0) { c.innerHTML = `<b>${n}</b>`; beep(600, 80); } else { clearInterval(timer); if (!closed) beginRec(); } }, 1000);
    } else if (state === 'rec') endRec();
  };
  $('#cRe').onclick = () => { state = 'frame'; blob = null; ui(); $('#cCnt').classList.add('hide'); };
  $('#cUse').onclick = () => { const b = blob; close(); onDone(b); };     // called inside the tap, so the analysis may create its video element

  function draw(p, fr) {
    const W = cv.width, H = cv.height, col = fr === 'ok' ? '#7BE0A3' : '#FFFFFF';
    g.clearRect(0, 0, W, H);
    if (state === 'frame' || state === 'count') {
      g.lineWidth = Math.max(3, W / 160); g.strokeStyle = col; g.setLineDash([W / 40, W / 60]);
      g.beginPath(); g.roundRect(GUIDE.left * W, GUIDE.top * H, (GUIDE.right - GUIDE.left) * W, (GUIDE.foot - GUIDE.top) * H, W / 30); g.stroke();
      g.setLineDash([]); g.strokeStyle = '#D9E43A'; g.lineWidth = Math.max(4, W / 120);          // foot / baseline line
      g.beginPath(); g.moveTo(0.04 * W, GUIDE.foot * H); g.lineTo(0.96 * W, GUIDE.foot * H); g.stroke();
      g.strokeStyle = col; g.lineWidth = Math.max(2, W / 240); g.setLineDash([W / 80, W / 80]);     // head line
      g.beginPath(); g.moveTo(GUIDE.left * W, GUIDE.head * H); g.lineTo(GUIDE.right * W, GUIDE.head * H); g.stroke(); g.setLineDash([]);
      if (!p) {                                                                                      // stick figure showing where to stand
        const x = 0.5 * W, s = (GUIDE.foot - GUIDE.head) * H; g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(4, W / 110); g.lineCap = 'round';
        const y0 = GUIDE.head * H, L2 = (ax, ay, bx, by) => { g.beginPath(); g.moveTo(x + ax * s, y0 + ay * s); g.lineTo(x + bx * s, y0 + by * s); g.stroke(); };
        g.beginPath(); g.arc(x, y0 + 0.07 * s, 0.06 * s, 0, 7); g.stroke();
        L2(0, 0.13, 0, 0.52); L2(0, 0.52, -0.07, 1); L2(0, 0.52, 0.08, 1); L2(0, 0.2, -0.05, -0.22); L2(0, 0.2, 0.16, 0.12); L2(0.16, 0.12, 0.16, -0.1);
      }
    }
    if (p) {
      g.lineCap = 'round'; g.lineWidth = Math.max(4, W / 110); g.strokeStyle = state === 'rec' ? '#D9E43A' : col;
      for (const [a, b] of EDGES) if (p[a].v >= .5 && p[b].v >= .5) { g.beginPath(); g.moveTo(p[a].x * W, p[a].y * H); g.lineTo(p[b].x * W, p[b].y * H); g.stroke(); }
    }
  }
  const MSG = () => ({ none: L('人が映っていません', '사람이 보이지 않아요'), part: L('頭から足先まで入るように下がってください', '머리부터 발끝까지 나오게 물러나 주세요'), close: isS ? L('もう少し離れてください(頭の上にボールの空きが必要です)', '조금 더 떨어져 주세요 (머리 위에 공이 올라갈 공간이 필요해요)') : L('もう少し離れてください', '조금 더 떨어져 주세요'), far: L('もう少し近づいてください', '조금 더 가까이 와 주세요'), ok: L('✓ この位置でOK', '✓ 이 위치면 좋아요') });
  function loop() {
    if (closed) return;
    raf = requestAnimationFrame(loop);
    if (!v.videoWidth) return;
    if (cv.width !== v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; ov.querySelector('.flip').style.aspectRatio = v.videoWidth + '/' + v.videoHeight; }
    const now = performance.now();
    if (state === 'done') { g.clearRect(0, 0, cv.width, cv.height); $('#cMsg').textContent = L('撮影が終わりました', '촬영이 끝났어요'); return; }
    if (engineState.phase === 'ready' && now - lastDet > 60) {
      lastDet = now; lastP = detectLive(v);
      if (state === 'rec' && counter.count < TARGET && counter.feed(lastP, now)) { showCount(); beep(1320, 140); if (counter.count >= TARGET && !stopAt) stopAt = now + 2500; }
    }
    const fr = framing(lastP);
    draw(lastP, fr);
    if (state === 'frame') $('#cMsg').textContent = engineState.phase === 'ready' ? MSG()[fr] : L('準備中…(枠に合わせて立ってください)', '준비 중… (틀에 맞춰 서 주세요)');
    else if (state === 'rec') $('#cMsg').textContent = L('● 録画中', '● 녹화 중');
    else $('#cMsg').textContent = '';
    if (state === 'rec' && ((stopAt && now > stopAt) || now - t0 > MAX_SEC * 1000)) endRec();
  }
  ui(); loadEngine().catch(() => {});
  await start(); loop();
}
