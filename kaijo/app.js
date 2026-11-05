// 会場の情報（iPad 用・オフライン）
// 会場ごとの住所・連絡先・会場代・設備・持ち物・開催日のメモを、この iPad の中だけに保存する。
// 直したら APP_VERSION と sw.js の CACHE の番号を上げ、下の HISTORY に1行足す。
const APP_VERSION = '1.2.0';
const HISTORY = [
  ['1.2.0', '2026-11-06', '会場ごとの打ち合わせ。確認する項目・決まったこと・宿題・次回の記録、印刷、LINE 用にコピー。'],
  ['1.1.0', '2026-11-05', 'お手洗いの場所の案内。お客様に見せる大きな表示と、LINE に貼れるコピー。'],
  ['1.0.0', '2026-11-05', '最初の版。会場の一覧・くわしい情報・設備・持ち物チェック・開催日のメモ・バックアップ。'],
];
const KEY = 'kaijo-info-v1';

// 設備の項目（あり／なし／未確認 ＋ ひとことメモ）
const EQUIP = [
  ['power', '電源・コンセント'], ['water', '水道・流し'], ['wifi', 'Wi-Fi'], ['parking', '駐車場'],
  ['elevator', 'エレベーター'], ['tables', '机'], ['chairs', '椅子'], ['curtain', '更衣・仕切り'],
  ['toilet', 'トイレ'], ['aircon', '冷暖房'], ['storage', '荷物置き場'], ['trash', 'ゴミを捨てられる'],
];
// 一覧で「まだ入っていない」と知らせる大事な項目
const IMPORTANT = [['address', '住所'], ['tel', '電話'], ['contact', '担当の方'], ['fee', '会場代'], ['payHow', '払い方'], ['openIn', '入れる時間'], ['closeOut', '出る時間'], ['toilet', 'お手洗いの場所']];
const FEE_UNITS = ['1回', '1時間', '半日', '1日', '1か月'];
const PAY_HOWS = ['現金', '振込', 'カード', 'その他'];
const PAY_WHENS = ['当日', '前払い', '後払い', '月末'];
// 打ち合わせで確認する項目 [キー, 項目, 会場の情報から「今わかっていること」を出す]
const MEET_ITEMS = [
  ['time', '使える時間（入り・片付け）', v => [v.openIn, v.closeOut].some(Boolean) ? `${v.openIn || '?'}〜${v.closeOut || '?'}` : ''],
  ['room', '部屋・広さ・定員', v => v.size],
  ['equip', '机・椅子・電源・水回り', v => EQUIP.filter(([k]) => ['tables', 'chairs', 'power', 'water'].includes(k) && (v.equip || {})[k] && v.equip[k].has).map(([k, l]) => `${l}:${v.equip[k].has}`).join('／')],
  ['carry', '駐車場・荷物の搬入', v => (v.equip || {}).parking && v.equip.parking.has ? `駐車場:${v.equip.parking.has}${v.equip.parking.note ? '（' + v.equip.parking.note + '）' : ''}` : ''],
  ['station', '最寄り駅・駅から歩いて何分', v => v.station],
  ['fee', '会場代・払い方・キャンセル', v => [feeText(v), v.payHow, v.payWhen, v.cancel].filter(Boolean).join('・')],
  ['slots', '予約の時間帯・台数・人数', () => ''],
  ['flow', '当日の流れ・受付のしかた', () => ''],
  ['toilet', 'お手洗い・着替える場所', v => v.toilet],
  ['promo', '告知・お客様集め', () => ''],
  ['emerg', '急ぎのときの連絡先', v => [v.contact, v.tel].filter(Boolean).join(' ')],
];
const MEET_HOWS = ['会って', '電話', 'オンライン', 'LINE・メール'];
const DEFAULT_ITEMS = ['リファイナリー本体', '延長コード', 'お水（2L・500ml・30ml）', 'コップ', 'タオル', '集金袋・お釣り', '領収書', '同意書', 'iPad・充電器', '名簿・予約表'];

let state = load();
const ui = { view: 'list', id: null, q: '', showOff: false, form: null, mform: null };

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  s = s && typeof s === 'object' ? s : {};
  s.venues = Array.isArray(s.venues) ? s.venues : [];
  s.items = Array.isArray(s.items) ? s.items : DEFAULT_ITEMS.slice();
  s.checks = s.checks || {};
  return s;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch (e) { alert('保存できませんでした。iPad の空き容量を確かめてください。\n' + e.message); return false; }
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pad(n) { return String(n).padStart(2, '0'); }
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function jdate(s) { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()]; return `${y}/${m}/${d}（${w}）`; }
function yen(n) { return Number(n).toLocaleString('ja-JP') + ' 円'; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function byId(id) { return state.venues.find(v => v.id === id); }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 1800);
}
function go(view, id) { ui.view = view; if (id !== undefined) ui.id = id; render(); window.scrollTo(0, 0); }
function blank() {
  return { id: uid(), name: '', area: '', address: '', station: '', access: '', contact: '', tel: '', mail: '', web: '',
    bookHow: '', bookDeadline: '', fee: '', feeUnit: '1回', payHow: '', payWhen: '', cancel: '', openIn: '', closeOut: '',
    usual: '', size: '', toilet: '', toiletMore: '', equip: {}, items: [], notes: '', days: [], off: false, updated: 0 };
}
function missing(v) { return IMPORTANT.filter(([k]) => !String(v[k] ?? '').trim()); }
function feeText(v) { return v.fee !== '' && v.fee != null ? `${yen(v.fee)}／${v.feeUnit || '1回'}` : ''; }
function nextDay(v) { const t = today(); return (v.days || []).map(d => d.date).filter(d => d >= t).sort()[0] || ''; }
function lastDay(v) { const t = today(); return (v.days || []).map(d => d.date).filter(d => d < t).sort().pop() || ''; }

// ---------- 描画 ----------
function render() {
  const tab = ui.view === 'settings' ? 'settings' : 'list';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
  const html = ({ list: viewList, venue: viewVenue, edit: viewEdit, meet: viewMeet, settings: viewSettings })[ui.view]();
  document.getElementById('view').innerHTML = html;
}

function viewList() {
  const q = ui.q.trim().toLowerCase();
  const hit = v => !q || JSON.stringify([v.name, v.area, v.address, v.station, v.access, v.contact, v.tel, v.notes, (v.days || []).map(d => d.memo)]).toLowerCase().includes(q);
  const list = state.venues.filter(v => (ui.showOff || !v.off) && hit(v)).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const offCount = state.venues.filter(v => v.off).length;
  const card = v => {
    const miss = missing(v), nx = nextDay(v);
    return `<button class="vcard" data-open="${v.id}">
      <div class="vn">${esc(v.name || '（名前なし）')}${v.off ? ' <span class="tag off">使っていない</span>' : ''}</div>
      <div class="vs">${esc([v.area, v.station].filter(Boolean).join('・') || v.address || '')}</div>
      <div class="vm">
        ${nx ? `<span class="tag ok">次回 ${esc(jdate(nx))}</span>` : ''}
        ${feeText(v) ? `<span class="tag">${esc(feeText(v))}</span>` : ''}
        ${v.openIn || v.closeOut ? `<span class="tag">${esc(v.openIn || '?')}〜${esc(v.closeOut || '?')}</span>` : ''}
        ${miss.length ? `<span class="tag warn">未入力 ${miss.length}</span>` : ''}
        ${openTodos(v).length ? `<span class="tag warn">宿題 ${openTodos(v).length}</span>` : ''}
      </div></button>`;
  };
  return `
  <div class="btns" style="margin-bottom:12px"><button class="btn primary" data-act="new">＋ 会場を追加</button></div>
  <div class="field"><input id="q" placeholder="会場名・地域・駅・メモで探す" value="${esc(ui.q)}" autocomplete="off"></div>
  ${state.venues.length ? '' : `<div class="card">まだ会場がありません。「＋ 会場を追加」から入れてください。<br>
    <span class="small muted">入れた情報はこの iPad の中だけに保存されます。</span></div>`}
  <div class="vlist">${list.map(card).join('')}</div>
  ${state.venues.length && !list.length ? '<div class="card">該当する会場はありません。</div>' : ''}
  ${offCount ? `<div class="btns" style="margin-top:14px"><button class="btn" data-act="toggleoff">${ui.showOff ? '使っていない会場を隠す' : `使っていない会場も出す（${offCount}）`}</button></div>` : ''}`;
}

function viewVenue() {
  const v = byId(ui.id); if (!v) { ui.view = 'list'; return viewList(); }
  const miss = missing(v);
  const row = (label, val) => String(val ?? '').trim() ? `<dt>${label}</dt><dd>${val}</dd>` : '';
  const link = (u) => /^https?:\/\//.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>` : esc(u);
  const mapUrl = v.address ? 'https://maps.apple.com/?q=' + encodeURIComponent(v.address) : '';
  const eqs = EQUIP.map(([k, l]) => ({ k, l, ...(v.equip[k] || {}) })).filter(e => e.has || e.note);
  // 持ち物チェック（日が変わったら自動で外れる）
  const items = [...state.items, ...(v.items || [])];
  let ck = state.checks[v.id];
  if (!ck || ck.date !== today()) ck = { date: today(), done: [] };
  const doneN = items.filter(i => ck.done.includes(i)).length;
  const days = [...(v.days || [])].map((d, i) => ({ ...d, i })).sort((a, b) => b.date.localeCompare(a.date));
  return `
  <div class="btns" style="margin-bottom:10px"><button class="btn" data-go="list">← 一覧へ</button></div>
  <div class="vhead"><span class="vn">${esc(v.name || '（名前なし）')}</span><span class="muted">${esc(v.area)}</span>${v.off ? '<span class="tag off">使っていない</span>' : ''}</div>
  <div class="small muted">最後に直した日: ${v.updated ? esc(jdate(new Date(v.updated).toISOString().slice(0, 10))) : '—'}</div>
  <div class="acts">
    <a class="btn ${v.tel ? '' : 'off'}" href="tel:${esc(v.tel.replace(/[^0-9+]/g, ''))}">📞 電話する</a>
    <a class="btn ${mapUrl ? '' : 'off'}" ${mapUrl ? `href="${esc(mapUrl)}"` : ''} target="_blank" rel="noopener">🗺 地図で見る</a>
    <a class="btn ${/^https?:\/\//.test(v.web) ? '' : 'off'}" ${/^https?:\/\//.test(v.web) ? `href="${esc(v.web)}"` : ''} target="_blank" rel="noopener">🌐 ホームページ</a>
    <button class="btn primary" data-act="edit">✏️ 直す</button>
  </div>
  ${miss.length ? `<div class="missing">まだ入っていない大事な項目: ${miss.map(([k, l]) => `<button data-act="edit" data-focus="${k}">${l}</button>`).join('')}</div>` : ''}

  <div class="card guide"><h2>🚻 お手洗いの場所（お客様へのご案内）</h2>
    ${v.toilet ? `<div class="gtext">${esc(v.toilet)}</div>${v.toiletMore ? `<div class="gmore">${esc(v.toiletMore)}</div>` : ''}
      <div class="btns" style="margin-top:12px"><button class="btn primary" data-act="show">大きく表示してお見せする</button><button class="btn" data-act="copyguide">LINE 用にコピー</button></div>`
      : '<div class="muted">まだ入っていません。「直す」で、部屋からの道順を入れてください（例: 部屋を出て右、突き当たりを左）。</div>'}
  </div>

  ${meetCard(v)}

  <div class="card"><h2>場所と行き方</h2><dl class="info">
    ${row('住所', esc(v.address))}${row('最寄り駅', esc(v.station))}${row('行き方', esc(v.access))}${row('広さ・定員', esc(v.size))}
  </dl>${!v.address && !v.station && !v.access && !v.size ? '<div class="muted">まだ入っていません。</div>' : ''}</div>

  <div class="card"><h2>連絡先と予約</h2><dl class="info">
    ${row('担当の方', esc(v.contact))}${row('電話', v.tel ? `<a href="tel:${esc(v.tel.replace(/[^0-9+]/g, ''))}">${esc(v.tel)}</a>` : '')}
    ${row('メール・LINE', esc(v.mail))}${row('ホームページ', link(v.web))}
    ${row('予約のしかた', esc(v.bookHow))}${row('予約の締め切り', esc(v.bookDeadline))}
  </dl>${!v.contact && !v.tel && !v.mail && !v.web && !v.bookHow && !v.bookDeadline ? '<div class="muted">まだ入っていません。</div>' : ''}</div>

  <div class="card"><h2>会場代と時間</h2><dl class="info">
    ${row('会場代', esc(feeText(v)))}${row('払い方', esc([v.payHow, v.payWhen].filter(Boolean).join('・')))}
    ${row('キャンセル', esc(v.cancel))}${row('入れる時間', esc(v.openIn))}${row('出る時間', esc(v.closeOut))}${row('いつもの開催', esc(v.usual))}
  </dl>${!feeText(v) && !v.payHow && !v.payWhen && !v.cancel && !v.openIn && !v.closeOut && !v.usual ? '<div class="muted">まだ入っていません。</div>' : ''}</div>

  <div class="card"><h2>設備</h2>
    ${eqs.length ? `<div class="equip">${eqs.map(e => `<div class="eq ${e.has === 'あり' ? 'yes' : e.has === 'なし' ? 'no' : ''}"><b>${e.l}: ${esc(e.has || '未確認')}</b>${e.note ? `<span class="n">${esc(e.note)}</span>` : ''}</div>`).join('')}</div>` : '<div class="muted">まだ入っていません。</div>'}
  </div>

  <div class="card"><h2>気をつけること</h2>
    ${v.notes ? `<div style="white-space:pre-wrap">${esc(v.notes)}</div>` : '<div class="muted">鍵の受け取り・片付け・ゴミの出し方・近所への配慮など。「直す」で入れられます。</div>'}
  </div>

  <div class="card"><h2>持ち物チェック（${esc(jdate(today()))}）</h2>
    <div class="small muted">いつもの持ち物（設定で変更）＋ この会場だけの持ち物。日が変わると自動で外れます。</div>
    <div class="progress"><i style="width:${items.length ? Math.round(doneN / items.length * 100) : 0}%"></i></div>
    <div class="small" style="margin-bottom:8px"><b>${doneN} / ${items.length}</b> 用意できた${doneN === items.length && items.length ? ' ✅ 全部そろいました' : ''}</div>
    <div class="checks">${items.map((it, i) => `<button class="ck ${ck.done.includes(it) ? 'on' : ''}" data-ck="${i}"><span class="box">${ck.done.includes(it) ? '✓' : ''}</span><span class="t">${esc(it)}</span></button>`).join('')}</div>
    ${doneN ? '<div class="btns" style="margin-top:10px"><button class="btn" data-act="ckreset">チェックを全部外す</button></div>' : ''}
  </div>

  <div class="card"><h2>開催日のメモ</h2>
    <div class="small muted" style="margin-bottom:8px">次回の予定や、その日にあったこと（会場代を払った、鍵の場所が変わった など）。</div>
    <div class="row2"><div class="field"><input type="date" id="d-date" value="${today()}"></div>
      <div class="field"><input id="d-memo" placeholder="メモ（例: 会場代 3,000円 現金で払った）"></div></div>
    <div class="btns" style="margin-bottom:10px"><button class="btn" data-act="dayadd">メモを追加</button></div>
    <div class="days">${days.map(d => `<div class="d"><span>${esc(jdate(d.date))}${d.date >= today() ? '<br><span class="tag ok">これから</span>' : ''}</span><span class="m">${esc(d.memo || '')}</span><button data-daydel="${d.i}">消す</button></div>`).join('') || '<div class="muted">まだありません。</div>'}</div>
  </div>`;
}

function viewEdit() {
  const f = ui.form; if (!f) { ui.view = 'list'; return viewList(); }
  const isNew = !byId(f.id);
  const inp = (k, label, ph = '', type = 'text') => `<div class="field"><label for="f-${k}">${label}</label><input id="f-${k}" data-f="${k}" type="${type}" value="${esc(f[k])}" placeholder="${esc(ph)}" ${type === 'number' ? 'inputmode="numeric" min="0"' : ''}></div>`;
  const area = (k, label, ph = '') => `<div class="field"><label for="f-${k}">${label}</label><textarea id="f-${k}" data-f="${k}" placeholder="${esc(ph)}">${esc(f[k])}</textarea></div>`;
  const seg = (k, opts) => `<div class="seg">${opts.map(o => `<button type="button" data-seg="${k}" data-v="${esc(o)}" class="${f[k] === o ? 'on' : ''}">${esc(o)}</button>`).join('')}</div>`;
  return `
  <h2>${isNew ? '会場を追加' : '会場の情報を直す'}</h2>
  <div class="card"><h2>名前と場所</h2>
    ${inp('name', '会場の名前（必ず）', '例: 品川')}
    <div class="row2">${inp('area', '地域', '例: 東京都品川区')}${inp('station', '最寄り駅', '例: JR 品川駅 港南口 徒歩5分')}</div>
    ${inp('address', '住所', '例: 東京都港区港南2-…')}
    ${area('access', '行き方・入り口', '例: 1階のコンビニ横のエレベーターで3階')}
    ${inp('size', '広さ・定員', '例: 20畳・15人まで')}
  </div>
  <div class="card"><h2>🚻 お手洗いの場所（お客様へのご案内）</h2>
    ${area('toilet', '部屋からの道順（お客様にそのまま見せる文）', '例: お部屋を出て右へ。突き当たりを左に曲がった奥にあります。')}
    ${inp('toiletMore', 'ひとこと（あれば）', '例: 男女別・車いす用あり／鍵は不要／混みあうので 2階もどうぞ')}
  </div>
  <div class="card"><h2>連絡先と予約</h2>
    <div class="row2">${inp('contact', '担当の方', '例: 田中様（管理人）')}${inp('tel', '電話', '例: 03-1234-5678', 'tel')}</div>
    <div class="row2">${inp('mail', 'メール・LINE', '')}${inp('web', 'ホームページ・予約サイト', 'https://…', 'url')}</div>
    <div class="row2">${inp('bookHow', '予約のしかた', '例: 電話で2か月前から')}${inp('bookDeadline', '予約の締め切り', '例: 使う日の1週間前まで')}</div>
  </div>
  <div class="card"><h2>会場代と時間</h2>
    <div class="row2">${inp('fee', '会場代（円）', '例: 3000', 'number')}<div class="field"><label>単位</label>${seg('feeUnit', FEE_UNITS)}</div></div>
    <div class="row2"><div class="field"><label>払い方</label>${seg('payHow', PAY_HOWS)}</div><div class="field"><label>払うとき</label>${seg('payWhen', PAY_WHENS)}</div></div>
    ${inp('cancel', 'キャンセルの決まり', '例: 3日前から全額')}
    <div class="row3">${inp('openIn', '入れる時間', '例: 9:00')}${inp('closeOut', '出る時間', '例: 18:00')}${inp('usual', 'いつもの開催', '例: 第1・第3木曜')}</div>
  </div>
  <div class="card"><h2>設備</h2>
    <div class="eqedit">${EQUIP.map(([k, l]) => {
      const e = f.equip[k] || {};
      return `<div class="eqname">${l}</div><div class="eqctl">
        <div class="seg">${['あり', 'なし', '未確認'].map(o => `<button type="button" data-eq="${k}" data-v="${o}" class="${(e.has || '未確認') === o ? 'on' : ''}">${o}</button>`).join('')}</div>
        <input data-eqnote="${k}" value="${esc(e.note || '')}" placeholder="メモ（例: 2口・壁の右側）"></div>`;
    }).join('')}</div>
  </div>
  <div class="card"><h2>この会場だけの持ち物</h2>
    <div class="field"><textarea id="f-items" data-items placeholder="1行に1つ（例: 鍵・入館証）">${esc((f.items || []).join('\n'))}</textarea>
    <div class="hint">どの会場でも持っていく物は「設定」→「いつもの持ち物」に入れます。</div></div>
  </div>
  <div class="card"><h2>気をつけること</h2>
    ${area('notes', '', '例: 鍵は管理人室で受け取る／ゴミは持ち帰り／17:45 までに片付け')}
    <label style="display:flex;gap:10px;align-items:center"><input type="checkbox" id="f-off" style="width:24px;min-height:24px" ${f.off ? 'checked' : ''}> 今は使っていない会場にする（一覧に出さない）</label>
  </div>
  ${isNew ? '' : '<div class="btns" style="margin-bottom:14px"><button class="btn danger" data-act="delete">この会場を消す</button></div>'}
  <div class="sticky-save"><button class="btn" data-act="cancel">やめる</button><button class="btn primary" data-act="save">保存する</button></div>`;
}

// ---------- 打ち合わせ ----------
function openTodos(v) {
  const out = [];
  (v.meets || []).forEach(m => (m.todos || []).forEach((t, i) => { if (!t.done && t.t) out.push({ m, t, i }); }));
  return out.sort((a, b) => (a.t.due || '9999').localeCompare(b.t.due || '9999'));
}
function meetCard(v) {
  const ms = [...(v.meets || [])].sort((a, b) => b.date.localeCompare(a.date));
  const todos = openTodos(v);
  const nexts = ms.map(m => m.next).filter(d => d && d >= today()).sort();
  const firstLine = s => String(s || '').split('\n').find(x => x.trim()) || '';
  return `<div class="card"><h2>🤝 打ち合わせ</h2>
    ${nexts.length ? `<div style="margin-bottom:8px"><span class="tag ok">次の打ち合わせ ${esc(jdate(nexts[0]))}</span></div>` : ''}
    <div class="btns" style="margin-bottom:12px"><button class="btn primary" data-act="meetnew">＋ 打ち合わせを記録</button><button class="btn" data-act="printblank">🖨 白紙のシートを印刷</button></div>
    ${todos.length ? `<div class="small muted" style="margin:4px 0 6px">まだ終わっていない宿題（押すと「終わった」になります）</div>
      <div class="checks" style="margin-bottom:12px">${todos.map(o => `<button class="ck" data-todo="${o.m.id}:${o.i}"><span class="box"></span><span class="t">${esc(o.t.t)}<br><span class="small muted">${esc(o.t.who || '')}${o.t.due ? '・' + esc(jdate(o.t.due)) + 'まで' : ''}${o.t.due && o.t.due < today() ? ' <b style="color:var(--out)">期限すぎ</b>' : ''}</span></span></button>`).join('')}</div>` : ''}
    <div class="days">${ms.map(m => `<div class="d"><span>${esc(jdate(m.date))}<br><span class="small muted">${esc(m.how || '')}</span></span>
      <span class="m"><button class="linkish" data-meet="${m.id}">${esc(firstLine(m.decided) || '（決まったことは未記入）')}</button>${m.them ? `<br><span class="small muted">先方: ${esc(m.them)}</span>` : ''}</span>
      <span class="mbtns"><button data-mprint="${m.id}">印刷</button><button data-mcopy="${m.id}">コピー</button></span></div>`).join('') || '<div class="muted">まだ記録はありません。打ち合わせの前に「＋ 打ち合わせを記録」を開くと、確認することの一覧として使えます。</div>'}</div>
  </div>`;
}
function blankMeet(v) {
  return { id: uid(), date: today(), time: '', how: '会って', them: v.contact || '', us: '', agenda: {}, decided: '', todos: [], next: '' };
}
function viewMeet() {
  const v = byId(ui.id), m = ui.mform; if (!v || !m) { ui.view = 'list'; return viewList(); }
  const isNew = !(v.meets || []).some(x => x.id === m.id);
  const val = k => esc(m[k] || '');
  const okN = MEET_ITEMS.filter(([k]) => (m.agenda[k] || {}).ok).length;
  return `
  <h2>${esc(v.name)} の打ち合わせ${isNew ? '（新しく記録）' : ''}</h2>
  <div class="card">
    <div class="row3"><div class="field"><label>日にち</label><input type="date" data-m="date" value="${val('date')}"></div>
      <div class="field"><label>時間</label><input data-m="time" value="${val('time')}" placeholder="例: 10:00〜10:30"></div>
      <div class="field"><label>次の打ち合わせ</label><input type="date" data-m="next" value="${val('next')}"></div></div>
    <div class="field"><label>どうやって</label><div class="seg">${MEET_HOWS.map(o => `<button type="button" data-mhow="${o}" class="${m.how === o ? 'on' : ''}">${o}</button>`).join('')}</div></div>
    <div class="row2"><div class="field"><label>先方の方</label><input data-m="them" value="${val('them')}" placeholder="例: 田中様（管理人）"></div>
      <div class="field"><label>こちら</label><input data-m="us" value="${val('us')}" placeholder="例: 鶴岡"></div></div>
  </div>
  <div class="card"><h2>確認すること <span class="small muted">（${okN} / ${MEET_ITEMS.length} 確認した）</span></h2>
    <div class="small muted" style="margin-bottom:8px">「今の情報」は、この会場の画面に入っている内容です。違っていたら、あとで「直す」で直してください。</div>
    <div class="agenda">${MEET_ITEMS.map(([k, l, f]) => {
      const a = m.agenda[k] || {}, cur = f(v);
      return `<div class="ag ${a.ok ? 'on' : ''}"><button type="button" class="agok" data-mok="${k}"><span class="box">${a.ok ? '✓' : ''}</span></button>
        <div class="agb"><div class="agl">${l}</div>${cur ? `<div class="small muted">今の情報: ${esc(cur)}</div>` : ''}
        <input data-mmemo="${k}" value="${esc(a.memo || '')}" placeholder="聞いたこと・決めたこと"></div></div>`;
    }).join('')}</div>
  </div>
  <div class="card"><h2>決まったこと</h2>
    <div class="field"><textarea data-m="decided" placeholder="例: 12月から第2木曜も使える／机は6台まで／会場代は月末に振込">${val('decided')}</textarea></div>
  </div>
  <div class="card"><h2>宿題（やること）</h2>
    ${(m.todos || []).map((t, i) => `<div class="todo">
      <input data-tt="${i}" value="${esc(t.t || '')}" placeholder="例: 机の配置図を送る">
      <div class="seg">${['こちら', '先方'].map(o => `<button type="button" data-tw="${i}" data-v="${o}" class="${t.who === o ? 'on' : ''}">${o}</button>`).join('')}</div>
      <input type="date" data-td="${i}" value="${esc(t.due || '')}">
      <button type="button" class="btn" data-tdone="${i}">${t.done ? '✓ 済み' : '未'}</button>
      <button type="button" class="btn danger" data-tdel="${i}">✕</button></div>`).join('') || '<div class="muted small" style="margin-bottom:8px">まだありません。</div>'}
    <div class="btns"><button class="btn" data-act="todoadd">＋ 宿題を足す</button></div>
  </div>
  ${isNew ? '' : '<div class="btns" style="margin-bottom:14px"><button class="btn danger" data-act="meetdel">この打ち合わせを消す</button></div>'}
  <div class="sticky-save"><button class="btn" data-act="meetcancel">やめる</button><button class="btn" data-act="meetprint">🖨 印刷</button><button class="btn primary" data-act="meetsave">保存する</button></div>`;
}
function meetText(v, m) {
  const lines = [`【${v.name} 打ち合わせ ${jdate(m.date)}${m.time ? ' ' + m.time : ''}】`];
  const ag = MEET_ITEMS.filter(([k]) => (m.agenda[k] || {}).memo).map(([k, l]) => `・${l}: ${m.agenda[k].memo}`);
  if (ag.length) lines.push('', '■ 確認したこと', ...ag);
  if (m.decided) lines.push('', '■ 決まったこと', m.decided);
  const td = (m.todos || []).filter(t => t.t);
  if (td.length) lines.push('', '■ 宿題', ...td.map(t => `・${t.t}（${t.who || '?'}${t.due ? '・' + jdate(t.due) + 'まで' : ''}）${t.done ? ' 済' : ''}`));
  if (m.next) lines.push('', `■ 次回: ${jdate(m.next)}`);
  return lines.join('\n');
}
// 印刷用の用紙（m が無ければ白紙。会場の名前と今の情報は入れておく）
function printSheet(v, m) {
  const blankM = !m; m = m || { agenda: {}, todos: [] };
  const box = c => `<span class="pbox">${c ? '✓' : ''}</span>`;
  const todos = [...(m.todos || []).filter(t => t.t)];
  while (todos.length < (blankM ? 6 : 3)) todos.push({});
  if (!blankM) todos.push({}, {});
  let el = document.getElementById('printarea');
  if (!el) { el = document.createElement('div'); el.id = 'printarea'; document.body.appendChild(el); }
  el.innerHTML = `<div class="psheet">
    <div class="ptitle">打ち合わせシート</div>
    <table class="ptbl phead"><tr><th>会場</th><td>${esc(v.name)}</td><th>日にち</th><td>${m.date ? esc(jdate(m.date)) + ' ' + esc(m.time || '') : '　　年　　月　　日（　）　　：　　〜　　：'}</td></tr>
      <tr><th>先方の方</th><td>${esc(m.them || (blankM ? v.contact : '') || '')}</td><th>こちら</th><td>${esc(m.us || '')}</td></tr>
      <tr><th>どうやって</th><td colspan="3">${MEET_HOWS.map(o => `${box(m.how === o && !blankM)} ${o}`).join('　')}</td></tr></table>
    <div class="psec">確認すること</div>
    <table class="ptbl pag"><tr><th style="width:2.2em">済</th><th style="width:30%">項目</th><th style="width:25%">今の情報</th><th>聞いたこと・決めたこと</th></tr>
      ${MEET_ITEMS.map(([k, l, f]) => `<tr><td class="c">${box((m.agenda[k] || {}).ok)}</td><td>${l}</td><td class="pcur">${esc(f(v))}</td><td>${esc((m.agenda[k] || {}).memo || '')}</td></tr>`).join('')}</table>
    <div class="psec">決まったこと</div>
    <div class="pfree">${esc(m.decided || '')}</div>
    <div class="psec">宿題</div>
    <table class="ptbl"><tr><th>やること</th><th style="width:16%">だれ</th><th style="width:22%">いつまで</th><th style="width:2.2em">済</th></tr>
      ${todos.map(t => `<tr><td>${esc(t.t || '')}</td><td>${esc(t.who || '')}</td><td>${t.due ? esc(jdate(t.due)) : ''}</td><td class="c">${box(t.done)}</td></tr>`).join('')}</table>
    <table class="ptbl" style="margin-top:10px"><tr><th style="width:9em">次の打ち合わせ</th><td>${m.next ? esc(jdate(m.next)) : '　　年　　月　　日（　）'}</td></tr></table>
  </div>`;
  setTimeout(() => window.print(), 50);
}

function viewSettings() {
  const n = state.venues.length;
  return `
  <div class="card"><h2>いつもの持ち物</h2>
    <div class="small muted" style="margin-bottom:8px">どの会場でも持っていく物。1行に1つ。会場の画面の「持ち物チェック」に出ます。</div>
    <div class="field"><textarea id="s-items" style="min-height:220px">${esc(state.items.join('\n'))}</textarea></div>
    <div class="btns"><button class="btn primary" data-act="itemsave">持ち物を保存</button></div>
  </div>
  <div class="card"><h2>バックアップ</h2>
    <p class="small">会場の情報（${n} 件）はこの iPad の中にだけ保存されています。故障や買い替えに備えて、ときどき保存してください。保存先には「ファイル」や Dropbox を選べます。
    ${state.lastBackup ? `<br>前回の保存: ${esc(new Date(state.lastBackup).toLocaleString('ja-JP'))}` : '<br><b>まだ一度も保存していません。</b>'}</p>
    <div class="btns">
      <button class="btn primary" data-act="export">バックアップを保存</button>
      <button class="btn" data-act="import">バックアップから戻す</button>
      <input type="file" id="s-file" accept=".json,application/json" hidden>
    </div>
  </div>
  <div class="card"><h2>版（ver ${APP_VERSION}）</h2>
    <div class="btns" style="margin-bottom:10px"><button class="btn" data-act="update">新しい版を確認する</button></div>
    <ul class="hist small">${HISTORY.slice().reverse().map(([v, d, t]) => `<li><b>ver ${v}</b>（${d}）${esc(t)}</li>`).join('')}</ul>
  </div>`;
}

// ---------- 操作 ----------
function startEdit(v) { ui.form = JSON.parse(JSON.stringify(v)); ui.form.equip = ui.form.equip || {}; go('edit'); }
function commitForm() {
  const f = ui.form;
  f.name = f.name.trim();
  if (!f.name) { alert('会場の名前を入れてください。'); document.getElementById('f-name').focus(); return; }
  if (state.venues.some(v => v.id !== f.id && v.name === f.name)) { alert(`「${f.name}」はもうあります。別の名前にしてください。`); return; }
  f.fee = String(f.fee).trim() === '' ? '' : Math.max(0, Math.round(Number(f.fee) || 0));
  f.updated = Date.now();
  const i = state.venues.findIndex(v => v.id === f.id);
  if (i >= 0) state.venues[i] = f; else state.venues.push(f);
  if (!save()) return;
  ui.form = null; toast('保存しました'); go('venue', f.id);
}

document.addEventListener('click', e => {
  const t = e.target.closest('button, a'); if (!t) return;
  const d = t.dataset;
  if (d.go) { go(d.go); return; }
  if (d.open) { go('venue', d.open); return; }
  if (d.seg) { ui.form[d.seg] = ui.form[d.seg] === d.v ? '' : d.v; t.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t && ui.form[d.seg] === d.v)); return; }
  if (d.eq) { const e2 = ui.form.equip[d.eq] = ui.form.equip[d.eq] || {}; e2.has = d.v === '未確認' ? '' : d.v; t.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t)); return; }
  if (d.ck !== undefined) {
    const v = byId(ui.id), items = [...state.items, ...(v.items || [])], it = items[+d.ck];
    let ck = state.checks[v.id]; if (!ck || ck.date !== today()) ck = state.checks[v.id] = { date: today(), done: [] };
    ck.done = ck.done.includes(it) ? ck.done.filter(x => x !== it) : [...ck.done, it];
    save(); render(); return;
  }
  if (d.daydel !== undefined) {
    const v = byId(ui.id), day = v.days[+d.daydel];
    if (!confirm(`${jdate(day.date)} のメモを消しますか？\n${day.memo || ''}`)) return;
    v.days.splice(+d.daydel, 1); save(); render(); return;
  }
  if (d.meet) { const v = byId(ui.id); ui.mform = JSON.parse(JSON.stringify(v.meets.find(m => m.id === d.meet))); ui.mform.agenda = ui.mform.agenda || {}; ui.mform.todos = ui.mform.todos || []; go('meet'); return; }
  if (d.mprint) { const v = byId(ui.id); printSheet(v, v.meets.find(m => m.id === d.mprint)); return; }
  if (d.mcopy) { const v = byId(ui.id); copyText(meetText(v, v.meets.find(m => m.id === d.mcopy))); return; }
  if (d.todo) {
    const [mid, i] = d.todo.split(':'), v = byId(ui.id), m = v.meets.find(x => x.id === mid);
    if (m && m.todos[+i]) { m.todos[+i].done = true; v.updated = Date.now(); save(); render(); toast('宿題を「終わった」にしました'); }
    return;
  }
  if (ui.mform && ui.view === 'meet') {
    const m = ui.mform;
    if (d.mhow) { m.how = m.how === d.mhow ? '' : d.mhow; render(); return; }
    if (d.mok) { const a = m.agenda[d.mok] = m.agenda[d.mok] || {}; a.ok = !a.ok; render(); return; }
    if (d.tw !== undefined) { const t = m.todos[+d.tw]; t.who = t.who === d.v ? '' : d.v; render(); return; }
    if (d.tdone !== undefined) { const t = m.todos[+d.tdone]; t.done = !t.done; render(); return; }
    if (d.tdel !== undefined) { m.todos.splice(+d.tdel, 1); render(); return; }
  }
  const act = d.act; if (!act) return;
  if (act === 'new') { const v = blank(); v.items = []; startEdit(v); }
  else if (act === 'toggleoff') { ui.showOff = !ui.showOff; render(); }
  else if (act === 'edit') {
    startEdit(byId(ui.id));
    if (d.focus) { const el = document.getElementById('f-' + d.focus); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } }
  }
  else if (act === 'cancel') { const id = ui.form.id; ui.form = null; byId(id) ? go('venue', id) : go('list'); }
  else if (act === 'save') commitForm();
  else if (act === 'delete') {
    const f = ui.form;
    if (!confirm(`「${f.name}」を消しますか？\n設備・持ち物・開催日のメモ・打ち合わせの記録もすべて消えます。\n（使わなくなっただけなら「今は使っていない会場にする」がおすすめです）`)) return;
    state.venues = state.venues.filter(v => v.id !== f.id); delete state.checks[f.id];
    save(); ui.form = null; toast('消しました'); go('list');
  }
  else if (act === 'show') showGuide(byId(ui.id));
  else if (act === 'closeshow') document.getElementById('bigshow')?.remove();
  else if (act === 'copyguide') {
    const v = byId(ui.id);
    copyText(`【${v.name} お手洗いのご案内】\n${v.toilet}${v.toiletMore ? '\n' + v.toiletMore : ''}`);
  }
  else if (act === 'meetnew') { ui.mform = blankMeet(byId(ui.id)); go('meet'); }
  else if (act === 'printblank') printSheet(byId(ui.id), null);
  else if (act === 'todoadd') { ui.mform.todos.push({ t: '', who: 'こちら', due: '', done: false }); render(); const ins = document.querySelectorAll('[data-tt]'); if (ins.length) ins[ins.length - 1].focus(); }
  else if (act === 'meetcancel') { ui.mform = null; go('venue'); }
  else if (act === 'meetprint') printSheet(byId(ui.id), ui.mform);
  else if (act === 'meetsave') {
    const v = byId(ui.id), m = ui.mform;
    if (!m.date) return alert('日にちを入れてください。');
    m.todos = (m.todos || []).filter(t => String(t.t || '').trim());
    v.meets = v.meets || [];
    const i = v.meets.findIndex(x => x.id === m.id);
    if (i >= 0) v.meets[i] = m; else v.meets.push(m);
    v.updated = Date.now();
    if (!save()) return;
    ui.mform = null; toast('打ち合わせを保存しました'); go('venue');
  }
  else if (act === 'meetdel') {
    const v = byId(ui.id), m = ui.mform;
    if (!confirm(`${jdate(m.date)} の打ち合わせの記録を消しますか？`)) return;
    v.meets = (v.meets || []).filter(x => x.id !== m.id); save(); ui.mform = null; toast('消しました'); go('venue');
  }
  else if (act === 'ckreset') { delete state.checks[ui.id]; save(); render(); }
  else if (act === 'dayadd') {
    const date = document.getElementById('d-date').value, memo = document.getElementById('d-memo').value.trim();
    if (!date) return alert('日付を入れてください。');
    const v = byId(ui.id); v.days = v.days || []; v.days.push({ date, memo }); v.updated = Date.now();
    save(); render(); toast('メモを追加しました');
  }
  else if (act === 'itemsave') {
    state.items = document.getElementById('s-items').value.split('\n').map(s => s.trim()).filter(Boolean);
    save(); render(); toast('いつもの持ち物を保存しました');
  }
  else if (act === 'export') exportBackup();
  else if (act === 'import') document.getElementById('s-file').click();
  else if (act === 'update') checkUpdate();
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') {
    ui.q = t.value; const pos = t.selectionStart; render();
    const q = document.getElementById('q'); q.focus(); q.setSelectionRange(pos, pos); return;
  }
  if (ui.mform && ui.view === 'meet') {
    const m = ui.mform;
    if (t.dataset.m) m[t.dataset.m] = t.value;
    else if (t.dataset.mmemo) { const a = m.agenda[t.dataset.mmemo] = m.agenda[t.dataset.mmemo] || {}; a.memo = t.value; }
    else if (t.dataset.tt !== undefined) m.todos[+t.dataset.tt].t = t.value;
    else if (t.dataset.td !== undefined) m.todos[+t.dataset.td].due = t.value;
    return;
  }
  if (!ui.form) return;
  if (t.dataset.f) ui.form[t.dataset.f] = t.value;
  else if (t.dataset.eqnote) { const e2 = ui.form.equip[t.dataset.eqnote] = ui.form.equip[t.dataset.eqnote] || {}; e2.note = t.value; }
  else if (t.dataset.items !== undefined) ui.form.items = t.value.split('\n').map(s => s.trim()).filter(Boolean);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'f-off') ui.form.off = t.checked;
  else if (t.id === 's-file' && t.files[0]) importBackup(t.files[0]);
});

// お客様に iPad を向けて見せる、画面いっぱいの案内（どこを押しても閉じる）
function showGuide(v) {
  const d = document.createElement('div');
  d.id = 'bigshow'; d.className = 'bigshow';
  d.innerHTML = `<button class="bigin" data-act="closeshow">
    <div class="bt">🚻 お手洗い</div>
    <div class="bb">${esc(v.toilet)}</div>
    ${v.toiletMore ? `<div class="bm">${esc(v.toiletMore)}</div>` : ''}
    <div class="bx">画面を押すと閉じます</div></button>`;
  document.body.appendChild(d);
}
function copyText(s) {
  const done = () => toast('コピーしました。LINE に貼りつけてください');
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(s).then(done, () => fallback());
  fallback();
  function fallback() {
    const t = document.createElement('textarea'); t.value = s; document.body.appendChild(t);
    t.select(); try { document.execCommand('copy'); done(); } catch (e) { alert(s); } t.remove();
  }
}

// ---------- バックアップ ----------
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
async function exportBackup() {
  const data = JSON.stringify({ app: 'kaijo', version: APP_VERSION, exported: new Date().toISOString(), state }, null, 1);
  const ok = await download(`会場の情報バックアップ_${stamp()}.json`, data, 'application/json');
  if (ok) { state.lastBackup = Date.now(); save(); render(); toast('バックアップを保存しました'); }
}
function importBackup(file) {
  const r = new FileReader();
  r.onload = () => {
    let data;
    try { data = JSON.parse(r.result); } catch (e) { return alert('このファイルは読み込めませんでした。'); }
    if (!data || data.app !== 'kaijo' || !data.state) return alert('「会場の情報」のバックアップではありません。\n（帳簿のバックアップは帳簿のアプリで戻してください）');
    const n = (data.state.venues || []).length;
    if (!confirm(`${data.exported ? new Date(data.exported).toLocaleString('ja-JP') + ' に保存した' : ''}バックアップ（会場 ${n} 件）に戻しますか？\n今の iPad の内容は、このバックアップに置きかわります。`)) return;
    localStorage.setItem(KEY, JSON.stringify(data.state));
    state = load(); go('list'); toast('バックアップから戻しました');
  };
  r.readAsText(file);
}

// ---------- 起動 ----------
function updateOnline() { document.getElementById('offline').hidden = navigator.onLine; }
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || checkUpdate.reloading) return;
    document.getElementById('newver').hidden = false;
  });
}
async function checkUpdate() {
  if (!navigator.onLine) return alert('Wi-Fi につながっているときに押してください。');
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.update();
      const w = reg.installing || reg.waiting;
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
