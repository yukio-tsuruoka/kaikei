'use strict';
/* お店の帳簿 — 青色申告用のかんたん帳簿（オフライン・iPad 用）
   データはこの端末の中（localStorage）にだけ保存し、外へは送らない。 */

const STORE_KEY = 'kaikei.v1';
const APP_VERSION = '1.1.0';

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
function blank() { return { entries: [], years: {}, customExpenses: [], lastBackup: null, seq: 1 }; }
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
    amount: '', partner: '', memo: '', editId: null,
    orderDate: '', items: [{ name: '', price: '', qty: '1' }], treatment: '',
  };
}
function itemsTotal(items) { return (items || []).reduce((s, it) => s + parseAmount(it.price) * (parseAmount(it.qty) || 0), 0); }
function cleanItems(items) {
  return (items || []).map(it => ({ name: String(it.name || '').trim(), price: parseAmount(it.price), qty: parseAmount(it.qty) || 0 }))
    .filter(it => it.name || it.price);
}
function itemsText(items) { return (items || []).map(it => `${it.name || '（品名なし）'}×${it.qty}`).join('、'); }
function knownItems() { // 品名 → 最後に使った単価
  const m = new Map();
  for (const e of sorted(state.entries)) for (const it of e.items || []) if (it.name) m.set(it.name, it.price);
  return m;
}

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
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === ui.view));
  const v = document.getElementById('view');
  v.innerHTML = ({ home: viewHome, input: viewInput, list: viewList, summary: viewSummary, settings: viewSettings, ledger: viewLedger })[ui.view]();
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
  const extra = [e.partner, e.items && e.items.length ? itemsText(e.items) : '', e.treatment ? '施術: ' + e.treatment : '', e.memo]
    .filter(Boolean).map(esc).join('・');
  const [, mm, dd] = e.date.split('-');
  return `<button class="item" data-edit="${e.id}">
    <div class="d">${+mm}/${+dd}</div>
    <div><div class="main"><span class="badge ${t.cls}">${KIND_LABEL[e.kind]}</span>${esc(t.main)}</div>
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
        <label class="muted small">注文の内容（単価×数量の合計が金額に入ります）</label>
        <div class="tablewrap"><table id="items">
          <tr><th>品名・施術名</th><th class="right" style="width:22%">単価</th><th class="right" style="width:14%">数量</th><th class="right" style="width:18%">小計</th><th style="width:44px"></th></tr>
          ${f.items.map((it, i) => `<tr data-row="${i}">
            <td><input data-it="name" list="itemnames" value="${esc(it.name)}" autocomplete="off"></td>
            <td><input data-it="price" class="num" inputmode="numeric" value="${it.price ? plain(parseAmount(it.price)) : ''}"></td>
            <td><input data-it="qty" class="num" inputmode="numeric" value="${esc(it.qty)}"></td>
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
    if ($('f-acc')) f.acc = $('f-acc').value;
    if ($('f-method')) f.method = $('f-method').value;
    if ($('f-dr')) { f.dr = $('f-dr').value; f.cr = $('f-cr').value; }
    const r = document.querySelector('input[name=preset]:checked'); if (r) f.preset = r.value;
    if ($('f-order')) {
      f.orderDate = $('f-order').value;
      f.treatment = $('f-treat').value.trim();
      f.items = [...document.querySelectorAll('[data-row]')].map(tr => ({
        name: tr.querySelector('[data-it=name]').value, price: tr.querySelector('[data-it=price]').value, qty: tr.querySelector('[data-it=qty]').value,
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
    $('items').addEventListener('input', e => {
      const k = e.target.dataset.it;
      if (k === 'price' || k === 'qty') { const v = parseAmount(e.target.value); e.target.value = v ? (k === 'price' ? plain(v) : String(v)) : ''; }
      if (k === 'name') {
        const price = e.target.closest('tr').querySelector('[data-it=price]');
        if (!price.value && known.has(e.target.value)) price.value = plain(known.get(e.target.value));
      }
      refreshTotal();
    });
    $('f-addrow').onclick = () => { sync(); f.items.push({ name: '', price: '', qty: '1' }); render(); };
    document.querySelectorAll('[data-delrow]').forEach(b => b.onclick = () => {
      sync(); f.items.splice(+b.dataset.delrow, 1);
      if (!f.items.length) f.items.push({ name: '', price: '', qty: '1' });
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
    const rec = { date: f.date, kind: f.kind, dr, cr, amount, partner: f.partner, memo: f.memo };
    if (f.kind === 'move') rec.preset = f.preset;
    if (f.kind === 'in') {
      const items = cleanItems(f.items);
      const t = itemsTotal(items);
      if (t && t !== amount && !confirm(`注文の内容の合計（${yen(t)}）と金額（${yen(amount)}）が違います。このまま保存しますか？`)) return;
      Object.assign(rec, { orderDate: f.orderDate, items, treatment: f.treatment });
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
      const keep = { kind: f.kind, date: f.date };
      ui.form = Object.assign(freshForm(keep.kind), keep);
      render();
    }
  };
  if ($('f-cancel')) $('f-cancel').onclick = () => { ui.form = freshForm(); go('list'); };
  if ($('f-delete')) $('f-delete').onclick = () => {
    if (!confirm('この記録を削除しますか？')) return;
    state.entries = state.entries.filter(e => e.id !== f.editId);
    save(); toast('削除しました'); ui.form = freshForm(); go('list');
  };
}

function viewList() {
  const { y, m } = ui.ym;
  const q = ui.search.trim();
  let list = q ? state.entries.filter(e => [e.dr, e.cr, e.partner, e.memo, String(e.amount), itemsText(e.items), e.treatment].join(' ').includes(q)) : inMonth(y, m);
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
    const head = ['日付', '借方科目', '借方金額', '貸方科目', '貸方金額', '取引先', '摘要', '種類', '注文日', '注文の内容', '施術の内容'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = sorted(state.entries).map(e => [e.date.replace(/-/g, '/'), e.dr, e.amount, e.cr, e.amount, e.partner, e.memo, KIND_LABEL[e.kind],
      (e.orderDate || '').replace(/-/g, '/'), (e.items || []).map(it => `${it.name} ${it.price}円×${it.qty}`).join(' / '), e.treatment].map(q).join(','));
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
      orderDate: en.orderDate || '', treatment: en.treatment || '',
      items: en.items && en.items.length ? en.items.map(it => ({ name: it.name, price: String(it.price), qty: String(it.qty) })) : [{ name: '', price: '', qty: '1' }] };
    go('input');
  } else if (t.dataset.mon) {
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
});
document.addEventListener('input', e => {
  if (e.target.id === 'search') {
    ui.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const s = document.getElementById('search'); s.focus(); s.setSelectionRange(pos, pos);
  }
});
// ---------- 起動 ----------
function updateOnline() { document.getElementById('offline').hidden = navigator.onLine; }
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
