// "How to fix it" on the user's own photo: current line (orange) morphs into the corrected line (blue).
// pts: MediaPipe landmarks in photo-canvas pixels {x,y,v}. d: hitting direction (+1 right / -1 left).
import { L } from './i18n.js';

const ok = (P, ...i) => i.every(j => P[j] && P[j].v >= 0.5);
const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clone = P => P.map(q => q && { ...q });
const deg = r => r * 180 / Math.PI, rad = a => a * Math.PI / 180;
function angAt(P, a, b, c) { const A = P[a], B = P[b], C = P[c]; const u = [A.x - B.x, A.y - B.y], v = [C.x - B.x, C.y - B.y]; return deg(Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) + 1e-9))))); }
const bodyH = P => ok(P, 0, 27, 28) ? ((P[27].y + P[28].y) / 2 - P[0].y) * 1.08 : 3 * len(P[11], P[23]);

// Build the corrected pose for one item. Returns { to, parts, cue, target } or null.
export function correct(item, P, d, level, side) {
  const Q = clone(P), H = bodyH(P);
  const tossS = side.tossW === 15 ? 11 : 12, tossE = tossS + 2, tossW = side.tossW;
  const [rs, re, rw] = side.racket;
  const placeArm = (s, e, w, angDown) => { // straight arm from shoulder at angle from straight down, toward d
    const l1 = len(P[s], P[e]), l2 = len(P[e], P[w]), a = rad(angDown);
    const ux = Math.sin(a) * d, uy = Math.cos(a);
    Q[e] = { ...Q[e], x: P[s].x + ux * l1, y: P[s].y + uy * l1 }; Q[w] = { ...Q[w], x: P[s].x + ux * (l1 + l2), y: P[s].y + uy * (l1 + l2) };
  };
  if (item === 'tossH' || item === 'hold') {
    if (!ok(P, tossS, tossE, tossW)) return null;
    placeArm(tossS, tossE, tossW, 170);
    return { to: Q, parts: [[tossS, tossE], [tossE, tossW]],
      cue: item === 'tossH' ? L('トスの腕をひじまで伸ばし切り、指先を真上へ。', '토스 팔을 팔꿈치까지 쭉 펴고 손끝을 바로 위로.') : L('ラケットが上がるまで、この位置にトス腕を残す。', '라켓이 올라올 때까지 토스 팔을 이 위치에 남겨 두기.') };
  }
  if (item === 'tossPos') {
    if (!ok(P, tossS, tossE, tossW) || !(P[27].v >= 0.2 && P[28].v >= 0.2)) return null;
    const front = d > 0 ? Math.max(P[27].x, P[28].x) : Math.min(P[27].x, P[28].x);
    const tx = front + 0.07 * H * d, reach = len(P[tossS], P[tossE]) + len(P[tossE], P[tossW]);
    const l1 = len(P[tossS], P[tossE]);
    const dx = Math.max(-reach * 0.95, Math.min(reach * 0.95, tx - P[tossS].x)), dy = -Math.sqrt(reach * reach - dx * dx);
    Q[tossW] = { ...Q[tossW], x: P[tossS].x + dx, y: P[tossS].y + dy };
    Q[tossE] = { ...Q[tossE], x: P[tossS].x + dx * l1 / reach, y: P[tossS].y + dy * l1 / reach };
    return { to: Q, parts: [[tossS, tossE], [tossE, tossW]], mark: { x: tx, y: Q[tossW].y },
      cue: L('トスは前足の少し前の真上へ。腕の向きごと前に。', '토스는 앞발 살짝 앞, 그 위로. 팔 방향째로 앞으로.') };
  }
  if (item === 'elbow') {
    if (!ok(P, rs, re, rw)) return null;
    const l2 = len(P[re], P[rw]), up = Math.atan2(P[rs].y - P[re].y, P[rs].x - P[re].x); // elbow→shoulder direction
    const cand = [up + rad(90), up - rad(90)].map(a => ({ x: P[re].x + Math.cos(a) * l2, y: P[re].y + Math.sin(a) * l2 }));
    Q[rw] = { ...Q[rw], ...(cand[0].y < cand[1].y ? cand[0] : cand[1]) }; // forearm pointing up
    return { to: Q, parts: [[re, rw]], cue: L('トロフィーでひじを90°に曲げ、ラケットを立てる。', '트로피에서 팔꿈치를 90°로 접고 라켓을 세우기.') };
  }
  if (item === 'knee') {
    const legs = [[23, 25, 27], [24, 26, 28]].filter(l => ok(P, ...l));
    if (!legs.length) return null;
    const target = level === 'mid' ? 125 : 140;
    let drop = 0;
    for (const [h, k, a] of legs) {
      const t = len(P[h], P[k]), s = len(P[k], P[a]), th = rad(Math.min(angAt(P, h, k, a), target));
      const hk = Math.sqrt(t * t + s * s - 2 * t * s * Math.cos(th));
      const newHipY = P[a].y - hk; drop = Math.max(drop, newHipY - P[h].y);
      Q[h] = { ...Q[h], y: newHipY };
      // knee goes forward (toward d) on the circle of both segments
      const cx = P[h].x, cy = newHipY, dist = len({ x: cx, y: cy }, P[a]);
      const along = (t * t - s * s + dist * dist) / (2 * dist), hgt = Math.sqrt(Math.max(0, t * t - along * along));
      const ux = (P[a].x - cx) / dist, uy = (P[a].y - cy) / dist, mx = cx + ux * along, my = cy + uy * along;
      const k1 = { x: mx - uy * hgt, y: my + ux * hgt }, k2 = { x: mx + uy * hgt, y: my - ux * hgt };
      Q[k] = { ...Q[k], ...((k1.x - cx) * d > (k2.x - cx) * d ? k1 : k2) };
      Q[h].x = cx;
    }
    for (const j of [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16]) if (Q[j]) Q[j].y += drop; // upper body sinks with the hips
    return { to: Q, parts: [[23, 25], [25, 27], [24, 26], [26, 28], [11, 23], [12, 24]],
      cue: L(`トロフィーで膝を約${target}°まで曲げて、地面を押す準備。`, `트로피에서 무릎을 약 ${target}°까지 굽혀 바닥을 누를 준비.`), target };
  }
  return null;
}

const EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
// Animate: photo + faint full skeleton, current part (orange) fixed, moving part morphs to corrected (blue).
export function playFix(canvas, img, P, fix) {
  const c = canvas.getContext('2d'), W = canvas.width, Hh = canvas.height, sc = W / img.naturalWidth;
  const key = new Set(fix.parts.map(p => p.join('-')));
  let raf, t0 = performance.now();
  const lw = Math.max(3, W / 70);
  const line = (a, b, col, w, dash) => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); c.moveTo(a.x * sc, a.y * sc); c.lineTo(b.x * sc, b.y * sc); c.stroke(); };
  const frame = now => {
    if (!canvas.isConnected) return;
    const T = ((now - t0) % 3000) / 3000, k = T < 0.15 ? 0 : T < 0.55 ? (T - 0.15) / 0.4 : 1, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    c.drawImage(img, 0, 0, W, Hh); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 0, W, Hh);
    c.lineCap = 'round';
    const M = P.map((q, i) => q && fix.to[i] && { x: q.x + (fix.to[i].x - q.x) * e, y: q.y + (fix.to[i].y - q.y) * e });
    for (const [a, b] of EDGES) if (P[a] && P[b] && P[a].v >= .5 && P[b].v >= .5 && !key.has(a + '-' + b)) line(M[a], M[b], 'rgba(255,255,255,.85)', lw * 0.8);
    for (const [a, b] of fix.parts) if (P[a] && P[b]) line(P[a], P[b], '#F08A3C', lw * 1.3, [lw * 1.5, lw]);
    for (const [a, b] of fix.parts) if (M[a] && M[b]) line(M[a], M[b], '#3D8BFF', lw * 1.6);
    if (fix.mark) { c.setLineDash([]); c.strokeStyle = '#D9E43A'; c.lineWidth = lw; c.beginPath(); c.arc(fix.mark.x * sc, fix.mark.y * sc, lw * 2.4, 0, 7); c.stroke(); }
    c.setLineDash([]); c.font = `700 ${Math.round(W / 16)}px sans-serif`; c.fillStyle = '#fff';
    c.fillText(e < 0.5 ? L('今', '지금') : L('目標', '목표'), W * 0.05, Hh * 0.07);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
