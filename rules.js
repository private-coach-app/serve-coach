// Coaching rules (v2, after the independent audit). Ranges other than the knee are provisional pending coach review.
import { L, WD } from './i18n.js';

export const RULES_V = 2;
export const fin = v => typeof v === 'number' && Number.isFinite(v);
const pc = v => Math.round(v * 100);

// Each item: band(level) = [lo, hi] "good" range, warnLo / warnHi = beyond these it is the starting point ("ここから").
export const ITEMS = {
  tossPos: {
    name: () => L('トスの位置', '토스 위치'),
    band: () => [-0.02, 0.17], warnLo: () => -0.08, warnHi: () => 0.30,
    fmt: v => Math.abs(v) < 0.015 ? L('前足の真上', '앞발 바로 위') : v > 0 ? L(`前足より身長の約${pc(v)}%ぶん前`, `앞발보다 키의 약 ${pc(v)}%만큼 앞`) : L(`前足より身長の約${pc(-v)}%ぶん後ろ`, `앞발보다 키의 약 ${pc(-v)}%만큼 뒤`),
    ideal: () => L('目安：前足の真上〜身長の約15%ぶん前', '기준: 앞발 바로 위 ~ 키의 약 15%만큼 앞'),
    good: () => L('トスを前足の少し前に上げられています。', '토스를 앞발 살짝 앞에 올리고 있어요.'),
    msg: v => v < 0 ? L('トスが体の後ろ寄りです。前足の少し前の真上に上げましょう。', '토스가 몸 뒤쪽으로 가요. 앞발 살짝 앞, 바로 위로 올려 보세요.')
                    : L('トスが前に行きすぎています。前足の少し前の真上に上げましょう。', '토스가 너무 앞으로 나가요. 앞발 살짝 앞, 바로 위로 올려 보세요.'),
    short: v => v < 0 ? L('トスをもう少し前へ', '토스를 조금 더 앞으로') : L('トスを体の近くへ', '토스를 몸 가까이로'),
    mdc: 0.05, part: 'toss' },
  tossH: {
    name: () => L('トスの腕の伸び', '토스 팔 뻗기'),
    band: () => [0.85, 9], warnLo: () => 0.70, warnHi: () => 9,
    fmt: v => L(`腕の長さの約${pc(v)}%まで上がっています`, `팔 길이의 약 ${pc(v)}%까지 올라갔어요`),
    ideal: () => L('目安：腕の長さの85%以上(ほぼ真上)', '기준: 팔 길이의 85% 이상(거의 수직 위)'),
    good: () => L('トスの腕を真上までしっかり伸ばせています。', '토스 팔을 바로 위까지 잘 뻗고 있어요.'),
    msg: () => L('トスの腕が上まで伸び切っていません。ボールを離した後も、ひじを伸ばして指先を空へ。', '토스 팔이 끝까지 올라가지 않아요. 공을 놓은 뒤에도 팔꿈치를 펴고 손끝을 하늘로.'),
    short: () => L('トスの腕を真上まで伸ばす', '토스 팔을 바로 위까지 뻗기'),
    mdc: 0.07, part: 'toss' },
  hold: {
    name: () => L('トスした腕を上に残す', '토스한 팔 위에 남기기'),
    band: () => [0.35, 99], warnLo: () => 0.20, warnHi: () => 99,
    fmt: v => L(`上で約${v.toFixed(1)}秒`, `위에서 약 ${v.toFixed(1)}초`),
    ideal: () => L('目安：いちばん高い位置の近くで0.35秒以上', '기준: 가장 높은 위치 근처에서 0.35초 이상'),
    good: () => L('トスした腕を上にしっかり残せています。', '토스한 팔을 위에 잘 남겨 두고 있어요.'),
    msg: () => L('トスした腕がすぐ下がっています。ラケットが上がってくるまで、腕を上に残しましょう。', '토스한 팔이 바로 내려와요. 라켓이 올라올 때까지 팔을 위에 남겨 두세요.'),
    short: () => L('トスした腕を上に残す', '토스한 팔을 위에 남기기'),
    mdc: 0.10, part: 'toss' },
  elbow: {
    name: () => L('ラケットを持つ腕のひじ', '라켓 든 팔의 팔꿈치'),
    band: () => [70, 110], warnLo: () => 60, warnHi: () => 130,
    fmt: v => Math.round(v) + '°',
    ideal: () => L('目安：70〜110°(L字)', '기준: 70~110°(L자)'),
    good: () => L('打つ直前のひじの角度が良いです。', '치기 직전 팔꿈치 각도가 좋아요.'),
    msg: v => v > 110 ? L('ひじが伸びぎみです。打つ直前の姿勢でL字(90°くらい)を作りましょう。', '팔꿈치가 펴져 있어요. 치기 직전 자세에서 L자(90° 정도)를 만들어 보세요.')
                      : L('ひじが曲がりすぎています。L字(90°くらい)まで少し開きましょう。', '팔꿈치가 너무 접혀 있어요. L자(90° 정도)까지 조금 펴 보세요.'),
    short: v => v > 110 ? L('ひじをL字に曲げる', '팔꿈치를 L자로 접기') : L('ひじをL字まで開く', '팔꿈치를 L자까지 펴기'),
    mdc: 12, part: 'racket' },
  knee: {
    name: () => L('ひざの曲げ', '무릎 굽히기'),
    band: lv => [0, lv === 'mid' ? 140 : 150], warnLo: () => -1, warnHi: lv => lv === 'mid' ? 155 : 165,
    fmt: v => Math.round(v) + '°',
    ideal: lv => L(`目安：${lv === 'mid' ? '中級は140°' : '初級は150°'}以下(上級者の平均は約115°)`, `기준: ${lv === 'mid' ? '중급은 140°' : '초급은 150°'} 이하(상급자 평균은 약 115°)`),
    good: () => L('打つ直前にひざをしっかり曲げられています。', '치기 직전에 무릎을 잘 굽히고 있어요.'),
    msg: () => L('ひざがあまり曲がっていません。トスと一緒にひざを曲げて、地面を押す準備をしましょう。', '무릎이 별로 굽지 않아요. 토스와 함께 무릎을 굽혀 바닥을 누를 준비를 해 보세요.'),
    short: () => L('トスと一緒にひざを曲げる', '토스와 함께 무릎 굽히기'),
    mdc: 10, part: 'legs' },
};
export const PRIORITY = ['tossPos', 'tossH', 'hold', 'elbow', 'knee'];
export const LABEL = () => ({ ref: L('参考', '참고'), good: L('良い', '좋아요'), mid: L('あと少し', '조금만 더'), warn: L('ここから', '여기부터'), na: L('今回は測れず', '이번엔 못 쟀어요') });
export const CMP = () => ({ up: L('良くなった', '좋아졌어요'), same: L('ほぼ同じ', '거의 같아요'), keep: L('良い状態のまま', '좋은 상태 그대로'), down: L('前回より下がった', '지난번보다 내려갔어요') });

export function judge(M, k, v, level) {
  if (!fin(v)) return 'na';
  const it = M.items[k], [lo, hi] = it.band(level);
  if (it.ref) return 'ref';
  if (v >= lo && v <= hi) return 'good';
  return v < it.warnLo(level) || v > it.warnHi(level) ? 'warn' : 'mid';
}
export function judgeAll(M, m, level) { const out = {}; for (const k of M.order) out[k] = judge(M, k, m[k], level); return out; }
// Order to fix things: "ここから" items first, then "あと少し", each in the motion's own order.
export const fixOrder = (M, j) => [...M.order.filter(k => j[k] === 'warn'), ...M.order.filter(k => j[k] === 'mid')];
export const pickTask = (M, j) => fixOrder(M, j)[0] || 'keep';
// Skeleton joints to highlight for an item, from the arms actually used in this video.
export function jointsFor(M, k, side) {
  const part = M.items[k] && M.items[k].part;
  if (part === 'toss') return [side.tossS, side.tossE, side.tossW];
  if (part === 'racket') return side.racket;
  if (part === 'body') return [11, 12, 23, 24];
  return [23, 25, 27, 24, 26, 28];
}

// Drill DB (subset of coach draft #1–30). place: home | court
const D = (ja, ko, dja, dko, place, min) => ({ t: () => L(ja, ko), d: () => L(dja, dko), place, min });
export const DRILLS = {
  tossPos: [
    D('ラケット的当てトス', '라켓 표적 토스', '前足の前にラケットを寝かせて置き、トスしたボールがラケットの面に落ちるように。10回×2。', '앞발 앞에 라켓을 눕혀 두고, 토스한 공이 라켓 면에 떨어지게. 10회×2.', 'court', 5),
    D('壁沿いトス', '벽 따라 토스', '壁に横向きに立ち、手が壁に沿ってまっすぐ上がるようにトスの動きだけ。10回×2(ボールなしでもOK)。', '벽에 옆으로 서서, 손이 벽을 따라 똑바로 올라가게 토스 동작만. 10회×2(공 없이도 OK).', 'home', 5),
  ],
  tossH: [
    D('トスして手を止める', '토스하고 손 멈추기', 'トスした腕でボールを指さしたまま2秒止める。10回。', '토스한 팔로 공을 가리킨 채 2초 멈추기. 10회.', 'home', 5),
    D('トスの高さ合わせ', '토스 높이 맞추기', '伸ばした腕の先より30〜50cm上がボールの頂点になるよう、フェンスなどに目印を決めてトス。10回×2。', '뻗은 팔 끝보다 30~50cm 위가 공의 정점이 되게, 펜스 등에 기준점을 정해 토스. 10회×2.', 'court', 5),
  ],
  hold: [
    D('トスして手を止める', '토스하고 손 멈추기', 'トスした腕でボールを指さしたまま2秒止める。10回。', '토스한 팔로 공을 가리킨 채 2초 멈추기. 10회.', 'home', 5),
    D('トスして打たずに止まる', '토스하고 치지 않고 멈추기', 'トスして、打つ直前の姿勢のまま打たずに2秒止まる。10回。', '토스하고, 치기 직전 자세 그대로 치지 않고 2초 멈추기. 10회.', 'court', 5),
  ],
  elbow: [
    D('タオルでL字キープ', '수건으로 L자 유지', 'ラケットの代わりにタオルを持ち、ひじを肩の高さでL字にして3秒止める。10回。', '라켓 대신 수건을 들고, 팔꿈치를 어깨 높이에서 L자로 만들어 3초 멈추기. 10회.', 'home', 5),
    D('L字の姿勢から打つ', 'L자 자세에서 시작해 치기', '先に打つ直前の姿勢(ひじL字)を作ってから、トスして打つ。10回。', '먼저 치기 직전 자세(팔꿈치 L자)를 만든 뒤, 토스해서 치기. 10회.', 'court', 10),
  ],
  knee: [
    D('トスとひざを同時に', '토스와 무릎을 동시에', 'トスの腕が上がるのに合わせてひざを曲げるリズムだけを繰り返す(ボールなし)。10回×2。', '토스 팔이 올라가는 것에 맞춰 무릎을 굽히는 리듬만 반복(공 없이). 10회×2.', 'home', 5),
    D('「1・2・3」で打つ', '「하나·둘·셋」으로 치기', '「1(トス)・2(ひざを曲げる)・3(伸びて打つ)」と声に出して、ゆっくりサーブ。10回。', '「하나(토스)·둘(무릎 굽히기)·셋(뻗으며 치기)」 소리 내며 천천히 서브. 10회.', 'court', 10),
  ],
  keep: [
    D('ゆっくり素振り', '천천히 빈 스윙', 'サーブの動きを半分の速さで素振り(ボールなし)。5回。', '서브 동작을 절반 속도로 빈 스윙(공 없이). 5회.', 'home', 5),
    D('同じリズムで入れる', '같은 리듬으로 넣기', '強く打たず、同じリズムでコートに入れるだけ。10回。', '세게 치지 않고, 같은 리듬으로 코트에 넣기만. 10회.', 'court', 10),
  ],
};
export const WARMUP = D('準備運動', '준비운동', '肩回し・腕回し・体のひねりを合わせて3分。', '어깨 돌리기·팔 돌리기·몸통 비틀기 합쳐 3분.', 'both', 3);

// Local calendar date (never UTC: before 9 a.m. in Japan/Korea the UTC date is still yesterday).
export const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dayDiff = (a, b) => { const p = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 864e5); };

// Schedule: today (day 0) through the same weekday next week (day 7). Stores drill indices only, so it renders in either language.
// The re-film day is the last court day in days 1–7 (day 7 if there is none).
export function makeSchedule(M, task, courtDays, start = new Date()) {
  const DRILLS = M.drills;
  const days = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const court = courtDays.includes(d.getDay());
    const idx = DRILLS[task].map((x, j) => j).filter(j => court || DRILLS[task][j].place === 'home');
    days.push({ date: ymd(d), dow: d.getDay(), court, drills: idx.length ? idx : [0], film: false });
  }
  let f = 7; for (let i = 7; i >= 1; i--) if (days[i].court) { f = i; break; }
  days[f].film = true;
  return days.slice(0, f + 1);   // the plan ends on the re-film day
}
export const filmDay = days => days.find(d => d.film) || days[days.length - 1];
export const wd = dow => WD()[dow];

// Compare two sessions. Only the distance outside the "good" range counts, so changes inside the good range are never a step back.
export function compare(M, now, prev, level) {
  const rows = [];
  for (const k of M.order) {
    const a = prev[k], b = now[k], it = M.items[k];
    if (!fin(a) || !fin(b) || it.ref) continue;
    const [lo, hi] = it.band(level), out = v => v < lo ? lo - v : v > hi ? v - hi : 0;
    const gain = out(a) - out(b);
    const res = out(a) === 0 && out(b) === 0 ? 'keep' : Math.abs(b - a) < it.mdc || gain === 0 ? 'same' : gain > 0 ? 'up' : 'down';
    rows.push({ k, a, b, res });
  }
  return rows;
}

// ---------- forehand / backhand (ground strokes, side view). All ranges are provisional pending coach review. ----------
const strokeItems = bh => ({
  finish: {
    name: () => L('振り終わりの手の高さ', '마지막에 손이 오는 높이'),
    band: () => [-0.3, 9], warnLo: () => -0.8, warnHi: () => 9,
    fmt: v => v >= 0 ? L('手が肩より上まで上がっています', '손이 어깨 위까지 올라갔어요') : v >= -0.3 ? L('手が肩のあたりまで上がっています', '손이 어깨 근처까지 올라갔어요') : v > -0.8 ? L('手が胸からおなかのあたりで止まっています', '손이 가슴~배 근처에서 멈췄어요') : L('手が腰のあたりで止まっています', '손이 허리 근처에서 멈췄어요'),
    ideal: () => L('目安：最後に手が肩のあたりより上まで', '기준: 마지막에 손이 어깨 근처보다 위까지'),
    good: () => L('最後まで大きく振れています。', '끝까지 크게 휘두르고 있어요.'),
    msg: () => bh ? L('振りが途中で止まっています。打ったあと、手を肩より上まで大きく振りましょう。', '스윙이 중간에 멈춰요. 친 뒤 손을 어깨 위까지 크게 휘둘러 보세요.')
                  : L('振りが途中で止まっています。打ったあと、手を反対の肩の上まで振りましょう。', '스윙이 중간에 멈춰요. 친 뒤 손을 반대쪽 어깨 위까지 휘둘러 보세요.'),
    short: () => L('最後に手を肩より上まで上げる', '마지막에 손을 어깨 위까지 올리기'),
    mdc: 0.3, part: 'racket' },
  weight: {
    name: () => L('打ち終わりの体の位置', '치고 난 뒤 몸의 위치'),
    band: () => [0.55, 9], warnLo: () => 0.35, warnHi: () => 9,
    fmt: v => v >= 0.55 ? L('腰が前足寄りにあります', '허리가 앞발 쪽에 있어요') : v >= 0.35 ? L('腰が両足のまん中あたりにあります', '허리가 두 발 가운데쯤에 있어요') : L('腰が後ろ足寄りに残っています', '허리가 뒷발 쪽에 남아 있어요'),
    ideal: () => L('目安：打ち終わりに、腰が両足のまん中より前足寄り', '기준: 치고 난 뒤 허리가 두 발 가운데보다 앞발 쪽'),
    good: () => L('打ち終わりに、体が前足の上まで移っています。', '치고 난 뒤 몸이 앞발 위까지 옮겨 가 있어요.'),
    msg: v => v < 0.35 ? L('打ち終わっても体が後ろ足に残っています。前足を踏み込んで、体ごと前へ打ちましょう。', '치고 나서도 몸이 뒷발에 남아 있어요. 앞발을 내디디며 몸째로 앞으로 쳐 보세요.')
                       : L('体があまり前へ移っていません。前足を踏み込んで、体ごと前へ打ちましょう。', '몸이 앞으로 별로 옮겨 가지 않아요. 앞발을 내디디며 몸째로 앞으로 쳐 보세요.'),
    short: () => L('前足を踏み込んで、体ごと前へ打つ', '앞발을 내디디며 몸째로 앞으로 치기'),
    mdc: 0.15, part: 'body' },
  knee: {
    name: () => L('ひざの曲げ', '무릎 굽히기'),
    band: lv => [0, lv === 'mid' ? 140 : 150], warnLo: () => -1, warnHi: lv => lv === 'mid' ? 155 : 165,
    fmt: v => Math.round(v) + '°',
    ideal: lv => L(`目安：${lv === 'mid' ? '中級は140°' : '初級は150°'}以下`, `기준: ${lv === 'mid' ? '중급은 140°' : '초급은 150°'} 이하`),
    good: () => L('打つ前にひざを曲げて、低い姿勢を作れています。', '치기 전에 무릎을 굽혀 낮은 자세를 만들고 있어요.'),
    msg: () => L('ひざが伸びたまま打っています。ラケットを後ろに引くときにひざを曲げて、低く構えましょう。', '무릎이 펴진 채로 쳐요. 라켓을 뒤로 뺄 때 무릎을 굽혀 낮게 준비해 보세요.'),
    short: () => L('ラケットを引くときにひざを曲げる', '라켓을 뺄 때 무릎 굽히기'),
    mdc: 10, part: 'legs' },
  // Reference only: at 30 frames per second the moment of contact cannot be located precisely, so this is shown but never judged.
  contact: {
    ref: true,
    name: () => L('ボールに当たる位置', '공 맞는 위치'),
    band: () => [-9, 9], warnLo: () => -9, warnHi: () => 9,
    fmt: v => v > 0.1 ? L('体より前', '몸보다 앞') : v > -0.05 ? L('体のほぼ真横', '몸 거의 바로 옆') : L('体より後ろ', '몸보다 뒤'),
    ideal: () => L('目安：体より少し前(ふつうの動画では正確に測れないため、判定はしていません)', '기준: 몸보다 살짝 앞 (일반 영상으로는 정확히 잴 수 없어서 판정하지 않아요)'),
    good: () => '', msg: () => '', short: () => '',
    mdc: 9, part: 'racket' },
});
const strokeDrills = bh => ({
  contact: [
    D('ボールに当たる位置で止める素振り', '공이 맞을 위치에서 멈추는 빈 스윙', '体の少し前でラケットを止め、位置を目で確認する。10回×2。', '몸 살짝 앞에서 라켓을 멈추고 위치를 눈으로 확인. 10회×2.', 'home', 5),
    D('投げてもらったボールを前で打つ', '던져 준 공을 앞에서 치기', '近くからゆっくり投げてもらったボールを、前足より少し前で打つ。10球×2。', '가까이서 천천히 던져 준 공을 앞발보다 살짝 앞에서 치기. 10구×2.', 'court', 10),
  ],
  weight: [
    D('踏み込み素振り', '내딛는 빈 스윙', '前足を一歩踏み込みながら素振り。打ち終わりに後ろ足のかかとが浮くまで。10回×2。', '앞발을 한 걸음 내디디며 빈 스윙. 끝났을 때 뒷발 뒤꿈치가 뜰 때까지. 10회×2.', 'home', 5),
    D('踏み込んで打つ', '내디디며 치기', '投げてもらったボールを、前足を踏み込みながら打つ。打ったあと前足1本で立てるか確認。10球×2。', '던져 준 공을 앞발을 내디디며 치기. 친 뒤 앞발 하나로 설 수 있는지 확인. 10구×2.', 'court', 10),
  ],
  knee: [
    D('低い構えの素振り', '낮은 자세 빈 스윙', 'ラケットを引くと同時にひざを曲げ、伸び上がりながら振る。10回×2。', '라켓을 빼는 것과 동시에 무릎을 굽히고, 일어서면서 휘두르기. 10회×2.', 'home', 5),
    D('低いボールを打つ', '낮은 공 치기', 'ひざの高さに出してもらったボールを、ひざを曲げて打つ(腰を折らない)。10球×2。', '무릎 높이로 던져 준 공을 무릎을 굽혀서 치기(허리를 숙이지 않기). 10구×2.', 'court', 10),
  ],
  finish: [
    D('振り終わりで止まる素振り', '끝 자세에서 멈추는 빈 스윙', bh ? '最後に手が肩より上に来たところで2秒止まる。10回×2。' : '最後に手が反対の肩の上に来たところで2秒止まる。10回×2。', bh ? '마지막에 손이 어깨 위에 온 곳에서 2초 멈추기. 10회×2.' : '마지막에 손이 반대쪽 어깨 위에 온 곳에서 2초 멈추기. 10회×2.', 'home', 5),
    D('ゆっくり大きく打つ', '천천히 크게 치기', '7割の力で、最後まで振り切ることだけ意識して打つ。10球×2。', '70% 힘으로, 끝까지 휘두르는 것만 생각하며 치기. 10구×2.', 'court', 10),
  ],
  keep: [
    D('ゆっくり素振り', '천천히 빈 스윙', '同じ動きを半分の速さで素振り。5回。', '같은 동작을 절반 속도로 빈 스윙. 5회.', 'home', 5),
    D('同じリズムで打つ', '같은 리듬으로 치기', '強く打たず、同じリズムでコートに入れるだけ。10球。', '세게 치지 않고, 같은 리듬으로 코트에 넣기만. 10구.', 'court', 10),
  ],
});

export const MOTIONS = {
  serve: { id: 'serve', name: () => L('サーブ', '서브'), unit: () => L('本', '개'), items: ITEMS, order: PRIORITY, drills: DRILLS,
    orderNote: () => L('サーブは前の動きが崩れると後ろも崩れるので、トス → 腕 → 脚の順に直します。', '서브는 앞 동작이 흔들리면 뒤도 흔들려서, 토스 → 팔 → 다리 순서로 고쳐요.') },
  forehand: { id: 'forehand', name: () => L('フォアハンド', '포핸드'), unit: () => L('回', '회'), items: strokeItems(false), order: ['finish', 'weight', 'knee', 'contact'], drills: strokeDrills(false),
    orderNote: () => L('振り終わり → 体の位置 → ひざの順に、1つずつ直します。', '끝까지 휘두르기 → 몸의 위치 → 무릎 순서로 하나씩 고쳐요.') },
  backhand: { id: 'backhand', name: () => L('バックハンド', '백핸드'), unit: () => L('回', '회'), items: strokeItems(true), order: ['finish', 'weight', 'knee', 'contact'], drills: strokeDrills(true),
    orderNote: () => L('振り終わり → 体の位置 → ひざの順に、1つずつ直します。', '끝까지 휘두르기 → 몸의 위치 → 무릎 순서로 하나씩 고쳐요.') },
};
export const motionOf = s => MOTIONS[(s && s.motion) || 'serve'] || MOTIONS.serve;
