// Coaching rules (coach-review draft v0). Ranges/drills are drafts pending coach review.
import { L, WD } from './i18n.js';

export const ITEMS = {
  tossPos: { name: () => L('トスの位置', '토스 위치'), grade: 'B',
    fmt: v => L(v >= 0 ? '前 ' : '後ろ ', v >= 0 ? '앞 ' : '뒤 ') + Math.abs(v * 100).toFixed(0) + '%',
    judge: v => v >= 0 && v <= 0.15 ? 'good' : (v < -0.05 || v > 0.30) ? 'warn' : 'mid',
    good: () => L('ボールを前足より少し前に上げられています。', '공을 앞발보다 살짝 앞에 올리고 있어요.'),
    warn: v => v < 0 ? L('トスが体の後ろ(頭の上)に行っています。前足より前に上げましょう。', '토스가 몸 뒤쪽(머리 위)으로 가요. 앞발보다 앞으로 올려 보세요.')
                     : L('トスが前に行きすぎています。前足のすぐ前の上に集めましょう。', '토스가 너무 앞으로 나가요. 앞발 바로 앞 위로 모아 보세요.'),
    mdc: 0.05, better: 'closer', target: 0.07, joints: [11, 13, 15] },
  tossH: { name: () => L('トスの高さ', '토스 높이'), grade: 'A',
    fmt: v => v.toFixed(2) + L(' × 身長', ' × 키'),
    judge: v => v >= 1.20 ? 'good' : v < 1.12 ? 'warn' : 'mid',
    good: () => L('トスの手を十分高く伸ばせています。', '토스 손을 충분히 높이 뻗고 있어요.'),
    warn: () => L('トスの手が上まで伸び切っていません。ボールを離した後も指先を空へ伸ばし続けましょう。', '토스 손이 끝까지 올라가지 않아요. 공을 놓은 뒤에도 손끝을 하늘로 계속 뻗어 주세요.'),
    mdc: 0.05, better: 'up', joints: [11, 13, 15] },
  hold: { name: () => L('トス腕のキープ', '토스 팔 유지'), grade: 'A',
    fmt: v => v.toFixed(2) + L('秒', '초'),
    judge: v => v >= 0.35 ? 'good' : v < 0.20 ? 'warn' : 'mid',
    good: () => L('トス腕を上でしっかりキープできています。', '토스 팔을 위에서 잘 버티고 있어요.'),
    warn: () => L('トス腕が早く下がっています。ラケットが上がってくるまでトス腕を上に残しましょう。', '토스 팔이 너무 빨리 내려와요. 라켓이 올라올 때까지 토스 팔을 위에 두세요.'),
    mdc: 0.10, better: 'up', joints: [11, 13, 15] },
  elbow: { name: () => L('ラケット腕の肘', '라켓 팔 팔꿈치'), grade: 'B',
    fmt: v => v.toFixed(0) + '°',
    judge: v => v >= 70 && v <= 110 ? 'good' : (v > 130 || v < 60) ? 'warn' : 'mid',
    good: () => L('トロフィーでの肘の角度が良いです。', '트로피 자세에서 팔꿈치 각도가 좋아요.'),
    warn: v => v > 130 ? L('肘が伸びすぎています。トロフィーでL字(90°前後)を作りましょう。', '팔꿈치가 너무 펴져 있어요. 트로피에서 L자(90° 전후)를 만들어 보세요.')
                       : L('肘が曲がりすぎています。', '팔꿈치가 너무 접혀 있어요.'),
    mdc: 12, better: 'closer', target: 90, joints: [12, 14, 16] },
  knee: { name: () => L('膝の曲げ', '무릎 굽힘'), grade: 'A',
    fmt: v => v.toFixed(0) + '°',
    judge: (v, lv) => v <= (lv === 'mid' ? 148 : 158) ? 'good' : 'warn',
    good: () => L('トロフィーで膝を十分に曲げられています。', '트로피에서 무릎을 충분히 굽히고 있어요.'),
    warn: () => L('膝がほぼ伸びたまま打っています。トロフィーで膝をもう少し曲げて地面を押しましょう。', '무릎이 거의 펴진 채로 쳐요. 트로피에서 무릎을 살짝 더 굽혀 바닥을 눌러 주세요.'),
    mdc: 10, better: 'down', joints: [23, 25, 27, 24, 26, 28] },
};
export const PRIORITY = ['tossPos', 'tossH', 'hold', 'elbow', 'knee'];
export const LABEL = () => ({ good: L('良い', '좋음'), mid: L('普通', '보통'), warn: L('要改善', '개선 필요'), na: L('測定不可', '측정 불가') });
export const CMP = () => ({ up: L('改善', '개선'), same: L('変化なし(誤差内)', '유지(오차 범위)'), down: L('後退', '후퇴'), na: L('比較保留', '비교 보류') });

// Drill DB (subset of coach draft #1–30). place: home | court
const D = (ja, ko, dja, dko, place, min) => ({ t: () => L(ja, ko), d: () => L(dja, dko), place, min });
export const DRILLS = {
  tossPos: [
    D('ラケット的当てトス', '라켓 표적 토스', '前足の前にラケットを寝かせて置き、トスしたボールがラケット面に落ちるように10回×2。', '앞발 앞에 라켓을 눕혀 두고 토스한 공이 라켓면에 떨어지게 10회×2.', 'court', 5),
    D('壁沿いトス', '벽 따라 토스', '壁に横向きに立ち、手が壁に沿ってまっすぐ上がるようにトス動作10回×2。', '벽에 옆으로 서서 손이 벽을 따라 일직선으로 올라가게 토스 동작 10회×2.', 'home', 5),
  ],
  tossH: [
    D('トス後に手を止める', '토스 후 손 멈추기', 'トス後、トス腕でボールを指したまま2秒キープ×10回。', '토스한 뒤 토스 팔로 공을 가리킨 채 2초 유지×10회.', 'home', 5),
    D('トスの高さ合わせ', '토스 높이 맞추기', '伸ばした腕の先より30〜50cm上が頂点になるよう、フェンスなどの目印を決めてトス10回×2。', '편 팔 끝보다 30~50cm 위가 정점이 되게 펜스 등 기준점을 정해 토스 10회×2.', 'court', 5),
  ],
  hold: [
    D('トス後に手を止める', '토스 후 손 멈추기', 'トス後、トス腕でボールを指したまま2秒キープ×10回。', '토스한 뒤 토스 팔로 공을 가리킨 채 2초 유지×10회.', 'home', 5),
    D('トス＋トロフィー静止', '토스 + 트로피 정지', 'トスしてトロフィーの姿勢で打たずに2秒止まる×10回。', '토스하고 트로피 자세에서 치지 않고 2초 멈추기×10회.', 'court', 5),
  ],
  elbow: [
    D('タオルトロフィー', '수건 트로피', 'タオルを持ち、肘を肩の高さでL字にして3秒キープ×10回。', '수건을 들고 팔꿈치를 어깨 높이 L자로 3초 유지×10회.', 'home', 5),
    D('トロフィーから始めるサーブ', '트로피에서 시작하는 서브', 'トロフィーの姿勢を作ってからトスして打つ×10回。', '트로피 자세를 만든 뒤 토스해서 치기×10회.', 'court', 10),
  ],
  knee: [
    D('トスと膝を同時に', '토스·무릎 동시', 'トス腕が上がるときに膝を曲げるリズムだけを反復(ボールなし)10回×2。', '토스 팔이 올라갈 때 무릎을 굽히는 리듬만 반복(공 없이) 10회×2.', 'home', 5),
    D('リズムカウントサーブ', '리듬 카운트 서브', '「1(トス)-2(曲げ)-3(伸び)」と声に出してゆっくりサーブ×10回。', '「하나(토스)-둘(굽힘)-셋(뻗기)」 소리 내며 느린 서브×10회.', 'court', 10),
  ],
  keep: [
    D('半分の速さのシャドー', '반 속도 섀도', '全体の動作を半分の速さで、局面ごとに姿勢を確認×5回。', '전체 동작을 절반 속도로, 단계마다 자세 확인×5회.', 'home', 5),
    D('セカンドサーブのリズム', '두 번째 서브 리듬', '強く打たず同じリズムで入れるだけ×10回。', '강하게 치지 않고 같은 리듬으로 넣기만×10회.', 'court', 10),
  ],
};
export const WARMUP = D('準備運動', '준비운동', 'チューブで肩の外旋15回×2、腕回しと上半身のひねり1分。', '밴드 어깨 바깥 돌리기 15회×2, 팔 돌리기·상체 비틀기 1분.', 'both', 3);

export function judgeAll(m, level) {
  const out = {};
  for (const k of PRIORITY) out[k] = isFinite(m[k]) ? ITEMS[k].judge(m[k], level) : 'na';
  return out;
}
export function pickTask(j) {
  const warn = PRIORITY.filter(k => j[k] === 'warn');
  const mid = PRIORITY.filter(k => j[k] === 'mid');
  return (warn[0] || mid[0] || 'keep');
}
// Schedule stores drill indices only, so it re-renders in either language.
export function makeSchedule(task, courtDays, start = new Date()) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const court = courtDays.includes(d.getDay());
    const idx = DRILLS[task].map((x, j) => j).filter(j => court || DRILLS[task][j].place === 'home');
    days.push({ date: d.toISOString().slice(0, 10), dow: d.getDay(), court, drills: idx.length ? idx : [0], film: i === 6 });
  }
  if (!days[6].court) { const last = [...days].reverse().find(x => x.court); if (last) last.filmHint = true; }
  return days;
}
export const wd = dow => WD()[dow];
export function compare(now, prev) {
  return PRIORITY.map(k => {
    const a = prev[k], b = now[k], it = ITEMS[k];
    if (!isFinite(a) || !isFinite(b)) return { k, res: 'na' };
    const d = b - a;
    const gain = it.better === 'up' ? d : it.better === 'down' ? -d : Math.abs(a - it.target) - Math.abs(b - it.target);
    return { k, a, b, d, res: Math.abs(d) < it.mdc ? 'same' : gain > 0 ? 'up' : 'down' };
  });
}
