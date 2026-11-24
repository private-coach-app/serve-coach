// Ideal serve model (side view). Segment directions in degrees: 0 = down, 90 = forward (hitting direction), 180 = up, -90 = backward.
// Trophy knee ≈115° follows the meta-analysis mean front-knee flexion 64.5±9.7° (Jacquier-Bret & Gorce 2024);
// impact elbow ≈150° follows its elbow flexion 30.1±15.9°. Other key frames are coaching-standard shapes.
import { L } from './i18n.js';

export const PHASES = [
  { name: () => L('構え', '준비'), tip: () => L('力を抜いて横向きに立つ', '힘을 빼고 옆으로 서기'),
    lean: 0, fT: 10, fS: 6, bT: -10, bS: -5, tU: 25, tF: 40, rU: 20, rF: 45 },
  { name: () => L('ボールを離す', '공 놓기'), tip: () => L('腕を伸ばしたまま、ゆっくり上へ', '팔을 편 채로 천천히 위로'),
    lean: -8, fT: 30, fS: -5, bT: 15, bS: -20, tU: 160, tF: 165, rU: -60, rF: -30 },
  { name: () => L('打つ直前のため姿勢', '치기 직전 준비 자세'), tip: () => L('トスの腕は真上、ひじはL字、ひざを曲げる', '토스 팔은 바로 위, 팔꿈치는 L자, 무릎 굽히기'),
    lean: -15, fT: 40, fS: -25, bT: 25, bS: -35, tU: 170, tF: 172, rU: -95, rF: 175 },
  { name: () => L('ラケットを背中に落とす', '라켓을 등 뒤로 떨어뜨리기'), tip: () => L('ひざを伸ばしながら、ラケットは背中側へ', '무릎을 펴면서 라켓은 등 쪽으로'),
    lean: -5, fT: 25, fS: -10, bT: 10, bS: -25, tU: 120, tF: 110, rU: 170, rF: -80 },
  { name: () => L('ボールを打つ', '공 치기'), tip: () => L('いちばん高いところで、腕を伸ばして打つ', '가장 높은 곳에서 팔을 뻗어 치기'),
    lean: 5, fT: 5, fS: 0, bT: -5, bS: -15, tU: 40, tF: 30, rU: 160, rF: 190 },
  { name: () => L('振り抜き', '끝까지 휘두르기'), tip: () => L('前に踏み込みながら、最後まで振る', '앞으로 들어가면서 끝까지 휘두르기'),
    lean: 30, fT: 15, fS: 5, bT: -40, bS: -70, tU: 30, tF: 40, rU: 20, rF: -20, raw: ['rF'] },
];
const SEG = { torso: 0.30, head: 0.12, thigh: 0.245, shank: 0.246, upper: 0.186, fore: 0.20 };
const dirv = a => { const r = a * Math.PI / 180; return [Math.sin(r), Math.cos(r)]; };
const nd = d => ((d % 360) + 540) % 360 - 180;

// Shortest-way interpolation, except keys listed in b.raw (the racket forearm must swing through the front, not wrap behind).
function lerpPhase(a, b, t) {
  const o = {};
  for (const k of Object.keys(a)) if (typeof a[k] === 'number') o[k] = a[k] + ((b.raw || []).includes(k) ? b[k] - a[k] : nd(b[k] - a[k])) * t;
  return o;
}
// Joint positions (unit = body height, origin = hip centre, y down, +x = hitting direction).
export function pose(p) {
  const hip = [0, 0], t = dirv(180 - p.lean), sh = [t[0] * SEG.torso, t[1] * SEG.torso];
  const head = [sh[0] + t[0] * SEG.head, sh[1] + t[1] * SEG.head];
  const limb = (o, a, la, b, lb) => { const d1 = dirv(a), j = [o[0] + d1[0] * la, o[1] + d1[1] * la], d2 = dirv(b); return [j, [j[0] + d2[0] * lb, j[1] + d2[1] * lb]]; };
  const [fk, fa] = limb(hip, p.fT, SEG.thigh, p.fS, SEG.shank), [bk, ba] = limb(hip, p.bT, SEG.thigh, p.bS, SEG.shank);
  const [te, tw] = limb(sh, p.tU, SEG.upper, p.tF, SEG.fore), [re, rw] = limb(sh, p.rU, SEG.upper, p.rF, SEG.fore);
  return { head, sh, hip, fk, fa, bk, ba, te, tw, re, rw };
}
const BODY = [['hip', 'sh'], ['hip', 'fk'], ['fk', 'fa'], ['hip', 'bk'], ['bk', 'ba']], TOSS = [['sh', 'te'], ['te', 'tw']], RACKET = [['sh', 're'], ['re', 'rw']];

// Animated ideal serve, looping through PHASES. d = +1 (hits to the right) / -1 (to the left), matching the user's video. Returns stop().
export function animateIdeal(canvas, onPhase, d = 1) {
  const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const hold = 700, move = 600, per = hold + move; let raf, t0 = performance.now(), last = -1;
  const s = H * 0.60, gy = H * 0.90, lw = Math.max(3, W / 60);
  const frame = now => {
    if (!canvas.isConnected) return;
    const t = (now - t0) % (per * PHASES.length), i = Math.floor(t / per), k = Math.max(0, (t % per - hold) / move);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const P = pose(i === PHASES.length - 1 ? PHASES[i] : lerpPhase(PHASES[i], PHASES[i + 1], e));
    const foot = Math.max(P.fa[1], P.ba[1]);                       // keep the lower foot on the ground line
    const M = ([x, y]) => [W * 0.5 + (x - 0.05) * s * d, gy + (y - foot) * s];
    c.clearRect(0, 0, W, H); c.fillStyle = '#EEF1EA'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#C9CFC3'; c.lineWidth = 2; c.beginPath(); c.moveTo(W * 0.06, gy); c.lineTo(W * 0.94, gy); c.stroke();
    c.lineCap = 'round'; c.lineWidth = lw;
    const draw = (segs, col) => { c.strokeStyle = col; for (const [a, b] of segs) { const A = M(P[a]), B = M(P[b]); c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.stroke(); } };
    draw(BODY, '#14211A'); draw(TOSS, '#2F6FD6'); draw(RACKET, '#B4501A');
    const h = M(P.head), sh = M(P.sh); c.strokeStyle = '#14211A'; c.beginPath(); c.arc(h[0], h[1], Math.hypot(h[0] - sh[0], h[1] - sh[1]) * 0.55, 0, 7); c.stroke();
    // racket: a short line continuing the forearm
    const re = M(P.re), rw = M(P.rw), ux = rw[0] - re[0], uy = rw[1] - re[1], ul = Math.hypot(ux, uy) || 1;
    c.strokeStyle = '#B4501A'; c.lineWidth = lw * 0.6; c.beginPath(); c.moveTo(...rw); c.lineTo(rw[0] + ux / ul * s * 0.22, rw[1] + uy / ul * s * 0.22); c.stroke();
    if (i !== last) { last = i; onPhase && onPhase(i); }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
