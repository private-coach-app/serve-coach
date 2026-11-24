import * as E from './engine.js';
import { L, lang, setLang, WD } from './i18n.js';
import { PHASES, phaseAngles, overlayTrophy, animateIdeal } from './ideal.js';
import { correct, playFix } from './fix.js';
import { ITEMS, PRIORITY, LABEL, DRILLS, WARMUP, judgeAll, pickTask, makeSchedule, compare, CMP, wd } from './rules.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FPS = 30;
const FONT = '"Hiragino Sans","Apple SD Gothic Neo","Noto Sans JP","Noto Sans KR",sans-serif';

// ---------- storage (IndexedDB, falls back to memory) ----------
const mem = { kv: {}, sessions: [] };
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('serve-coach', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('sessions', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  return dbp;
}
const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
const S = {
  async get(k) { try { return await tx('kv', 'readonly', s => s.get(k)); } catch { return mem.kv[k]; } },
  async set(k, v) { mem.kv[k] = v; try { await tx('kv', 'readwrite', s => s.put(v, k)); } catch {} },
  async sessions() { try { return (await tx('sessions', 'readonly', s => s.getAll())).sort((a, b) => a.id - b.id); } catch { return mem.sessions; } },
  async add(x) { mem.sessions.push(x); try { await tx('sessions', 'readwrite', s => s.put(x)); } catch {} },
  async del(id) { mem.sessions = mem.sessions.filter(s => s.id !== id); try { await tx('sessions', 'readwrite', s => s.delete(id)); } catch {} },
};

let profile = null, work = null, curRoute = 'home', curArg = null;

// ---------- router ----------
const routes = { setup, home, capture, mark, history, view };
function navLabels() {
  const t = { home: L('ホーム', '홈'), capture: L('分析', '분석'), history: L('記録', '기록'), setup: L('設定', '내 정보') };
  document.querySelectorAll('nav button').forEach(b => b.querySelector('span').textContent = t[b.dataset.go]);
  $('#langbtn').textContent = lang === 'ja' ? '한국어' : '日本語';
  document.title = L('サーブコーチ(ベータ v0)', '서브 코치 (베타 v0)');
  $('#brand').textContent = L('サーブコーチ', '서브 코치');
}
async function go(r, arg) {
  curRoute = r; curArg = arg;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.go === r));
  window.scrollTo(0, 0);
  await routes[r](arg);
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => go(b.dataset.go));
$('#langbtn').onclick = () => { setLang(lang === 'ja' ? 'ko' : 'ja'); navLabels(); go(curRoute, curArg); };

// ---------- setup ----------
async function setup() {
  const p = profile ? { ...profile } : { gender: 'm', hand: 'r', level: 'beg', court: [6] };
  const opt = {
    gender: [['m', L('男性', '남성')], ['f', L('女性', '여성')]],
    hand: [['r', L('右利き', '오른손')], ['l', L('左利き', '왼손')]],
    level: [['beg', L('初級', '입문')], ['mid', L('中級', '중급')]],
  };
  const chips = key => `<div class="row" data-k="${key}">${opt[key].map(([v, t]) => `<button class="chip ${p[key] === v ? 'on' : ''}" data-v="${v}">${t}</button>`).join('')}</div>`;
  app.innerHTML = `<h1>${L('プロフィール', '내 정보')}</h1><p class="sub">${L('判定基準と1週間スケジュールに使います。動画と記録はこのスマホの中だけに保存されます。', '판정 기준과 1주 스케줄에 쓰입니다. 영상과 기록은 이 폰 안에만 저장됩니다.')}</p>
  <div class="card"><label class="f">${L('モデル画像', '모델 이미지')}</label>${chips('gender')}
  <label class="f">${L('利き手', '잘 쓰는 손')}</label>${chips('hand')}
  <label class="f">${L('レベル', '레벨')}</label>${chips('level')}
  <label class="f">${L('コートに行く曜日(複数可)', '코트에 가는 요일 (여러 개)')}</label><div class="row" data-k="court">${WD().map((w, i) => `<button class="chip ${p.court.includes(i) ? 'on' : ''}" data-v="${i}">${w}</button>`).join('')}</div></div>
  <button class="btn" id="save">${L('保存', '저장')}</button>`;
  app.querySelectorAll('.row').forEach(row => row.onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return; const k = row.dataset.k;
    if (k === 'court') { const v = +b.dataset.v; p.court = p.court.includes(v) ? p.court.filter(x => x !== v) : [...p.court, v]; b.classList.toggle('on'); }
    else { p[k] = b.dataset.v; row.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); }
  });
  $('#save').onclick = async () => { if (!p.court.length) return alertBox(L('コートの曜日を1つ以上選んでください。', '코트 요일을 하나 이상 골라 주세요.')); profile = p; await S.set('profile', p); go('home'); };
}
function alertBox(t) { let w = $('#alert'); if (!w) { w = document.createElement('div'); w.id = 'alert'; w.className = 'warnbox'; app.appendChild(w); } w.textContent = t; }

const taskTitle = t => t === 'keep' ? L('今のフォームを維持', '지금 폼 유지하기') : ITEMS[t].name();
const taskMsg = s => s.task === 'keep' ? L('大きな問題は見当たりません', '큰 문제는 보이지 않아요') : ITEMS[s.task].warn(s.metrics[s.task]);

// ---------- home ----------
async function home() {
  const ss = await S.sessions(); if (curRoute !== 'home') return; const last = ss[ss.length - 1];
  if (!last) {
    app.innerHTML = `<h1>${L('最初のサーブを分析しましょう', '첫 서브를 분석해 볼까요?')}</h1>
    <div class="card hero"><div class="k">${L('はじめに', '시작하기')}</div><div class="t">${L('横から撮ったサーブ動画1本', '옆에서 찍은 서브 영상 1개')}</div><div style="font-size:14px;opacity:.85">${L('サーブが3〜5本入った20〜60秒の動画がベストです。', '서브 3~5개가 들어간 20~60초 영상이 가장 좋아요.')}</div></div>
    <button class="btn ball" id="go">${L('動画を選んで分析する', '영상 올리고 분석하기')}</button>
    <div class="note">${L('このベータでできること：骨格分析 → 良い点・改善点 → 今週の課題1つ → 7日間スケジュール → 7日後に撮り直して比較。', '이번 베타에서 하는 일: 스켈레톤 분석 → 좋은 점·개선점 → 이번 주 과제 1개 → 7일 스케줄 → 7일 뒤 다시 찍어 비교.')}</div>`;
    $('#go').onclick = () => go('capture'); return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const days = last.schedule; const idx = days.findIndex(d => d.date === today);
  const dleft = Math.max(0, Math.round((new Date(days[6].date) - new Date(today)) / 864e5));
  const done = (await S.get('done_' + last.id)) || {};
  if (curRoute !== 'home') return;
  const d = idx >= 0 ? days[idx] : null;
  const due = dleft === 0 || idx < 0;
  app.innerHTML = `<p class="sub">${esc(last.date)} ${L('の分析', '분석 기준')}</p><h1>${last.task === 'keep' ? taskTitle('keep') : L('今週の課題：', '이번 주 과제: ') + taskTitle(last.task)}</h1>
  <div class="card hero"><div class="k">${dleft > 0 ? L(`再評価まで あと${dleft}日`, `재평가까지 D-${dleft}`) : L('今日は再評価の日です', '재평가하는 날이에요')}</div>
  <div class="t">${esc(taskMsg(last))}</div></div>
  ${d ? `<h2>${L('今日', '오늘')} (${wd(d.dow)}) · ${d.court ? L('コート', '코트') : L('自宅', '집')}</h2><div class="card">${dayHtml(last.task, d, idx, done, true)}</div>` : `<div class="note">${L('今週のスケジュールは終わりました。撮り直して比較しましょう。', '이번 주 스케줄이 끝났어요. 다시 찍어서 비교해 보세요.')}</div>`}
  <button class="btn ${due ? 'ball' : 'ghost'}" id="re">${due ? L('撮り直して比較する', '다시 찍고 비교하기') : L('新しい動画を分析', '새 영상 분석하기')}</button>
  <button class="btn ghost" id="rep">${L('前回のレポートを見る', '지난 리포트 보기')}</button>`;
  bindChecks(last.id, done);
  $('#re').onclick = () => go('capture'); $('#rep').onclick = () => go('view', last.id);
}
function dayHtml(task, d, i, done, big) {
  const drills = [WARMUP, ...d.drills.map(j => DRILLS[task][j])];
  return `<div class="day ${d.court ? 'court' : ''}"><div class="d"><b>${wd(d.dow)}</b><small>${d.date.slice(5).replace('-', '/')}</small></div><div>
  ${drills.map((x, j) => `<label><input type="checkbox" data-c="${i}_${j}" ${done[i + '_' + j] ? 'checked' : ''}><span><b>${esc(x.t())}</b> · ${x.min}${L('分', '분')}${big ? `<br><span class="msg">${esc(x.d())}</span>` : ''}</span></label>`).join('')}
  ${d.film ? `<label><span>🎥 <b>${L('撮り直し → 比較', '재촬영 → 비교')}</b></span></label>` : ''}${d.filmHint ? `<span class="msg">${L('7日目がコートの日でなければ、今日撮っておきましょう。', '7일째가 코트 날이 아니면 오늘 찍어 두세요.')}</span>` : ''}</div></div>`;
}
function bindChecks(id, done) {
  app.querySelectorAll('input[data-c]').forEach(c => c.onchange = async () => { done[c.dataset.c] = c.checked; await S.set('done_' + id, done); });
}

// ---------- capture / analyse ----------
async function capture() {
  app.innerHTML = `<h1>${L('サーブ動画の分析', '서브 영상 분석')}</h1>
  <div class="guide"><svg viewBox="0 0 90 160"><rect x="20" y="14" width="50" height="132" rx="6" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="3 2"/>
  <circle cx="45" cy="30" r="6" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M45 36v40M45 50l-14-18M45 50l12 8M45 76l-8 30v26M45 76l10 28v28" stroke="#fff" stroke-width="1.5" fill="none"/>
  <path d="M8 146h74" stroke="#fff" stroke-width="1"/><text x="45" y="10" font-size="6" fill="#fff" text-anchor="middle">${L('頭〜つま先を点線の中に', '머리~발끝이 점선 안에')}</text></svg></div>
  <div class="card"><b>${L('撮影チェック', '촬영 체크')}</b><div class="msg">${L('① 体の<b>横</b>から(ネットと平行の向き) ② スマホは縦、腰の高さで固定 ③ 頭上のボールまで画面に入れる ④ できれば<b>スローモーションか60fps</b> ⑤ サーブ3〜5本', '① 몸 <b>옆</b>에서 (네트와 평행한 방향) ② 폰 세로, 허리 높이 고정 ③ 머리 위 공까지 화면 안 ④ 가능하면 <b>슬로모션 또는 60fps</b> ⑤ 서브 3~5개')}</div></div>
  <input type="file" id="file" accept="video/*" class="hide">
  <button class="btn ball" id="pick">${L('動画を選ぶ / 撮影する', '영상 고르기 / 촬영')}</button>
  <div id="eng" class="card"><b id="et"></b><div class="bar"><i id="eb"></i></div><div class="msg" id="es"></div><button class="btn ghost hide" id="retry">${L('再試行', '다시 시도')}</button></div>
  <div id="prog" class="card hide"><b id="pt">${L('準備中…', '준비 중…')}</b><div class="bar"><i id="pb"></i></div><div class="msg" id="ps"></div></div>`;
  $('#pick').onclick = () => $('#file').click();
  bindEngineCard();
  $('#file').onchange = e => { const f = e.target.files[0]; if (!f) return; if (work && work.video) { URL.revokeObjectURL(work.video.src); work.video.remove(); work = null; } const v = E.makeVideo(f); analyse(v); };
}
let unsubEng = null, stallTimer = null;
function bindEngineCard() {
  if (unsubEng) unsubEng();
  clearInterval(stallTimer);
  const mb = b => (b / 1048576).toFixed(1);
  const paint = st => {
    const et = $('#et'); if (!et) { unsubEng && unsubEng(); clearInterval(stallTimer); return; }
    const eb = $('#eb'), es = $('#es'), rt = $('#retry');
    rt.classList.toggle('hide', st.phase !== 'error');
    $('#eng').classList.toggle('hide', st.phase === 'ready' && !$('#prog').classList.contains('hide'));
    if (st.phase === 'ready') { et.textContent = L('✓ 分析エンジン準備完了', '✓ 분석 엔진 준비 완료'); eb.style.width = '100%'; es.textContent = L('動画を選ぶとすぐに分析が始まります。', '영상을 고르면 바로 분석을 시작해요.'); return; }
    if (st.phase === 'error') { et.textContent = L('エンジンを読み込めませんでした', '엔진을 불러오지 못했어요'); es.textContent = L('通信を確認して「再試行」を押してください。', '인터넷 연결을 확인하고 「다시 시도」를 눌러 주세요.') + ' (' + st.error + ')'; return; }
    if (st.phase === 'init') { et.textContent = L('分析エンジンを起動中…(2/2)', '분석 엔진 시작 중… (2/2)'); eb.style.width = '100%'; es.textContent = L('数秒〜20秒ほどかかります。', '몇 초~20초 정도 걸려요.'); return; }
    et.textContent = L('分析エンジンをダウンロード中…(1/2)', '분석 엔진 내려받는 중… (1/2)');
    eb.style.width = Math.min(100, st.loaded / st.total * 100).toFixed(0) + '%';
    es.textContent = `${mb(st.loaded)} / ${mb(st.total)} MB · ` + L('初回のみ。Wi-Fi推奨', '처음 한 번만 받아요. Wi-Fi 권장');
  };
  unsubEng = E.onEngine(paint);
  stallTimer = setInterval(() => {
    const st = E.engineState, es = $('#es'); if (!es) return clearInterval(stallTimer);
    if ((st.phase === 'download' || st.phase === 'init') && Date.now() - st.t > 25000)
      es.textContent = L('25秒以上進んでいません。通信が遅いか止まっている可能性があります。そのまま待つか、ページを再読み込みしてください。', '25초 넘게 진행이 없어요. 연결이 느리거나 멈췄을 수 있어요. 조금 더 기다리거나 페이지를 새로고침해 주세요.');
  }, 5000);
  $('#retry').onclick = () => { E.loadEngine().catch(() => {}); };
  if (E.engineState.phase === 'idle' || E.engineState.phase === 'error') E.loadEngine().catch(() => {});
}
async function analyse(vEl) {
  const pb = $('#pb'), pt = $('#pt'), ps = $('#ps');
  $('#prog').classList.remove('hide'); $('#pick').disabled = true;
  const t0 = performance.now();
  try {
    pt.textContent = L('分析を開始します…', '분석을 시작해요…');
    if (E.engineState.phase !== 'ready') pt.textContent = L('エンジンの準備ができ次第、分析を始めます…', '엔진 준비가 끝나면 바로 분석을 시작해요…');
    await E.loadEngine();
    $('#eng') && $('#eng').classList.add('hide');
    pt.textContent = L('動画を読み込み中…', '영상을 불러오는 중…');
    const video = await E.openVideo(vEl);
    pt.textContent = L('フォームを読み取り中…', '자세를 읽는 중…');
    const tr = await E.trackPose(video, FPS, f => { pb.style.width = (f * 100).toFixed(0) + '%'; ps.textContent = `${(f * video.duration).toFixed(0)} / ${video.duration.toFixed(0)}${L('秒', '초')}`; });
    pb.style.width = '100%';
    const r = E.findServes(tr);
    work = { video, tr, ...r, sel: r.serves.map(() => true), secs: ((performance.now() - t0) / 1000).toFixed(1) };
    if (tr.detectRate < 0.5) return failBox(L(`人を検出できたフレームが${(tr.detectRate * 100).toFixed(0)}%だけでした。全身が大きく映るように撮り直してください。`, `사람을 찾은 프레임이 ${(tr.detectRate * 100).toFixed(0)}%뿐이에요. 몸 전체가 크게 나오게 다시 찍어 주세요.`));
    if (!r.serves.length) return failBox(L('サーブが見つかりませんでした。トス腕が画面内で頭より上に上がっているか確認してください。', '서브를 찾지 못했어요. 토스 팔이 화면 안에서 머리 위로 올라가는지 확인해 주세요.'));
    go('mark');
  } catch (e) { failBox(L('分析中にエラー：', '분석 중 오류: ') + e.message); console.error(e); }
}
function failBox(t) { $('#pick').disabled = false; $('#pt').textContent = L('分析できませんでした', '분석하지 못했어요'); alertBox(t); }

// ---------- mark (serve confirmation) ----------
async function frameAt(i, w, crop = true, hl, after, noSkel) { await E.seek(work.video, Math.min(work.video.duration - 0.001, (i + 0.5) / FPS)); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return E.drawFrame(document.createElement('canvas'), work.video, work.tr.frames[i], { crop, w, h: w * 16 / 9, highlight: hl, after, noSkel }); }
async function mark() {
  if (!work) return go('capture');
  app.innerHTML = `<h1>${L(`サーブを${work.serves.length}本見つけました`, `서브 ${work.serves.length}개를 찾았어요`)}</h1><p class="sub">${L('トロフィーの姿勢(膝が一番曲がった瞬間)です。間違って拾われたものはタップして外してください。', '트로피 자세(무릎이 가장 굽은 순간)입니다. 잘못 잡힌 건 눌러서 빼 주세요.')}</p>
  <div class="serves" id="sv"></div><div id="adjw" class="card hide"><b id="adjt"></b><canvas id="big"></canvas>
  <div class="adj"><button class="btn ghost" id="m1">−1</button><span id="fi" class="msg"></span><button class="btn ghost" id="p1">+1</button></div><div class="msg">${L('コマを動かしてトロフィーの瞬間に合わせられます。', '프레임을 움직여 트로피 순간에 맞출 수 있어요.')}</div></div>
  <button class="btn ball" id="ok">${L('このサーブでレポートを見る', '이 서브들로 리포트 보기')}</button><p class="sub" style="margin-top:8px">${L('分析', '분석')} ${work.secs}${L('秒', '초')} · ${L('人物検出', '사람 인식')} ${(work.tr.detectRate * 100).toFixed(0)}%</p>`;
  $('#ok').onclick = async () => { if (!work.sel.some(Boolean)) return alertBox(L('サーブを1本以上残してください。', '서브를 하나 이상 남겨 주세요.')); const b = $('#ok'); if (b.disabled) return; b.disabled = true; b.textContent = L('レポートを作成中…', '리포트 만드는 중…'); try { await buildSession(); } catch (e) { b.disabled = false; alertBox(e.message); } };
  const sv = $('#sv'); let cur = 0;
  for (let i = 0; i < work.serves.length; i++) {
    const c = await frameAt(work.serves[i].tro, 240);
    const d = document.createElement('div'); d.className = 's' + (work.sel[i] ? '' : ' off'); d.innerHTML = `<span>#${i + 1}</span>`; d.prepend(c);
    d.onclick = async () => { if (cur === i) { work.sel[i] = !work.sel[i]; d.classList.toggle('off', !work.sel[i]); } cur = i; sv.querySelectorAll('.s').forEach((x, j) => x.classList.toggle('on', j === i)); await showBig(); };
    sv.appendChild(d);
  }
  async function showBig() {
    $('#adjw').classList.remove('hide'); const s = work.serves[cur];
    $('#adjt').textContent = `#${cur + 1} ${work.sel[cur] ? '' : L('(除外中・もう一度タップで戻す)', '(제외됨 · 한 번 더 누르면 포함)')}`;
    const c = await frameAt(s.tro, 540); $('#big').replaceWith(c); c.id = 'big';
    $('#fi').textContent = `${L('膝', '무릎')} ${isFinite(s.knee) ? s.knee.toFixed(0) + '°' : '—'}`;
  }
  const mv = async d => { const s = work.serves[cur]; const n = Math.max(0, Math.min(work.tr.n - 1, s.tro + d)); work.serves[cur] = E.remeasure(work.tr, work.ctx, s, n); await showBig(); const c = await frameAt(n, 240); sv.children[cur].querySelector('canvas').replaceWith(c); };
  $('#m1').onclick = () => mv(-1); $('#p1').onclick = () => mv(1);
  sv.firstChild && sv.firstChild.classList.add('on'); await showBig();
}
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

async function buildSession() {
  const used = work.serves.filter((_, i) => work.sel[i]);
  const metrics = {}; for (const k of PRIORITY) metrics[k] = med(used.map(s => s[k]));
  const j = judgeAll(metrics, profile.level);
  const ss = await S.sessions(); const prev = ss[ss.length - 1];
  const task = pickTask(j);
  const repeat = prev && prev.task === task && task !== 'keep' ? (prev.repeat || 0) + 1 : 0;
  const rep = used.reduce((a, b) => Math.abs(b.knee - metrics.knee) < Math.abs(a.knee - metrics.knee) ? b : a, used[0]);
  const hl = task !== 'keep' ? ITEMS[task].joints : [];
  const view = work.ctx.view;
  const after = view === 'side' ? (c, T, k) => { const p = work.tr.frames[rep.tro]; if (!p) return; const hip = T({ x: (p[23].x + p[24].x) / 2, y: (p[23].y + p[24].y) / 2 }); overlayTrophy(c, hip, work.ctx.bodyH * k, rep.dir); } : null;
  const img = (await frameAt(rep.tro, 540, true, hl, after)).toDataURL('image/jpeg', 0.82);
  // clean photo + landmark positions in its pixels, for the "how to fix" morph
  let fixPts = null;
  const clean = (await frameAt(rep.tro, 360, true, null, (c, T) => { const p = work.tr.frames[rep.tro]; fixPts = p.map(q => { const [x, y] = T(q); return { x: +x.toFixed(1), y: +y.toFixed(1), v: +q.v.toFixed(2) }; }); }, true)).toDataURL('image/jpeg', 0.8);
  const fixData = { img: clean, pts: fixPts, dir: rep.dir, tossW: work.ctx.tossW, racket: work.ctx.racket };
  const pf = E.phaseFrames(work.tr, rep);
  const phases = [];
  for (const f of pf) phases.push({ img: (await frameAt(f, 240, true)).toDataURL('image/jpeg', 0.7), ...E.anglesAt(work.tr, work.ctx, f) });
  const s = { id: Date.now(), date: new Date().toISOString().slice(0, 10), level: profile.level, n: used.length, metrics, judge: j, task, repeat, img, view, phases, fix: fixData, prevId: prev ? prev.id : null, schedule: makeSchedule(task, profile.court) };
  await S.add(s);
  go('view', s.id);
}

// ---------- report ----------
async function view(id) {
  const ss = await S.sessions(); const s = ss.find(x => x.id === id); if (!s) return go('home');
  const prev = ss.find(x => x.id === s.prevId);
  const LB = LABEL();
  const goods = PRIORITY.filter(k => s.judge[k] === 'good'), warns = [...PRIORITY.filter(k => s.judge[k] === 'warn'), ...PRIORITY.filter(k => s.judge[k] === 'mid')];
  const done = (await S.get('done_' + s.id)) || {};
  if (curRoute !== 'view') return;
  const row = k => { const it = ITEMS[k], v = s.metrics[k], jj = s.judge[k];
    const msg = jj === 'good' ? it.good() : jj === 'na' ? (k === 'elbow' ? L('横からの撮影ではラケット腕が体に隠れて測りにくいです。', '옆 촬영에서는 라켓 팔이 몸에 가려 재기 어려워요.') : L('この動画では測れませんでした。', '이 영상에서는 잴 수 없었어요.')) : it.warn(v);
    return `<div class="item"><div><div class="n">${it.name()} <span class="msg">${it.grade === 'B' ? L('(参考)', '(참고)') : ''}</span></div><div class="msg">${esc(msg)}</div><div class="range">${esc(it.ideal(s.level))}</div></div>
    <div class="v">${isFinite(v) ? it.fmt(v) : '—'}<br><span class="tag ${jj}">${LB[jj]}</span></div></div>`; };
  app.innerHTML = `<p class="sub">${s.date} · ${L(`サーブ${s.n}本の中央値`, `서브 ${s.n}개 중앙값`)} · ${s.level === 'mid' ? L('中級', '중급') : L('初級', '입문')}</p><h1>${L('分析レポート', '분석 리포트')}</h1>
  <img class="frame" src="${s.img}" alt=""><p class="sub" style="margin-top:6px">${L('緑 = あなたの姿勢', '초록 = 내 자세')}${s.task !== 'keep' ? L(' · オレンジ = 今週の課題の部位', ' · 주황 = 이번 주 과제 부위') : ''}${s.view === 'side' ? L(' · 青の点線 = 理想のトロフィー姿勢(腰の位置と体格に合わせて表示)', ' · 파란 점선 = 이상적인 트로피 자세(허리 위치·체격에 맞춤)') : ''}</p>
  ${s.view && s.view !== 'side' ? `<div class="warnbox">${L('この動画は正面または斜めから撮影されたようです。判定は横からの撮影を前提にしているため、今回の数値は参考程度にしてください。理想ライン(青)も表示していません。', '이 영상은 정면이나 비스듬한 각도에서 찍힌 것 같아요. 판정은 옆 촬영을 기준으로 하므로 이번 수치는 참고만 해 주세요. 이상적인 선(파랑)도 표시하지 않았어요.')}</div>` : ''}
  ${priorityHtml(s)}
  ${fixHtml(s)}
  ${prev ? cmpHtml(s, prev) : ''}
  <h2>${L('良い点', '좋은 점')}</h2><div class="card">${goods.length ? goods.map(k => `<div class="item"><div><span class="tag good">${LB.good}</span> <b>${ITEMS[k].name()}</b><div class="msg">${ITEMS[k].good()}</div></div></div>`).join('') : `<div class="msg">${L('まだ基準を超えた項目はありません。課題を1つずつ直していきましょう。', '아직 기준을 넘은 항목이 없어요. 과제 하나씩 바꿔 가면 됩니다.')}</div>`}</div>
  <h2>${L('今週の課題', '이번 주 과제')}</h2>
  <div class="card hero"><div class="k">${s.task === 'keep' ? L('維持', '유지') : L('課題1 · ', '과제 1 · ') + ITEMS[s.task].name()}${s.repeat ? L(` · ${s.repeat + 1}週目`, ` · ${s.repeat + 1}주째`) : ''}</div>
  <div class="t">${esc(s.task === 'keep' ? L('今のフォームを繰り返して体に覚えさせる', '지금 폼을 반복해 몸에 익히기') : taskMsg(s))}</div>
  ${s.repeat >= 2 ? `<div style="font-size:13px;opacity:.9">${L('3週連続で同じ課題です。一度コーチに動画を見てもらうのがおすすめです。', '3주째 같은 과제예요. 코치에게 영상을 한 번 보여 주는 걸 권해요.')}</div>` : ''}</div>
  ${warns.length > 1 ? `<div class="msg">${L('次の候補：', '다음 후보: ')}${warns.filter(k => k !== s.task).map(k => ITEMS[k].name()).join(' → ')} ${L('(1つずつ)', '(한 번에 하나씩)')}</div>` : ''}
  <h2>${L('項目別の結果', '항목별 결과')}</h2><div class="card">${PRIORITY.map(row).join('')}</div>
  ${flowHtml(s)}
  <h2>${L('7日間スケジュール', '7일 스케줄')}</h2><div class="card">${s.schedule.map((d, i) => dayHtml(s.task, d, i, done, false)).join('')}</div>
  <h2>${L('シェアカード', '공유 카드')}</h2><div id="share"><button class="btn ghost" id="mk">${L('画像カードを作る', '이미지 카드 만들기')}</button></div>
  <div class="note">${L('数値の出どころ：膝の理想値と理想モデルのトロフィー・インパクトの角度は、テニスサーブの研究をまとめた論文(Jacquier-Bret & Gorce 2024、上級者中心)の平均値です。そのほかは一般的なコーチング基準をもとにした目安値で、コーチの確認後に確定します。', '수치 출처: 무릎 이상값과 이상 모델의 트로피·임팩트 각도는 테니스 서브 연구를 종합한 논문(Jacquier-Bret & Gorce 2024, 상급자 중심)의 평균값이에요. 나머지는 일반적인 코칭 기준을 바탕으로 한 잠정값이고, 코치 확인 후 확정해요.')}</div>
  <div class="note">${L('ベータv0：判定基準はコーチ確認前のドラフトです。痛みがあれば課題を中止してください。総合点は信頼性の検証前のため表示していません。', '베타 v0: 판정 기준은 코치 검수 전 초안입니다. 통증이 있으면 과제를 멈추세요. 총점은 신뢰도 검증 전이라 표시하지 않습니다.')}</div>
  <button class="btn ghost" id="hm">${L('ホームへ', '홈으로')}</button>`;
  bindChecks(s.id, done);
  startFlow(s);
  startFixes(s);
  $('#hm').onclick = () => go('home');
  $('#mk').onclick = async () => { const url = await shareCard(s, prev); $('#share').innerHTML = `<img class="frame" src="${url}" style="max-width:300px;margin:0 auto"><p class="sub" style="text-align:center;margin-top:6px">${L('画像を長押しして保存してください', '이미지를 길게 눌러 저장하세요')}</p>`; };
}
function priorityHtml(s) {
  const LB = LABEL();
  const list = [...PRIORITY.filter(k => s.judge[k] === 'warn'), ...PRIORITY.filter(k => s.judge[k] === 'mid')];
  if (!list.length) return '';
  return `<h2>${L('改善の優先順位', '개선 우선순위')}</h2><div class="card"><ol class="prio">${list.map((k, i) => `<li><div><b>${ITEMS[k].name()}</b> <span class="tag ${s.judge[k]}">${LB[s.judge[k]]}</span>${k === s.task ? ` <span class="tag now">${L('今週の課題', '이번 주 과제')}</span>` : ''}</div><div class="msg">${esc(ITEMS[k].warn(s.metrics[k]))}</div></li>`).join('')}</ol>
  <div class="msg">${L('サーブは前の動作が崩れると後ろも崩れるため、トス→腕→脚の順に1つずつ直します。', '서브는 앞 동작이 흔들리면 뒤도 흔들려서, 토스 → 팔 → 다리 순서로 하나씩 고쳐요.')}</div></div>`;
}
let stopFlow = null, flipTimer = null, stopFixes = [];
function fixItems(s) {
  if (!s.fix || !s.fix.pts) return [];
  const list = [...PRIORITY.filter(k => s.judge[k] === 'warn'), ...PRIORITY.filter(k => s.judge[k] === 'mid')].slice(0, 3);
  return list.map(k => ({ k, f: correct(k, s.fix.pts, s.fix.dir || 1, s.level, s.fix) })).filter(x => x.f);
}
function fixHtml(s) {
  const items = fixItems(s); if (!items.length) return '';
  return `<h2>${L('直し方(あなたのフォームで)', '고치는 법 (내 자세로)')}</h2>
  <p class="sub">${L('オレンジの点線 = 今、青 = 直した形。動きを繰り返し表示します。', '주황 점선 = 지금, 파랑 = 고친 모양. 움직임을 반복해서 보여줘요.')}</p>
  ${s.view && s.view !== 'side' ? `<div class="msg">${L('※横から撮った動画のほうが正確に表示できます。', '※옆에서 찍은 영상이어야 더 정확하게 보여줄 수 있어요.')}</div>` : ''}
  <div class="fixes">${items.map((x, i) => `<div class="card fixc"><canvas data-fix="${i}" width="360" height="640"></canvas>
  <div><b>${i + 1}. ${ITEMS[x.k].name()}</b> <span class="msg">${ITEMS[x.k].fmt(s.metrics[x.k])}${x.f.target ? ' → ' + L('目標 ', '목표 ') + x.f.target + '°' : ''}</span><div class="msg">${esc(x.f.cue)}</div></div></div>`).join('')}</div>`;
}
function startFixes(s) {
  stopFixes.forEach(f => f()); stopFixes = [];
  const items = fixItems(s); if (!items.length) return;
  const img = new Image(); img.onload = () => items.forEach((x, i) => { const cv = document.querySelector(`canvas[data-fix="${i}"]`); if (cv) stopFixes.push(playFix(cv, img, s.fix.pts, x.f)); }); img.src = s.fix.img;
}
function flowHtml(s) {
  const fmt = v => isFinite(v) ? Math.round(v) + '°' : '—';
  const rows = PHASES.map((ph, i) => { const a = phaseAngles(ph), u = (s.phases || [])[i] || {};
    return `<tr data-i="${i}"><td>${ph.name()}</td><td>${a.toss}°<br><span class="you">${fmt(u.toss)}</span></td><td>${a.elbow}°<br><span class="you">${fmt(u.elbow)}</span></td><td>${a.knee}°<br><span class="you">${fmt(u.knee)}</span></td></tr>`; }).join('');
  return `<h2>${L('理想のサーブの流れ', '이상적인 서브 흐름')}</h2><div class="card">
  <div class="flow"><div><canvas id="idealC" width="360" height="480"></canvas><div class="msg c">${L('理想(モデル)', '이상(모델)')}</div></div>
  ${s.phases ? `<div><img id="youC" class="frame" src="${s.phases[0].img}"><div class="msg c">${L('あなた(同じ局面)', '나(같은 단계)')}</div></div>` : ''}</div>
  <div class="phase" id="phName"></div>
  <table class="ang"><tr><th>${L('局面', '단계')}</th><th>${L('トス腕', '토스 팔')}</th><th>${L('ラケット腕の肘', '라켓 팔 팔꿈치')}</th><th>${L('前膝', '앞 무릎')}</th></tr>${rows}</table>
  <div class="msg">${L('上段 = 理想、下段(緑) = あなた。トス腕は真下0°〜真上180°。横から撮影した場合のみ比較できます。', '윗줄 = 이상, 아랫줄(초록) = 나. 토스 팔은 아래 0°~위 180°. 옆에서 찍은 영상만 비교할 수 있어요.')}</div></div>`;
}
function startFlow(s) {
  if (stopFlow) stopFlow(); clearInterval(flipTimer);
  const cv = $('#idealC'); if (!cv) return;
  stopFlow = animateIdeal(cv, i => {
    if (!$('#idealC')) { stopFlow(); return; }
    $('#phName').textContent = `${i + 1}/6 ${PHASES[i].name()}`;
    document.querySelectorAll('table.ang tr[data-i]').forEach(r => r.classList.toggle('on', +r.dataset.i === i));
    const y = $('#youC'); if (y && s.phases && s.phases[i]) y.src = s.phases[i].img;
  });
}
function cmpHtml(s, prev) {
  const C = CMP();
  const rows = compare(s.metrics, prev.metrics).filter(r => r.res !== 'na');
  const ups = rows.filter(r => r.res === 'up').length;
  return `<h2>${L(`前回(${prev.date})との比較`, `지난번(${prev.date})과 비교`)}</h2><div class="card">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px"><div><img class="frame" src="${prev.img}"><div class="msg" style="text-align:center">${L('前回', '지난번')}</div></div><div><img class="frame" src="${s.img}"><div class="msg" style="text-align:center">${L('今回', '이번')}</div></div></div>
  ${rows.map(r => `<div class="item"><div class="n">${ITEMS[r.k].name()}</div><div class="v">${ITEMS[r.k].fmt(r.a)} → ${ITEMS[r.k].fmt(r.b)}<br><span class="tag ${r.res}">${C[r.res]}</span></div></div>`).join('')}
  <div class="msg">${ups ? L(`${ups}項目が誤差を超えて良くなりました。`, `${ups}개 항목이 오차 범위를 넘어 좋아졌어요.`) : L('誤差を超える変化はまだありません。もう1週、同じ課題で続けましょう。', '오차 범위를 넘는 변화는 아직 없어요. 한 주 더 같은 과제로 가 봅시다.')} ${L('(同じ角度・距離で撮ると比較が正確になります)', '(같은 각도·거리로 찍어야 비교가 정확해요)')}</div></div>`;
}
async function shareCard(s, prev) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const g = c.getContext('2d');
  g.fillStyle = '#14211A'; g.fillRect(0, 0, 1080, 1920);
  const im = new Image(); im.src = s.img; await im.decode();
  const h = 1300, iw = h * 9 / 16;
  g.save(); g.beginPath(); g.roundRect((1080 - iw) / 2, 200, iw, h, 36); g.clip(); g.drawImage(im, (1080 - iw) / 2, 200, iw, h); g.restore();
  g.fillStyle = '#D9E43A'; g.beginPath(); g.arc(110, 110, 26, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = `900 54px ${FONT}`; g.fillText(L('サーブコーチ', '서브 코치'), 156, 128);
  g.font = `500 34px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.7)'; g.textAlign = 'right'; g.fillText(s.date, 990, 124); g.textAlign = 'left';
  const y = 200 + h + 90;
  g.fillStyle = '#D9E43A'; g.font = `900 60px ${FONT}`;
  if (prev) {
    const cr = compare(s.metrics, prev.metrics);
    const r = cr.find(r => r.res === 'up') || cr.find(r => r.k === s.task && r.res !== 'na') || cr.find(r => r.res !== 'na');
    g.fillText(r ? `${ITEMS[r.k].name()} ${ITEMS[r.k].fmt(r.a)} → ${ITEMS[r.k].fmt(r.b)}` : L('1週間チャレンジ完了', '1주 챌린지 완료'), 90, y);
  } else g.fillText(s.task === 'keep' ? L('今週：フォーム維持', '이번 주: 폼 유지') : L('今週の課題：', '이번 주 과제: ') + ITEMS[s.task].name(), 90, y);
  g.fillStyle = '#fff'; g.font = `500 40px ${FONT}`; g.fillText(L('7日後に撮り直して比較します 🎾', '7일 뒤 다시 찍어 비교합니다 🎾'), 90, y + 80);
  return c.toDataURL('image/png');
}

// ---------- history ----------
async function history() {
  const ss = (await S.sessions()).slice().reverse();
  if (curRoute !== 'history') return;
  app.innerHTML = `<h1>${L('記録', '기록')}</h1>${ss.length ? ss.map(s => `<div class="card" data-id="${s.id}" style="display:flex;gap:12px;align-items:center;cursor:pointer">
  <img src="${s.img}" style="width:64px;border-radius:8px"><div><b>${s.date}</b><div class="msg">${L('課題：', '과제: ')}${taskTitle(s.task)} · ${L(`サーブ${s.n}本`, `서브 ${s.n}개`)}</div>
  <div class="msg">${L('膝', '무릎')} ${isFinite(s.metrics.knee) ? s.metrics.knee.toFixed(0) + '°' : '—'} · ${ITEMS.hold.name()} ${isFinite(s.metrics.hold) ? ITEMS.hold.fmt(s.metrics.hold) : '—'}</div></div></div>`).join('') : `<p class="sub">${L('まだ記録がありません。', '아직 기록이 없어요.')}</p>`}
  ${ss.length ? `<button class="btn ghost" id="clr">${L('最新の記録を削除', '마지막 기록 삭제')}</button>` : ''}`;
  app.querySelectorAll('[data-id]').forEach(c => c.onclick = () => go('view', +c.dataset.id));
  const clr = $('#clr'); if (clr) clr.onclick = async () => { if (clr.dataset.sure) { await S.del(ss[0].id); go('history'); } else { clr.dataset.sure = 1; clr.textContent = L('もう一度押すと削除します', '한 번 더 누르면 삭제됩니다'); } };
}

// ---------- boot ----------
window.addEventListener('unhandledrejection', e => { console.error('UNHANDLED', e.reason && (e.reason.stack || e.reason.message || e.reason)); try { alertBox(L('エラー：', '오류: ') + (e.reason && e.reason.message || e.reason)); } catch {} });
window.addEventListener('error', e => console.error('ERROR', e.message));
(async () => {
  setLang(lang); navLabels();
  profile = await S.get('profile');
  go(profile ? 'home' : 'setup');
  E.loadEngine().catch(() => {});
})();
window.__go = go;
