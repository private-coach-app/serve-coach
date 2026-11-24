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
    band: () => [0.90, 9], warnLo: () => 0.75, warnHi: () => 9,
    fmt: v => L(`腕の長さの約${pc(v)}%まで上がっています`, `팔 길이의 약 ${pc(v)}%까지 올라갔어요`),
    ideal: () => L('目安：腕の長さの90%以上(ほぼ真上)', '기준: 팔 길이의 90% 이상(거의 수직 위)'),
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
export const LABEL = () => ({ good: L('良い', '좋아요'), mid: L('あと少し', '조금만 더'), warn: L('ここから', '여기부터'), na: L('今回は測れず', '이번엔 못 쟀어요') });
export const CMP = () => ({ up: L('良くなった', '좋아졌어요'), same: L('ほぼ同じ', '거의 같아요'), keep: L('良い状態のまま', '좋은 상태 그대로'), down: L('前回より下がった', '지난번보다 내려갔어요') });

export function judge(k, v, level) {
  if (!fin(v)) return 'na';
  const it = ITEMS[k], [lo, hi] = it.band(level);
  if (v >= lo && v <= hi) return 'good';
  return v < it.warnLo(level) || v > it.warnHi(level) ? 'warn' : 'mid';
}
export function judgeAll(m, level) { const out = {}; for (const k of PRIORITY) out[k] = judge(k, m[k], level); return out; }
// Order to fix things: "ここから" items first, then "あと少し", each in toss → arm → legs order.
export const fixOrder = j => [...PRIORITY.filter(k => j[k] === 'warn'), ...PRIORITY.filter(k => j[k] === 'mid')];
export const pickTask = j => fixOrder(j)[0] || 'keep';
// Skeleton joints to highlight for an item, from the arms actually used in this video.
export function jointsFor(k, side) {
  const part = ITEMS[k] && ITEMS[k].part;
  if (part === 'toss') return [side.tossS, side.tossE, side.tossW];
  if (part === 'racket') return side.racket;
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
export function makeSchedule(task, courtDays, start = new Date()) {
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
export function compare(now, prev, level) {
  const rows = [];
  for (const k of PRIORITY) {
    const a = prev[k], b = now[k], it = ITEMS[k];
    if (!fin(a) || !fin(b)) continue;
    const [lo, hi] = it.band(level), out = v => v < lo ? lo - v : v > hi ? v - hi : 0;
    const gain = out(a) - out(b);
    const res = out(a) === 0 && out(b) === 0 ? 'keep' : Math.abs(b - a) < it.mdc || gain === 0 ? 'same' : gain > 0 ? 'up' : 'down';
    rows.push({ k, a, b, res });
  }
  return rows;
}
