import * as E from './engine.js';
import { L, lang, setLang, WD } from './i18n.js';
import { PHASES, animateIdeal } from './ideal.js';
import { correct, playFix } from './fix.js';
import { ITEMS, PRIORITY, LABEL, CMP, DRILLS, WARMUP, RULES_V, fin, judgeAll, fixOrder, pickTask, jointsFor, makeSchedule, filmDay, compare, wd, ymd, dayDiff } from './rules.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FPS = 30;
const FONT = '"Hiragino Sans","Apple SD Gothic Neo","Noto Sans JP","Noto Sans KR",sans-serif';
const md = d => d.slice(5).replace('-', '/').replace(/^0/, '');

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
  // records made with older judging rules are not comparable, so they are left out
  async sessions() { let a; try { a = await tx('sessions', 'readonly', s => s.getAll()); } catch { a = mem.sessions; } return a.filter(s => s.v === RULES_V).sort((x, y) => x.id - y.id); },
  async add(x) { mem.sessions.push(x); try { await tx('sessions', 'readwrite', s => s.put(x)); } catch {} },
  async del(id) { mem.sessions = mem.sessions.filter(s => s.id !== id); try { await tx('sessions', 'readwrite', s => s.delete(id)); } catch {} },
};

let profile = null, work = null, curRoute = 'home', curArg = null;
let stops = [];                                   // running animations of the current screen
const stopAll = () => { stops.forEach(f => { try { f(); } catch {} }); stops = []; };

// ---------- router ----------
const routes = { setup, home, capture, mark, history, view };
const TAB = { view: 'history', mark: 'capture' };
function navLabels() {
  const t = { home: L('ホーム', '홈'), capture: L('撮る・分析', '촬영·분석'), history: L('記録', '기록'), setup: L('プロフィール', '내 정보') };
  document.querySelectorAll('nav button').forEach(b => b.querySelector('span').textContent = t[b.dataset.go]);
  $('#langbtn').textContent = lang === 'ja' ? '🌐 한국어' : '🌐 日本語';
  document.title = L('サーブコーチ', '서브 코치');
  $('#brand').textContent = L('サーブコーチ', '서브 코치');
}
async function go(r, arg) {
  curRoute = r; curArg = arg; stopAll();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.go === (TAB[r] || r)));
  window.scrollTo(0, 0);
  await routes[r](arg);
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => go(profile ? b.dataset.go : 'setup'));
$('#langbtn').onclick = () => { setLang(lang === 'ja' ? 'ko' : 'ja'); navLabels(); go(curRoute, curArg); };
function alertBox(t) { let w = $('#alert'); if (!w) { w = document.createElement('div'); w.id = 'alert'; w.className = 'warnbox'; app.appendChild(w); } w.textContent = t; w.scrollIntoView({ block: 'nearest' }); }

// ---------- setup ----------
async function setup() {
  const first = !profile;
  const p = profile ? { ...profile } : { hand: 'r', level: 'beg', court: [6] };
  const opt = {
    hand: [['r', L('右利き', '오른손잡이')], ['l', L('左利き', '왼손잡이')]],
    level: [['beg', L('初級', '초급'), L('サーブがまだ安定しない', '서브가 아직 불안정')], ['mid', L('中級', '중급'), L('試合でサーブが入る', '경기에서 서브가 들어감')]],
  };
  const chips = key => `<div class="row" data-k="${key}">${opt[key].map(([v, t, sub]) => `<button class="chip ${p[key] === v ? 'on' : ''}" data-v="${v}">${t}${sub ? `<small>${sub}</small>` : ''}</button>`).join('')}</div>`;
  app.innerHTML = `<h1>${first ? L('はじめに3つだけ教えてください', '시작 전에 3가지만 알려 주세요') : L('プロフィール', '내 정보')}</h1>
  <div class="card"><label class="f">${L('① ラケットを持つ手', '① 라켓을 드는 손')}</label>${chips('hand')}
  <label class="f">${L('② レベル', '② 레벨')}</label>${chips('level')}
  <label class="f">${L('③ コートに行く曜日(いくつでも)', '③ 코트에 가는 요일 (여러 개 가능)')}</label><div class="row" data-k="court">${WD().map((w, i) => `<button class="chip day ${p.court.includes(i) ? 'on' : ''}" data-v="${i}">${w}</button>`).join('')}</div>
  <p class="msg" style="margin-top:8px">${L('練習の予定を、コートの日と自宅の日に分けて作るために使います。', '연습 일정을 코트 가는 날과 집에 있는 날로 나눠 짜는 데 써요.')}</p></div>
  <button class="btn" id="save">${first ? L('保存してはじめる', '저장하고 시작하기') : L('保存する', '저장하기')}</button>
  <div class="note">🔒 ${L('動画と記録はこのスマホの中だけに保存されます。どこにも送信されません。', '영상과 기록은 이 폰 안에만 저장돼요. 어디로도 전송되지 않아요.')}</div>`;
  app.querySelectorAll('.row').forEach(row => row.onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return; const k = row.dataset.k;
    if (k === 'court') { const v = +b.dataset.v; p.court = p.court.includes(v) ? p.court.filter(x => x !== v) : [...p.court, v]; b.classList.toggle('on'); }
    else { p[k] = b.dataset.v; row.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); }
  });
  $('#save').onclick = async () => { if (!p.court.length) return alertBox(L('コートに行く曜日を1つ以上選んでください。', '코트에 가는 요일을 하나 이상 골라 주세요.')); profile = p; await S.set('profile', p); go('home'); };
}

const taskShort = s => s.task === 'keep' ? L('今のフォームをそのまま続ける', '지금 자세 그대로 이어 가기') : ITEMS[s.task].short(s.metrics[s.task]);
const taskMsg = s => s.task === 'keep' ? L('大きく直すところは見当たりません。同じリズムで繰り返して、体に覚えさせましょう。', '크게 고칠 곳은 보이지 않아요. 같은 리듬으로 반복해서 몸에 익혀요.') : ITEMS[s.task].msg(s.metrics[s.task]);

// ---------- schedule pieces ----------
function dayHtml(s, i, done, big) {
  const d = s.schedule[i], drills = [WARMUP, ...d.drills.map(j => DRILLS[s.task][j])];
  return `<div class="day" data-day="${i}"><div class="d"><b>${wd(d.dow)}</b><small>${md(d.date)}</small><span class="badge ${d.court ? 'court' : ''}">${d.court ? L('コート', '코트') : L('自宅', '집')}</span></div><div class="dl">
  ${drills.map((x, j) => `<label class="chk"><input type="checkbox" data-c="${i}_${j}" ${done[i + '_' + j] ? 'checked' : ''}><span><b>${esc(x.t())}</b> <span class="msg">${x.min}${L('分', '분')}</span>${big ? `<span class="msg blk">${esc(x.d())}</span>` : ''}</span></label>`).join('')}
  ${d.film ? `<div class="film">🎥 ${L('この日にもう一度撮影して、今回と比べます', '이날 다시 촬영해서 이번과 비교해요')}</div>` : ''}
  <div class="doneMsg hide">✓ ${L('この日の分は完了！', '이날 분량 끝!')}</div></div></div>`;
}
function bindChecks(id, done) {
  const paint = () => app.querySelectorAll('.day').forEach(d => { const cs = [...d.querySelectorAll('input[data-c]')]; d.querySelector('.doneMsg').classList.toggle('hide', !(cs.length && cs.every(c => c.checked))); });
  app.querySelectorAll('input[data-c]').forEach(c => c.onchange = async () => {
    done[c.dataset.c] = c.checked; app.querySelectorAll(`input[data-c="${c.dataset.c}"]`).forEach(o => { o.checked = c.checked; }); paint(); await S.set('done_' + id, done);
  });
  paint();
}

// ---------- home ----------
async function home() {
  const ss = await S.sessions(); if (curRoute !== 'home') return; const last = ss[ss.length - 1];
  if (!last) {
    app.innerHTML = `<h1>${L('最初のサーブを分析しましょう', '첫 서브를 분석해 볼까요?')}</h1>
    <div class="card hero"><div class="k">${L('用意するもの', '준비물')}</div><div class="t">${L('横から撮ったサーブの動画1本', '옆에서 찍은 서브 영상 1개')}</div><div class="hs">${L('サーブが3〜5本入った20〜60秒の動画がおすすめです。', '서브 3~5개가 들어간 20~60초 영상을 추천해요.')}</div></div>
    <button class="btn ball" id="go">${L('動画を選んで分析する', '영상 고르고 분석하기')}</button>
    <div class="note">${L('できること：フォーム分析 → 今週直すところを1つ → 毎日の練習メニュー → 1週間後に撮り直して比べる', '할 수 있는 것: 자세 분석 → 이번 주 고칠 곳 1개 → 매일 연습 메뉴 → 1주일 뒤 다시 찍어 비교')}</div>`;
    $('#go').onclick = () => go('capture'); return;
  }
  const today = ymd(), days = last.schedule, idx = days.findIndex(d => d.date === today);
  const dleft = dayDiff(today, filmDay(days).date);
  const done = (await S.get('done_' + last.id)) || {};
  if (curRoute !== 'home') return;
  const due = dleft <= 0;
  app.innerHTML = `<p class="sub">${md(last.date)}${L('の分析結果', ' 분석 결과')}</p>
  <div class="card hero"><div class="k">${L('今週はこれだけ', '이번 주엔 이것만')}</div><div class="t">${esc(taskShort(last))}</div>
  <div class="hs">${dleft > 0 ? L(`次の撮影まで あと${dleft}日`, `다음 촬영까지 ${dleft}일`) : L('今日はもう一度撮影して比べる日です', '오늘은 다시 촬영해서 비교하는 날이에요')}</div></div>
  ${idx >= 0 ? `<h2>${L('今日やること', '오늘 할 일')}</h2><div class="card">${dayHtml(last, idx, done, true)}</div>` : `<div class="note">${L('今週の予定は終わりました。もう一度撮影して、前回と比べましょう。', '이번 주 일정이 끝났어요. 다시 촬영해서 지난번과 비교해 봐요.')}</div>`}
  <button class="btn ${due ? 'ball' : 'ghost'}" id="re">${due ? L('撮り直して比べる', '다시 찍고 비교하기') : L('新しい動画を分析する', '새 영상 분석하기')}</button>
  <button class="btn ghost" id="rep">${L('直し方をもう一度見る', '고치는 법 다시 보기')}</button>`;
  bindChecks(last.id, done);
  $('#re').onclick = () => go('capture'); $('#rep').onclick = () => go('view', last.id);
}

// ---------- capture / analyse ----------
async function capture() {
  app.innerHTML = `<h1>${L('サーブの動画を選ぶ', '서브 영상 고르기')}</h1>
  <div class="card guidec"><svg viewBox="0 0 200 150" class="court">
  <rect x="30" y="8" width="140" height="120" fill="#3F7D5B" rx="4"/><path d="M30 20h140" stroke="#fff" stroke-width="3" stroke-dasharray="2 3"/><path d="M30 112h140M100 20v50M52 70h96M52 20v92M148 20v92" stroke="#fff" stroke-width="1.5" fill="none"/>
  <text x="100" y="16" font-size="8" fill="#fff" text-anchor="middle">${L('ネット', '네트')}</text>
  <circle cx="112" cy="120" r="6" fill="#D9E43A" stroke="#14211A" stroke-width="1.5"/><text x="112" y="140" font-size="9" fill="#14211A" text-anchor="middle" font-weight="700">${L('あなた', '나')}</text>
  <path d="M112 112v-22" stroke="#D9E43A" stroke-width="2" marker-end="url(#ah)"/><defs><marker id="ah" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0l6 3-6 3z" fill="#D9E43A"/></marker></defs>
  <rect x="178" y="112" width="10" height="16" rx="2" fill="#14211A"/><path d="M176 120h-52" stroke="#14211A" stroke-width="1.5" stroke-dasharray="3 3"/><text x="183" y="140" font-size="9" fill="#14211A" text-anchor="middle" font-weight="700">${L('スマホ', '폰')}</text></svg>
  <ol class="howto"><li>${L('<b>真横</b>から撮る(ベースラインの延長線上にスマホ)', '<b>바로 옆</b>에서 찍기 (베이스라인 연장선에 폰)')}</li>
  <li>${L('スマホは<b>縦向き</b>、腰の高さで固定', '폰은 <b>세로</b>, 허리 높이에 고정')}</li>
  <li>${L('頭の上のボールから足先まで、<b>全身</b>を入れる', '머리 위 공부터 발끝까지 <b>온몸</b>이 나오게')}</li>
  <li>${L('<b>ふつうの動画</b>で撮る(スローモーションは使えません)', '<b>일반 동영상</b>으로 찍기 (슬로모션은 쓸 수 없어요)')}</li>
  <li>${L('サーブを<b>3〜5本</b>', '서브 <b>3~5개</b>')}</li></ol></div>
  <input type="file" id="file" accept="video/*" class="hide">
  <button class="btn ball" id="pick">${L('動画を選ぶ / 撮影する', '영상 고르기 / 촬영하기')}</button>
  <p class="sub c">🔒 ${L('動画はこのスマホの中だけで分析します。どこにも送信されません。', '영상은 이 폰 안에서만 분석해요. 어디로도 전송되지 않아요.')}</p>
  <div id="eng" class="card"><b id="et"></b><div class="bar"><i id="eb"></i></div><div class="msg" id="es"></div><button class="btn ghost hide" id="retry">${L('もう一度試す', '다시 시도')}</button></div>
  <div id="prog" class="card hide"><b id="pt"></b><div class="bar"><i id="pb"></i></div><div class="msg" id="ps"></div></div>`;
  $('#pick').onclick = () => $('#file').click();
  bindEngineCard();
  // the video element must be created inside this tap handler (iOS)
  $('#file').onchange = e => { const f = e.target.files[0]; if (!f) return; if (work && work.video) { URL.revokeObjectURL(work.video.src); work.video.remove(); work = null; } analyse(E.makeVideo(f)); };
}
function bindEngineCard() {
  const mb = b => (b / 1048576).toFixed(1);
  const paint = st => {
    const et = $('#et'); if (!et) return;
    const eb = $('#eb'), es = $('#es');
    $('#retry').classList.toggle('hide', st.phase !== 'error');
    if (st.phase === 'ready') { et.textContent = L('✓ 準備できました', '✓ 준비됐어요'); eb.style.width = '100%'; es.textContent = L('動画を選ぶと、すぐに分析が始まります。', '영상을 고르면 바로 분석을 시작해요.'); return; }
    if (st.phase === 'error') { et.textContent = L('準備に失敗しました', '준비에 실패했어요'); es.textContent = L('通信を確認して「もう一度試す」を押してください。', '인터넷 연결을 확인하고 「다시 시도」를 눌러 주세요.') + ' (' + st.error + ')'; return; }
    if (st.phase === 'init') { et.textContent = L('準備中…(あと少し)', '준비 중… (조금만 더)'); eb.style.width = '100%'; es.textContent = L('数秒〜20秒ほどかかります。', '몇 초~20초 정도 걸려요.'); return; }
    et.textContent = L('分析の準備をダウンロード中…', '분석 준비 파일 받는 중…');
    eb.style.width = Math.min(100, st.loaded / st.total * 100).toFixed(0) + '%';
    es.textContent = `${mb(st.loaded)} / ${mb(st.total)} MB · ` + L('最初の1回だけ。Wi-Fiがおすすめ', '처음 한 번만 받아요. Wi-Fi 추천');
  };
  stops.push(E.onEngine(paint));
  const timer = setInterval(() => {
    const st = E.engineState, es = $('#es'); if (!es) return;
    if ((st.phase === 'download' || st.phase === 'init') && Date.now() - st.t > 25000)
      es.textContent = L('25秒以上進んでいません。通信が遅いか止まっているかもしれません。もう少し待つか、ページを読み込み直してください。', '25초 넘게 진행이 없어요. 연결이 느리거나 멈췄을 수 있어요. 조금 더 기다리거나 페이지를 새로고침해 주세요.');
  }, 5000);
  stops.push(() => clearInterval(timer));
  $('#retry').onclick = () => { E.loadEngine().catch(() => {}); };
  if (E.engineState.phase === 'idle' || E.engineState.phase === 'error') E.loadEngine().catch(() => {});
}
async function analyse(vEl) {
  const pb = $('#pb'), pt = $('#pt'), ps = $('#ps');
  $('#prog').classList.remove('hide'); $('#pick').disabled = true;
  const wait = L('このままお待ちください(30秒〜2分)。画面を閉じないでください。', '이대로 기다려 주세요(30초~2분). 화면을 닫지 마세요.');
  try {
    pt.textContent = E.engineState.phase === 'ready' ? L('分析を始めます…', '분석을 시작해요…') : L('準備ができ次第、分析を始めます…', '준비가 끝나면 바로 분석을 시작해요…');
    ps.textContent = wait;
    await E.loadEngine();
    $('#eng') && $('#eng').classList.add('hide');
    pt.textContent = L('動画を読み込み中…', '영상을 불러오는 중…');
    const video = await E.openVideo(vEl);
    const tr = await E.trackPose(video, FPS, f => { const pc = Math.round(f * 100); pb.style.width = pc + '%'; pt.textContent = L(`フォームを読み取り中… ${pc}%`, `자세를 읽는 중… ${pc}%`); });
    pb.style.width = '100%';
    const r = E.findServes(tr, profile.hand);
    work = { video, tr, ...r, sel: r.serves.map(() => true) };
    if (tr.detectRate < 0.5) return failBox(L('人がうまく映っていませんでした。全身が大きく映るように撮り直してください。', '사람이 잘 잡히지 않았어요. 온몸이 크게 나오게 다시 찍어 주세요.'));
    if (!r.serves.length) return failBox(L('サーブが見つかりませんでした。トスの腕が頭より上まで映っているか確認してください。', '서브를 찾지 못했어요. 토스하는 팔이 머리 위까지 화면에 나오는지 확인해 주세요.'));
    go('mark');
  } catch (e) { failBox(L('分析できませんでした：', '분석하지 못했어요: ') + e.message); console.error(e); }
}
function failBox(t) { const b = $('#pick'); if (b) b.disabled = false; const pt = $('#pt'); if (pt) { pt.textContent = L('分析できませんでした', '분석하지 못했어요'); $('#ps').textContent = ''; } alertBox(t); }

// ---------- mark (serve confirmation) ----------
async function frameAt(i, w, hl, after, noSkel) {
  await E.seek(work.video, Math.min(work.video.duration - 0.001, (i + 0.5) / FPS));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return E.drawFrame(document.createElement('canvas'), work.video, work.tr.frames[i], { crop: true, w, h: w * 16 / 9, highlight: hl, after, noSkel });
}
async function mark() {
  if (!work) return go('capture');
  const n = work.serves.length;
  app.innerHTML = `<h1>${L(`サーブを${n}本見つけました`, `서브 ${n}개를 찾았어요`)}</h1>
  <p class="sub">${L('打つ直前の場面です。サーブではない場面が混ざっていたら、選んで外してください。', '치기 직전 장면이에요. 서브가 아닌 장면이 섞여 있으면 골라서 빼 주세요.')}</p>
  ${work.ctx.slow ? `<div class="note">${L('スローモーションの動画のようです。時間に関する項目は今回は測れません。', '슬로모션 영상인 것 같아요. 시간과 관련된 항목은 이번엔 잴 수 없어요.')}</div>` : ''}
  <div class="serves" id="sv"></div>
  <div id="adjw" class="card hide"><div class="bigw"><canvas id="big"></canvas></div>
  <button class="btn ghost" id="tog"></button>
  <details class="fold"><summary>${L('場面を細かく調整する', '장면 세부 조정')}</summary><div class="adj"><button class="btn ghost" id="m1">◀ ${L('少し前', '조금 앞')}</button><button class="btn ghost" id="p1">${L('少し後', '조금 뒤')} ▶</button></div>
  <div class="msg">${L('ひざがいちばん曲がった瞬間に合わせると、より正確になります。', '무릎이 가장 굽은 순간에 맞추면 더 정확해져요.')}</div></details></div>
  <div class="stick"><button class="btn ball" id="ok">${L('この内容で結果を見る', '이대로 결과 보기')}</button></div>`;
  $('#ok').onclick = async () => {
    if (!work.sel.some(Boolean)) return alertBox(L('サーブを1本以上残してください。', '서브를 하나 이상 남겨 주세요.'));
    const b = $('#ok'); if (b.disabled) return; b.disabled = true; b.textContent = L('結果を作っています…', '결과를 만드는 중…');
    try { await buildSession(); } catch (e) { b.disabled = false; b.textContent = L('この内容で結果を見る', '이대로 결과 보기'); alertBox(e.message); console.error(e); }
  };
  const sv = $('#sv'); let cur = 0, busy = false;
  const paintSel = () => { sv.querySelectorAll('.s').forEach((x, j) => { x.classList.toggle('on', j === cur); x.classList.toggle('off', !work.sel[j]); }); $('#tog').textContent = work.sel[cur] ? L(`#${cur + 1} このサーブを使わない`, `#${cur + 1} 이 서브 빼기`) : L(`#${cur + 1} このサーブを使う(今は外しています)`, `#${cur + 1} 이 서브 다시 넣기 (지금은 뺐어요)`); };
  async function showBig() { $('#adjw').classList.remove('hide'); const c = await frameAt(work.serves[cur].tro, 540); if (!$('#big')) return; $('#big').replaceWith(c); c.id = 'big'; paintSel(); }
  for (let i = 0; i < n; i++) {
    const c = await frameAt(work.serves[i].tro, 240); if (curRoute !== 'mark') return;
    const d = document.createElement('div'); d.className = 's'; d.innerHTML = `<span>#${i + 1}</span><em>${L('外す', '뺌')}</em>`; d.prepend(c);
    d.onclick = async () => { if (busy) return; busy = true; cur = i; await showBig(); busy = false; };
    sv.appendChild(d);
  }
  $('#tog').onclick = () => { work.sel[cur] = !work.sel[cur]; paintSel(); };
  const mv = async dlt => { if (busy) return; busy = true; const s = work.serves[cur], f = Math.max(0, Math.min(work.tr.n - 1, s.tro + dlt)); work.serves[cur] = E.remeasure(work.tr, work.ctx, s, f); await showBig(); const c = await frameAt(f, 240); const old = sv.children[cur] && sv.children[cur].querySelector('canvas'); if (old) old.replaceWith(c); busy = false; };
  $('#m1').onclick = () => mv(-1); $('#p1').onclick = () => mv(1);
  await showBig();
}
const med = a => { const s = a.filter(fin).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

async function buildSession() {
  const used = work.serves.filter((_, i) => work.sel[i]), ctx = work.ctx;
  const metrics = {}; for (const k of PRIORITY) metrics[k] = med(used.map(s => s[k]));
  const j = judgeAll(metrics, profile.level);
  const ss = await S.sessions(), prev = ss[ss.length - 1], today = ymd();
  const task = pickTask(j);
  // "same task again" only counts when about a week has passed
  const repeat = prev && prev.task === task && task !== 'keep' ? (dayDiff(prev.date, today) >= 5 ? (prev.repeat || 0) + 1 : (prev.repeat || 0)) : 0;
  // representative serve: the one closest to the median on the task item (so the picture matches the number)
  const key = task !== 'keep' && fin(metrics[task]) ? task : fin(metrics.knee) ? 'knee' : null;
  const rep = key ? used.reduce((a, b) => Math.abs(b[key] - metrics[key]) < Math.abs(a[key] - metrics[key]) || !fin(a[key]) ? b : a, used[0]) : used[0];
  const side = { tossS: ctx.tossS, tossE: ctx.tossE, tossW: ctx.tossW, racket: ctx.racket };
  const img = (await frameAt(rep.tro, 540, task !== 'keep' ? jointsFor(task, side) : [])).toDataURL('image/jpeg', 0.82);
  let pts = null;
  const clean = (await frameAt(rep.tro, 360, null, (c, T) => { pts = work.tr.frames[rep.tro].map(q => { const [x, y] = T(q); return { x: +x.toFixed(1), y: +y.toFixed(1), v: +q.v.toFixed(2) }; }); }, true)).toDataURL('image/jpeg', 0.8);
  const s = { v: RULES_V, id: Date.now(), date: today, level: profile.level, n: used.length, metrics, judge: j, task, repeat, img, dir: ctx.dir, view: ctx.view, slow: ctx.slow,
    fix: { img: clean, pts, ...side }, prevId: prev ? prev.id : null, schedule: makeSchedule(task, profile.court) };
  await S.add(s);
  go('view', s.id);
}

// ---------- report ----------
const fixFor = (s, k) => s.fix && s.fix.pts && ITEMS[k] ? correct(k, s.fix.pts, s.dir || 1, s.level, s.fix, s.metrics[k]) : null;
const legend = () => `<div class="legend"><span><i class="lg o"></i>${L('今', '지금')}</span><span><i class="lg b"></i>${L('目標', '목표')}</span></div>`;
async function view(id) {
  const ss = await S.sessions(); const s = ss.find(x => x.id === id); if (!s) return go('home');
  const prev = ss.find(x => x.id === s.prevId);
  const done = (await S.get('done_' + s.id)) || {};
  if (curRoute !== 'view') return;
  const LB = LABEL(), today = ymd();
  const order = fixOrder(s.judge), others = order.filter(k => k !== s.task), goods = PRIORITY.filter(k => s.judge[k] === 'good'), nas = PRIORITY.filter(k => s.judge[k] === 'na');
  const mainFix = s.task !== 'keep' ? fixFor(s, s.task) : null;
  const otherFix = others.map(k => ({ k, f: fixFor(s, k) }));
  const ti = Math.max(0, s.schedule.findIndex(d => d.date === today));
  const dayTitle = s.schedule[ti].date === today ? L('今日やること', '오늘 할 일') : L('最初の日にやること', '첫날 할 일');
  const row = k => { const it = ITEMS[k], v = s.metrics[k], jj = s.judge[k];
    return `<div class="item"><div><div class="n">${it.name()} <span class="tag ${jj}">${LB[jj]}</span></div><div class="msg">${esc(it.fmt(v))}</div><div class="range">${esc(it.ideal(s.level))}</div></div></div>`; };
  app.innerHTML = `<p class="sub">${md(s.date)} · ${L(`サーブ${s.n}本をまとめた結果`, `서브 ${s.n}개를 종합한 결과`)}</p>
  ${s.view !== 'side' ? `<div class="note">${L('真横からの動画ではないかもしれません。その場合、結果は目安として見てください。', '바로 옆에서 찍은 영상이 아닐 수 있어요. 그렇다면 결과는 참고로만 봐 주세요.')}</div>` : ''}
  <div class="card hero"><div class="k">${s.task === 'keep' ? L('今週は', '이번 주는') : L('今週はこれだけ', '이번 주엔 이것만')}${s.repeat ? L(` · ${s.repeat + 1}週目`, ` · ${s.repeat + 1}주째`) : ''}</div>
  <div class="t">${esc(taskShort(s))}</div><div class="hs">${esc(taskMsg(s))}</div>
  ${s.repeat >= 2 ? `<div class="hs">${L('3週続けて同じ課題です。一度コーチに動画を見てもらうのがおすすめです。', '3주째 같은 과제예요. 코치에게 영상을 한 번 보여 주는 걸 추천해요.')}</div>` : ''}</div>
  ${mainFix ? `<div class="card fixmain"><b>${L('直し方(あなたのフォームで)', '고치는 법 (내 자세로)')}</b><canvas data-fix="${s.task}" width="360" height="640"></canvas>${legend()}<div class="cue">${esc(mainFix.cue)}</div></div>`
            : `<img class="frame main" src="${s.img}" alt="">`}
  <h2>${dayTitle}</h2><div class="card">${dayHtml(s, ti, done, true)}
  <details class="fold"><summary>${L('このあとの予定を見る', '이후 일정 보기')}</summary>${s.schedule.map((d, i) => i === ti ? '' : dayHtml(s, i, done, false)).join('')}</details></div>
  ${goods.length ? `<h2>${L('良い点', '좋은 점')}</h2><div class="card">${goods.map(k => `<div class="item"><div><span class="tag good">${LB.good}</span> <b>${ITEMS[k].name()}</b><div class="msg">${ITEMS[k].good()}</div></div></div>`).join('')}</div>` : ''}
  ${prev ? cmpHtml(s, prev) : ''}
  ${others.length ? `<details class="fold card"><summary>${L('次に直すところ', '다음에 고칠 곳')}：${others.map(k => ITEMS[k].name()).join('、')}</summary>
  <p class="msg">${L('今週の課題ができてから、1つずつ取り組みます。', '이번 주 과제가 된 다음에 하나씩 해요.')}</p>
  ${otherFix.map(({ k, f }) => `<div class="fixc">${f ? `<canvas data-fix="${k}" width="360" height="640"></canvas>` : ''}<div><b>${ITEMS[k].name()}</b> <span class="tag ${s.judge[k]}">${LB[s.judge[k]]}</span><div class="msg">${esc(f ? f.cue : ITEMS[k].msg(s.metrics[k]))}</div></div></div>`).join('')}${otherFix.some(x => x.f) ? legend() : ''}</details>` : ''}
  <details class="fold card"><summary>${L('くわしい数値を見る', '자세한 수치 보기')}</summary>
  <img class="frame" src="${s.img}" alt=""><p class="msg">${L('緑の線 = 読み取ったあなたの姿勢', '초록 선 = 읽어 낸 내 자세')}${s.task !== 'keep' ? L('、オレンジ = 今週直すところ', ', 주황 = 이번 주 고칠 곳') : ''}</p>
  ${PRIORITY.filter(k => s.judge[k] !== 'na').map(row).join('')}
  ${nas.length ? `<p class="msg">${L('今回は測れなかった項目：', '이번엔 못 잰 항목: ')}${nas.map(k => ITEMS[k].name()).join('、')}${nas.includes('elbow') ? L('(横からはラケット側の腕が体に隠れやすいため)', '(옆에서는 라켓 쪽 팔이 몸에 가려지기 쉬워서)') : ''}</p>` : ''}
  <p class="msg">${L('基準は、研究データ(ひざ)と一般的なコーチングをもとにした仮の値です。コーチの確認後に確定します。', '기준은 연구 자료(무릎)와 일반적인 코칭을 바탕으로 한 임시 값이에요. 코치 확인 후 확정해요.')}</p>
  <p class="msg src">${L('ひざの参考：', '무릎 참고: ')}Jacquier-Bret &amp; Gorce (2024), Frontiers in Sports and Active Living</p></details>
  <details class="fold card" id="flowd"><summary>${L('お手本の動きを見る', '시범 동작 보기')}</summary>
  <div class="flow1"><canvas id="idealC" width="360" height="480"></canvas></div>
  <div class="phase" id="phName"></div><div class="msg c" id="phTip"></div>
  <div class="legend"><span><i class="lg t"></i>${L('トスの腕', '토스 팔')}</span><span><i class="lg r"></i>${L('ラケットの腕', '라켓 팔')}</span></div></details>
  <details class="fold card"><summary>${L('画像でシェアする', '이미지로 공유하기')}</summary><div id="share"><button class="btn ghost" id="mk">${L('画像を作る', '이미지 만들기')}</button></div></details>
  <div class="note">${L('試作版です。判定は目安として見てください。痛みがあるときは練習を中止してください。', '시험판이에요. 판정은 참고로만 봐 주세요. 아플 때는 연습을 멈추세요.')}</div>
  <button class="btn ghost" id="hm">${L('ホームへ', '홈으로')}</button>`;
  bindChecks(s.id, done);
  $('#hm').onclick = () => go('home');
  // how-to-fix animations
  if (s.fix && s.fix.img) { const im = new Image(); im.onload = () => { if (curRoute !== 'view') return; app.querySelectorAll('canvas[data-fix]').forEach(cv => { const f = fixFor(s, cv.dataset.fix); if (f) stops.push(playFix(cv, im, s.fix.pts, f)); }); }; im.src = s.fix.img; }
  // model animation runs only while its section is open
  let stopFlow = null;
  const fd = $('#flowd');
  fd.addEventListener('toggle', () => {
    if (stopFlow) { stopFlow(); stopFlow = null; }
    if (!fd.open) return;
    stopFlow = animateIdeal($('#idealC'), i => { const n = $('#phName'); if (!n) return; n.textContent = `${i + 1}/6 ${PHASES[i].name()}`; $('#phTip').textContent = PHASES[i].tip(); }, s.dir || 1);
    stops.push(() => stopFlow && stopFlow());
  });
  $('#mk').onclick = async () => { const url = await shareCard(s, prev); $('#share').innerHTML = `<img class="frame" src="${url}" style="max-width:280px;margin:0 auto" alt=""><p class="sub c">${L('画像を長押しすると保存できます', '이미지를 길게 누르면 저장할 수 있어요')}</p>`; };
}
function cmpHtml(s, prev) {
  const C = CMP(), rows = compare(s.metrics, prev.metrics, s.level), ups = rows.filter(r => r.res === 'up').length;
  if (!rows.length) return '';
  return `<h2>${L(`前回(${md(prev.date)})と比べると`, `지난번(${md(prev.date)})과 비교하면`)}</h2><div class="card">
  <div class="two"><div><img class="frame" src="${prev.img}" alt=""><div class="msg c">${L('前回', '지난번')}</div></div><div><img class="frame" src="${s.img}" alt=""><div class="msg c">${L('今回', '이번')}</div></div></div>
  ${rows.map(r => `<div class="item"><div class="n">${ITEMS[r.k].name()}</div><div class="v"><span class="tag ${r.res}">${C[r.res]}</span></div></div>`).join('')}
  <div class="msg">${ups ? L(`${ups}つの項目がはっきり良くなりました。`, `${ups}개 항목이 확실히 좋아졌어요.`) : L('はっきりした変化はまだありません。あせらず続けましょう。', '뚜렷한 변화는 아직 없어요. 조급해하지 말고 이어 가요.')} ${L('(毎回同じ場所・同じ距離から撮ると、正しく比べられます)', '(매번 같은 위치·같은 거리에서 찍어야 제대로 비교할 수 있어요)')}</div></div>`;
}
async function shareCard(s, prev) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const g = c.getContext('2d');
  g.fillStyle = '#14211A'; g.fillRect(0, 0, 1080, 1920);
  const im = new Image(); im.src = s.img; await im.decode();
  const h = 1400, iw = h * 9 / 16, x0 = (1080 - iw) / 2;
  g.save(); g.beginPath(); g.roundRect(x0, 190, iw, h, 36); g.clip(); g.drawImage(im, x0, 190, iw, h); g.restore();
  g.fillStyle = '#D9E43A'; g.beginPath(); g.arc(110, 105, 26, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = `900 54px ${FONT}`; g.fillText(L('サーブコーチ', '서브 코치'), 156, 124);
  g.font = `500 34px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.7)'; g.textAlign = 'right'; g.fillText(md(s.date), 990, 120); g.textAlign = 'center';
  const up = prev ? compare(s.metrics, prev.metrics, s.level).find(r => r.res === 'up') : null;
  g.fillStyle = '#D9E43A'; g.font = `900 58px ${FONT}`;
  g.fillText(up ? L(`「${ITEMS[up.k].name()}」が良くなった！`, `「${ITEMS[up.k].name()}」 좋아졌어요!`) : L('今週：', '이번 주: ') + taskShort(s), 540, 1700, 1000);
  g.fillStyle = '#fff'; g.font = `500 40px ${FONT}`; g.fillText(L('1週間後に撮り直して比べます 🎾', '1주일 뒤 다시 찍어 비교해요 🎾'), 540, 1790, 1000);
  return c.toDataURL('image/png');
}

// ---------- history ----------
async function history() {
  const ss = (await S.sessions()).slice().reverse();
  if (curRoute !== 'history') return;
  app.innerHTML = `<h1>${L('記録', '기록')}</h1>${ss.length ? ss.map(s => `<div class="card hist" data-id="${s.id}"><img src="${s.img}" alt=""><div><b>${md(s.date)}</b><div class="msg">${esc(taskShort(s))}</div><div class="msg">${L(`サーブ${s.n}本`, `서브 ${s.n}개`)}</div></div><span class="arr">›</span></div>`).join('') : `<p class="sub">${L('まだ記録がありません。', '아직 기록이 없어요.')}</p>`}
  ${ss.length ? `<div id="delw"><button class="btn ghost" id="clr">${L('いちばん新しい記録を削除', '가장 최근 기록 삭제')}</button></div>` : ''}`;
  app.querySelectorAll('[data-id]').forEach(c => c.onclick = () => go('view', +c.dataset.id));
  const clr = $('#clr'); if (clr) clr.onclick = () => {
    $('#delw').innerHTML = `<p class="sub c">${L(`${md(ss[0].date)}の記録を削除しますか？`, `${md(ss[0].date)} 기록을 삭제할까요?`)}</p><div class="adj"><button class="btn ghost" id="no">${L('やめる', '취소')}</button><button class="btn" id="yes">${L('削除する', '삭제하기')}</button></div>`;
    $('#no').onclick = () => go('history'); $('#yes').onclick = async () => { await S.del(ss[0].id); go('history'); };
  };
}

// ---------- boot ----------
window.addEventListener('unhandledrejection', e => { console.error('UNHANDLED', e.reason && (e.reason.stack || e.reason.message || e.reason)); try { alertBox(L('エラー：', '오류: ') + (e.reason && e.reason.message || e.reason)); } catch {} });
window.addEventListener('error', e => console.error('ERROR', e.message));
(async () => {
  setLang(lang); navLabels();
  profile = await S.get('profile');
  if (profile && !profile.hand) profile = null;
  go(profile ? 'home' : 'setup');
  E.loadEngine().catch(() => {});
})();
window.__go = go;
