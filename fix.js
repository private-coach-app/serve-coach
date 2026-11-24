// "How to fix it" on the user's own photo: the current line (orange, dotted) morphs into the corrected line (blue).
// pts: MediaPipe landmarks in photo pixels {x,y,v}. d: hitting direction (+1 right / -1 left). side: { tossS, tossE, tossW, racket }.
import { L } from './i18n.js';

const ok = (P, ...i) => i.every(j => P[j] && P[j].v >= 0.5);
const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const deg = r => r * 180 / Math.PI, rad = a => a * Math.PI / 180;
function angAt(A, B, C) { const u = [A.x - B.x, A.y - B.y], v = [C.x - B.x, C.y - B.y]; return deg(Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) + 1e-9))))); }
const bodyH = P => P[0] && P[27] && P[28] && P[0].v >= .5 ? ((P[27].y + P[28].y) / 2 - P[0].y) * 1.08 : 3 * len(P[11], P[23]);

// Build the corrected pose for one item. value = the measured value (decides the direction of the cue). Returns { to, parts, cue, target?, mark? } or null.
export function correct(item, P, d, level, side, value) {
  const Q = P.map(q => q && { ...q }), H = bodyH(P);
  const { tossS, tossE, tossW } = side, [rs, re, rw] = side.racket;
  const set = (i, x, y) => { Q[i] = { ...Q[i], x, y }; };
  if (item === 'tossH' || item === 'hold') {
    if (!ok(P, tossS, tossE, tossW)) return null;
    const l1 = len(P[tossS], P[tossE]), l2 = len(P[tossE], P[tossW]), a = rad(172), ux = Math.sin(a) * d, uy = Math.cos(a);
    set(tossE, P[tossS].x + ux * l1, P[tossS].y + uy * l1); set(tossW, P[tossS].x + ux * (l1 + l2), P[tossS].y + uy * (l1 + l2));
    return { to: Q, parts: [[tossS, tossE], [tossE, tossW]],
      cue: item === 'tossH' ? L('ひじが伸び切るまで腕を上げ、指先を真上へ。', '팔꿈치가 다 펴질 때까지 팔을 올리고, 손끝을 바로 위로.') : L('ラケットが上がってくるまで、この位置に腕を残す。', '라켓이 올라올 때까지 이 위치에 팔을 남겨 두기.') };
  }
  if (item === 'tossPos') {
    if (!ok(P, tossS, tossE, tossW) || !(P[27] && P[28] && P[27].v >= 0.3 && P[28].v >= 0.3)) return null;
    const front = d > 0 ? Math.max(P[27].x, P[28].x) : Math.min(P[27].x, P[28].x);
    const tx = front + 0.07 * H * d, l1 = len(P[tossS], P[tossE]), reach = l1 + len(P[tossE], P[tossW]);
    const dx = Math.max(-reach * 0.95, Math.min(reach * 0.95, tx - P[tossS].x)), dy = -Math.sqrt(reach * reach - dx * dx);
    set(tossW, P[tossS].x + dx, P[tossS].y + dy); set(tossE, P[tossS].x + dx * l1 / reach, P[tossS].y + dy * l1 / reach);
    const tooFar = value > 0;
    return { to: Q, parts: [[tossS, tossE], [tossE, tossW]], mark: { x: tx, y: Q[tossW].y },
      cue: tooFar ? L('腕をもう少し立てて、前足の少し前の真上(黄色の丸)に上げる。', '팔을 조금 더 세워서, 앞발 살짝 앞의 바로 위(노란 원)로 올리기.')
                  : L('腕ごともう少し前へ。前足の少し前の真上(黄色の丸)に上げる。', '팔째로 조금 더 앞으로. 앞발 살짝 앞의 바로 위(노란 원)로 올리기.') };
  }
  if (item === 'elbow') {
    if (!ok(P, rs, re, rw)) return null;
    // the standard L: elbow at shoulder height behind the body, forearm straight up
    const l1 = len(P[rs], P[re]), l2 = len(P[re], P[rw]);
    set(re, P[rs].x - d * l1 * 0.95, P[rs].y + l1 * 0.1); set(rw, Q[re].x, Q[re].y - l2);
    return { to: Q, parts: [[rs, re], [re, rw]], target: 90,
      cue: L('ひじを肩の高さまで上げて、ひじから先を立てる(L字)。', '팔꿈치를 어깨 높이까지 올리고, 팔꿈치 아래를 세우기(L자).') };
  }
  if (item === 'knee') {
    const legs = [[23, 25, 27], [24, 26, 28]].filter(l => ok(P, ...l));
    if (!legs.length) return null;
    const target = level === 'mid' ? 125 : 140;
    // ankles stay where they are; both hips sink by the same amount, enough for the straighter leg to reach the target angle
    let drop = 0;
    for (const [h, k, a] of legs) {
      const t = len(P[h], P[k]), s = len(P[k], P[a]);
      if (angAt(P[h], P[k], P[a]) <= target) continue;
      const hk = Math.sqrt(t * t + s * s - 2 * t * s * Math.cos(rad(target))), dx = P[h].x - P[a].x;
      if (hk <= Math.abs(dx)) continue;
      drop = Math.max(drop, (P[a].y - Math.sqrt(hk * hk - dx * dx)) - P[h].y);
    }
    if (drop <= 1) return null;
    for (const [h, k, a] of legs) {
      const t = len(P[h], P[k]), s = len(P[k], P[a]), cx = P[h].x, cy = P[h].y + drop;
      const dist = Math.min(t + s - 0.01, Math.hypot(P[a].x - cx, P[a].y - cy));
      const ux = (P[a].x - cx) / (Math.hypot(P[a].x - cx, P[a].y - cy) || 1), uy = (P[a].y - cy) / (Math.hypot(P[a].x - cx, P[a].y - cy) || 1);
      const along = (t * t - s * s + dist * dist) / (2 * dist), hgt = Math.sqrt(Math.max(0, t * t - along * along));
      const mx = cx + ux * along, my = cy + uy * along, k1 = { x: mx - uy * hgt, y: my + ux * hgt }, k2 = { x: mx + uy * hgt, y: my - ux * hgt };
      const kn = (k1.x - cx) * d > (k2.x - cx) * d ? k1 : k2;   // the knee goes toward the hitting direction
      set(h, cx, cy); set(k, kn.x, kn.y);
    }
    for (const j of [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16]) if (Q[j]) Q[j].y += drop; // upper body sinks with the hips
    for (const h of [23, 24]) if (Q[h] && !legs.some(l => l[0] === h)) Q[h].y += drop;
    return { to: Q, parts: [[23, 25], [25, 27], [24, 26], [26, 28]], target,
      cue: L(`トスと一緒に、ひざを約${target}°まで曲げる。`, `토스와 함께 무릎을 약 ${target}°까지 굽히기.`) };
  }
  // ---- ground strokes ----
  const armTo = (tx, ty) => {            // racket arm reaches for (tx, ty): shoulder stays, elbow hangs below the line
    const S = P[rs], l1 = len(P[rs], P[re]), l2 = len(P[re], P[rw]);
    let dx = tx - S.x, dy = ty - S.y, dd = Math.hypot(dx, dy) || 1; const mx = (l1 + l2) * 0.98, mn = Math.abs(l1 - l2) + 1;
    const k = Math.max(mn, Math.min(mx, dd)) / dd; dx *= k; dy *= k; dd *= k;
    const along = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - along * along)), ux = dx / dd, uy = dy / dd;
    const e1 = { x: S.x + ux * along - uy * h, y: S.y + uy * along + ux * h }, e2 = { x: S.x + ux * along + uy * h, y: S.y + uy * along - ux * h };
    const e = e1.y > e2.y ? e1 : e2; set(re, e.x, e.y); set(rw, S.x + dx, S.y + dy);
  };
  if (item === 'contact') {
    if (!ok(P, rs, re, rw, 23, 24)) return null;
    const hipX = (P[23].x + P[24].x) / 2, late = !(value > 0.12);
    armTo(hipX + d * 0.3 * H, P[rw].y);
    return { to: Q, parts: [[rs, re], [re, rw]], mark: { x: Q[rw].x, y: Q[rw].y },
      cue: late ? L('ボールが体の横に来る前に、体の前(黄色の丸)でとらえる。', '공이 몸 옆에 오기 전에, 몸 앞(노란 원)에서 맞히기.') : L('腕が伸び切る前、少し引きつけた位置(黄色の丸)でとらえる。', '팔이 다 펴지기 전, 조금 끌어당긴 위치(노란 원)에서 맞히기.') };
  }
  if (item === 'finish') {
    if (!ok(P, rs, re, rw)) return null;
    const reach = len(P[rs], P[re]) + len(P[re], P[rw]);
    armTo(P[rs].x + d * 0.45 * reach, P[rs].y - 0.7 * reach);
    return { to: Q, parts: [[rs, re], [re, rw]], cue: L('打ったあとも止めずに、手が肩より上に来るまで振り抜く。', '친 뒤에도 멈추지 말고, 손이 어깨 위에 올 때까지 휘두르기.') };
  }
  if (item === 'weight') {
    if (!ok(P, 11, 12, 23, 24)) return null;
    const dx = d * 0.1 * H;
    for (const j of [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24]) if (Q[j]) Q[j].x += dx;
    for (const j of [25, 26]) if (Q[j]) Q[j].x += dx * 0.5;
    return { to: Q, parts: [[11, 23], [12, 24], [23, 25], [24, 26]], cue: L('打ちながら、腰ごと前足の上へ移動する。', '치면서 허리째로 앞발 위로 옮겨 가기.') };
  }
  return null;
}

const EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
// Animate: photo, faint full skeleton, the current part (orange dotted) stays, the same part morphs to the corrected shape (blue).
export function playFix(canvas, img, P, fix) {
  const c = canvas.getContext('2d'), W = canvas.width, Hh = canvas.height, sc = W / img.naturalWidth;
  const key = new Set(fix.parts.map(p => p.join('-')));
  let raf, t0 = performance.now();
  const lw = Math.max(3, W / 70);
  const line = (a, b, col, w, dash) => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); c.moveTo(a.x * sc, a.y * sc); c.lineTo(b.x * sc, b.y * sc); c.stroke(); };
  const frame = now => {
    if (!canvas.isConnected) return;
    const T = ((now - t0) % 3200) / 3200, k = T < 0.2 ? 0 : T < 0.55 ? (T - 0.2) / 0.35 : 1, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    c.drawImage(img, 0, 0, W, Hh); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, 0, W, Hh);
    c.lineCap = 'round';
    const M = P.map((q, i) => q && fix.to[i] && { x: q.x + (fix.to[i].x - q.x) * e, y: q.y + (fix.to[i].y - q.y) * e });
    for (const [a, b] of EDGES) if (P[a] && P[b] && P[a].v >= .5 && P[b].v >= .5 && !key.has(a + '-' + b)) line(M[a], M[b], 'rgba(255,255,255,.8)', lw * 0.7);
    for (const [a, b] of fix.parts) if (P[a] && P[b]) line(P[a], P[b], '#F08A3C', lw * 1.2, [lw * 1.5, lw]);
    for (const [a, b] of fix.parts) if (M[a] && M[b]) line(M[a], M[b], '#3D8BFF', lw * 1.6);
    if (fix.mark) { c.setLineDash([]); c.strokeStyle = '#D9E43A'; c.lineWidth = lw; c.beginPath(); c.arc(fix.mark.x * sc, fix.mark.y * sc, lw * 2.4, 0, 7); c.stroke(); }
    // label chip
    c.setLineDash([]); const fs = Math.round(W / 13), txt = e < 0.5 ? L('今', '지금') : L('目標', '목표');
    c.font = `700 ${fs}px sans-serif`; const tw = c.measureText(txt).width;
    c.fillStyle = e < 0.5 ? '#F08A3C' : '#3D8BFF'; c.beginPath(); c.roundRect(W * 0.04, Hh * 0.03, tw + fs, fs * 1.6, fs * 0.8); c.fill();
    c.fillStyle = '#fff'; c.fillText(txt, W * 0.04 + fs / 2, Hh * 0.03 + fs * 1.15);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
