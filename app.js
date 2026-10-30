'use strict';
/* お店の帳簿 — 青色申告用のかんたん帳簿（オフライン・iPad 用）
   データはこの端末の中（localStorage）にだけ保存し、外へは送らない。 */

const STORE_KEY = 'kaikei.v1';
const APP_VERSION = '1.5.1';

// ---------- 勘定科目 ----------
const EXPENSES = [
  ['租税公課', '印紙・固定資産税・自動車税など'],
  ['荷造運賃', '宅急便の送料・梱包材'],
  ['水道光熱費', '電気・水道・ガス'],
  ['旅費交通費', '電車・バス・駐車場・高速代・出張'],
  ['通信費', '電話・インターネット・切手'],
  ['広告宣伝費', 'チラシ・広告・名刺・ホームページ'],
  ['接待交際費', '取引先との飲食・贈答・お祝い'],
  ['損害保険料', '火災保険・自動車保険など'],
  ['修繕費', '機械・建物・車の修理'],
  ['消耗品費', '10万円未満の道具・事務用品・備品'],
  ['減価償却費', '10万円以上の設備の、今年分の費用（年末に記録）'],
  ['福利厚生費', '従業員のための費用'],
  ['給料賃金', '従業員の給料'],
  ['外注工賃', '外部に頼んだ仕事の代金'],
  ['利子割引料', '借入金の利息'],
  ['地代家賃', '店舗・倉庫・駐車場の賃料'],
  ['貸倒金', '回収できなくなった売掛金'],
  ['支払手数料', '振込手数料・決済手数料・各種手数料'],
  ['車両費', 'ガソリン・車検・オイル交換'],
  ['新聞図書費', '本・新聞・雑誌'],
  ['会議費', '打ち合わせの飲食'],
  ['諸会費', '組合・協会の会費'],
  ['雑費', 'どれにも当てはまらないもの'],
];
const BASE_ACCOUNTS = [
  ['現金', 'asset'], ['普通預金', 'asset'], ['定期預金', 'asset'], ['その他の預金', 'asset'],
  ['売掛金', 'asset'], ['前払金', 'asset'], ['貸付金', 'asset'],
  ['建物', 'asset'], ['建物附属設備', 'asset'], ['車両運搬具', 'asset'], ['工具器具備品', 'asset'], ['土地', 'asset'],
  ['事業主貸', 'asset'],
  ['支払手形', 'liability'], ['買掛金', 'liability'], ['借入金', 'liability'], ['未払金', 'liability'],
  ['前受金', 'liability'], ['預り金', 'liability'], ['事業主借', 'liability'],
  ['元入金', 'equity'],
  ['売上高', 'revenue'], ['雑収入', 'revenue'],
  ['仕入高', 'cogs'],
];
const HINTS = Object.fromEntries(EXPENSES);
HINTS['仕入高'] = '売るための商品・材料の購入';
HINTS['売上高'] = 'お店の売上';
HINTS['雑収入'] = '売上以外の収入（補助金・雑多な入金など）';

const RECV_METHODS = [
  ['現金', '現金'], ['普通預金', '普通預金（銀行）'], ['売掛金', 'あとで入金（売掛金）'], ['その他の預金', 'その他の預金'],
];
const PAY_METHODS = [
  ['現金', '現金'], ['普通預金', '普通預金（銀行）'], ['未払金', 'クレジットカード'],
  ['事業主借', '個人のお金で払った'], ['買掛金', 'あとで払う（買掛金）'], ['その他の預金', 'その他の預金'],
];
const MOVES = [
  { id: 'withdraw', label: '銀行から現金を引き出した', dr: '現金', cr: '普通預金' },
  { id: 'deposit', label: '現金を銀行に預けた', dr: '普通預金', cr: '現金' },
  { id: 'card', label: 'クレジットカードの代金が引き落とされた', dr: '未払金', cr: '普通預金' },
  { id: 'ar', label: '売掛金（あとで入金の分）が入金された', dr: '普通預金', cr: '売掛金' },
  { id: 'ap', label: '買掛金（あとで払う分）を支払った', dr: '買掛金', cr: '普通預金' },
  { id: 'draw_bank', label: '事業の口座から生活費など私用に使った', dr: '事業主貸', cr: '普通預金' },
  { id: 'draw_cash', label: '事業の現金から生活費など私用に使った', dr: '事業主貸', cr: '現金' },
  { id: 'contrib', label: '個人のお金を事業の口座に入れた', dr: '普通預金', cr: '事業主借' },
  { id: 'loan_repay', label: '借入金を返した（元本の分）', dr: '借入金', cr: '普通預金' },
];
const KIND_LABEL = { in: '収入', out: '支出', move: '移動', journal: '振替' };
const METHOD_LABEL = Object.fromEntries([...RECV_METHODS, ...PAY_METHODS]);

// ---------- データ ----------
let state = load();
function blank() { return { entries: [], years: {}, customExpenses: [], customers: {}, lastBackup: null, seq: 1 }; }
const DEFAULT_TADASHI = 'お品代として';
// お客様ごとの領収書の設定 { receipt: true/false, atena, tadashi }
function profile(name) { return (state.customers || {})[name] || null; }
function needsReceipt(e) { return e.kind === 'in' && e.receipt && !e.receipt.issued; }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.entries)) return Object.assign(blank(), s);
  } catch (e) { /* 壊れていたら空から */ }
  return blank();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; }
  catch (e) { alert('保存できませんでした。iPad の空き容量を確認してください。\n' + e.message); return false; }
}
function newId() { return 'e' + Date.now().toString(36) + (state.seq++).toString(36); }

function expenseNames() {
  const base = EXPENSES.map(e => e[0]);
  const zatsu = base.pop(); // 雑費は最後
  return [...base, ...state.customExpenses, zatsu];
}
function allAccounts() {
  return [...BASE_ACCOUNTS, ...expenseNames().map(n => [n, 'expense'])];
}
function typeOf(name) {
  const a = allAccounts().find(x => x[0] === name);
  return a ? a[1] : null;
}
function debitNormal(t) { return t === 'asset' || t === 'expense' || t === 'cogs'; }
function balanceAccounts() { return BASE_ACCOUNTS.filter(a => a[1] === 'asset' || a[1] === 'liability').map(a => a[0]); }

function yearData(y) {
  const d = state.years[y] || {};
  return { opening: d.opening || {}, openingInventory: d.openingInventory || 0, closingInventory: d.closingInventory || 0 };
}
function openingCapital(y) { // 元入金 = 期首の資産 − 期首の負債
  const d = yearData(y);
  let v = d.openingInventory;
  for (const [n, t] of BASE_ACCOUNTS) {
    if (n === '事業主貸' || n === '事業主借') continue;
    if (t === 'asset') v += d.opening[n] || 0;
    if (t === 'liability') v -= d.opening[n] || 0;
  }
  return v;
}

// ---------- 計算 ----------
const pad = n => String(n).padStart(2, '0');
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function yen(n) { return (n < 0 ? '−' : '') + '¥' + Math.abs(Math.round(n)).toLocaleString('ja-JP'); }
function plain(n) { return (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ja-JP'); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function parseAmount(s) { const v = parseInt(String(s).replace(/[^\d]/g, ''), 10); return isNaN(v) ? 0 : v; }
function sorted(list) { return [...list].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created || 0) - (b.created || 0)); }
function inYear(y) { return state.entries.filter(e => e.date.startsWith(y + '-')); }
function inMonth(y, m) { const p = `${y}-${pad(m)}-`; return state.entries.filter(e => e.date.startsWith(p)); }

function movement(entries) { // 科目ごとの増減（その科目の普通の向きをプラス）
  const m = {};
  for (const e of entries) {
    for (const [acc, side] of [[e.dr, 'dr'], [e.cr, 'cr']]) {
      const t = typeOf(acc);
      const sign = (side === 'dr') === debitNormal(t) ? 1 : -1;
      m[acc] = (m[acc] || 0) + sign * e.amount;
    }
  }
  return m;
}
function profitLoss(entries, y) { // y を渡すと棚卸を反映
  const m = movement(entries);
  const sales = m['売上高'] || 0, misc = m['雑収入'] || 0;
  const purchases = m['仕入高'] || 0;
  const inv = y ? yearData(y) : { openingInventory: 0, closingInventory: 0 };
  const cogs = inv.openingInventory + purchases - inv.closingInventory;
  const exp = expenseNames().map(n => [n, m[n] || 0]);
  const expTotal = exp.reduce((s, x) => s + x[1], 0);
  const revenue = sales + misc;
  return { sales, misc, revenue, purchases, inv, cogs, gross: revenue - cogs, exp, expTotal, profit: revenue - cogs - expTotal };
}
function balancesAt(y, entries) { // 期首残高＋その年の増減
  const d = yearData(y), m = movement(entries), out = {};
  for (const n of balanceAccounts()) out[n] = (d.opening[n] || 0) + (m[n] || 0);
  return out;
}

// ---------- 画面の状態 ----------
const ui = {
  view: 'home',
  ym: (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; })(),
  year: new Date().getFullYear(),
  ledgerAcc: '現金',
  search: '',
  form: null,
};
function freshForm(kind) {
  const prev = ui.form;
  return {
    kind: kind || (prev && prev.kind) || 'out',
    date: (prev && prev.date) || today(),
    acc: '', method: '', preset: '', dr: '', cr: '',
    amount: '', partner: '', memo: '', editId: null, venue: (prev && prev.venue) || '',
    rcpt: '', atena: '', tadashi: '', rstate: '', rreason: '',
    orderDate: '', items: defaultItems(), treatment: '',
  };
}
function itemsTotal(items) { return (items || []).reduce((s, it) => s + parseAmount(it.price) * (parseAmount(it.qty) || 0), 0); }
function cleanItems(items) {
  return (items || []).map(it => ({ type: ITEM_TYPES.some(t => t[0] === it.type) ? it.type : 'goods', name: String(it.name || '').trim(), price: parseAmount(it.price), qty: parseAmount(it.qty) || 0 }))
    .filter(it => it.qty > 0 && (it.name || it.price));
}
function itemsText(items) { return (items || []).map(it => `${it.name || '（品名なし）'}×${it.qty}`).join('、'); }
function knownItems() { // 品名 → 最後に使った単価と種類
  const m = new Map();
  for (const e of sorted(state.entries)) for (const it of e.items || []) if (it.name) m.set(it.name, { price: it.price, type: it.type || 'goods' });
  return m;
}
const ITEM_TYPES = [['goods', '商品'], ['treat', '施術'], ['measure', '測定']];
const DEFAULT_PRICE = { measure: 3000 }; // 種類を選んだとき単価が空なら入れる金額
const blankItem = () => ({ type: 'goods', name: '', price: '', qty: '' });
// 新しい注文の最初の行：商品・施術・測定を1行ずつ（数量を入れた行だけが保存される）
const defaultItems = () => [
  { type: 'goods', name: '', price: '', qty: '' },
  { type: 'treat', name: '', price: '', qty: '' },
  { type: 'measure', name: '測定', price: String(DEFAULT_PRICE.measure), qty: '' },
];
// 掛け売り（売掛金）で、まだ入金を記録していない注文
function isUnpaid(e) { return e.kind === 'in' && e.dr === '売掛金' && !e.settledBy; }

function go(view, opts) {
  ui.view = view;
  if (view === 'input' && (!ui.form || (opts && opts.kind))) ui.form = freshForm(opts && opts.kind);
  if (view === 'input' && opts && opts.kind && !ui.form.editId) ui.form.kind = opts.kind;
  render();
  window.scrollTo(0, 0);
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 1800);
}

// ---------- 描画 ----------
function render() {
  const v = document.getElementById('view');
  const tab = ['customer', 'venues', 'venue'].includes(ui.view) ? 'customers' : ui.view === 'ledger' ? 'list' : ui.view;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
  v.innerHTML = ({ home: viewHome, input: viewInput, list: viewList, summary: viewSummary, settings: viewSettings, ledger: viewLedger, customers: viewCustomers, customer: viewCustomer, venues: viewVenues, venue: viewVenue })[ui.view]();
  if (ui.view === 'input') bindInput();
  if (ui.view === 'settings') bindSettings();
}

function entryText(e) {
  if (e.kind === 'in') return { main: e.cr, sub: '受取: ' + (METHOD_LABEL[e.dr] || e.dr), cls: 'in' };
  if (e.kind === 'out') return { main: e.dr, sub: '支払: ' + (METHOD_LABEL[e.cr] || e.cr), cls: 'out' };
  if (e.kind === 'move') { const p = MOVES.find(x => x.id === e.preset); return { main: p ? p.label : `${e.dr} ← ${e.cr}`, sub: `${e.dr} / ${e.cr}`, cls: '' }; }
  return { main: `${e.dr} / ${e.cr}`, sub: '借方 / 貸方', cls: '' };
}
function itemHtml(e) {
  const t = entryText(e);
  const extra = [e.venue ? '［' + e.venue + '］' : '', e.partner, e.items && e.items.length ? itemsText(e.items) : '', e.treatment ? '施術: ' + e.treatment : '', e.memo]
    .filter(Boolean).map(esc).join('・');
  const [, mm, dd] = e.date.split('-');
  return `<button class="item" data-edit="${e.id}">
    <div class="d">${+mm}/${+dd}</div>
    <div><div class="main"><span class="badge ${t.cls}">${KIND_LABEL[e.kind]}</span>${esc(t.main)}${isUnpaid(e) ? ' <span class="badge out">未精算</span>' : ''}${needsReceipt(e) ? ' <span class="badge out">領収書 未発行</span>' : ''}</div>
      <div class="sub">${esc(t.sub)}${extra ? '・' + extra : ''}</div></div>
    <div class="num ${t.cls}">${e.kind === 'out' ? '−' : ''}${yen(e.amount)}</div>
  </button>`;
}

function viewHome() {
  const { y, m } = { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
  const pl = profitLoss(inMonth(y, m));
  const bal = balancesAt(y, inYear(y));
  const recent = sorted(state.entries).slice(-8).reverse();
  let banner = '';
  if (state.entries.length) {
    const days = state.lastBackup ? Math.floor((Date.now() - state.lastBackup) / 86400000) : null;
    if (days === null || days >= 7) banner = `<div class="banner">${days === null ? 'まだバックアップがありません。' : `最後のバックアップから ${days} 日たっています。`}
      「設定」→「バックアップを保存」で、帳簿のコピーを残してください。</div>`;
  }
  const unpaid = state.entries.filter(isUnpaid).reduce((a, e) => a + e.amount, 0);
  if (unpaid) banner += `<div class="banner">まだ入金されていない注文が <b>${yen(unpaid)}</b> あります。「お客様」で確認できます。</div>`;
  const noRcpt = sorted(state.entries.filter(needsReceipt));
  if (noRcpt.length) banner += `<div class="banner"><b>渡せていない領収書が ${noRcpt.length} 件あります</b>
    ${noRcpt.map(e => `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid rgba(0,0,0,.1)">
      <div style="flex:1;min-width:220px">${jdate(e.orderDate || e.date)}・${esc(e.partner || '')}・<b>${yen(e.amount)}</b>
        <div class="small">宛名: ${esc(e.receipt.atena)} 様／但し: ${esc(e.receipt.tadashi)}${e.receipt.reason ? '／' + esc(e.receipt.reason) : ''}</div></div>
      <button class="btn primary" data-issue="${e.id}">あとで渡した</button></div>`).join('')}</div>`;
  return `${banner}
  <h2>${m}月の状況</h2>
  <div class="stats">
    <div class="stat"><div class="label">収入</div><div class="value in">${yen(pl.revenue)}</div></div>
    <div class="stat"><div class="label">仕入・経費</div><div class="value out">${yen(pl.purchases + pl.expTotal)}</div></div>
    <div class="stat"><div class="label">差し引き</div><div class="value">${yen(pl.revenue - pl.purchases - pl.expTotal)}</div></div>
  </div>
  <div class="bigbtns">
    <button class="bigbtn in" data-new="in">＋ 収入</button>
    <button class="bigbtn out" data-new="out">＋ 支出</button>
    <button class="bigbtn" data-new="move">⇄ お金の移動</button>
  </div>
  <h2>いまの残高</h2>
  <div class="stats">
    <div class="stat"><div class="label">現金</div><div class="value">${yen(bal['現金'])}</div></div>
    <div class="stat"><div class="label">普通預金</div><div class="value">${yen(bal['普通預金'])}</div></div>
    <div class="stat"><div class="label">カードの未払い</div><div class="value">${yen(bal['未払金'])}</div></div>
  </div>
  <p class="muted small">残高は、設定の「${y}年の期首残高」に今年の記録を足したものです。</p>
  <h2>最近の記録</h2>
  <div class="list">${recent.length ? recent.map(itemHtml).join('') : '<div class="empty">まだ記録がありません。上の「＋ 収入」「＋ 支出」から始めましょう。</div>'}</div>`;
}

function options(list, selected, placeholder) {
  return (placeholder ? `<option value="">${placeholder}</option>` : '') +
    list.map(([v, l]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');
}
function frequent(kind) {
  const c = new Map();
  for (const e of state.entries) {
    if (e.kind !== kind) continue;
    const acc = kind === 'in' ? e.cr : e.dr, method = kind === 'in' ? e.dr : e.cr;
    const k = JSON.stringify([acc, method, e.partner || '']);
    c.set(k, (c.get(k) || 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => JSON.parse(x[0]));
}

function viewInput() {
  const f = ui.form;
  if (f.kind === 'in' && !f.editId && !f.rcpt && profile(f.partner)) { // お客様が決まっていれば、その人の領収書の設定を入れておく
    const pr = profile(f.partner);
    Object.assign(f, { rcpt: pr.receipt ? 'yes' : 'no', atena: pr.atena || '', tadashi: pr.tadashi || '' });
  }
  const kinds = [['out', '支出'], ['in', '収入'], ['move', 'お金の移動'], ['journal', '振替（上級）']];
  let body = '';
  const partners = [...new Set(state.entries.map(e => e.partner).filter(Boolean))];
  const freq = (f.kind === 'in' || f.kind === 'out') && !f.editId ? frequent(f.kind) : [];
  const chips = freq.length ? `<div class="hint">よく使う記録（押すと入ります）</div><div class="chips">${freq.map(([a, mth, p], i) =>
    `<button class="chip" data-freq="${i}">${esc(a)}・${esc(METHOD_LABEL[mth] || mth)}${p ? '・' + esc(p) : ''}</button>`).join('')}</div>` : '';

  if (f.kind === 'out') {
    const accs = [['仕入高', '仕入（売るための商品・材料）'], ...expenseNames().map(n => [n, n])];
    body = `${chips}
      <div class="field"><label>何に使った？（勘定科目）</label><select id="f-acc">${options(accs, f.acc, '選んでください')}</select>
        <div class="hint" id="acc-hint">${esc(HINTS[f.acc] || '')}</div></div>
      <div class="field"><label>どうやって払った？</label><select id="f-method">${options(PAY_METHODS, f.method || '現金')}</select></div>`;
  } else if (f.kind === 'in') {
    body = `${chips}
      <div class="field"><label>何の収入？</label><select id="f-acc">${options([['売上高', '売上'], ['雑収入', '雑収入（売上以外）']], f.acc || '売上高')}</select>
        <div class="hint" id="acc-hint">${esc(HINTS[f.acc || '売上高'])}</div></div>
      <div class="field"><label>どうやって受け取った？</label><select id="f-method">${options(RECV_METHODS, f.method || '現金')}</select></div>
      <div class="card" style="background:var(--accent-soft)">
        <div class="row2">
          <div class="field"><label>注文を受けた日</label><input type="date" id="f-order" value="${esc(f.orderDate)}"></div>
          <div class="field"><label>お客様（誰からの注文）</label><input id="f-partner" list="partners" value="${esc(f.partner)}" autocomplete="off"></div>
        </div>
        <div class="card" style="padding:12px 14px">
          <div class="field" style="margin-bottom:8px"><label>領収書</label>
            <select id="f-rcpt">${options([['no', '不要'], ['yes', '必要']], f.rcpt || 'no')}</select>
            <div class="hint" id="rcpt-hint">${f.partner && profile(f.partner) ? `${esc(f.partner)} 様の設定: ${profile(f.partner).receipt ? '領収書が必要' : '領収書は不要'}` : ''}</div></div>
          <div id="rcpt-box" ${f.rcpt === 'yes' ? '' : 'hidden'}>
            <div class="row2">
              <div class="field"><label>宛名</label><input id="f-atena" value="${esc(f.atena)}" autocomplete="off" placeholder="例: 株式会社〇〇 / 山田花子"></div>
              <div class="field"><label>但し書き</label><input id="f-tadashi" value="${esc(f.tadashi || DEFAULT_TADASHI)}" autocomplete="off"></div>
            </div>
            <div class="field" style="margin-bottom:0"><label>領収書を渡せましたか？（どちらかを選んでください）</label>
              <div class="presets" style="margin-bottom:8px">
                <label><input type="radio" name="rstate" value="given" ${f.rstate === 'given' ? 'checked' : ''}><span>その場で渡した</span></label>
                <label><input type="radio" name="rstate" value="later" ${f.rstate === 'later' ? 'checked' : ''}><span>渡せなかった（あとで渡す）</span></label>
              </div>
              <div id="rreason-box" ${f.rstate === 'later' ? '' : 'hidden'}><label class="muted small">渡せなかった理由</label>
                <input id="f-rreason" value="${esc(f.rreason || '領収書切れ')}" autocomplete="off"></div>
            </div>
          </div>
        </div>
        <label class="muted small">注文の内容（使う行に数量を入れてください。数量が空の行は保存されません。単価×数量の合計が金額に入ります）</label>
        <div class="tablewrap"><table id="items">
          <tr><th style="width:96px">種類</th><th>品名・施術名</th><th class="right" style="width:19%">単価</th><th class="right" style="width:12%">数量</th><th class="right" style="width:15%">小計</th><th style="width:44px"></th></tr>
          ${f.items.map((it, i) => `<tr data-row="${i}">
            <td><select data-it="type">${options(ITEM_TYPES, it.type || 'goods')}</select></td>
            <td><input data-it="name" list="itemnames" value="${esc(it.name)}" autocomplete="off"></td>
            <td><input data-it="price" class="num" inputmode="numeric" value="${it.price ? plain(parseAmount(it.price)) : ''}"></td>
            <td><input data-it="qty" class="num" inputmode="numeric" placeholder="0" value="${esc(it.qty)}"></td>
            <td class="num" data-sub>${plain(parseAmount(it.price) * (parseAmount(it.qty) || 0))}</td>
            <td><button class="btn" data-delrow="${i}" style="min-height:40px;padding:4px 10px">✕</button></td></tr>`).join('')}
        </table></div>
        <datalist id="itemnames">${[...knownItems().keys()].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <button class="btn" id="f-addrow" style="margin:8px 0 14px">＋ 行を追加</button>
        <div class="field"><label>施術の内容（なくてもOK）</label><textarea id="f-treat" rows="3">${esc(f.treatment)}</textarea></div>
      </div>`;
  } else if (f.kind === 'move') {
    body = `<div class="field"><label>どんなお金の動き？</label><div class="presets">${MOVES.map(p =>
      `<label><input type="radio" name="preset" value="${p.id}"${f.preset === p.id ? ' checked' : ''}><span>${esc(p.label)}<div class="sub">${p.dr} / ${p.cr}</div></span></label>`).join('')}</div></div>`;
  } else {
    const all = allAccounts().map(([n]) => [n, n]);
    body = `<p class="muted small">減価償却や、上の3つに当てはまらない記録に使います。「借方」に増えた資産・費用、「貸方」に減った資産・増えた負債や収入を入れます。</p>
      <div class="row2">
        <div class="field"><label>借方の科目</label><select id="f-dr">${options(all, f.dr, '選んでください')}</select></div>
        <div class="field"><label>貸方の科目</label><select id="f-cr">${options(all, f.cr, '選んでください')}</select></div>
      </div>`;
  }

  return `<h2>${f.editId ? '記録を直す' : '記録する'}</h2>
  ${f.editId ? '' : `<div class="seg">${kinds.map(([k, l]) => `<button data-kind="${k}" class="${f.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>`}
  <div class="card">
    <div class="row2">
      <div class="field"><label>日付</label><input type="date" id="f-date" value="${esc(f.date)}"></div>
      <div class="field"><label>金額（円）</label><input class="amount" id="f-amount" inputmode="numeric" autocomplete="off" placeholder="0" value="${f.amount ? plain(parseAmount(f.amount)) : ''}"></div>
    </div>
    ${body}
    <datalist id="partners">${partners.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    ${f.kind === 'in' || f.kind === 'out' ? `<div class="field"><label>会場（会場ごとの会計に使います。共通の費用は空のままでOK）</label>
      <input id="f-venue" list="venues" value="${esc(f.venue)}" autocomplete="off" placeholder="例: 〇〇公民館">
      <datalist id="venues">${venueNames().map(v => `<option value="${esc(v)}">`).join('')}</datalist></div>` : ''}
    <div class="row2">
      ${f.kind === 'in' ? '' : `<div class="field"><label>取引先（なくてもOK）</label><input id="f-partner" list="partners" value="${esc(f.partner)}" autocomplete="off"></div>`}
      <div class="field"><label>メモ（なくてもOK）</label><input id="f-memo" value="${esc(f.memo)}" autocomplete="off"></div>
    </div>
    <div class="btns">
      <button class="btn primary" id="f-save" style="flex:1">${f.editId ? '直して保存' : '保存する'}</button>
      ${f.editId ? '<button class="btn" id="f-cancel">やめる</button><button class="btn danger" id="f-delete">削除</button>' : ''}
    </div>
  </div>`;
}

function bindInput() {
  const f = ui.form;
  const $ = id => document.getElementById(id);
  const sync = () => {
    f.date = $('f-date').value;
    f.amount = $('f-amount').value;
    f.partner = $('f-partner').value.trim();
    f.memo = $('f-memo').value.trim();
    if ($('f-venue')) f.venue = $('f-venue').value.trim();
    if ($('f-acc')) f.acc = $('f-acc').value;
    if ($('f-method')) f.method = $('f-method').value;
    if ($('f-dr')) { f.dr = $('f-dr').value; f.cr = $('f-cr').value; }
    const r = document.querySelector('input[name=preset]:checked'); if (r) f.preset = r.value;
    if ($('f-order')) {
      f.orderDate = $('f-order').value;
      f.treatment = $('f-treat').value.trim();
      f.rcpt = $('f-rcpt').value;
      f.atena = $('f-atena').value.trim();
      f.tadashi = $('f-tadashi').value.trim();
      const rs = document.querySelector('input[name=rstate]:checked');
      f.rstate = rs ? rs.value : '';
      f.rreason = $('f-rreason').value.trim();
      f.items = [...document.querySelectorAll('[data-row]')].map(tr => ({
        type: tr.querySelector('[data-it=type]').value, name: tr.querySelector('[data-it=name]').value, price: tr.querySelector('[data-it=price]').value, qty: tr.querySelector('[data-it=qty]').value,
      }));
    }
  };
  const refreshTotal = () => {
    let total = 0;
    document.querySelectorAll('[data-row]').forEach(tr => {
      const sub = parseAmount(tr.querySelector('[data-it=price]').value) * (parseAmount(tr.querySelector('[data-it=qty]').value) || 0);
      tr.querySelector('[data-sub]').textContent = plain(sub);
      total += sub;
    });
    if (total) $('f-amount').value = plain(total);
  };
  if ($('items')) {
    const known = knownItems();
    $('items').addEventListener('change', e => {
      if (e.target.dataset.it !== 'type') return;
      const tr = e.target.closest('tr'), def = DEFAULT_PRICE[e.target.value];
      const price = tr.querySelector('[data-it=price]'), name = tr.querySelector('[data-it=name]');
      if (def && !parseAmount(price.value)) price.value = plain(def);
      if (e.target.value === 'measure' && !name.value) name.value = '測定';
      refreshTotal();
    });
    $('items').addEventListener('input', e => {
      const k = e.target.dataset.it;
      if (k === 'type') return;
      if (k === 'price' || k === 'qty') { const v = parseAmount(e.target.value); e.target.value = v ? (k === 'price' ? plain(v) : String(v)) : ''; }
      if ((k === 'name' || k === 'price') && e.target.value) { // 品名か単価を入れたら、数量が空なら1にする
        const qty = e.target.closest('tr').querySelector('[data-it=qty]');
        if (!qty.value) qty.value = '1';
      }
      if (k === 'name' && known.has(e.target.value)) {
        const tr = e.target.closest('tr'), kn = known.get(e.target.value);
        const price = tr.querySelector('[data-it=price]');
        if (!price.value) price.value = plain(kn.price);
        tr.querySelector('[data-it=type]').value = kn.type;
      }
      refreshTotal();
    });
    $('f-addrow').onclick = () => { sync(); f.items.push(blankItem()); render(); };
    document.querySelectorAll('[data-delrow]').forEach(b => b.onclick = () => {
      sync(); f.items.splice(+b.dataset.delrow, 1);
      if (!f.items.length) f.items = defaultItems();
      render();
    });
  }
  document.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { sync(); f.kind = b.dataset.kind; f.acc = ''; f.method = ''; render(); });
  if ($('f-acc')) $('f-acc').onchange = () => { $('acc-hint').textContent = HINTS[$('f-acc').value] || ''; };
  $('f-amount').oninput = e => {
    const v = parseAmount(e.target.value);
    e.target.value = v ? plain(v) : '';
  };
  const freq = frequent(f.kind);
  document.querySelectorAll('[data-freq]').forEach(b => b.onclick = () => {
    sync();
    const [a, m, p] = freq[+b.dataset.freq];
    f.acc = a; f.method = m; f.partner = p;
    render();
    document.getElementById('f-amount').focus();
  });
  if ($('f-rcpt')) {
    const applyProfile = () => { // お客様の名前が入ったら、その人の領収書の設定を入れる
      const nm = $('f-partner').value.trim(), pr = profile(nm);
      $('rcpt-hint').textContent = pr ? `${nm} 様の設定: ${pr.receipt ? '領収書が必要' : '領収書は不要'}` : '';
      if (!pr) return;
      $('f-rcpt').value = pr.receipt ? 'yes' : 'no';
      $('f-atena').value = pr.atena || '';
      $('f-tadashi').value = pr.tadashi || DEFAULT_TADASHI;
      $('rcpt-box').hidden = !pr.receipt;
    };
    $('f-partner').addEventListener('change', applyProfile);
    document.querySelectorAll('input[name=rstate]').forEach(r => r.onchange = () => { $('rreason-box').hidden = r.value !== 'later' || !r.checked; });
    $('f-rcpt').onchange = () => {
      $('rcpt-box').hidden = $('f-rcpt').value !== 'yes';
      if ($('f-rcpt').value === 'yes' && !$('f-atena').value) $('f-atena').value = $('f-partner').value.trim();
    };
  }
  $('f-save').onclick = () => {
    sync();
    const amount = parseAmount(f.amount);
    if (!f.date) return alert('日付を入れてください。');
    if (!amount) return alert('金額を入れてください。');
    let dr, cr;
    if (f.kind === 'out') { if (!f.acc) return alert('何に使ったか（勘定科目）を選んでください。'); dr = f.acc; cr = f.method || '現金'; }
    else if (f.kind === 'in') { dr = f.method || '現金'; cr = f.acc || '売上高'; }
    else if (f.kind === 'move') { const p = MOVES.find(x => x.id === f.preset); if (!p) return alert('お金の動きを選んでください。'); dr = p.dr; cr = p.cr; }
    else { if (!f.dr || !f.cr) return alert('借方と貸方の科目を選んでください。'); if (f.dr === f.cr) return alert('借方と貸方は別の科目にしてください。'); dr = f.dr; cr = f.cr; }
    const rec = { date: f.date, kind: f.kind, dr, cr, amount, partner: f.partner, memo: f.memo, venue: (f.kind === 'in' || f.kind === 'out') ? f.venue : '' };
    if (f.kind === 'move') rec.preset = f.preset;
    if (f.kind === 'in') {
      const items = cleanItems(f.items);
      const t = itemsTotal(items);
      if (t && t !== amount && !confirm(`注文の内容の合計（${yen(t)}）と金額（${yen(amount)}）が違います。このまま保存しますか？`)) return;
      if (f.rcpt === 'yes' && !f.rstate) return alert('領収書を「その場で渡した」か「渡せなかった（あとで渡す）」かを選んでください。');
      const old = f.editId ? (state.entries.find(e => e.id === f.editId) || {}).receipt : null;
      const receipt = f.rcpt === 'yes' ? {
        atena: f.atena || f.partner, tadashi: f.tadashi || DEFAULT_TADASHI, issued: f.rstate === 'given',
        issuedDate: f.rstate === 'given' ? ((old && old.issuedDate) || f.date) : '',
        reason: f.rstate === 'later' ? (f.rreason || '領収書切れ') : (old && old.reason) || '',
      } : null;
      if (receipt && !receipt.atena) return alert('領収書の宛名を入れてください。');
      Object.assign(rec, { orderDate: f.orderDate, items, treatment: f.treatment, receipt });
      // 初めてのお客様なら、今回の領収書の選び方をその人の設定として覚える
      if (f.partner && !profile(f.partner)) {
        state.customers = state.customers || {};
        state.customers[f.partner] = receipt ? { receipt: true, atena: receipt.atena, tadashi: receipt.tadashi } : { receipt: false };
      }
    }
    if (f.editId) {
      const i = state.entries.findIndex(e => e.id === f.editId);
      if (i >= 0) state.entries[i] = Object.assign({}, state.entries[i], rec, { updated: Date.now() });
      if (!save()) return;
      toast('直しました');
      ui.form = null; ui.form = freshForm(f.kind); ui.form.date = f.date;
      go('list');
    } else {
      state.entries.push(Object.assign({ id: newId(), created: Date.now() }, rec));
      if (!save()) return;
      toast(`保存しました（${yen(amount)}）`);
      const keep = { kind: f.kind, date: f.date, venue: f.venue };
      ui.form = Object.assign(freshForm(keep.kind), keep);
      render();
    }
  };
  if ($('f-cancel')) $('f-cancel').onclick = () => { ui.form = freshForm(); go('list'); };
  if ($('f-delete')) $('f-delete').onclick = () => {
    const en = state.entries.find(e => e.id === f.editId);
    const link = en && en.settledBy ? '\nこの注文の入金の記録も一緒に削除します。' : '';
    if (!confirm('この記録を削除しますか？' + link)) return;
    const gone = new Set([f.editId, en && en.settledBy].filter(Boolean));
    state.entries = state.entries.filter(e => !gone.has(e.id));
    // 消したのが入金の記録なら、その注文を「未精算」に戻す
    for (const e of state.entries) if (gone.has(e.settledBy)) { delete e.settledBy; delete e.settledDate; }
    save(); toast('削除しました'); ui.form = freshForm(); go('list');
  };
}

function viewList() {
  const { y, m } = ui.ym;
  const q = ui.search.trim();
  let list = q ? state.entries.filter(e => [e.dr, e.cr, e.partner, e.memo, String(e.amount), itemsText(e.items), e.treatment, e.venue, e.receipt ? e.receipt.atena : ''].join(' ').includes(q)) : inMonth(y, m);
  list = sorted(list).reverse();
  const pl = profitLoss(list);
  return `<h2>帳簿</h2>
  <div class="monthbar">
    <button class="btn" data-mon="-1">◀</button>
    <div class="lbl">${q ? '検索結果' : `${y}年${m}月`}</div>
    <button class="btn" data-mon="1">▶</button>
  </div>
  <div class="field"><input id="search" placeholder="検索（取引先・メモ・科目・金額）" value="${esc(ui.search)}"></div>
  <p class="muted small">${list.length} 件・収入 ${yen(pl.revenue)}・仕入と経費 ${yen(pl.purchases + pl.expTotal)}　（押すと直せます）</p>
  <div class="list">${list.length ? list.map(itemHtml).join('') : '<div class="empty">この月の記録はありません。</div>'}</div>
  <div class="btns" style="margin-top:14px"><button class="btn" data-go="ledger">科目ごとの帳簿（元帳）を見る</button></div>`;
}

function viewLedger() {
  const y = ui.year, acc = ui.ledgerAcc;
  const t = typeOf(acc);
  const isBal = t === 'asset' || t === 'liability';
  let bal = isBal ? (yearData(y).opening[acc] || 0) : 0;
  const rows = sorted(inYear(y)).filter(e => e.dr === acc || e.cr === acc).map(e => {
    const isDr = e.dr === acc;
    bal += (isDr === debitNormal(t) ? 1 : -1) * e.amount;
    const [, mm, dd] = e.date.split('-');
    return `<tr><td>${+mm}/${+dd}</td><td>${esc(isDr ? e.cr : e.dr)}<div class="muted small">${esc([e.partner, e.memo].filter(Boolean).join('・'))}</div></td>
      <td class="num">${isDr ? plain(e.amount) : ''}</td><td class="num">${isDr ? '' : plain(e.amount)}</td><td class="num">${plain(bal)}</td></tr>`;
  });
  const accs = allAccounts().map(([n]) => [n, n]);
  return `<h2>元帳（科目ごとの帳簿）</h2>
  <div class="row2">
    <div class="field"><label>科目</label><select id="l-acc">${options(accs, acc)}</select></div>
    <div class="field"><label>年</label><select id="l-year">${yearOptions(y)}</select></div>
  </div>
  <div class="card tablewrap"><table>
    <tr><th>日付</th><th>相手の科目</th><th class="right">借方</th><th class="right">貸方</th><th class="right">残高</th></tr>
    ${isBal ? `<tr><td></td><td>前年からの繰越</td><td></td><td></td><td class="num">${plain(yearData(y).opening[acc] || 0)}</td></tr>` : ''}
    ${rows.join('') || '<tr><td colspan="5" class="muted">記録はありません。</td></tr>'}
  </table></div>
  <button class="btn" data-go="list">◀ 帳簿にもどる</button>`;
}

function yearOptions(sel, withNext) {
  const now = new Date().getFullYear();
  const ys = new Set([now, sel, ...(withNext ? [now + 1] : []), ...state.entries.map(e => +e.date.slice(0, 4)), ...Object.keys(state.years).map(Number)]);
  return [...ys].sort((a, b) => b - a).map(y => `<option value="${y}"${y === sel ? ' selected' : ''}>${y}年</option>`).join('');
}

function viewSummary() {
  const y = ui.year;
  const ents = inYear(y);
  const pl = profitLoss(ents, y);
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const p = profitLoss(inMonth(y, m));
    months.push(`<tr><td>${m}月</td><td class="num">${plain(p.revenue)}</td><td class="num">${plain(p.purchases)}</td><td class="num">${plain(p.expTotal)}</td><td class="num">${plain(p.revenue - p.purchases - p.expTotal)}</td></tr>`);
  }
  const yp = profitLoss(ents);
  const expRows = pl.exp.filter(([, v]) => v).map(([n, v]) => `<tr><td class="indent">${esc(n)}</td><td class="num">${plain(v)}</td></tr>`).join('')
    || '<tr><td class="indent muted">（経費の記録はまだありません）</td><td></td></tr>';

  const d = yearData(y);
  const end = balancesAt(y, ents);
  const assetRows = [], liabRows = [];
  let aOpen = d.openingInventory, aEnd = d.closingInventory, lOpen = 0, lEnd = 0;
  for (const [n, t] of BASE_ACCOUNTS) {
    if (t !== 'asset' && t !== 'liability') continue;
    const o = d.opening[n] || 0, e = end[n] || 0;
    if (!o && !e) continue;
    const row = `<tr><td class="indent">${n}</td><td class="num">${plain(o)}</td><td class="num">${plain(e)}</td></tr>`;
    if (t === 'asset') { assetRows.push(row); aOpen += o; aEnd += e; } else { liabRows.push(row); lOpen += o; lEnd += e; }
  }
  if (d.openingInventory || d.closingInventory) assetRows.push(`<tr><td class="indent">棚卸資産</td><td class="num">${plain(d.openingInventory)}</td><td class="num">${plain(d.closingInventory)}</td></tr>`);
  const cap = openingCapital(y);
  lOpen += cap; lEnd += cap + pl.profit;
  const diff = aEnd - lEnd;

  return `<h2>集計</h2>
  <div class="field"><select id="s-year">${yearOptions(y)}</select></div>

  <div class="stats">
    <div class="stat"><div class="label">${y}年の収入</div><div class="value in">${yen(pl.revenue)}</div></div>
    <div class="stat"><div class="label">売上原価＋経費</div><div class="value out">${yen(pl.cogs + pl.expTotal)}</div></div>
    <div class="stat"><div class="label">所得（控除前）</div><div class="value">${yen(pl.profit)}</div></div>
  </div>

  <h2>月ごと</h2>
  <div class="card tablewrap"><table>
    <tr><th>月</th><th class="right">収入</th><th class="right">仕入</th><th class="right">経費</th><th class="right">差し引き</th></tr>
    ${months.join('')}
    <tr class="total"><td>合計</td><td class="num">${plain(yp.revenue)}</td><td class="num">${plain(yp.purchases)}</td><td class="num">${plain(yp.expTotal)}</td><td class="num">${plain(yp.revenue - yp.purchases - yp.expTotal)}</td></tr>
  </table></div>

  ${venueTableHtml(ents)}
  ${itemSalesHtml(ents)}

  <h2>損益計算書（青色申告決算書の1ページ目に写す数字）</h2>
  <div class="card tablewrap"><table>
    <tr><td>売上（収入）金額</td><td class="num">${plain(pl.sales)}</td></tr>
    <tr><td class="indent">うち 雑収入</td><td class="num">${plain(pl.misc)}</td></tr>
    <tr class="sub"><td>① 売上（収入）金額 計</td><td class="num">${plain(pl.revenue)}</td></tr>
    <tr><td class="indent">期首商品棚卸高</td><td class="num">${plain(pl.inv.openingInventory)}</td></tr>
    <tr><td class="indent">仕入金額</td><td class="num">${plain(pl.purchases)}</td></tr>
    <tr><td class="indent">期末商品棚卸高</td><td class="num">${plain(pl.inv.closingInventory)}</td></tr>
    <tr class="sub"><td>差引原価</td><td class="num">${plain(pl.cogs)}</td></tr>
    <tr class="sub"><td>差引金額（①−差引原価）</td><td class="num">${plain(pl.gross)}</td></tr>
    ${expRows}
    <tr class="sub"><td>経費 計</td><td class="num">${plain(pl.expTotal)}</td></tr>
    <tr class="total"><td>青色申告特別控除前の所得金額</td><td class="num">${plain(pl.profit)}</td></tr>
  </table>
  <p class="muted small">棚卸の金額は「設定」で入れます。家事按分（自宅兼用の電気代など）は、年末に事業の分だけになるよう振替で調整してください。</p></div>

  <h2>貸借対照表（決算書の4ページ目）</h2>
  <div class="card tablewrap"><table>
    <tr><th>資産</th><th class="right">1月1日</th><th class="right">12月31日</th></tr>
    ${assetRows.join('') || '<tr><td class="indent muted">（なし）</td><td></td><td></td></tr>'}
    <tr class="total"><td>資産 合計</td><td class="num">${plain(aOpen)}</td><td class="num">${plain(aEnd)}</td></tr>
  </table>
  <table style="margin-top:14px">
    <tr><th>負債・資本</th><th class="right">1月1日</th><th class="right">12月31日</th></tr>
    ${liabRows.join('')}
    <tr><td class="indent">元入金</td><td class="num">${plain(cap)}</td><td class="num">${plain(cap)}</td></tr>
    <tr><td class="indent">青色申告特別控除前の所得金額</td><td class="num"></td><td class="num">${plain(pl.profit)}</td></tr>
    <tr class="total"><td>負債・資本 合計</td><td class="num">${plain(lOpen)}</td><td class="num">${plain(lEnd)}</td></tr>
  </table>
  ${diff ? `<p class="out small">資産と負債・資本の合計が ${yen(diff)} 合いません。期首残高の入れ忘れがないか確認してください。</p>` : '<p class="muted small">資産と負債・資本の合計は一致しています。</p>'}
  </div>`;
}

function itemSalesHtml(ents) {
  const m = new Map();
  for (const e of ents) for (const it of e.items || []) {
    const k = it.name || '（品名なし）';
    const r = m.get(k) || { qty: 0, amount: 0, count: 0 };
    r.qty += it.qty; r.amount += it.price * it.qty; r.count++;
    m.set(k, r);
  }
  if (!m.size) return '';
  const rows = [...m.entries()].sort((a, b) => b[1].amount - a[1].amount)
    .map(([n, r]) => `<tr><td>${esc(n)}</td><td class="num">${plain(r.count)}</td><td class="num">${plain(r.qty)}</td><td class="num">${plain(r.amount)}</td></tr>`).join('');
  return `<h2>品名・施術ごとの売上</h2>
  <div class="card tablewrap"><table>
    <tr><th>品名・施術名</th><th class="right">注文回数</th><th class="right">数量</th><th class="right">金額</th></tr>${rows}
  </table></div>`;
}

// ---------- お客様 ----------
function customerStats(venue) {
  const m = new Map();
  for (const e of sorted(state.entries)) {
    if (e.kind !== 'in' || !e.partner) continue;
    if (venue && e.venue !== venue) continue;
    const c = m.get(e.partner) || { name: e.partner, orders: 0, treats: 0, measures: 0, goods: 0, total: 0, unpaid: 0, last: '', venues: new Set() };
    if (e.venue) c.venues.add(e.venue);
    c.orders++;
    c.total += e.amount;
    for (const it of e.items || []) { if (it.type === 'treat') c.treats += it.qty; else if (it.type === 'measure') c.measures += it.qty; else c.goods += it.qty; }
    if (isUnpaid(e)) c.unpaid += e.amount;
    if (needsReceipt(e)) c.noRcpt = (c.noRcpt || 0) + 1;
    const d = e.orderDate || e.date; if (d > c.last) c.last = d;
    m.set(e.partner, c);
  }
  return [...m.values()];
}
// ---------- 会場 ----------
function venueNames() { return [...new Set(state.entries.map(e => e.venue).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')); }
function peopleTabs(on) {
  return `<div class="seg">${[['customers', 'お客様ごと'], ['venues', '会場ごと']].map(([k, l]) =>
    `<button data-go="${k}" class="${on === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function venueStats(ents) { // 会場ごと（会場なしは「共通」）の収入・経費・メンバー
  const m = new Map();
  for (const e of ents) {
    if (e.kind !== 'in' && e.kind !== 'out') continue;
    const k = e.venue || '';
    const v = m.get(k) || { name: k, revenue: 0, cost: 0, unpaid: 0, members: new Set(), orders: 0, treats: 0, measures: 0, last: '' };
    if (e.kind === 'in') {
      v.revenue += e.amount; v.orders++;
      if (e.partner) v.members.add(e.partner);
      for (const it of e.items || []) { if (it.type === 'treat') v.treats += it.qty; if (it.type === 'measure') v.measures += it.qty; }
      if (isUnpaid(e)) v.unpaid += e.amount;
    } else v.cost += e.amount;
    const d = e.orderDate || e.date; if (d > v.last) v.last = d;
    m.set(k, v);
  }
  return [...m.values()].sort((a, b) => (a.name === '') - (b.name === '') || b.revenue - a.revenue);
}
function venuePeriod() {
  const y = ui.year, mo = ui.vmonth || 0;
  return { y, mo, ents: mo ? inMonth(y, mo) : inYear(y), label: mo ? `${y}年${mo}月` : `${y}年` };
}
function periodSelects() {
  const { y, mo } = venuePeriod();
  return `<div class="row2">
    <div class="field"><select id="v-year">${yearOptions(y)}</select></div>
    <div class="field"><select id="v-month">${options([['0', '1年分'], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), `${i + 1}月`])], String(mo))}</select></div>
  </div>`;
}
function venueTableHtml(ents) {
  const vs = venueStats(ents);
  if (!vs.some(v => v.name)) return '';
  return `<h2>会場ごと</h2>
  <div class="card tablewrap"><table>
    <tr><th>会場</th><th class="right">参加人数</th><th class="right">収入</th><th class="right">経費・仕入</th><th class="right">差し引き</th></tr>
    ${vs.map(v => `<tr><td>${v.name ? esc(v.name) : '<span class="muted">共通（会場なし）</span>'}</td><td class="num">${v.members.size}</td><td class="num">${plain(v.revenue)}</td><td class="num">${plain(v.cost)}</td><td class="num">${plain(v.revenue - v.cost)}</td></tr>`).join('')}
  </table></div>`;
}

function viewVenues() {
  const { ents, label } = venuePeriod();
  const vs = venueStats(ents);
  const rows = vs.map(v => `<button class="item" data-venue="${esc(v.name)}" style="grid-template-columns:1fr auto">
      <div><div class="main">${v.name ? esc(v.name) : '共通（会場なし）'}${v.unpaid ? ` <span class="badge out">未精算 ${yen(v.unpaid)}</span>` : ''}</div>
        <div class="sub">参加 ${v.members.size} 人・注文 ${v.orders} 回・施術 ${v.treats} 回・測定 ${v.measures} 回・経費 ${yen(v.cost)}</div></div>
      <div class="num">${yen(v.revenue - v.cost)}<div class="muted small">差し引き</div></div></button>`).join('');
  return `${peopleTabs('venues')}
  ${periodSelects()}
  <div class="list">${rows || `<div class="empty">${label}の記録はありません。収入や支出の「会場」に名前を入れると、ここに出ます。</div>`}</div>
  <p class="muted small">会場を入れなかった収入・支出は「共通（会場なし）」にまとまります。</p>`;
}

function viewVenue() {
  const name = ui.venue;
  const { ents: all, label } = venuePeriod();
  const ents = all.filter(e => (e.kind === 'in' || e.kind === 'out') && (e.venue || '') === name);
  const pl = profitLoss(ents);
  const members = customerStats().length ? (() => {
    const m = new Map();
    for (const e of ents) {
      if (e.kind !== 'in' || !e.partner) continue;
      const c = m.get(e.partner) || { name: e.partner, orders: 0, treats: 0, measures: 0, goods: 0, total: 0, unpaid: 0, last: '' };
      c.orders++; c.total += e.amount;
      for (const it of e.items || []) { if (it.type === 'treat') c.treats += it.qty; else if (it.type === 'measure') c.measures += it.qty; else c.goods += it.qty; }
      if (isUnpaid(e)) c.unpaid += e.amount;
      const d = e.orderDate || e.date; if (d > c.last) c.last = d;
      m.set(e.partner, c);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  })() : [];
  const unpaid = members.reduce((s, c) => s + c.unpaid, 0);
  const expRows = [['仕入', pl.purchases], ...pl.exp].filter(([, v]) => v)
    .map(([n, v]) => `<tr><td class="indent">${esc(n)}</td><td class="num">${plain(v)}</td></tr>`).join('');
  return `<button class="btn" data-go="venues">◀ 会場の一覧</button>
  <h2>${name ? esc(name) : '共通（会場なし）'}　<span class="muted small">${label}</span></h2>
  ${periodSelects()}
  <div class="stats">
    <div class="stat"><div class="label">収入</div><div class="value in">${yen(pl.revenue)}</div></div>
    <div class="stat"><div class="label">経費・仕入</div><div class="value out">${yen(pl.purchases + pl.expTotal)}</div></div>
    <div class="stat"><div class="label">差し引き</div><div class="value">${yen(pl.revenue - pl.purchases - pl.expTotal)}</div></div>
  </div>
  ${unpaid ? `<div class="banner" style="margin-top:14px">この会場の未精算: <b>${yen(unpaid)}</b>（お名前を押すと精算できます）</div>` : ''}

  <h2>参加メンバー（${members.length} 人）</h2>
  <div class="card tablewrap"><table>
    <tr><th>お名前</th><th class="right">注文</th><th class="right">施術</th><th class="right">測定</th><th class="right">商品</th><th class="right">金額</th><th class="right">精算</th></tr>
    ${members.map(c => `<tr><td><button class="btn" data-cust="${esc(c.name)}" style="min-height:36px;padding:4px 10px">${esc(c.name)}</button></td>
      <td class="num">${c.orders}回</td><td class="num">${c.treats}回</td><td class="num">${c.measures}回</td><td class="num">${c.goods}点</td><td class="num">${plain(c.total)}</td>
      <td class="num ${c.unpaid ? 'out' : ''}">${c.unpaid ? '未 ' + plain(c.unpaid) : '済'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">この期間の参加者の記録はありません。</td></tr>'}
  </table></div>

  <h2>経費・仕入の内訳</h2>
  <div class="card tablewrap"><table>${expRows || '<tr><td class="muted">この期間の経費はありません。</td></tr>'}</table></div>

  <h2>この会場の記録（押すと直せます）</h2>
  <div class="list">${sorted(ents).reverse().map(itemHtml).join('') || '<div class="empty">記録はありません。</div>'}</div>
  ${name ? `<div class="btns" style="margin-top:14px"><button class="btn" data-rename="venue">会場の名前を変える</button></div>` : ''}`;
}

// お客様・会場の名前を、すべての記録でまとめて変える
function renameAll(kind, from) {
  const label = kind === 'venue' ? '会場' : 'お客様';
  const to = (prompt(`「${from}」の新しい${label}の名前を入れてください。\n（すでにある名前にすると、ひとつにまとまります）`, from) || '').trim();
  if (!to || to === from) return;
  const field = kind === 'venue' ? 'venue' : 'partner';
  let n = 0;
  for (const e of state.entries) if (e[field] === from) { e[field] = to; n++; }
  if (kind !== 'venue' && state.customers && state.customers[from]) {
    if (!state.customers[to]) state.customers[to] = state.customers[from];
    delete state.customers[from];
  }
  save();
  if (kind === 'venue') ui.venue = to; else ui.customer = to;
  render(); toast(`${n} 件の記録を「${to}」に変えました`);
}

function jdate(d) { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${y}/${+m}/${+dd}`; }

function viewCustomers() {
  const q = (ui.csearch || '').trim();
  const cv = ui.cvenue || '';
  let list = customerStats(cv);
  if (q) list = list.filter(c => c.name.includes(q));
  const sort = ui.csort || 'last';
  list.sort((a, b) => sort === 'unpaid' ? b.unpaid - a.unpaid || (b.last > a.last ? 1 : -1) : sort === 'name' ? a.name.localeCompare(b.name, 'ja') : (b.last > a.last ? 1 : -1));
  const unpaidTotal = list.reduce((s, c) => s + c.unpaid, 0);
  const rows = list.map(c => `<button class="item" data-cust="${esc(c.name)}" style="grid-template-columns:1fr auto">
      <div><div class="main">${esc(c.name)}${c.unpaid ? ` <span class="badge out">未精算 ${yen(c.unpaid)}</span>` : ''}${profile(c.name) && profile(c.name).receipt ? ' <span class="badge">領収書</span>' : ''}${c.noRcpt ? ` <span class="badge out">領収書 未発行 ${c.noRcpt}</span>` : ''}</div>
        <div class="sub">最後: ${jdate(c.last)}・注文 ${c.orders} 回・施術 ${c.treats} 回・測定 ${c.measures} 回・商品 ${c.goods} 点${c.venues.size ? '・' + esc([...c.venues].join('、')) : ''}</div></div>
      <div class="num">${yen(c.total)}</div></button>`).join('');
  return `${peopleTabs('customers')}
  <div class="row2">
    <div class="field"><input id="c-search" placeholder="お名前で探す" value="${esc(q)}"></div>
    <div class="field"><select id="c-venue">${options([['', 'すべての会場'], ...venueNames().map(v => [v, v])], cv)}</select></div>
  </div>
  <div class="seg">${[['last', '最近の順'], ['unpaid', '未精算の多い順'], ['name', '名前の順']].map(([k, l]) => `<button data-csort="${k}" class="${sort === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  ${unpaidTotal ? `<div class="banner">未精算（まだ入金されていない分）の合計: <b>${yen(unpaidTotal)}</b></div>` : ''}
  <div class="list">${rows || '<div class="empty">まだお客様の記録がありません。「＋ 収入」でお客様の名前を入れると、ここに出ます。</div>'}</div>
  <p class="muted small">「あとで入金（売掛金）」で記録した注文が「未精算」になります。</p>`;
}

function viewCustomer() {
  const name = ui.customer;
  const ents = sorted(state.entries.filter(e => e.kind === 'in' && e.partner === name)).reverse();
  const c = customerStats().find(x => x.name === name) || { orders: 0, treats: 0, measures: 0, goods: 0, total: 0, unpaid: 0 };
  const treats = [], measures = [], goods = new Map();
  for (const e of ents) for (const it of e.items || []) {
    if (it.type === 'treat') treats.push({ e, it });
    else if (it.type === 'measure') measures.push({ e, it });
    else { const g = goods.get(it.name) || { qty: 0, amount: 0, last: '' }; g.qty += it.qty; g.amount += it.price * it.qty; const d = e.orderDate || e.date; if (d > g.last) g.last = d; goods.set(it.name, g); }
  }
  const unpaid = ents.filter(isUnpaid);
  const pr = profile(name) || { receipt: false };
  const noRcpt = ents.filter(needsReceipt);
  return `<button class="btn" data-go="customers">◀ お客様の一覧</button>
  <h2>${esc(name)}</h2>
  <div class="stats">
    <div class="stat"><div class="label">施術・測定の回数</div><div class="value">施術 ${c.treats} 回・測定 ${c.measures} 回</div></div>
    <div class="stat"><div class="label">注文の回数・合計</div><div class="value">${c.orders} 回・${yen(c.total)}</div></div>
    <div class="stat"><div class="label">精算</div><div class="value ${c.unpaid ? 'out' : ''}">${c.unpaid ? '未精算 ' + yen(c.unpaid) : 'すべて完了'}</div></div>
  </div>

  <h2>領収書</h2>
  <div class="card">
    <div class="row2">
      <div class="field"><label>この方の領収書</label><select id="p-rcpt">${options([['no', '不要'], ['yes', '必要']], pr.receipt ? 'yes' : 'no')}</select></div>
      <div class="field"><label>宛名</label><input id="p-atena" value="${esc(pr.atena || name)}" autocomplete="off"></div>
    </div>
    <div class="field"><label>但し書き</label><input id="p-tadashi" value="${esc(pr.tadashi || DEFAULT_TADASHI)}" autocomplete="off"></div>
    <button class="btn primary" data-psave="1">この設定を保存</button>
    <p class="muted small" style="margin-bottom:0">ここで保存した設定が、次からこの方の収入を記録するときに自動で入ります。</p>
    ${noRcpt.length ? `<h2>まだ渡していない領収書（${noRcpt.length} 件）</h2>
    ${noRcpt.map(e => `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line)">
      <div style="flex:1;min-width:220px">${jdate(e.orderDate || e.date)}・<b>${yen(e.amount)}</b><div class="small">宛名: ${esc(e.receipt.atena)} 様／但し: ${esc(e.receipt.tadashi)}${e.receipt.reason ? `／<span class="out">${esc(e.receipt.reason)}</span>` : ''}</div></div>
      <button class="btn primary" data-issue="${e.id}">あとで渡した</button></div>`).join('')}` : ''}
  </div>

  ${unpaid.length ? `<h2>まだ入金されていない注文</h2>
  <div class="card">${unpaid.map(e => `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--line)">
      <div style="flex:1;min-width:200px">${jdate(e.orderDate || e.date)}・${esc(itemsText(e.items) || e.memo || '注文')}<div class="num out" style="text-align:left">${yen(e.amount)}</div></div>
      <button class="btn primary" data-settle="${e.id}" data-to="現金">現金で受け取った</button>
      <button class="btn primary" data-settle="${e.id}" data-to="普通預金">銀行に入金された</button></div>`).join('')}
    <p class="muted small" style="margin-bottom:0">ボタンを押すと、今日の日付で入金の記録を作り、「精算済み」にします。</p></div>` : ''}

  <h2>施術の履歴（${treats.length} 件）</h2>
  <div class="card tablewrap"><table>
    <tr><th>日付</th><th>施術</th><th class="right">回数</th><th class="right">金額</th><th>内容</th></tr>
    ${treats.map(({ e, it }) => `<tr><td>${jdate(e.orderDate || e.date)}</td><td>${esc(it.name)}</td><td class="num">${it.qty}</td><td class="num">${plain(it.price * it.qty)}</td><td class="small">${esc(e.treatment)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">施術の記録はありません。</td></tr>'}
  </table></div>

  <h2>測定の履歴（${measures.length} 件）</h2>
  <div class="card tablewrap"><table>
    <tr><th>日付</th><th>測定</th><th class="right">回数</th><th class="right">金額</th></tr>
    ${measures.map(({ e, it }) => `<tr><td>${jdate(e.orderDate || e.date)}</td><td>${esc(it.name)}</td><td class="num">${it.qty}</td><td class="num">${plain(it.price * it.qty)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">測定の記録はありません。</td></tr>'}
  </table></div>

  <h2>注文した商品</h2>
  <div class="card tablewrap"><table>
    <tr><th>商品</th><th class="right">合計数量</th><th class="right">合計金額</th><th class="right">最後の注文</th></tr>
    ${[...goods.entries()].sort((a, b) => b[1].qty - a[1].qty).map(([n, g]) => `<tr><td>${esc(n)}</td><td class="num">${g.qty}</td><td class="num">${plain(g.amount)}</td><td class="num">${jdate(g.last)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">商品の注文はありません。</td></tr>'}
  </table></div>

  <h2>すべての注文（押すと直せます）</h2>
  <div class="list">${ents.map(e => itemHtml(e)).join('') || '<div class="empty">記録はありません。</div>'}</div>
  <div class="btns" style="margin-top:14px"><button class="btn" data-rename="customer">お名前を変える・ほかの名前とまとめる</button></div>`;
}

function settle(id, to) {
  const order = state.entries.find(e => e.id === id);
  if (!order || !isUnpaid(order)) return;
  if (!confirm(`${order.partner} 様の ${yen(order.amount)} を「${to === '現金' ? '現金で受け取った' : '銀行に入金された'}」として、精算済みにします。よろしいですか？`)) return;
  const pay = { id: newId(), created: Date.now(), date: today(), kind: 'move', preset: 'ar', dr: to, cr: '売掛金', amount: order.amount,
    partner: order.partner, memo: `${jdate(order.orderDate || order.date)}の注文の入金`, settles: order.id };
  state.entries.push(pay);
  order.settledBy = pay.id; order.settledDate = pay.date;
  save(); render(); toast('精算済みにしました');
}

function viewSettings() {
  const y = ui.year;
  const d = yearData(y);
  const balRows = balanceAccounts().filter(n => n !== '事業主貸' && n !== '事業主借').map(n =>
    `<div class="field"><label>${n}</label><input class="amount" data-open="${n}" inputmode="numeric" value="${d.opening[n] ? plain(d.opening[n]) : ''}" placeholder="0"></div>`).join('');
  const used = new Set(state.entries.flatMap(e => [e.dr, e.cr]));
  const backupInfo = state.lastBackup ? new Date(state.lastBackup).toLocaleString('ja-JP') : 'まだありません';
  return `<h2>設定</h2>

  <div class="card">
    <h2 style="margin-top:0">バックアップ</h2>
    <p class="small">帳簿はこの iPad の中にだけ保存されています。iPad の故障や買い替えに備えて、ときどきバックアップを保存してください。保存先には「ファイル」や Dropbox を選べます。</p>
    <p class="small muted">最後のバックアップ: ${esc(backupInfo)}・記録 ${state.entries.length} 件</p>
    <div class="btns">
      <button class="btn primary" id="b-export">バックアップを保存</button>
      <button class="btn" id="b-import">バックアップから戻す</button>
      <button class="btn" id="b-csv">仕訳帳を CSV で書き出す</button>
    </div>
    <input type="file" id="b-file" accept=".json,application/json" hidden>
  </div>

  <div class="card">
    <h2 style="margin-top:0">年ごとの設定</h2>
    <div class="field"><select id="y-year">${yearOptions(y, true)}</select></div>
    <p class="small">1月1日時点の残高（期首残高）と、棚卸の金額です。初めての年は、1月1日の現金・預金などの残高を入れてください。</p>
    <div class="btns" style="margin-bottom:14px"><button class="btn" id="y-carry">${y - 1}年の年末残高を写す</button></div>
    <div class="row2">${balRows}</div>
    <div class="row2">
      <div class="field"><label>期首商品棚卸高（1月1日の在庫の金額）</label><input class="amount" data-inv="openingInventory" inputmode="numeric" value="${d.openingInventory ? plain(d.openingInventory) : ''}" placeholder="0"></div>
      <div class="field"><label>期末商品棚卸高（12月31日の在庫の金額）</label><input class="amount" data-inv="closingInventory" inputmode="numeric" value="${d.closingInventory ? plain(d.closingInventory) : ''}" placeholder="0"></div>
    </div>
    <p class="small muted">元入金（自動計算）: ${yen(openingCapital(y))}</p>
    <button class="btn primary" id="y-save">この年の設定を保存</button>
  </div>

  <div class="card">
    <h2 style="margin-top:0">経費の科目を追加</h2>
    <p class="small">決算書の空いている欄に書く科目を増やせます（例: 研修費、リース料）。</p>
    <div class="row2"><div class="field"><input id="c-name" placeholder="科目の名前"></div><div><button class="btn" id="c-add">追加</button></div></div>
    ${state.customExpenses.length ? `<div class="chips">${state.customExpenses.map(n => `<button class="chip" data-delacc="${esc(n)}" ${used.has(n) ? 'disabled title="使用中"' : ''}>${esc(n)} ${used.has(n) ? '（使用中）' : '✕'}</button>`).join('')}</div>` : ''}
  </div>

  <div class="card"><h2 style="margin-top:0">アプリの版</h2>
    <p class="small">いまの版: <b>ver ${APP_VERSION}</b>。Wi-Fi につながっているときに押すと、新しい版があれば切り替えます（帳簿の記録は消えません）。</p>
    <button class="btn" id="b-update">新しい版を確認する</button></div>
  <p class="muted small">お店の帳簿 ver ${APP_VERSION}・データはこの端末の中だけに保存され、インターネットには送られません。</p>`;
}

// ---------- 設定画面の動作 ----------
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title: name }).then(() => true, err => { if (err.name !== 'AbortError') fallback(); return false; });
  }
  fallback();
  return Promise.resolve(true);
  function fallback() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
}
function stamp() { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; }

function bindSettings() {
  const $ = id => document.getElementById(id);
  $('b-export').onclick = async () => {
    const data = JSON.stringify({ app: 'kaikei', version: APP_VERSION, exported: new Date().toISOString(), state }, null, 1);
    const ok = await download(`帳簿バックアップ_${stamp()}.json`, data, 'application/json');
    if (ok) { state.lastBackup = Date.now(); save(); render(); toast('バックアップを保存しました'); }
  };
  $('b-update').onclick = checkUpdate;
  $('b-import').onclick = () => $('b-file').click();
  $('b-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      const s = obj.state || obj;
      if (!Array.isArray(s.entries)) throw new Error('帳簿のバックアップではないようです');
      if (!confirm(`バックアップ（記録 ${s.entries.length} 件）で、いまの帳簿（記録 ${state.entries.length} 件）を置き換えます。よろしいですか？`)) return;
      state = Object.assign(blank(), s); save(); render(); toast('バックアップから戻しました');
    } catch (err) { alert('読み込めませんでした: ' + err.message); }
    e.target.value = '';
  };
  $('b-csv').onclick = () => {
    const head = ['日付', '借方科目', '借方金額', '貸方科目', '貸方金額', '取引先', '摘要', '種類', '注文日', '注文の内容', '施術の内容', '会場', '領収書', '宛名', '但し書き', '領収書発行'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = sorted(state.entries).map(e => [e.date.replace(/-/g, '/'), e.dr, e.amount, e.cr, e.amount, e.partner, e.memo, KIND_LABEL[e.kind],
      (e.orderDate || '').replace(/-/g, '/'), (e.items || []).map(it => `${it.name} ${it.price}円×${it.qty}`).join(' / '), e.treatment, e.venue, e.receipt ? '必要' : '', e.receipt ? e.receipt.atena : '', e.receipt ? e.receipt.tadashi : '', e.receipt ? (e.receipt.issued ? '済 ' + (e.receipt.issuedDate || '') : '未（' + (e.receipt.reason || '') + '）') : ''].map(q).join(','));
    download(`仕訳帳_${stamp()}.csv`, '﻿' + [head.map(q).join(','), ...lines].join('\r\n'), 'text/csv');
  };
  $('y-year').onchange = e => { ui.year = +e.target.value; render(); };
  document.querySelectorAll('[data-open],[data-inv]').forEach(inp => inp.oninput = () => { const v = parseAmount(inp.value); inp.value = v ? plain(v) : ''; });
  $('y-save').onclick = () => {
    const y = ui.year, cur = yearData(y);
    const opening = {};
    document.querySelectorAll('[data-open]').forEach(inp => { const v = parseAmount(inp.value); if (v) opening[inp.dataset.open] = v; });
    const inv = {};
    document.querySelectorAll('[data-inv]').forEach(inp => inv[inp.dataset.inv] = parseAmount(inp.value));
    state.years[y] = Object.assign({}, cur, { opening }, inv);
    save(); render(); toast(`${y}年の設定を保存しました`);
  };
  $('y-carry').onclick = () => {
    const y = ui.year, py = y - 1;
    const end = balancesAt(py, inYear(py));
    if (!confirm(`${py}年12月31日の残高を、${y}年1月1日の残高として入れます（事業主貸・事業主借は0に戻ります）。よろしいですか？`)) return;
    const opening = {};
    for (const n of balanceAccounts()) if (n !== '事業主貸' && n !== '事業主借' && end[n]) opening[n] = end[n];
    const cur = yearData(y);
    state.years[y] = Object.assign({}, cur, { opening, openingInventory: yearData(py).closingInventory });
    save(); render(); toast('繰り越しました。確認して必要なら直してください');
  };
  $('c-add').onclick = () => {
    const n = $('c-name').value.trim();
    if (!n) return;
    if (allAccounts().some(a => a[0] === n)) return alert('その科目はもうあります。');
    state.customExpenses.push(n); save(); render(); toast(`「${n}」を追加しました`);
  };
  document.querySelectorAll('[data-delacc]').forEach(b => b.onclick = () => {
    const n = b.dataset.delacc;
    if (!confirm(`「${n}」を消しますか？`)) return;
    state.customExpenses = state.customExpenses.filter(x => x !== n); save(); render();
  });
}

// ---------- 共通のクリック処理 ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.go) { if (t.dataset.go === 'input') ui.form = ui.form && !ui.form.editId ? ui.form : freshForm(); go(t.dataset.go); }
  else if (t.dataset.new) { ui.form = freshForm(t.dataset.new); go('input'); }
  else if (t.dataset.edit) {
    const en = state.entries.find(x => x.id === t.dataset.edit); if (!en) return;
    ui.form = { kind: en.kind, date: en.date, amount: String(en.amount), partner: en.partner || '', memo: en.memo || '', editId: en.id,
      acc: en.kind === 'in' ? en.cr : en.dr, method: en.kind === 'in' ? en.dr : en.cr, preset: en.preset || '', dr: en.dr, cr: en.cr,
      orderDate: en.orderDate || '', treatment: en.treatment || '', venue: en.venue || '',
      rcpt: en.receipt ? 'yes' : 'no', atena: en.receipt ? en.receipt.atena : '', tadashi: en.receipt ? en.receipt.tadashi : '', rstate: en.receipt ? (en.receipt.issued ? 'given' : 'later') : '', rreason: en.receipt ? en.receipt.reason || '' : '',
      items: en.items && en.items.length ? en.items.map(it => ({ type: it.type || 'goods', name: it.name, price: String(it.price), qty: String(it.qty) })) : defaultItems() };
    go('input');
  } else if (t.dataset.cust) { ui.customer = t.dataset.cust; go('customer'); }
  else if (t.dataset.csort) { ui.csort = t.dataset.csort; render(); }
  else if (t.dataset.settle) { settle(t.dataset.settle, t.dataset.to); }
  else if (t.dataset.psave) {
    const need = document.getElementById('p-rcpt').value === 'yes';
    state.customers = state.customers || {};
    state.customers[ui.customer] = { receipt: need, atena: document.getElementById('p-atena').value.trim() || ui.customer, tadashi: document.getElementById('p-tadashi').value.trim() || DEFAULT_TADASHI };
    save(); render(); toast('領収書の設定を保存しました');
  } else if (t.dataset.issue) {
    const en = state.entries.find(x => x.id === t.dataset.issue);
    if (en && en.receipt) { en.receipt.issued = true; en.receipt.issuedDate = today(); save(); render(); toast('渡したことを記録しました'); }
  }
  else if (t.dataset.venue !== undefined) { ui.venue = t.dataset.venue; go('venue'); }
  else if (t.dataset.rename) { renameAll(t.dataset.rename, t.dataset.rename === 'venue' ? ui.venue : ui.customer); }
  else if (t.dataset.mon) {
    ui.search = '';
    let { y, m } = ui.ym; m += +t.dataset.mon;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    ui.ym = { y, m }; render();
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 's-year') { ui.year = +e.target.value; render(); }
  if (e.target.id === 'l-year') { ui.year = +e.target.value; render(); }
  if (e.target.id === 'l-acc') { ui.ledgerAcc = e.target.value; render(); }
  if (e.target.id === 'c-venue') { ui.cvenue = e.target.value; render(); }
  if (e.target.id === 'v-year') { ui.year = +e.target.value; render(); }
  if (e.target.id === 'v-month') { ui.vmonth = +e.target.value; render(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'search' || e.target.id === 'c-search') {
    const id = e.target.id;
    if (id === 'search') ui.search = e.target.value; else ui.csearch = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const s = document.getElementById(id); s.focus(); s.setSelectionRange(pos, pos);
  }
});
// ---------- 起動 ----------
function updateOnline() { document.getElementById('offline').hidden = navigator.onLine; }
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // 新しい版が届いたら、上に「新しい版に切り替える」を出す（入力中の内容を消さないよう、自動では切り替えない）
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || checkUpdate.reloading) return;
    const b = document.getElementById('newver'); b.hidden = false;
  });
}
async function checkUpdate() {
  if (!navigator.onLine) return alert('Wi-Fi につながっているときに押してください。');
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.update();
      const w = reg.installing || reg.waiting; // 新しい版の準備が終わるまで待つ
      if (w) await new Promise(res => { w.addEventListener('statechange', () => { if (w.state === 'activated' || w.state === 'redundant') res(); }); setTimeout(res, 8000); });
    }
    const r = await fetch('app.js', { cache: 'no-store' });
    const latest = ((await r.text()).match(/APP_VERSION = '([^']+)'/) || [])[1];
    if (latest && latest !== APP_VERSION) {
      toast(`ver ${latest} に切り替えます`);
      checkUpdate.reloading = true;
      setTimeout(() => location.reload(), 1200);
    } else toast(`いまの版（ver ${APP_VERSION}）が最新です`);
  } catch (e) { alert('確認できませんでした: ' + e.message); }
}
document.getElementById('appver').textContent = 'ver ' + APP_VERSION;
render();
