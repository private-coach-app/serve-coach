// Ideal serve model (side view, player hits toward +x, right-handed layout; mirrored by dir).
// Segment directions in degrees: 0 = down, 90 = forward (+x), 180 = up, -90 = backward.
// Trophy knee ≈115° follows the meta-analysis mean front-knee flexion 64.5±9.7° (Jacquier-Bret & Gorce 2024);
// impact elbow ≈150° follows its elbow flexion 30.1±15.9°. Other key frames are coaching-standard shapes.
import { L } from './i18n.js';

export const PHASES = [
  { id: 'ready', name: () => L('構え', '준비'), lean: 0, fT: 10, fS: 15, bT: -10, bS: -5, tU: 25, tF: 40, rU: 20, rF: 45 },
  { id: 'release', name: () => L('トス(リリース)', '토스(공 놓기)'), lean: -8, fT: 30, fS: -5, bT: 15, bS: -20, tU: 160, tF: 165, rU: -60, rF: -30 },
  { id: 'trophy', name: () => L('トロフィー', '트로피'), lean: -15, fT: 40, fS: -25, bT: 25, bS: -35, tU: 170, tF: 172, rU: -95, rF: 175 },
  { id: 'drop', name: () => L('ラケットダウン', '라켓 드롭'), lean: -5, fT: 25, fS: -10, bT: 10, bS: -25, tU: 120, tF: 110, rU: 170, rF: -80 },
  { id: 'impact', name: () => L('インパクト', '임팩트'), lean: 5, fT: 5, fS: 0, bT: -5, bS: -15, tU: 40, tF: 30, rU: 160, rF: 190 },
  { id: 'follow', name: () => L('フォロースルー', '팔로스루'), lean: 30, fT: 15, fS: 5, bT: -40, bS: -70, tU: 30, tF: 40, rU: 20, rF: -20 },
];
const SEG = { torso: 0.30, head: 0.12, thigh: 0.245, shank: 0.246, upper: 0.186, fore: 0.20 };
const dir = a => { const r = a * Math.PI / 180; return [Math.sin(r), Math.cos(r)]; };
const nd = d => ((d % 360) + 540) % 360 - 180;
export const jointAngle = (a, b) => 180 - Math.abs(nd(a - b));

// Angles shown to the user for each phase.
export function phaseAngles(p) {
  return { knee: Math.round(jointAngle(p.fT, p.fS)), elbow: Math.round(Math.abs(nd(p.rU + 180 - p.rF))), toss: Math.round(Math.abs(nd(p.tU))) };
}
function lerpPhase(a, b, t) {
  const o = {}; for (const k of Object.keys(a)) if (typeof a[k] === 'number') o[k] = a[k] + nd(b[k] - a[k]) * t; return o;
}
// Returns MediaPipe-indexed points (unit = body height, origin = hip centre, y down).
export function pose(p) {
  const P = {}, hip = [0, 0];
  const t = dir(180 - p.lean), sh = [hip[0] + t[0] * SEG.torso, hip[1] + t[1] * SEG.torso];
  const head = [sh[0] + t[0] * SEG.head, sh[1] + t[1] * SEG.head];
  const limb = (o, a, la, b, lb) => { const d1 = dir(a), j = [o[0] + d1[0] * la, o[1] + d1[1] * la]; const d2 = dir(b); return [j, [j[0] + d2[0] * lb, j[1] + d2[1] * lb]]; };
  const [fk, fa] = limb(hip, p.fT, SEG.thigh, p.fS, SEG.shank), [bk, ba] = limb(hip, p.bT, SEG.thigh, p.bS, SEG.shank);
  const [te, tw] = limb(sh, p.tU, SEG.upper, p.tF, SEG.fore), [re, rw] = limb(sh, p.rU, SEG.upper, p.rF, SEG.fore);
  Object.assign(P, { head, sh, hip, fk, fa, bk, ba, te, tw, re, rw });
  return P;
}
const LINES = [['hip', 'sh'], ['sh', 'head'], ['hip', 'fk'], ['fk', 'fa'], ['hip', 'bk'], ['bk', 'ba'], ['sh', 'te'], ['te', 'tw'], ['sh', 're'], ['re', 'rw']];

// Draw an ideal figure. map(x,y) converts model units to canvas px. hl = segment group to emphasise.
export function drawIdeal(c, P, map, { color = '#2F6FD6', width = 4, dash = true, alpha = 0.9, head = true } = {}) {
  c.save(); c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
  if (dash) c.setLineDash([width * 2.2, width * 1.6]);
  for (const [a, b] of LINES) { if (b === 'head') continue; const A = map(...P[a]), B = map(...P[b]); c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.stroke(); }
  if (head) { const h = map(...P.head), s = map(...P.sh); const r = Math.hypot(h[0] - s[0], h[1] - s[1]) * 0.55; c.setLineDash([]); c.beginPath(); c.arc(h[0], h[1], r, 0, 7); c.stroke(); }
  c.restore();
}

// Overlay the ideal trophy shape on a user frame. hipPx: hip centre in canvas px, scale: px per body height, d: +1/-1 hitting direction.
export function overlayTrophy(c, hipPx, scale, d) {
  const P = pose(PHASES[2]);
  // ground the model's lower foot on the user's hip height-based estimate: keep hip anchored
  drawIdeal(c, P, (x, y) => [hipPx[0] + x * scale * d, hipPx[1] + y * scale], { width: Math.max(3, scale / 90) });
}

// Animated ideal serve: loops through PHASES with easing. Returns stop().
export function animateIdeal(canvas, onPhase) {
  const c = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
  const hold = 450, move = 550, per = hold + move; let raf, t0 = performance.now(), last = -1;
  const frame = now => {
    const t = (now - t0) % (per * PHASES.length), i = Math.floor(t / per), k = Math.max(0, (t % per - hold) / move);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const p = lerpPhase(PHASES[i], PHASES[(i + 1) % PHASES.length], i === PHASES.length - 1 ? 0 : e);
    const P = pose(p);
    c.clearRect(0, 0, W, H); c.fillStyle = '#EEF1EA'; c.fillRect(0, 0, W, H);
    const s = H * 0.62, base = [W * 0.45, H * 0.52];
    c.strokeStyle = '#C9CFC3'; c.lineWidth = 2; c.beginPath(); c.moveTo(W * 0.08, base[1] + s * 0.49); c.lineTo(W * 0.92, base[1] + s * 0.49); c.stroke();
    drawIdeal(c, P, (x, y) => [base[0] + x * s, base[1] + y * s], { dash: false, width: Math.max(3, W / 60), alpha: 1 });
    if (i !== last) { last = i; onPhase && onPhase(i); }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
