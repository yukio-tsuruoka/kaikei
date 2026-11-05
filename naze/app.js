// なぜなぜ分析（iPhone・iPad 用・オフライン）
// 起きた問題に「なぜ？」を5回くり返して、本当の原因と対策を決め、あとで効いたかをふり返る。
// 記録はこの端末の中だけに保存する。直したら APP_VERSION と sw.js の CACHE を上げ、HISTORY に1行足す。
const APP_VERSION = '1.0.0';
const HISTORY = [
  ['1.0.0', '2026-11-06', '最初の版。なぜを5回・本当の原因・対策（いつまで）・ふり返り・LINE で送る・印刷・バックアップ。'],
];
const KEY = 'naze-v1';
const SCENES = ['予約のミス', 'お客様からの苦情', '会場でのトラブル', 'その他'];
// 場面ごとの書き方の例（入力欄に薄く出る）
const EXAMPLES = {
  '予約のミス': { problem: '例: 11/9 午前に同じ時間の予約を2件入れてしまった', why1: '例: 予約を入れるときに、空き状況を見なかった' },
  'お客様からの苦情': { problem: '例: お水の届く日が遅れていると言われた', why1: '例: 発送の日をお伝えしていなかった' },
  '会場でのトラブル': { problem: '例: 品川で電源が足りず、開始が15分遅れた', why1: '例: 延長コードを持っていかなかった' },
  'その他': { problem: '例: 何が、いつ、どこで起きたか', why1: '例: それが起きたのは、なぜ？' },
};
const RESULTS = ['効いた', 'まだわからない', '効かなかった'];

let state = load();
const ui = { view: 'list', id: null, scene: '', form: null };

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  s = s && typeof s === 'object' ? s : {};
  s.items = Array.isArray(s.items) ? s.items : [];
  return s;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch (e) { alert('保存できませんでした。\n' + e.message); return false; }
}
const $ = id => document.getElementById(id);
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pad(n) { return String(n).padStart(2, '0'); }
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(s, n) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; }
function jdate(s) { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return `${m}/${d}（${'日月火水木金土'[new Date(y, m - 1, d).getDay()]}）`; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function byId(id) { return state.items.find(x => x.id === id); }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 1800); }
function go(view, id) { ui.view = view; if (id !== undefined) ui.id = id; render(); window.scrollTo(0, 0); }

function blank() {
  return { id: uid(), date: today(), scene: '', problem: '', whys: [''], cause: '', actions: [], review: { date: addDays(today(), 30), result: '', memo: '' }, updated: 0 };
}
// いまの状態（一覧の札に出す）
function status(x) {
  if (x.review && x.review.result) return x.review.result === '効いた' ? ['ok', 'ふり返り済み・効いた'] : ['warn', 'ふり返り済み・' + x.review.result];
  const acts = (x.actions || []).filter(a => a.t);
  if (!acts.length) return ['warn', '対策まだ'];
  if (acts.some(a => !a.done && a.due && a.due < today())) return ['bad', '対策の期限すぎ'];
  if (acts.some(a => !a.done)) return ['', '対策中'];
  if (x.review && x.review.date && x.review.date <= today()) return ['warn', 'ふり返りの時期'];
  return ['', '対策済み・ふり返り待ち'];
}

// ---------- 描画 ----------
function render() {
  const tab = ui.view === 'settings' ? 'settings' : 'list';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
  $('view').innerHTML = ({ list: viewList, edit: viewEdit, settings: viewSettings })[ui.view]();
}

function viewList() {
  const list = state.items.filter(x => !ui.scene || x.scene === ui.scene).sort((a, b) => b.date.localeCompare(a.date) || b.updated - a.updated);
  const due = state.items.filter(x => ['bad', 'warn'].includes(status(x)[0]) && status(x)[1] !== '対策まだ' && !(x.review && x.review.result));
  return `
  <button class="btn primary big" data-act="new">＋ 新しく分析する</button>
  <div class="tip">人を責めるためではなく、<b>同じことが二度と起きない「しくみ」</b>を見つけるための分析です。</div>
  ${due.length ? `<div class="alert">見てほしい分析が <b>${due.length}</b> 件あります（対策の期限すぎ・ふり返りの時期）。</div>` : ''}
  <div class="seg filter" style="margin:12px 0">${['', ...SCENES].map(s => `<button data-scene="${s}" class="${ui.scene === s ? 'on' : ''}">${s || 'すべて'}</button>`).join('')}</div>
  ${list.map(x => {
    const [cls, txt] = status(x);
    return `<button class="item" data-open="${x.id}">
      <div class="ih"><span class="small muted">${esc(jdate(x.date))}</span>${x.scene ? `<span class="tag">${esc(x.scene)}</span>` : ''}<span class="tag ${cls}">${txt}</span></div>
      <div class="ip">${esc(x.problem || '（問題が未記入）')}</div>
      ${x.cause ? `<div class="small muted">原因: ${esc(x.cause)}</div>` : ''}</button>`;
  }).join('') || `<div class="card muted">${state.items.length ? 'この場面の分析はまだありません。' : 'まだ分析はありません。困ったことが起きたら「＋ 新しく分析する」から始めてください。'}</div>`}`;
}

function viewEdit() {
  const f = ui.form; if (!f) { ui.view = 'list'; return viewList(); }
  const ex = EXAMPLES[f.scene] || EXAMPLES['その他'];
  const isNew = !byId(f.id);
  const whyBlocks = f.whys.map((w, i) => {
    const prev = i === 0 ? (f.problem || '問題') : (f.whys[i - 1] || '前の答え');
    return `<div class="why">
      <div class="q"><span class="n">なぜ ${i + 1}</span>「${esc(prev)}」のは、なぜ？</div>
      <textarea data-why="${i}" placeholder="${i === 0 ? esc(ex.why1) : '答え'}">${esc(w)}</textarea>
      ${i === f.whys.length - 1 && i > 0 ? `<button class="link danger" data-act="whydel">この段を消す</button>` : ''}
    </div>`;
  }).join('');
  return `
  <div class="btns" style="margin-bottom:10px"><button class="btn" data-act="cancel">← もどる</button></div>
  <div class="card"><h2>① 何が起きた？</h2>
    <div class="row2"><div class="field"><label>起きた日</label><input type="date" data-f="date" value="${esc(f.date)}"></div>
      <div class="field"><label>場面</label><div class="seg">${SCENES.map(s => `<button type="button" data-fscene="${s}" class="${f.scene === s ? 'on' : ''}">${s}</button>`).join('')}</div></div></div>
    <div class="field"><label>起きたこと（事実だけ。だれが悪いかは書かない）</label><textarea data-f="problem" placeholder="${esc(ex.problem)}">${esc(f.problem)}</textarea></div>
  </div>
  <div class="card"><h2>② なぜ？をくり返す <span class="small muted">（5回が目安。答えが「しくみ」にたどり着いたら止めてよい）</span></h2>
    ${whyBlocks}
    ${f.whys.length < 7 ? `<button class="btn" data-act="whyadd">＋ さらに「なぜ？」</button>` : ''}
    <div class="hint">こつ: 「気をつける」「うっかり」で止めずに、<b>なぜ気づけなかったか・なぜ防げなかったか</b>を聞く。</div>
  </div>
  <div class="card"><h2>③ 本当の原因</h2>
    <div class="field"><textarea data-f="cause" placeholder="例: 予約を入れる前に空き状況を見る決まり（手順）がなかった">${esc(f.cause)}</textarea></div>
    ${f.whys.filter(Boolean).length ? `<button class="link" data-act="usewhy">最後の「なぜ」の答えを入れる</button>` : ''}
  </div>
  <div class="card"><h2>④ 対策（やること）</h2>
    ${f.actions.map((a, i) => `<div class="act">
      <input data-at="${i}" value="${esc(a.t)}" placeholder="例: 予約ページで空きの印を見てから入れる">
      <input type="date" data-ad="${i}" value="${esc(a.due || '')}">
      <button type="button" class="btn ${a.done ? 'okb' : ''}" data-adone="${i}">${a.done ? '✓ 済み' : '未'}</button>
      <button type="button" class="btn danger" data-adel="${i}">✕</button></div>`).join('') || '<div class="muted small" style="margin-bottom:8px">まだありません。</div>'}
    <button class="btn" data-act="actadd">＋ 対策を足す</button>
    <div class="hint">「気をつける」ではなく、<b>だれがやっても同じになる</b>対策（手順・チェック・道具）がおすすめです。</div>
  </div>
  <div class="card"><h2>⑤ ふり返り（対策は効いた？）</h2>
    <div class="row2"><div class="field"><label>ふり返る日</label><input type="date" data-rv="date" value="${esc(f.review.date || '')}"></div>
      <div class="field"><label>結果</label><div class="seg">${RESULTS.map(r => `<button type="button" data-rres="${r}" class="${f.review.result === r ? 'on' : ''}">${r}</button>`).join('')}</div></div></div>
    <div class="field"><textarea data-rv="memo" placeholder="例: その後1か月、同じミスは起きていない">${esc(f.review.memo || '')}</textarea></div>
  </div>
  <div class="btns" style="margin-bottom:14px">
    <button class="btn" data-act="line">LINE で送る</button><button class="btn" data-act="copy">コピー</button><button class="btn" data-act="print">🖨 印刷</button>
    ${isNew ? '' : '<button class="btn danger" data-act="delete">この分析を消す</button>'}
  </div>
  <div class="sticky-save"><button class="btn" data-act="cancel">やめる</button><button class="btn primary" data-act="save">保存する</button></div>`;
}

function viewSettings() {
  return `
  <div class="card"><h2>なぜなぜ分析のすすめ方</h2>
    <ol class="small">
      <li>起きたことを、<b>事実だけ</b>書く（だれが悪いかは書かない）。</li>
      <li>「なぜ？」と聞いて、答えを書く。その答えに、また「なぜ？」。5回が目安。</li>
      <li>「気をつける」「うっかり」で止めない。<b>なぜ気づけなかったか・防げなかったか</b>まで聞く。</li>
      <li>最後の答え（しくみの穴）が、本当の原因。</li>
      <li>対策は<b>だれがやっても同じになるもの</b>（手順・チェック・道具）にして、いつまでにやるか決める。</li>
      <li>ふり返る日に、効いたかを確かめる。</li>
    </ol></div>
  <div class="card"><h2>バックアップ</h2>
    <p class="small">分析（${state.items.length} 件）はこの端末の中にだけ保存されています。ときどき保存してください。${state.lastBackup ? `<br>前回の保存: ${esc(new Date(state.lastBackup).toLocaleString('ja-JP'))}` : '<br><b>まだ一度も保存していません。</b>'}</p>
    <div class="btns"><button class="btn primary" data-act="export">バックアップを保存</button><button class="btn" data-act="import">バックアップから戻す</button>
      <input type="file" id="s-file" accept=".json,application/json" hidden></div></div>
  <div class="card"><h2>版（ver ${APP_VERSION}）</h2>
    <ul class="small">${HISTORY.map(([v, d, t]) => `<li><b>ver ${v}</b>（${d}）${esc(t)}</li>`).join('')}</ul></div>`;
}

// ---------- 文にする・印刷 ----------
function asText(x) {
  const L = [`【なぜなぜ分析】${jdate(x.date)}${x.scene ? ' ' + x.scene : ''}`, '', '■ 起きたこと', x.problem || '', ''];
  x.whys.filter(Boolean).forEach((w, i) => L.push(`なぜ${i + 1}: ${w}`));
  if (x.cause) L.push('', '■ 本当の原因', x.cause);
  const acts = (x.actions || []).filter(a => a.t);
  if (acts.length) L.push('', '■ 対策', ...acts.map(a => `・${a.t}${a.due ? `（${jdate(a.due)}まで）` : ''}${a.done ? ' 済' : ''}`));
  if (x.review && (x.review.result || x.review.date)) L.push('', `■ ふり返り ${x.review.date ? jdate(x.review.date) : ''} ${x.review.result || ''}`.trim(), ...(x.review.memo ? [x.review.memo] : []));
  return L.join('\n').trim();
}
function copyText(s) {
  const done = () => toast('コピーしました');
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(s).then(done, fb);
  fb();
  function fb() { const t = document.createElement('textarea'); t.value = s; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { alert(s); } t.remove(); }
}
function lineSend(s) { copyText(s); window.open('https://line.me/R/share?text=' + encodeURIComponent(s), '_blank'); }
function printIt(x) {
  const whys = [...x.whys]; while (whys.length < 5) whys.push('');
  const acts = (x.actions || []).filter(a => a.t); while (acts.length < 3) acts.push({});
  $('printarea').innerHTML = `<div class="ptitle">なぜなぜ分析</div>
    <table class="ptbl"><tr><th>起きた日</th><td>${esc(jdate(x.date))}</td><th>場面</th><td>${esc(x.scene)}</td></tr></table>
    <div class="psec">起きたこと</div><div class="pfree">${esc(x.problem)}</div>
    <div class="psec">なぜ？</div><table class="ptbl">${whys.map((w, i) => `<tr><th style="width:4.5em">なぜ ${i + 1}</th><td style="height:10mm">${esc(w)}</td></tr>`).join('')}</table>
    <div class="psec">本当の原因</div><div class="pfree">${esc(x.cause)}</div>
    <div class="psec">対策</div><table class="ptbl"><tr><th>やること</th><th style="width:25%">いつまで</th><th style="width:3em">済</th></tr>
      ${acts.map(a => `<tr><td style="height:9mm">${esc(a.t || '')}</td><td>${a.due ? esc(jdate(a.due)) : ''}</td><td>${a.done ? '✓' : ''}</td></tr>`).join('')}</table>
    <div class="psec">ふり返り</div><table class="ptbl"><tr><th style="width:6em">日にち</th><td>${esc(jdate(x.review.date))}</td><th style="width:4em">結果</th><td>${esc(x.review.result)}</td></tr>
      <tr><td colspan="4" style="height:14mm">${esc(x.review.memo)}</td></tr></table>`;
  setTimeout(() => window.print(), 50);
}

// ---------- 操作 ----------
function startEdit(x) { ui.form = JSON.parse(JSON.stringify(x)); ui.form.review = ui.form.review || { date: '', result: '', memo: '' }; go('edit'); }
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset, f = ui.form;
  if (d.go) { ui.form = null; go(d.go); return; }
  if (d.scene !== undefined) { ui.scene = d.scene; render(); return; }
  if (d.open) { startEdit(byId(d.open)); return; }
  if (f && d.fscene) { f.scene = f.scene === d.fscene ? '' : d.fscene; render(); return; }
  if (f && d.rres) { f.review.result = f.review.result === d.rres ? '' : d.rres; render(); return; }
  if (f && d.adone !== undefined) { const a = f.actions[+d.adone]; a.done = !a.done; render(); return; }
  if (f && d.adel !== undefined) { f.actions.splice(+d.adel, 1); render(); return; }
  const act = d.act; if (!act) return;
  if (act === 'new') startEdit(blank());
  else if (act === 'whyadd') { f.whys.push(''); render(); const ts = document.querySelectorAll('[data-why]'); ts[ts.length - 1].focus(); }
  else if (act === 'whydel') { f.whys.pop(); render(); }
  else if (act === 'usewhy') { f.cause = [...f.whys].reverse().find(Boolean) || ''; render(); }
  else if (act === 'actadd') { f.actions.push({ t: '', due: addDays(today(), 7), done: false }); render(); const ins = document.querySelectorAll('[data-at]'); ins[ins.length - 1].focus(); }
  else if (act === 'cancel') { ui.form = null; go('list'); }
  else if (act === 'save') {
    if (!f.problem.trim()) { alert('「起きたこと」を入れてください。'); return; }
    f.actions = f.actions.filter(a => a.t.trim());
    while (f.whys.length > 1 && !f.whys[f.whys.length - 1].trim()) f.whys.pop();
    f.updated = Date.now();
    const i = state.items.findIndex(x => x.id === f.id);
    if (i >= 0) state.items[i] = f; else state.items.push(f);
    if (!save()) return;
    ui.form = null; toast('保存しました'); go('list');
  }
  else if (act === 'delete') {
    if (!confirm('この分析を消しますか？')) return;
    state.items = state.items.filter(x => x.id !== f.id); save(); ui.form = null; toast('消しました'); go('list');
  }
  else if (act === 'copy') copyText(asText(f));
  else if (act === 'line') lineSend(asText(f));
  else if (act === 'print') printIt(f);
  else if (act === 'export') exportBackup();
  else if (act === 'import') $('s-file').click();
});
document.addEventListener('input', e => {
  const t = e.target, f = ui.form; if (!f) return;
  if (t.dataset.f) f[t.dataset.f] = t.value;
  else if (t.dataset.why !== undefined) {
    f.whys[+t.dataset.why] = t.value;
    // 次の「なぜ」の問いかけの文を、書いたそばから合わせる
    const q = document.querySelectorAll('.why .q')[+t.dataset.why + 1];
    if (q) q.innerHTML = `<span class="n">なぜ ${+t.dataset.why + 2}</span>「${esc(t.value || '前の答え')}」のは、なぜ？`;
  }
  else if (t.dataset.at !== undefined) f.actions[+t.dataset.at].t = t.value;
  else if (t.dataset.ad !== undefined) f.actions[+t.dataset.ad].due = t.value;
  else if (t.dataset.rv) f.review[t.dataset.rv] = t.value;
  if (t.dataset.f === 'problem') { const q = document.querySelector('.why .q'); if (q) q.innerHTML = `<span class="n">なぜ 1</span>「${esc(t.value || '問題')}」のは、なぜ？`; }
});
document.addEventListener('change', e => { if (e.target.id === 's-file' && e.target.files[0]) importBackup(e.target.files[0]); });

// ---------- バックアップ ----------
function stamp() { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; }
async function exportBackup() {
  const name = `なぜなぜ分析バックアップ_${stamp()}.json`;
  const text = JSON.stringify({ app: 'naze', version: APP_VERSION, exported: new Date().toISOString(), state }, null, 1);
  const file = new File([text], name, { type: 'application/json' });
  let ok = true;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); } catch (err) { ok = false; }
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  if (ok) { state.lastBackup = Date.now(); save(); render(); toast('バックアップを保存しました'); }
}
function importBackup(file) {
  const r = new FileReader();
  r.onload = () => {
    let data; try { data = JSON.parse(r.result); } catch (e) { return alert('このファイルは読み込めませんでした。'); }
    if (!data || data.app !== 'naze' || !data.state) return alert('「なぜなぜ分析」のバックアップではありません。');
    if (!confirm(`バックアップ（分析 ${(data.state.items || []).length} 件）に戻しますか？\n今の内容は置きかわります。`)) return;
    localStorage.setItem(KEY, JSON.stringify(data.state)); state = load(); go('list'); toast('戻しました');
  };
  r.readAsText(file);
}

// ---------- 起動 ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
$('appver').textContent = 'ver ' + APP_VERSION;
render();
