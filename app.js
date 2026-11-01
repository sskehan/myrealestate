"use strict";
/* My Real Estate — investment property analyser for Shaun and Lyndsey. Data lives on each phone (IndexedDB) with a shared live copy in Dropbox.
   The numbers all come from engine.js; the starting rules and preloaded properties from data.js. */
const APP_ID = "my-real-estate", APP_VERSION = "1.06", BACKUP_VERSION = 1;

/* ================= storage ================= */
const STORES = ["props", "files", "meta"];
let _db, _quiet = 0;
function openDB() { return new Promise((res, rej) => { const r = indexedDB.open("my-real-estate", 2);
  r.onupgradeneeded = () => { const d = r.result; for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: "id" }); };
  r.onsuccess = () => { _db = r.result; res(_db); }; r.onerror = () => rej(r.error); }); }
function tx(store, mode, fn) { return new Promise((res, rej) => { const t = _db.transaction(store, mode); const os = t.objectStore(store); let out; const r = fn(os); if (r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); }
const dbAll = s => tx(s, "readonly", os => os.getAll());
const dbPut = (s, o) => { if (!_quiet && o && s === "props") o._t = Date.now(); return tx(s, "readwrite", os => os.put(o)).then(r => { if (s === "props" || s === "files") markDirty(); return r; }); };
const DATA_STORES = ["props", "files"]; // changes to these are sent to Dropbox
const dbDel = (s, id) => { if (!_quiet && DATA_STORES.includes(s)) { S.meta.tomb = S.meta.tomb || {}; S.meta.tomb[id] = Date.now(); } return tx(s, "readwrite", os => os.delete(id)).then(r => { if (DATA_STORES.includes(s)) markDirty(); return r; }); };
const dbGet = (s, id) => tx(s, "readonly", os => os.get(id));
const saveMeta = () => tx("meta", "readwrite", os => os.put({ ...S.meta, id: "meta" }));
const uid = p => (p || "x") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ================= state & helpers ================= */
const S = { props: [], meta: {}, urls: {}, tab: "home", open: null, ptab: "report", filter: "all", set: null, wi: null, dutyState: "NSW", cmp: null, editOpen: {} };
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = n => String(n).padStart(2, "0");
const isoOf = d => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
const todayISO = () => isoOf(new Date());
const fmtDate = s => { if (!s) return "—"; const [y, m, d] = String(s).split("-"); return `${+d} ${MON[+m - 1]} ${y}`; };
const N = v => { const n = Number(v); return isFinite(n) ? n : 0; };
function num(v) { if (v == null) return null; const s = String(v).replace(/[,\s$%]/g, ""); if (s === "" || s === "-") return null; const n = Number(s); return isFinite(n) ? n : null; }
const minus = "−";
const money = (n, dp = 0) => n == null || isNaN(n) ? "—" : (n < -0.004 ? minus : "") + "$" + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const smoney = n => n == null || isNaN(n) ? "—" : (n > 0.5 ? "+" : "") + money(n);
const pct = (x, dp = 1) => x == null || isNaN(x) ? "—" : (x * 100).toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp }) + "%";
const pctIn = x => x == null || x === "" ? "" : String(Math.round(N(x) * 100 * 10000) / 10000);
const numIn = x => x == null || x === "" ? "" : String(Math.round(N(x) * 100) / 100);
const wk = n => money(n) + "/wk";
const cls = n => n > 0.5 ? "pos" : n < -0.5 ? "neg" : "";
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 3600); }
const cap1 = t => t ? t[0].toUpperCase() + t.slice(1) : t;
const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];
const TYPES = ["Unit", "Townhouse", "Villa", "Duplex", "House", "House & land", "Land", "Other"];
const STATUS = { owned: "Owned", looking: "Looking", passed: "Passed" };
const fyOf = Engine.fyOf;

/* settings = built-in defaults (data.js) overlaid with what's been changed on this phone / in Dropbox */
function SET() { const s = S.meta.settings || {}; const d = SEED.SETTINGS; return { ...d, ...s, defaults: { ...d.defaults, ...(s.defaults || {}) } }; }
async function saveSettings(s) { s._t = Date.now(); S.meta.settings = s; await saveMeta(); markDirty(); }
function editSettings(fn) { const s = clone(SET()); fn(s); return saveSettings(s); }
const people = () => SET().people || [];
const pName = id => (people().find(p => p.id === id) || {}).name || "—";
const ctx = () => { const s = SET(); return { taxYears: s.taxYears, duty: s.duty, lmi: s.lmi, people: s.people, borrowYears: s.borrowYears }; };
const getP = id => S.props.find(p => p.id === id);
/* ---- annual rules check: from 1 July each year until someone marks that financial year's figures as checked ---- */
const curFy = () => fyOf(todayISO());
const checkDue = () => SET().rulesCheckedFY !== curFy();
const missingYear = () => !SET().taxYears[curFy()];
const addrOf = p => [p.street, [p.suburb, p.state, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
const resCache = new Map();
function result(p) { const key = p.id + ":" + (p._t || 0) + ":" + ((S.meta.settings || {})._t || 0); let r = resCache.get(key); if (!r) { r = Engine.run(p, ctx()); resCache.set(key, r); } return r; }

/* ================= icons ================= */
const ic = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  home: ic('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  bolt: ic('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  cmp: ic('<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>'),
  cog: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  back: ic('<path d="M15 18l-6-6 6-6"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
  wifi: ic('<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>'),
  doc: ic('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  copy: ic('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  trash: ic('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  chev: ic('<path d="M9 6l6 6-6 6"/>')
};
const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#b4532a"/><path d="M14 31 32 16l18 15" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 30v18h26V30" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M25 43l6-6 4 4 7-8" fill="none" stroke="#ffd7c2" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ================= shell ================= */
function render() {
  const sy = S._keepScroll ? scrollY : 0; S._keepScroll = false;
  renderTop(); renderTabs();
  const v = $("#view");
  if (S.open && getP(S.open)) v.innerHTML = viewProperty(getP(S.open));
  else { S.open = null; v.innerHTML = S.tab === "quick" ? viewQuick() : S.tab === "compare" ? viewCompare() : S.tab === "settings" ? viewSettings() : viewHome(); }
  scrollTo(0, sy); paintStatus(); paintPhotos();
  if (S.open && S.ptab === "whatif") paintWhatIf();
  if (!S.open && S.tab === "quick") paintQuick();
}
function renderTop() {
  const p = S.open && getP(S.open), sub = !p && S.tab === "settings" && S.set;
  $("#topbar").innerHTML = (p ? `<button type="button" class="back" data-act="close">${IC.back}<span>Properties</span></button>`
    : sub ? `<button type="button" class="back" data-act="setBack">${IC.back}<span>Settings</span></button>`
    : `<button type="button" class="brand" data-act="goHome">${LOGO}<b>My Real Estate</b></button>`) + `<button type="button" class="sync" id="sync" data-act="goBackup"></button>`;
}
function renderTabs() {
  const t = [["home", "Properties", IC.home], ["quick", "Quick check", IC.bolt], ["compare", "Compare", IC.cmp], ["settings", "Settings", IC.cog]];
  $("#tabs").innerHTML = t.map(([k, l, i]) => `<button type="button" data-act="tab" data-tab="${k}" ${!S.open && S.tab === k ? 'aria-current="page"' : ""}>${i}<span>${l}</span></button>`).join("");
}

/* ================= photos (one per property, kept small: longest side 1280 px, JPEG) ================= */
async function photoURL(id) { if (!id) return null; if (S.urls[id]) return S.urls[id]; const f = await dbGet("files", id); if (!f || !f.blob) return null; return (S.urls[id] = URL.createObjectURL(f.blob)); }
function paintPhotos() { for (const img of $$("img[data-photo]")) photoURL(img.dataset.photo).then(u => { if (u) { img.src = u; img.closest(".ph")?.classList.add("has"); } }); }
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  const src = bmp || await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const w = src.width, h = src.height, sc = Math.min(1, 1280 / Math.max(w, h)), c = document.createElement("canvas");
  c.width = Math.round(w * sc); c.height = Math.round(h * sc); c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return await new Promise(res => c.toBlob(res, "image/jpeg", 0.82));
}
async function setPhoto(p, file) {
  const blob = await shrinkImage(file); if (!blob) throw new Error("couldn't read that picture");
  const id = uid("ph"), old = p.photo;
  await dbPut("files", { id, type: "image/jpeg", blob });
  p.photo = id; await saveProp(p);
  if (old) { await dbDel("files", old); if (S.urls[old]) { URL.revokeObjectURL(S.urls[old]); delete S.urls[old]; } }
}
async function copyPhoto(c) { if (!c.photo) return; const f = await dbGet("files", c.photo); if (!f) { c.photo = null; return; } const id = uid("ph"); await dbPut("files", { id, type: f.type, blob: f.blob }); c.photo = id; }
async function removePhoto(p) { const old = p.photo; if (!old) return; p.photo = null; await saveProp(p); await dbDel("files", old); if (S.urls[old]) { URL.revokeObjectURL(S.urls[old]); delete S.urls[old]; } }
const photoBox = (p, cls) => p.photo ? `<div class="ph ${cls || ""}"><img data-photo="${esc(p.photo)}" alt="Photo of ${esc(p.name)}"></div>` : "";

/* ================= home ================= */
function viewHome() {
  const ps = S.props.slice().sort((a, b) => ({ owned: 0, looking: 1, passed: 2 }[a.status] ?? 3) - ({ owned: 0, looking: 1, passed: 2 }[b.status] ?? 3) || String(a.name).localeCompare(b.name));
  const owned = ps.filter(p => p.status === "owned");
  let port = "";
  if (owned.length) {
    let val = 0, debt = 0, wkly = 0, rent = 0;
    for (const p of owned) { const r = result(p); val += r.y0.value * r.k; debt += r.y0.debt * r.k; wkly += r.summary.weekly1; rent += r.rows[0].rent * r.k; }
    port = `<div class="card"><h2>Our portfolio <span class="sub">${owned.length} owned · our shares</span></h2>
      <div class="tiles"><div class="tile"><small>Value</small><strong>${money(val)}</strong></div><div class="tile"><small>Loans</small><strong>${money(debt)}</strong></div>
      <div class="tile"><small>Equity</small><strong>${money(val - debt)}</strong><em>LVR ${pct(val > 0 ? debt / val : 0)}</em></div>
      <div class="tile"><small>Rent this year</small><strong>${money(rent)}</strong></div>
      <div class="tile"><small>After-tax cash flow, year 1</small><strong class="${cls(wkly)}">${wk(wkly)}</strong></div></div></div>`;
  }
  const f = S.filter, shown = ps.filter(p => f === "all" || p.status === f);
  return `${banners()}${port}
    <div class="row"><button type="button" class="btn primary" data-act="newProp">${IC.plus}New property</button><button type="button" class="btn" data-act="tab" data-tab="quick">${IC.bolt}Quick check</button></div>
    <div class="seg" role="tablist">${[["all", "All"], ["owned", "Owned"], ["looking", "Looking"], ["passed", "Passed"]].map(([k, l]) => `<button type="button" class="${f === k ? "on" : ""}" data-act="filter" data-f="${k}">${l}</button>`).join("")}</div>
    ${shown.length ? shown.map(pcard).join("") : `<div class="card empty">Nothing here yet.</div>`}
    <p class="foot">My Real Estate ${APP_VERSION} · estimates only — check with your accountant before relying on them</p>`;
}
function pcard(p) {
  const r = result(p), s = r.summary, ph = (p.placeholders || []).length;
  return `<button type="button" class="pcard ${p.photo ? "withph" : ""}" data-act="open" data-id="${p.id}">${photoBox(p, "card")}
    <div class="hd"><div class="t"><b>${esc(p.name)}</b><span class="addr">${esc(addrOf(p) || "No address yet")}</span></div>
      <div class="row" style="gap:4px;justify-content:flex-end">${ph ? `<span class="chip warn">${ph} to confirm</span>` : ""}<span class="chip ${p.status}">${STATUS[p.status] || "—"}</span></div></div>
    <div class="nums"><div><small>${p.status === "owned" ? "Value" : "Price"}</small><strong>${money(p.status === "owned" ? r.setup.value : r.setup.price)}</strong></div>
      <div><small>Rent</small><strong>${r.income ? money(N(p.rent && p.rent.pw)) + "/wk" : "None"}</strong></div>
      <div><small>After tax, yr 1</small><strong class="${cls(s.weekly1)}">${r.income || s.weekly1 ? wk(s.weekly1) : "—"}</strong></div>
      <div><small>${r.k < 0.999 ? "Our share" : "Equity yr 10"}</small><strong>${r.k < 0.999 ? pct(r.k, 0) : money(s.equity10)}</strong></div></div></button>`;
}
function annualBanner() {
  if (!checkDue()) return "";
  return `<div class="banner alert" role="alert"><span><b>New financial year (${esc(curFy())}) — check your figures.</b> Tax rates, stamp duty, interest rates, rents and costs may have changed${missingYear() ? `, and there are no ${esc(curFy())} tax rates yet` : ""}.</span><button type="button" class="btn sm" data-act="goCheck">Check</button></div>`;
}
function banners() {
  const out = [annualBanner()], m = S.meta;
  if (m.conflict) out.push(`<div class="banner bad"><span>Dropbox has a different copy from this phone. Choose which one to keep.</span><button type="button" class="btn sm" data-act="goBackup">Choose</button></div>`);
  else if (!dbxOn()) out.push(`<div class="banner info"><span>Your properties are only on this phone. Connect Dropbox to keep them safe and share them with Lyndsey's phone.</span><button type="button" class="btn sm" data-act="goBackup">Set up</button></div>`);
  if (!m.me) out.push(`<div class="banner info"><span>Whose phone is this?</span>${people().filter(p => p.household).map(p => `<button type="button" class="btn sm" data-act="setMe" data-id="${p.id}">${esc(p.name)}</button>`).join("")}</div>`);
  return out.join("");
}

/* ================= property page ================= */
function viewProperty(p) {
  const tabs = [["report", "Report"], ["whatif", "What-If"], ["edit", "Edit"]];
  const ph = p.placeholders || [];
  return `${photoBox(p, "hero")}<div class="card" style="gap:6px"><div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap">
      <div style="min-width:0"><h2 style="font-size:20px">${esc(p.name)}</h2><div class="small muted">${esc(addrOf(p) || "No address yet")}</div></div>
      <span class="chip ${p.status}">${STATUS[p.status] || "—"}</span></div>
      <div class="small muted">${esc([p.type, p.beds ? p.beds + " bed" : "", p.baths ? p.baths + " bath" : "", p.parking].filter(Boolean).join(" · "))}${p.purchaseDate ? " · bought " + fmtDate(p.purchaseDate) : ""}</div>
      ${ph.length && S.ptab !== "edit" ? `<div class="banner" style="margin-top:6px"><span><b>${ph.length} figure${ph.length === 1 ? "" : "s"} still to confirm</b> — ${esc(ph.slice(0, 3).join("; "))}${ph.length > 3 ? "…" : ""}</span><button type="button" class="btn sm" data-act="ptab" data-t="edit">Edit</button></div>` : ""}</div>
    <div class="subtabs"><div class="seg">${tabs.map(([k, l]) => `<button type="button" class="${S.ptab === k ? "on" : ""}" data-act="ptab" data-t="${k}">${l}</button>`).join("")}</div></div>
    ${S.ptab === "whatif" ? viewWhatIf(p) : S.ptab === "edit" ? viewEdit(p) : viewReport(p)}`;
}

/* ---------- report ---------- */
function viewReport(p) {
  const r = result(p), s = r.summary, st = r.setup, k = r.k, rows = r.rows;
  const shareNote = k < 0.999 ? `<div class="banner info"><span>Dollar figures are <b>your ${pct(k, 1)} share</b>. LVR and yields are for the whole property.</span></div>` : "";
  const notInc = !r.income ? `<div class="banner info"><span>Not income-producing: no rent deductions or tax refunds are worked out. The report shows value growth and your share of the equity and costs.</span></div>` : "";
  const inherited = rows.filter(x => x.rulesInherited).map(x => x.fy);
  const tiles = `<div class="tiles">
    <div class="tile"><small>After-tax cash flow, year 1</small><strong class="${cls(s.weekly1)}">${wk(s.weekly1)}</strong><em>${money(rows[0].after)} a year</em></div>
    <div class="tile"><small>Before tax, year 1</small><strong class="${cls(s.pretaxWeekly1)}">${wk(s.pretaxWeekly1)}</strong><em>tax back ${money(rows[0].refund)}</em></div>
    <div class="tile"><small>Cash flow turns positive</small><strong>${r.income ? (s.breakEven ? "Year " + s.breakEven : "Not in 10 yrs") : "—"}</strong><em>after tax</em></div>
    <div class="tile"><small>Equity in year 10</small><strong>${money(s.equity10)}</strong><em>now ${money(r.y0.equity * k)}</em></div>
    <div class="tile"><small>Wealth gained over 10 years</small><strong class="${cls(s.wealth10)}">${money(s.wealth10)}</strong><em>growth + after-tax cash</em></div>
    <div class="tile"><small>Total borrowed</small><strong>${money(st.totalDebt * k)}</strong><em>LVR ${pct(st.lvr)}</em></div></div>`;
  return `${notInc}${shareNote}${tiles}
    <div class="card"><h2>Value, loans and equity</h2>${chartEquity(r)}<div class="legend"><span><i style="background:var(--c3)"></i>Loans</span><span><i style="background:var(--c1)"></i>Equity</span></div></div>
    ${r.income ? `<div class="card"><h2>Cash flow per week</h2>${chartCash(r)}<div class="legend"><span><i style="background:var(--c2)"></i>Before tax</span><span><i style="background:var(--c1)"></i>After tax</span></div></div>` : ""}
    <div class="sechead"><h2>10-year report</h2><span class="xs muted">scroll sideways →</span></div>
    <div class="tablewrap">${reportTable(p, r)}</div>
    ${inherited.length ? `<p class="xs muted" style="margin:0 2px">Tax years ${esc(inherited[0])} onward use the latest rules you have (${esc(rows.find(x => x.rulesInherited).rules)}). Add new years in Settings → Tax &amp; rules when budgets change.</p>` : ""}
    ${setupCard(p, r)}
    <div class="row"><button type="button" class="btn" data-act="pdf">${IC.doc}PDF report</button><button type="button" class="btn" data-act="dup">${IC.copy}Duplicate as scenario</button></div>`;
}
function setupCard(p, r) {
  const st = r.setup, k = r.k;
  const line = (l, v) => `<dt>${esc(l)}</dt><dd>${v}</dd>`;
  return `<div class="card"><h2>Purchase &amp; funding</h2><dl class="kv">
    ${line("Purchase price", money(st.price))}${line("Today's value", money(st.value))}
    ${line("Cash deposit", money(st.cashDep))}${line("Equity deposit", money(st.eqDep))}
    ${st.items.filter(c => N(c.amount)).map(c => line(c.label + (c.fund === "equity" ? " (equity)" : ""), money(c.amount))).join("")}
    ${st.loanItems.filter(c => N(c.amount)).map(c => line(c.label + (c.fund === "equity" ? " (equity)" : ""), money(c.amount))).join("")}
    ${line("Total purchase expenses", "<b>" + money(st.totalPurchaseExpenses) + "</b>")}
    ${line("Cash needed", money(st.cashRequired))}${line("Equity used", money(st.equityUsed))}
    ${line("Main loan", money(st.mainLoan) + (st.mainLoan ? ` · ${pct(N(p.loan.rate), 2)} ${p.loan.type === "PI" ? "P&I" : "I/O"}` : ""))}
    ${st.equityLoan ? line("Equity loan", money(st.equityLoan) + ` · ${pct(p.equityLoan && p.equityLoan.rate !== "" && p.equityLoan.rate != null ? N(p.equityLoan.rate) : N(p.loan.rate), 2)} ${p.equityLoan && p.equityLoan.type === "PI" ? "P&I" : "I/O"}`) : ""}
    ${st.buffer ? line("Loan buffer (in the equity loan)", money(st.buffer)) : ""}
    ${line("Total borrowed / LVR", money(st.totalDebt) + " · " + pct(st.lvr))}
    ${r.owners.length ? line("Owners", r.owners.map(o => esc(pName(o.who)) + " " + pct(o.share, o.share * 100 % 1 ? 1 : 0)).join(", ")) : ""}
    </dl>${k < 0.999 ? `<p class="xs muted" style="margin:0">Purchase figures are for the whole property.</p>` : ""}</div>`;
}
/* the rows of the original workbook's 10 YEAR REPORT, plus the borrowing-cost write-off it used to hide inside total deductions */
function reportRows(r) {
  const k = r.k, M = v => money(v * k), owners = r.rows[0].refunds;
  const R = [
    ["grp", "Property"],
    ["", "Property market value", x => M(x.value), money(r.y0.value * k)],
    ["", "Loans (main + equity)", x => M(x.debt), money(r.y0.debt * k)],
    ["", "LVR (loan to value)", x => pct(x.lvr), pct(r.y0.lvr)],
    ["key", "Equity in property", x => M(x.equity), money(r.y0.equity * k)],
    ["", "Deposit + costs return %", x => pct(x.roc), ""],
    ["", `Available equity @ ${pct(N(r.availLVR || 0.8), 0)}`, x => M(x.avail), money(r.y0.avail * k)],
    ["grp", "Rent"],
    ["key", "Annual rent", x => M(x.rent)],
    ["", "Gross yield on purchase price", x => pct(x.grossYield, 2)],
    ["", "Net yield on purchase price", x => pct(x.netYield, 2)],
    ["", "Yield on debt", x => pct(x.debtYield, 2)],
    ["grp", "Cash deductions"],
    ["", "Interest (incl. equity loan)", x => M(x.interest)],
    ["", "Principal repayments", x => M(x.principal)],
    ["", "Property expenses", x => M(x.expenses)],
    ["key", "Pre-tax cash flow per year", x => `<span class="${cls(x.pretax)}">${M(x.pretax)}</span>`],
    ["", "Pre-tax cash flow per week", x => `<span class="${cls(x.pretax)}">${M(x.pretax / 52)}</span>`],
    ["grp", "Non-cash deductions"],
    ["", "Depreciation", x => M(x.depreciation)],
    ["", "Borrowing costs (written off over 5 yrs)", x => M(x.borrow)],
    ["", "Total deductions", x => M(x.deductions)],
    ["key", "Net profit / (loss) for tax", x => `<span class="${cls(x.net)}">${M(x.net)}</span>`],
    ...owners.map((o, i) => ["", "Tax refund — " + o.name, x => money(x.refunds[i] ? x.refunds[i].amount : 0)]),
    ["key", "After-tax cash flow per year", x => `<span class="${cls(x.after)}">${money(x.after)}</span>`],
    ["key", "After-tax cash flow per week", x => `<span class="${cls(x.after)}">${money(x.after / 52)}</span>`],
    ["grp", "Total net wealth increase"],
    ["", "After-tax cash flow", x => money(x.after)],
    ["", "Capital growth", x => M(x.growth)],
    ["key", "Total (cash flow + growth)", x => `<span class="${cls(x.wealth)}">${money(x.wealth)}</span>`],
    ["grp", "Who pays the costs"],
    ["", "Tenant", x => pct(x.tenant, 0)], ["", "Tax back", x => pct(x.taxBack, 0)], ["", "You", x => pct(x.investor, 0)]
  ];
  return r.income ? R : R.filter(x => !/Gross yield|Net yield|Yield on debt|Tax refund|Who pays|Tenant|Tax back|^You$|Depreciation|Borrowing|deductions|profit/i.test(x[1]));
}
function reportTable(p, r) {
  r.availLVR = p.availLVR;
  const head = `<thead><tr><th>Year</th><th>Today</th>${r.rows.map(x => `<th>Year ${x.y}</th>`).join("")}</tr></thead>`;
  const fy = `<tr class="fy"><td>Tax year / rules</td><td></td>${r.rows.map(x => `<td>${x.fy}${x.rulesInherited ? "*" : ""}</td>`).join("")}</tr>`;
  const body = reportRows(r).map(([c, l, f, t]) => c === "grp" ? `<tr class="grp"><td>${esc(l)}</td><td colspan="${r.rows.length + 1}"></td></tr>`
    : `<tr class="${c}"><td>${esc(l)}</td><td class="today">${t || ""}</td>${r.rows.map(x => `<td>${f(x)}</td>`).join("")}</tr>`).join("");
  return `<table class="rep">${head}<tbody>${fy}${body}</tbody></table>`;
}

/* ---------- charts (plain SVG) ---------- */
function niceMax(v) { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
const short = v => { const a = Math.abs(v), s = v < 0 ? minus : ""; return a >= 1e6 ? s + "$" + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "m" : a >= 1e3 ? s + "$" + Math.round(a / 1e3) + "k" : s + "$" + Math.round(a); };
function chartEquity(r) {
  const k = r.k, pts = [{ y: "Now", debt: r.y0.debt * k, eq: r.y0.equity * k }, ...r.rows.map(x => ({ y: String(x.y), debt: x.debt * k, eq: x.equity * k }))];
  const W = 340, H = 190, L = 44, B = 22, T = 8, max = niceMax(Math.max(...pts.map(p => Math.max(0, p.debt) + Math.max(0, p.eq)))), bw = (W - L - 6) / pts.length;
  const y = v => T + (H - T - B) * (1 - v / max);
  let g = ""; for (let i = 0; i <= 4; i++) { const v = max * i / 4; g += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`; }
  const bars = pts.map((p, i) => { const x = L + 4 + i * bw, w = bw - 5, d = Math.max(0, p.debt), e = Math.max(0, p.eq);
    return `<rect x="${x}" y="${y(d)}" width="${w}" height="${y(0) - y(d)}" fill="var(--c3)" rx="2"><title>${p.y}: loans ${money(p.debt)}</title></rect><rect x="${x}" y="${y(d + e)}" width="${w}" height="${y(d) - y(d + e)}" fill="var(--c1)" rx="2"><title>${p.y}: equity ${money(p.eq)}</title></rect><text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${p.y}</text>`; }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Loans and equity each year">${g}${bars}</svg>`;
}
function chartCash(r) {
  const k = r.k, pts = r.rows.map(x => ({ y: x.y, a: x.pretax * k / 52, b: x.after / 52 }));
  const W = 340, H = 180, L = 44, B = 22, T = 8, hi = Math.max(0, ...pts.map(p => Math.max(p.a, p.b))), lo = Math.min(0, ...pts.map(p => Math.min(p.a, p.b)));
  const span = niceMax(Math.max(hi - lo, 1)), top = hi > 0 ? Math.ceil(hi / (span / 4)) * (span / 4) : 0, bot = top - span;
  const y = v => T + (H - T - B) * (top - v) / (top - bot), bw = (W - L - 6) / pts.length;
  let g = ""; for (let i = 0; i <= 4; i++) { const v = bot + span * i / 4; g += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${Math.abs(v) < 1e-6 ? "var(--ink-3)" : "var(--grid)"}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`; }
  const bars = pts.map((p, i) => { const x = L + 4 + i * bw, w = (bw - 6) / 2;
    const bar = (v, xx, c, t) => `<rect x="${xx}" y="${Math.min(y(v), y(0))}" width="${w}" height="${Math.max(1, Math.abs(y(v) - y(0)))}" fill="${c}" rx="2"><title>Year ${p.y} ${t}: ${wk(v)}</title></rect>`;
    return bar(p.a, x, "var(--c2)", "before tax") + bar(p.b, x + w + 1, "var(--c1)", "after tax") + `<text x="${x + w}" y="${H - 6}" text-anchor="middle">${p.y}</text>`; }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cash flow per week each year">${g}${bars}</svg>`;
}

/* ---------- What-If ---------- */
function wiBase(p) { return { pw: N(p.rent && p.rent.pw), rate: N(p.loan && p.loan.rate), vacant: N(p.rent && p.rent.vacant), capital: N(p.growth && p.growth.capital), rentGrowth: N(p.growth && p.growth.rent), price: N(p.price) }; }
function viewWhatIf(p) {
  if (!S.wi || S.wi.pid !== p.id) S.wi = { pid: p.id, ...wiBase(p) };
  const b = wiBase(p), w = S.wi, r = result(p);
  if (!r.income) return `<div class="card empty">What-If works on rent and interest. This property isn't income-producing — set it as rented in Edit to use it.</div>`;
  const sl = (key, label, min, max, step, fmt) => `<div class="slider"><div class="top2"><label for="wi-${key}">${label}</label><output id="wo-${key}">${fmt(w[key])}</output></div>
    <input type="range" id="wi-${key}" data-wi="${key}" min="${min}" max="${max}" step="${step}" value="${w[key]}"><span class="xs muted">Saved: ${fmt(b[key])}</span></div>`;
  const pwMax = Math.max(200, Math.round(b.pw * 1.6 / 10) * 10), fP = v => pct(v, 2), fW = v => money(v) + "/wk";
  return `<div class="card"><h2>Change the numbers</h2>
    ${sl("pw", "Rent per week", Math.max(0, Math.round(b.pw * 0.5 / 10) * 10), pwMax, 5, fW)}
    ${sl("rate", "Interest rate", 0.02, 0.11, 0.0005, fP)}
    ${sl("vacant", "Vacant weeks a year", 0, 10, 1, v => v + " wk")}
    ${sl("capital", "Capital growth a year", 0, 0.10, 0.0025, fP)}
    ${sl("rentGrowth", "Rent growth a year", 0, 0.10, 0.0025, fP)}
    ${p.status !== "owned" ? sl("price", "Purchase price", Math.round(b.price * 0.8 / 5000) * 5000, Math.round(b.price * 1.2 / 5000) * 5000, 5000, v => money(v)) : ""}
    <div class="row"><button type="button" class="btn sm" data-act="wiReset">Reset to saved</button><button type="button" class="btn sm outline" data-act="wiSave">Save as scenario</button></div></div>
    <div id="wiOut"></div>`;
}
function paintWhatIf() {
  const p = getP(S.open); if (!p || !S.wi) return; const el = $("#wiOut"); if (!el) return;
  const c = ctx(), b = wiBase(p), w = S.wi, over = { pw: w.pw, rate: w.rate, vacant: w.vacant, capital: w.capital, rentGrowth: w.rentGrowth, price: p.status !== "owned" ? w.price : undefined };
  const base = result(p), now = Engine.run(p, c, over), sb = base.summary, sn = now.summary;
  const d = (a, bb, inv) => { const x = a - bb; if (Math.abs(x) < 0.5) return `<span class="delta muted">no change</span>`; return `<span class="delta ${(inv ? -x : x) > 0 ? "pos" : "neg"}">${x > 0 ? "+" : minus}${money(Math.abs(x)).replace("$", "$")}</span>`; };
  const ber = Engine.breakEvenRent(p, c, over);
  const tiles = `<div class="tiles">
    <div class="tile"><small>After tax, year 1</small><strong class="${cls(sn.weekly1)}">${wk(sn.weekly1)}</strong>${d(sn.weekly1, sb.weekly1)}</div>
    <div class="tile"><small>Before tax, year 1</small><strong class="${cls(sn.pretaxWeekly1)}">${wk(sn.pretaxWeekly1)}</strong>${d(sn.pretaxWeekly1, sb.pretaxWeekly1)}</div>
    <div class="tile"><small>Turns positive</small><strong>${sn.breakEven ? "Year " + sn.breakEven : "Not in 10 yrs"}</strong><em>saved: ${sb.breakEven ? "year " + sb.breakEven : "not in 10 yrs"}</em></div>
    <div class="tile"><small>Equity in year 10</small><strong>${money(sn.equity10)}</strong>${d(sn.equity10, sb.equity10)}</div>
    <div class="tile"><small>10-year wealth gain</small><strong>${money(sn.wealth10)}</strong>${d(sn.wealth10, sb.wealth10)}</div>
    <div class="tile"><small>Rent to break even (after tax)</small><strong>${ber == null ? "—" : wk(Math.ceil(ber))}</strong><em>at ${pct(w.rate, 2)}</em></div></div>`;
  // rate stress test
  const steps = [0, 0.005, 0.01, 0.02, 0.03];
  const stress = `<div class="card"><h2>Interest rate stress test <span class="sub">year 1, at ${money(w.pw)}/wk rent</span></h2><table class="cmp"><thead><tr><th>Rate</th><th>Before tax</th><th>After tax</th><th>A year</th></tr></thead><tbody>
    ${steps.map(s => { const rr = Engine.run(p, c, { ...over, rate: w.rate + s }), x = rr.rows[0]; return `<tr><td>${pct(w.rate + s, 2)}${s ? ` <span class="xs">(+${pct(s, s * 100 % 1 ? 1 : 0)})</span>` : ""}</td><td class="${cls(x.pretax)}">${wk(x.pretax * rr.k / 52)}</td><td class="${cls(x.after)}">${wk(x.after / 52)}</td><td class="${cls(x.after)}">${money(x.after)}</td></tr>`; }).join("")}</tbody></table></div>`;
  // rent × rate grid
  const rents = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15].map(f => Math.max(0, Math.round(w.pw * (1 + f) / 5) * 5));
  const rates = [-0.01, -0.005, 0, 0.005, 0.01].map(f => Math.max(0, Math.round((w.rate + f) * 10000) / 10000));
  const vals = rents.map(pw => rates.map(rt => Engine.run(p, c, { ...over, pw, rate: rt }).rows[0].after / 52));
  const amax = Math.max(1, ...vals.flat().map(Math.abs));
  const col = v => { const t = Math.min(1, Math.abs(v) / amax), a = (0.12 + 0.6 * t).toFixed(2); return v >= 0 ? `background:rgba(29,122,78,${a});color:${t > 0.55 ? "#fff" : "inherit"}` : `background:rgba(180,35,24,${a});color:${t > 0.55 ? "#fff" : "inherit"}`; };
  const grid = `<div class="card"><h2>Rent × interest rate <span class="sub">after-tax $/week, year 1</span></h2>
    <div class="grid"><table class="hm"><thead><tr><th>Rent ↓ Rate →</th>${rates.map(rt => `<th>${pct(rt, 2)}</th>`).join("")}</tr></thead><tbody>
    ${rents.map((pw, i) => `<tr><th>${money(pw)}</th>${rates.map((rt, j) => `<td style="${col(vals[i][j])}" class="${i === 3 && j === 2 ? "cur" : ""}">${Math.round(vals[i][j]).toLocaleString("en-AU").replace("-", minus)}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div><div class="legend"><span><i style="background:rgba(29,122,78,.6)"></i>money in your pocket</span><span><i style="background:rgba(180,35,24,.6)"></i>you top it up</span><span>outlined = your settings above</span></div></div>`;
  el.innerHTML = tiles + stress + grid;
}

/* ---------- Edit ---------- */
const kinds = { money: v => num(v) ?? 0, pct: v => num(v) == null ? 0 : num(v) / 100, pctBlank: v => num(v) == null ? "" : num(v) / 100, num: v => num(v) ?? 0, numBlank: v => num(v), text: v => String(v || "").trim(), date: v => v || "", bool: (v, el) => el.checked, sel: v => v };
function getPath(o, path) { return path.split(".").reduce((a, k) => a == null ? undefined : a[k], o); }
function setPath(o, path, v) { const ks = path.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; }
function inp(path, kind, val, o = {}) {
  const v = val === undefined ? "" : val, mode = kind === "text" ? "text" : "decimal";
  const unit = kind === "money" ? "$" : (kind === "pct" || kind === "pctBlank") ? "%" : o.unit || "";
  const input = `<input ${o.id ? `id="${o.id}"` : ""} data-path="${path}" data-kind="${kind}" ${kind === "date" ? 'type="date"' : `type="text" inputmode="${mode}"`} value="${esc(v)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ""} ${o.ro ? "readonly" : ""} autocomplete="off" ${kind === "text" ? "" : 'enterkeyhint="next"'}>`;
  return unit ? `<span class="inwrap ${kind === "money" ? "pre" : ""}">${input}<span class="u">${unit}</span></span>` : input;
}
function fld(label, path, kind, val, o = {}) { const id = "f-" + path.replace(/\./g, "-"); return `<div class="field ${o.calc ? "calc" : ""}"><label for="${id}">${label}</label>${inp(path, kind, val, { ...o, id })}${o.hint ? `<span class="hint">${o.hint}</span>` : ""}</div>`; }
function sel(label, path, val, opts, o = {}) { const id = "f-" + path.replace(/\./g, "-"); return `<div class="field"><label for="${id}">${label}</label><select id="${id}" data-path="${path}" data-kind="sel">${opts.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${String(v) === String(val ?? "") ? "selected" : ""}>${esc(l)}</option>`; }).join("")}</select>${o.hint ? `<span class="hint">${o.hint}</span>` : ""}</div>`; }
function sec(key, title, summary, body) { return `<details class="sec" data-sec="${key}" ${S.editOpen[key] ? "open" : ""}><summary>${title}<span class="s" data-calc="sum-${key}">${summary || ""}</span></summary><div class="body">${body}</div></details>`; }
const calc = (key, v) => `<b data-calc="${key}">${v}</b>`;
function viewEdit(p) {
  const r = result(p), st = r.setup, ppl = people();
  const costLines = (arr, base) => `<div class="lines">${(arr || []).map((c, i) => `<div class="line fund">
      <input data-path="${base}.${i}.label" data-kind="text" value="${esc(c.label)}" aria-label="Item">
      ${c.auto ? `<input data-autoval="${base}.${i}" value="${esc(String(Math.round((base === "purchaseCosts" ? st.items : st.loanItems)[i].amount)))}" readonly aria-label="Amount (worked out)" style="background:var(--surface-2)">` : `<input data-path="${base}.${i}.amount" data-kind="money" inputmode="decimal" value="${esc(numIn(c.amount))}" aria-label="Amount">`}
      <select data-path="${base}.${i}.fund" data-kind="sel" aria-label="Paid from"><option value="cash" ${c.fund !== "equity" ? "selected" : ""}>Cash</option><option value="equity" ${c.fund === "equity" ? "selected" : ""}>Equity</option></select>
      <button type="button" class="iconbtn" data-act="lineDel" data-base="${base}" data-i="${i}" aria-label="Remove">${IC.x}</button></div>
      ${c.auto === "duty" ? `<div class="xs muted">Stamp duty worked out for ${esc(p.state || "?")} (${esc((SET().duty[p.state] || {}).asAt || "no table")}) on ${money(N(p.dutyValue) || N(p.price))}. <button type="button" class="btn ghost sm" data-act="autoOff" data-base="${base}" data-i="${i}">Type my own</button></div>` : ""}
      ${c.auto === "lmi" ? `<div class="xs muted">LMI estimated from the LVR (a rough guide — your broker's quote is better). <button type="button" class="btn ghost sm" data-act="autoOff" data-base="${base}" data-i="${i}">Type my own</button></div>` : ""}
      ${!c.auto && /stamp|duty/i.test(c.label) ? `<div class="xs"><button type="button" class="btn ghost sm" data-act="autoOn" data-base="${base}" data-i="${i}" data-auto="duty">Work out stamp duty</button></div>` : ""}
      ${!c.auto && /lmi|mortgage insurance/i.test(c.label) ? `<div class="xs"><button type="button" class="btn ghost sm" data-act="autoOn" data-base="${base}" data-i="${i}" data-auto="lmi">Estimate LMI</button></div>` : ""}`).join("")}</div>
    <button type="button" class="btn sm" data-act="lineAdd" data-base="${base}">${IC.plus}Add item</button>`;
  const L = p.loan || {}, E = p.equityLoan || {}, R = p.rent || {}, SS = R.shortStay || { mode: "none", seasons: [] };
  const photoCtl = `<div class="field"><span class="lab">Photo</span>${p.photo ? photoBox(p, "edit") : `<div class="small muted">No photo yet.</div>`}
    <div class="row"><label class="btn sm">${p.photo ? "Change photo" : "Add photo"}<input type="file" id="photoIn" accept="image/*" hidden></label>${p.photo ? `<button type="button" class="btn sm danger" data-act="photoDel">Remove photo</button>` : ""}</div></div>`;
  const details = `${photoCtl}<div class="g2">${fld("Name", "name", "text", p.name)}${sel("Status", "status", p.status, Object.entries(STATUS))}</div>
    ${fld("Street", "street", "text", p.street)}
    <div class="g3">${fld("Suburb", "suburb", "text", p.suburb)}${sel("State", "state", p.state, STATES)}${fld("Postcode", "postcode", "text", p.postcode)}</div>
    <div class="g2">${sel("Type", "type", p.type, TYPES)}${fld("Parking", "parking", "text", p.parking)}</div>
    <div class="g2">${fld("Bedrooms", "beds", "numBlank", p.beds ?? "")}${fld("Bathrooms", "baths", "numBlank", p.baths ?? "")}</div>
    <div class="g2">${fld("Land size", "landSize", "numBlank", p.landSize ?? "", { unit: "m²" })}${fld("Building size", "buildSize", "numBlank", p.buildSize ?? "", { unit: "m²" })}</div>
    <div class="g2">${fld("Purchase / settlement date", "purchaseDate", "date", p.purchaseDate)}${fld("Projection starts", "startDate", "date", p.startDate, { hint: "Year 1 of the report starts here" })}</div>
    <label class="check"><input type="checkbox" data-path="incomeProducing" data-kind="bool" ${p.incomeProducing !== false ? "checked" : ""}> Rented out (income-producing — rent, deductions and tax refunds count)</label>
    <div class="field"><label for="f-notes">Notes</label><textarea id="f-notes" data-path="notes" data-kind="text">${esc(p.notes || "")}</textarea></div>`;
  const purchase = `<div class="g2">${fld("Purchase price", "price", "money", numIn(p.price))}${fld("Today's value", "marketValue", "money", numIn(p.marketValue), { hint: "Used for equity and LVR" })}</div>
    ${fld("Dutiable value (if different)", "dutyValue", "money", numIn(p.dutyValue || ""), { ph: "same as price", hint: "e.g. the land price on a house-and-land contract" })}
    <div class="g2">${fld("Cash deposit", "cashDeposit", "money", numIn(p.cashDeposit))}${fld("Equity deposit", "equityDeposit", "money", numIn(p.equityDeposit), { hint: "From the Equity Funds Loan" })}</div>
    ${fld("Loan buffer (borrowed on the equity loan)", "loanBuffer", "money", numIn(p.loanBuffer || ""), { ph: "0", hint: "Extra borrowed and held as cash for holding costs — adds to the loan and interest, not a purchase cost" })}
    <h3>Purchase costs</h3>${costLines(p.purchaseCosts, "purchaseCosts")}
    <h3>Loan costs <span class="xs muted" style="font-weight:400">— written off over ${SET().borrowYears} years for tax</span></h3>${costLines(p.loanCosts, "loanCosts")}
    <dl class="kv"><dt>Total purchase expenses</dt><dd>${calc("tpe", money(st.totalPurchaseExpenses))}</dd><dt>Cash needed</dt><dd>${calc("cash", money(st.cashRequired))}</dd><dt>Equity used</dt><dd>${calc("eq", money(st.equityUsed))}</dd></dl>`;
  const loan = `<label class="check"><input type="checkbox" data-act="loanManual" ${L.amountMode === "manual" ? "checked" : ""}> Set the main loan balance myself (e.g. today's balance from your statement)</label>
    ${L.amountMode === "manual" ? fld("Main loan amount", "loan.amount", "money", numIn(L.amount)) : `<div class="field calc"><span class="lab">Main loan amount</span><div>${calc("main", money(st.mainLoan))} <span class="xs muted">= price − cash deposit − equity deposit</span></div></div>`}
    <div class="g2">${fld("Interest rate", "loan.rate", "pct", pctIn(L.rate))}${sel("Repayments", "loan.type", L.type || "IO", [["IO", "Interest only"], ["PI", "P&I"]])}</div>
    <div class="g2">${L.type === "PI" ? "" : fld("Interest-only years", "loan.ioYears", "num", numIn(L.ioYears || 0), { hint: "Then P&I for the rest of the term. 0 = interest-only the whole time" })}${fld("Loan term", "loan.termYears", "num", numIn(L.termYears || 30), { unit: "yrs" })}</div>
    <h3>Equity loan (deposit, costs and buffer paid from equity)</h3>
    <label class="check"><input type="checkbox" data-act="eqManual" ${E.amountMode === "manual" ? "checked" : ""}> Set this property's share of the equity loan balance myself</label>
    ${E.amountMode === "manual" ? fld("Equity loan balance (this property's share)", "equityLoan.amount", "money", numIn(E.amount)) : `<div class="field calc"><span class="lab">Equity loan amount</span><div>${calc("eqLoan", money(st.equityLoan))} <span class="xs muted">= equity deposit + costs marked Equity + loan buffer</span></div></div>`}
    <div class="g2">${fld("Equity loan rate", "equityLoan.rate", "pctBlank", pctIn(E.rate), { ph: "same as main", hint: "Leave blank for the main rate" })}${sel("Repayments", "equityLoan.type", E.type || "IO", [["IO", "Interest only"], ["PI", "P&I"]])}</div>
    ${E.type === "PI" ? fld("Equity loan term left", "equityLoan.termYears", "num", numIn(E.termYears || L.termYears || 30), { unit: "yrs" }) : ""}
    <dl class="kv"><dt>Total borrowed</dt><dd>${calc("debt", money(st.totalDebt))}</dd><dt>LVR</dt><dd>${calc("lvr", pct(st.lvr))}</dd></dl>
    ${fld("Available equity is worked out at", "availLVR", "pct", pctIn(p.availLVR || 0.8), { hint: "of the property's value (80% avoids LMI)" })}`;
  const seasons = (SS.seasons || []);
  const rent = `<div class="g3">${fld("Rent per week", "rent.pw", "money", numIn(R.pw))}${fld("Weeks", "rent.weeks", "num", numIn(R.weeks || 52))}${fld("Vacant weeks", "rent.vacant", "num", numIn(R.vacant))}</div>
    <div class="g2">${fld("Property management", "mgmtPct", "pct", pctIn(p.mgmtPct), { hint: "Incl. GST, % of rent collected" })}${fld("Leasing / renewal fee", "lettingWeeks", "num", numIn(p.lettingWeeks), { unit: "wks", hint: "Weeks of rent incl. GST charged each year (new lease or renewal)" })}</div>
    ${sel("Short-stay rental", "rent.shortStay.mode", SS.mode || "none", [["none", "Not used"], ["replace", "Instead of the standard rent"], ["add", "On top of the standard rent"]])}
    ${SS.mode && SS.mode !== "none" ? `<div class="lines">${seasons.map((s, i) => `<div class="g3" style="grid-template-columns:1.3fr .8fr 1fr .8fr 40px;align-items:end">
      ${fld("Season", `rent.shortStay.seasons.${i}.name`, "text", s.name)}${fld("Weeks", `rent.shortStay.seasons.${i}.weeks`, "num", numIn(s.weeks))}${fld("Per week", `rent.shortStay.seasons.${i}.pw`, "money", numIn(s.pw))}${fld("Vacant", `rent.shortStay.seasons.${i}.vacant`, "num", numIn(s.vacant))}
      <button type="button" class="iconbtn" data-act="lineDel" data-base="rent.shortStay.seasons" data-i="${i}" aria-label="Remove season">${IC.x}</button></div>`).join("")}</div>
      <button type="button" class="btn sm" data-act="seasonAdd">${IC.plus}Add season</button>` : ""}
    <dl class="kv"><dt>Rent in year 1</dt><dd>${calc("rent1", money(r.rows[0].rent))}</dd></dl>`;
  const exp = `<div class="lines">${(p.expenses || []).map((e, i) => `<div class="line"><input data-path="expenses.${i}.label" data-kind="text" value="${esc(e.label)}" aria-label="Expense">
      <input data-path="expenses.${i}.amount" data-kind="money" inputmode="decimal" value="${esc(numIn(e.amount))}" aria-label="Amount a year">
      <button type="button" class="iconbtn" data-act="lineDel" data-base="expenses" data-i="${i}" aria-label="Remove">${IC.x}</button></div>`).join("")}</div>
    <button type="button" class="btn sm" data-act="lineAdd" data-base="expenses">${IC.plus}Add expense</button>
    <dl class="kv"><dt>Management (year 1)</dt><dd>${calc("mgmt1", money(r.rows[0].mgmt))}</dd><dt>Letting fee (year 1)</dt><dd>${calc("let1", money(r.rows[0].letting))}</dd><dt>Total year 1</dt><dd>${calc("exp1", money(r.rows[0].expenses))}</dd></dl>
    <p class="xs muted" style="margin:0">Amounts are a year. Each grows with CPI; management and letting fees follow the rent.</p>`;
  const dep = p.depreciation || [];
  const fy0 = p.depStartFy || "", fyAdd = (f, n) => { const y = +f.slice(0, 4) + n; return `${y}-${p2((y + 1) % 100)}`; };
  const lastFy = r.rows[r.rows.length - 1].fy, need = fy0 ? (+lastFy.slice(0, 4)) - (+fy0.slice(0, 4)) + 1 : 10;
  const depN = Math.min(20, Math.max(10, need, dep.length));
  const fyOpts = [["", "Years 1–10 of the projection"], ...Array.from({ length: 14 }, (_, i) => { const f = fyAdd(curFy(), i - 12); return [f, "Financial years, starting " + f]; })];
  const depr = `${sel("The figures below are for", "depStartFy", fy0, fyOpts, { hint: fy0 ? "Each figure lines up with its own financial year, wherever the projection starts" : "Pick the schedule's first financial year to line it up exactly" })}
    <div class="dep">${Array.from({ length: depN }, (_, i) => `<label>${fy0 ? fyAdd(fy0, i) : "Year " + (i + 1)}<input data-path="depreciation.${i}" data-kind="money" inputmode="decimal" value="${esc(dep[i] == null ? "" : numIn(dep[i]))}"></label>`).join("")}</div>
    <div class="row"><span class="small">Fill the empty years after the last one entered, reducing by</span><span class="inwrap" style="width:90px"><input id="depPct" type="text" inputmode="decimal" value="6" style="min-height:40px;border:1px solid var(--line-2);border-radius:8px;padding:0 26px 0 8px;width:100%;background:var(--surface)"><span class="u">%</span></span><button type="button" class="btn sm" data-act="depFill">Fill</button></div>
    <h3>Capital works (Div 43) — only if the figures above don't include it</h3>
    <div class="g2">${fld("Construction cost", "capWorksCost", "money", numIn(p.capWorksCost || ""), { ph: "leave blank", hint: "e.g. the build price" })}${fld("Rate a year", "capWorksRate", "pctBlank", pctIn(p.capWorksRate ?? ""), { ph: "2.5" })}</div>
    <p class="xs muted" style="margin:0">Best: copy the yearly totals from your quantity surveyor's depreciation schedule into the boxes above (they normally include capital works, so leave construction cost blank). Capital works applies to residential buildings started after 15 Sept 1987, at 2.5% a year for 40 years.</p>
    <dl class="kv"><dt>Depreciation claimed, year 1</dt><dd>${calc("dep1", money(r.rows[0].depreciation))}</dd></dl>`;
  const owners = `<div class="lines">${(p.owners || []).map((o, i) => `<div class="line"><select data-path="owners.${i}.who" data-kind="sel" aria-label="Owner">${ppl.map(x => `<option value="${x.id}" ${x.id === o.who ? "selected" : ""}>${esc(x.name)}${x.household ? "" : " (family)"}</option>`).join("")}</select>
      <span class="inwrap"><input data-path="owners.${i}.share" data-kind="pct" inputmode="decimal" value="${esc(pctIn(o.share))}" aria-label="Share"><span class="u">%</span></span>
      <button type="button" class="iconbtn" data-act="lineDel" data-base="owners" data-i="${i}" aria-label="Remove">${IC.x}</button></div>`).join("")}</div>
    <div class="row"><button type="button" class="btn sm" data-act="ownerAdd">${IC.plus}Add owner</button><button type="button" class="btn sm" data-act="ownerSplit">Split evenly</button></div>
    <dl class="kv"><dt>Total</dt><dd>${calc("owners", pct((p.owners || []).reduce((s, o) => s + N(o.share), 0), 1))}</dd><dt>Our share</dt><dd>${calc("k", pct(r.k, 1))}</dd></dl>
    <p class="xs muted" style="margin:0">Tax refunds use each household owner's income from Settings → People (${people().filter(x => x.household).map(x => esc(x.name) + " " + money(x.income)).join(", ")}).</p>`;
  const growth = `<div class="g3">${fld("Capital growth", "growth.capital", "pct", pctIn(p.growth && p.growth.capital))}${fld("Rent growth", "growth.rent", "pct", pctIn(p.growth && p.growth.rent))}${fld("CPI (expenses)", "growth.cpi", "pct", pctIn(p.growth && p.growth.cpi))}</div>`;
  const ph = p.placeholders || [];
  const todo = `${ph.length ? `<div class="list">${ph.map((t, i) => `<div class="li" style="cursor:default;padding:10px 0"><span class="t"><span style="color:var(--ink);font-size:14px">${esc(t)}</span></span><button type="button" class="btn sm" data-act="phDone" data-i="${i}">Done</button></div>`).join("")}</div>` : `<p class="small muted" style="margin:0">Nothing to confirm.</p>`}
    <div class="row"><input id="phNew" type="text" placeholder="Add something to check" style="flex:1;min-height:42px;border:1px solid var(--line-2);border-radius:10px;padding:0 10px;background:var(--surface)"><button type="button" class="btn sm" data-act="phAdd">Add</button></div>`;
  const loanSum = `${money(st.totalDebt)} · ${pct(N(L.rate), 2)}`;
  return `${sec("todo", "Still to confirm", ph.length ? ph.length + " left" : "none", todo)}
    ${sec("details", "Details", esc(p.state || ""), details)}
    ${sec("purchase", "Purchase & funding", money(st.price), purchase)}
    ${sec("loan", "Loans", loanSum, loan)}
    ${sec("rent", "Rent", r.income ? money(N(R.pw)) + "/wk" : "not rented", rent)}
    ${sec("exp", "Expenses", money(r.rows[0].expenses) + " yr 1", exp)}
    ${sec("dep", "Depreciation", money(r.rows[0].depreciation) + " yr 1", depr)}
    ${sec("owners", "Owners", pct(r.k, 0) + " ours", owners)}
    ${sec("growth", "Growth & inflation", pct(N(p.growth && p.growth.capital), 1) + " growth", growth)}
    <p class="xs muted" style="margin:2px">Changes save as you go and sync to the other phone.</p>
    <div class="row"><button type="button" class="btn" data-act="dup">${IC.copy}Duplicate</button><button type="button" class="btn danger" data-act="delProp">${IC.trash}Delete property</button></div>`;
}
/* after a field changes: refresh the worked-out figures without redrawing the form (so the keyboard stays put) */
function updateCalcs(p) {
  const r = result(p), st = r.setup, set = (k, v) => { for (const el of $$(`[data-calc="${k}"]`)) el.textContent = v; };
  set("tpe", money(st.totalPurchaseExpenses)); set("cash", money(st.cashRequired)); set("eq", money(st.equityUsed)); set("main", money(st.mainLoan)); set("eqLoan", money(st.equityLoan));
  set("debt", money(st.totalDebt)); set("lvr", pct(st.lvr)); set("rent1", money(r.rows[0].rent)); set("mgmt1", money(r.rows[0].mgmt)); set("let1", money(r.rows[0].letting)); set("exp1", money(r.rows[0].expenses));
  set("owners", pct((p.owners || []).reduce((s, o) => s + N(o.share), 0), 1)); set("k", pct(r.k, 1));
  set("sum-purchase", money(st.price)); set("sum-loan", `${money(st.totalDebt)} · ${pct(N(p.loan && p.loan.rate), 2)}`); set("sum-rent", r.income ? money(N(p.rent && p.rent.pw)) + "/wk" : "not rented");
  set("dep1", money(r.rows[0].depreciation));
  set("sum-exp", money(r.rows[0].expenses) + " yr 1"); set("sum-dep", money(r.rows[0].depreciation) + " yr 1"); set("sum-owners", pct(r.k, 0) + " ours"); set("sum-growth", pct(N(p.growth && p.growth.capital), 1) + " growth"); set("sum-details", p.state || "");
  for (const el of $$("[data-autoval]")) { const [base, i] = el.dataset.autoval.split("."); const arr = base === "purchaseCosts" ? st.items : st.loanItems; if (arr[+i]) el.value = String(Math.round(arr[+i].amount)); }
}
async function saveProp(p) { await dbPut("props", p); }

/* ---------- Quick Check ---------- */
function quickState() { const d = SET().defaults; return { price: 650000, state: "NSW", pw: 600, depPct: d.depositPct, depFund: d.depositFund, rate: d.rate, type: d.type, strata: 0, rates: 0, age: "new", buildCost: 0, depY1: 0, landTax: 0, buffer: d.buffer, ...(S.meta.quick || {}) }; }
/* Quick Check depreciation estimate: capital works (2.5% of the building cost) for buildings started after 15 Sept 1987, plus plant & equipment for a
   brand-new property only (second-hand plant isn't deductible for residential property bought after 9 May 2017). A typed year-1 figure overrides it. */
function quickDep(q) {
  const d = SET().defaults, price = N(q.price), build = N(q.buildCost) || Math.round(price * N(d.buildPct));
  if (N(q.depY1) > 0) { const a = [Math.round(N(q.depY1))]; while (a.length < 10) a.push(Math.round(a[a.length - 1] * 0.94)); return { dep: a, capWorksCost: 0, y1: a[0], cw: 0, plant: a[0], typed: true, build }; }
  if (q.age === "old") return { dep: [], capWorksCost: 0, y1: 0, cw: 0, plant: 0, build };
  const cw = Math.round(build * 0.025), plantY1 = q.age === "new" ? N(d.plantNew) : 0;
  const plant = Array.from({ length: 10 }, (_, i) => Math.round(plantY1 * Math.pow(1 - N(d.plantDecline), i)));
  return { dep: plantY1 ? plant : [], capWorksCost: build, y1: cw + plantY1, cw, plant: plantY1, build };
}
function quickProp(q) {
  const d = SET().defaults, dep = Math.round(N(q.price) * N(q.depPct)), qd = quickDep(q);
  return { id: "quick", name: "Quick check", status: "looking", state: q.state, startDate: todayISO(), incomeProducing: true, price: N(q.price), marketValue: N(q.price),
    cashDeposit: q.depFund === "cash" ? dep : 0, equityDeposit: q.depFund === "cash" ? 0 : dep,
    purchaseCosts: [{ label: "Stamp duty", amount: 0, fund: q.depFund, auto: "duty" }, { label: "Legals (solicitor/conveyancer)", amount: d.legals, fund: q.depFund }],
    loanCosts: [{ label: "Loan establishment fees", amount: d.establishment, fund: q.depFund }, { label: "Property valuation", amount: d.valuation, fund: q.depFund }, { label: "LMI", amount: 0, fund: q.depFund, auto: "lmi" }],
    loan: { amountMode: "auto", rate: N(q.rate), type: q.type, ioYears: 0, termYears: d.termYears }, equityLoan: { rate: "", type: "IO" },
    rent: { weeks: 52, pw: N(q.pw), vacant: d.vacant, shortStay: { mode: "none", seasons: [] } }, mgmtPct: d.mgmtPct, lettingWeeks: d.lettingWeeks,
    expenses: [{ id: "e-rates", label: "Council rates", amount: N(q.rates) || Math.round(N(q.price) * d.ratesPct) }, { id: "e-bi", label: "Building insurance", amount: N(q.strata) ? 0 : d.buildingIns },
      { id: "e-li", label: "Landlord insurance", amount: d.landlordIns }, { id: "e-strata", label: "Strata / body corporate", amount: N(q.strata) }, { id: "e-lt", label: "Land tax", amount: N(q.landTax) }],
    growth: { capital: d.capital, rent: d.rent, cpi: d.cpi }, depreciation: qd.dep, capWorksCost: qd.capWorksCost || "", availLVR: d.availLVR, owners: clone(d.owners), loanBuffer: N(q.buffer),
    placeholders: [qd.typed ? "Depreciation (year-1 figure typed in Quick Check) — get a quantity surveyor's schedule" : q.age === "old" ? "Depreciation (none — built before Sept 1987)" : `Depreciation estimated (${q.age === "new" ? "new build" : "established"}: building cost ${money(qd.build)} × 2.5%${qd.plant ? ` + plant ${money(qd.plant)}` : ""}) — get a quantity surveyor's schedule`,
      ...(N(q.landTax) ? [] : ["Land tax (none assumed)"])] };
}
function viewQuick() {
  const q = quickState(), qi = (k, label, kind, val, o = {}) => `<div class="field"><label for="q-${k}">${label}</label><span class="inwrap ${kind === "money" ? "pre" : ""}"><input id="q-${k}" data-q="${k}" data-kind="${kind}" type="text" inputmode="decimal" value="${esc(kind === "pct" ? pctIn(val) : numIn(val))}" ${o.ph ? `placeholder="${o.ph}"` : ""}><span class="u">${kind === "money" ? "$" : kind === "pct" ? "%" : ""}</span></span>${o.hint ? `<span class="hint">${o.hint}</span>` : ""}</div>`;
  const qs = (k, label, val, opts) => `<div class="field"><label for="q-${k}">${label}</label><select id="q-${k}" data-q="${k}" data-kind="sel">${opts.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${v}" ${String(v) === String(val) ? "selected" : ""}>${l}</option>`; }).join("")}</select></div>`;
  return `<div class="card"><h2>Quick check</h2><p class="small muted" style="margin:0">For when you're at an open home or reading a listing. Everything else uses your defaults (Settings → Defaults); save it to fill in the rest.</p>
    <div class="g2">${qi("price", "Price", "money", q.price)}${qs("state", "State", q.state, STATES)}</div>
    <div class="g2">${qi("pw", "Expected rent per week", "money", q.pw)}${qi("rate", "Interest rate", "pct", q.rate)}</div>
    <div class="g2">${qi("depPct", "Deposit", "pct", q.depPct)}${qs("depFund", "Deposit & costs from", q.depFund, [["equity", "Equity loan"], ["cash", "Cash"]])}</div>
    <div class="g2">${qs("type", "Repayments", q.type, [["IO", "Interest only"], ["PI", "P&I"]])}${qi("strata", "Strata a year", "money", q.strata, { ph: "0" })}</div>
    <div class="g2">${qi("rates", "Council rates a year", "money", q.rates || "", { ph: "estimate", hint: `Blank = ${pct(SET().defaults.ratesPct, 2)} of the price` })}${qi("landTax", "Land tax a year", "money", q.landTax || "", { ph: "0" })}</div>
    ${qi("buffer", "Loan buffer (on the equity loan)", "money", q.buffer || "", { ph: "0", hint: "Extra borrowed and held as cash — adds interest, not a purchase cost" })}
    <h3 style="margin-top:4px">Depreciation</h3>
    ${qs("age", "Building", q.age, [["new", "Brand new (never lived in)"], ["est", "Established — built after Sept 1987"], ["old", "Built before Sept 1987"]])}
    <div class="g2">${qi("buildCost", "Building cost", "money", q.buildCost || "", { ph: "estimate", hint: `Blank = ${pct(SET().defaults.buildPct, 0)} of the price. For established homes use the original build cost.` })}${qi("depY1", "Or depreciation, year 1", "money", q.depY1 || "", { ph: "estimate", hint: "From a quantity surveyor's estimate — overrides the estimate" })}</div></div>
    <div id="qOut"></div>
    <button type="button" class="btn big primary" data-act="quickSave">Save as a property I'm looking at</button>`;
}
function paintQuick() {
  const el = $("#qOut"); if (!el) return; const q = quickState(), p = quickProp(q), c = ctx(), r = Engine.run(p, c), s = r.summary, st = r.setup, qd = quickDep(q);
  const ber = Engine.breakEvenRent(p, c);
  el.innerHTML = `<div class="tiles">
    <div class="tile"><small>After tax, year 1</small><strong class="${cls(s.weekly1)}">${wk(s.weekly1)}</strong><em>${money(r.rows[0].after)} a year</em></div>
    <div class="tile"><small>Before tax, year 1</small><strong class="${cls(s.pretaxWeekly1)}">${wk(s.pretaxWeekly1)}</strong><em>tax back ${money(r.rows[0].refund)}</em></div>
    <div class="tile"><small>Gross yield</small><strong>${pct(s.grossYield1, 2)}</strong><em>net ${pct(s.netYield1, 2)}</em></div>
    <div class="tile"><small>Stamp duty</small><strong>${money(st.duty)}</strong><em>${esc(q.state)} ${esc((SET().duty[q.state] || {}).asAt || "")}</em></div>
    <div class="tile"><small>${q.depFund === "cash" ? "Cash needed" : "Equity needed"}</small><strong>${money(q.depFund === "cash" ? st.cashRequired : st.equityUsed)}</strong><em>deposit + costs</em></div>
    <div class="tile"><small>Total borrowed</small><strong>${money(st.totalDebt)}</strong><em>LVR ${pct(st.lvr)}${st.loanItems.find(x => x.auto === "lmi" && x.amount) ? " · LMI " + money(st.loanItems.find(x => x.auto === "lmi").amount) : ""}</em></div>
    <div class="tile"><small>Turns positive</small><strong>${s.breakEven ? "Year " + s.breakEven : "Not in 10 yrs"}</strong><em>after tax</em></div>
    <div class="tile"><small>Equity in year 10</small><strong>${money(s.equity10)}</strong><em>at ${pct(SET().defaults.capital, 1)} growth</em></div>
    <div class="tile"><small>Rent to break even</small><strong>${ber == null ? "—" : wk(Math.ceil(ber))}</strong><em>after tax, year 1</em></div>
    <div class="tile"><small>Depreciation, year 1</small><strong>${money(r.rows[0].depreciation)}</strong><em>${qd.typed ? "as typed" : q.age === "old" ? "none before Sept 1987" : `capital works ${money(qd.cw)}${qd.plant ? " + plant " + money(qd.plant) : ""}`}</em></div></div>
    <div class="card"><h2>Cash flow per week</h2>${chartCash(r)}<div class="legend"><span><i style="background:var(--c2)"></i>Before tax</span><span><i style="background:var(--c1)"></i>After tax</span></div></div>
    <p class="xs muted" style="margin:0 2px">Also uses your defaults: ${SET().defaults.vacant} vacant weeks, ${pct(SET().defaults.mgmtPct, 1)} management, ${numIn(SET().defaults.lettingWeeks)} weeks letting fee, legals ${money(SET().defaults.legals)}, ${pct(SET().defaults.capital, 1)} growth. Depreciation is an estimate until you have a quantity surveyor's schedule. Tax refunds use ${people().filter(x => x.household).map(x => esc(x.name)).join(" and ")}'s incomes, owned ${(SET().defaults.owners || []).map(o => pct(o.share, 0)).join("/")}.</p>`;
}

/* ---------- Compare ---------- */
function viewCompare() {
  if (!S.cmp) S.cmp = S.props.filter(p => p.status === "owned").slice(0, 3).map(p => p.id);
  S.cmp = S.cmp.filter(id => getP(id));
  const picks = `<div class="picks">${S.props.map(p => `<button type="button" class="pick ${S.cmp.includes(p.id) ? "on" : ""}" data-act="cmpPick" data-id="${p.id}">${esc(p.name)}</button>`).join("")}</div>`;
  const ps = S.cmp.map(getP).filter(Boolean);
  if (ps.length < 2) return `<div class="card"><h2>Compare</h2><p class="small muted" style="margin:0">Pick two or three properties or scenarios.</p>${picks}</div>`;
  const rs = ps.map(result);
  const M = [
    ["Price", r => r.setup.price, money, 0], ["Today's value", r => r.setup.value, money, 0], ["Our share", r => r.k, v => pct(v, 0), 0],
    ["Rent per week", (r, p) => r.income ? N(p.rent.pw) : 0, v => money(v), 1], ["Gross yield", r => r.summary.grossYield1, v => pct(v, 2), 1], ["Net yield", r => r.summary.netYield1, v => pct(v, 2), 1],
    ["Total borrowed", r => r.setup.totalDebt, money, -1], ["LVR", r => r.setup.lvr, v => pct(v), -1], ["Cash needed", r => r.setup.cashRequired, money, -1], ["Equity used", r => r.setup.equityUsed, money, -1],
    ["Before tax, yr 1 (/wk)", r => r.summary.pretaxWeekly1, v => money(v), 1], ["After tax, yr 1 (/wk)", r => r.summary.weekly1, v => money(v), 1],
    ["Turns positive", r => r.income ? (r.summary.breakEven || 99) : 99, v => v === 99 ? "—" : "Year " + v, -1], ["Equity now (ours)", r => r.y0.equity * r.k, money, 1], ["Equity yr 10 (ours)", r => r.summary.equity10, money, 1],
    ["10-yr wealth gain", r => r.summary.wealth10, money, 1], ["10-yr after-tax cash", r => r.summary.cash10, money, 1]
  ];
  const rows = M.map(([l, f, fm, dir]) => { const vals = rs.map((r, i) => f(r, ps[i])); const best = dir ? (dir > 0 ? Math.max(...vals) : Math.min(...vals)) : null;
    return `<tr><td>${l}</td>${vals.map(v => `<td class="${dir && v === best && vals.filter(x => x === best).length === 1 ? "best" : ""}">${fm(v)}</td>`).join("")}</tr>`; }).join("");
  return `<div class="card"><h2>Compare</h2>${picks}</div>
    <div class="card" style="padding:8px 8px 4px;overflow-x:auto"><table class="cmp"><thead><tr><th></th>${ps.map(p => `<th>${esc(p.name)}<div class="xs muted" style="font-weight:400">${STATUS[p.status] || ""}</div></th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="xs muted" style="margin:0 2px">Green = best of those picked. Dollar figures for part-owned properties are your share; price, value and borrowing are for the whole property.</p>`;
}

/* ================= settings ================= */
function viewSettings() {
  const s = SET();
  if (S.set === "tax") return viewTax(s);
  if (S.set === "duty") return viewDuty(s);
  if (S.set === "lmi") return viewLmi(s);
  if (S.set === "people") return viewPeople(s);
  if (S.set === "defaults") return viewDefaults(s);
  if (S.set === "backup") return viewBackup();
  if (S.set === "check") return viewCheck(s);
  const li = (k, t, sub) => `<button type="button" class="li" data-act="setGo" data-k="${k}"><span class="t"><b>${t}</b><span>${sub}</span></span>${IC.chev.replace("<svg", '<svg width="18" height="18"')}</button>`;
  const yrs = Object.keys(s.taxYears || {}).sort();
  return `${annualBanner()}<div class="card flat"><div class="list">
    ${li("check", "Yearly figures check", checkDue() ? `<span style="color:var(--neg);font-weight:600">Due for ${esc(curFy())}</span>` : `Checked for ${esc(s.rulesCheckedFY || "—")} on ${fmtDate(s.rulesChecked)}`)}
    ${li("tax", "Income tax rates", `${yrs.length} years · ${yrs[0] || "—"} to ${yrs[yrs.length - 1] || "—"}`)}
    ${li("duty", "Stamp duty tables", "All states & territories · " + esc((s.duty.NSW || {}).asAt || ""))}
    ${li("lmi", "LMI estimate & borrowing costs", `${s.lmi.length} LVR steps · write-off over ${s.borrowYears} years`)}
    ${li("people", "People & incomes", people().map(p => esc(p.name)).join(", "))}
    ${li("defaults", "Defaults for new properties", `${pct(s.defaults.rate, 2)} rate · ${pct(s.defaults.capital, 1)} growth · ${pct(s.defaults.mgmtPct, 1)} management`)}
    ${li("backup", "Dropbox & backup file", dbxOn() ? "Connected · " + syncText().t : "Not connected")}
  </div></div>
  <div class="card"><h2>This phone</h2>
    <div class="field"><span class="lab">Whose phone</span><div class="seg">${people().filter(p => p.household).map(p => `<button type="button" class="${S.meta.me === p.id ? "on" : ""}" data-act="setMe" data-id="${p.id}">${esc(p.name)}</button>`).join("")}</div></div>
    <div class="row"><button type="button" class="btn" data-act="checkUpdate">Check for update</button><button type="button" class="btn" data-act="restoreSeeds">Restore preloaded properties</button></div>
    <p class="xs muted" style="margin:0">Version ${APP_VERSION}. Figures last checked ${fmtDate(s.rulesChecked)} (${esc(s.rulesCheckedFY || "—")}). Estimates only — not financial or tax advice.</p></div>`;
}
const ruleIn = (path, kind, val, o = {}) => `<input data-rule="${path}" data-kind="${kind}" type="text" inputmode="${kind === "text" ? "text" : "decimal"}" value="${esc(kind === "pct" ? pctIn(val) : kind === "text" ? (val || "") : numIn(val))}" ${o.ph ? `placeholder="${o.ph}"` : ""} aria-label="${esc(o.label || path)}">`;
function viewTax(s) {
  const yrs = Object.keys(s.taxYears).sort().reverse();
  return `<div class="card"><h2>Income tax rates</h2><p class="small muted" style="margin:0">Resident rates for each financial year. Each year of a projection uses its own year's rates; years after the last one here use the latest. When a budget changes the rates, tap <b>Add next year</b> and change what's different.</p>
    <div class="row"><button type="button" class="btn primary" data-act="taxAdd">${IC.plus}Add ${esc(nextFy(yrs[0]))}</button><button type="button" class="btn" data-act="rulesReset">Reset to built-in</button></div></div>
    ${yrs.map(fy => { const R = s.taxYears[fy]; return `<details class="sec" ${fy === fyOf(todayISO()) ? "open" : ""}><summary>${esc(fy)}<span class="s">${(R.brackets || []).map(b => pct(b.rate, 0)).join(" / ")}</span></summary><div class="body">
      <table class="rt"><thead><tr><th>Taxable income from</th><th>Rate</th><th></th></tr></thead><tbody>
      ${(R.brackets || []).map((b, i) => `<tr><td>${ruleIn(`taxYears.${fy}.brackets.${i}.from`, "money", b.from, { label: "From" })}</td><td>${ruleIn(`taxYears.${fy}.brackets.${i}.rate`, "pct", b.rate, { label: "Rate %" })}</td><td><button type="button" class="iconbtn" data-act="brDel" data-fy="${fy}" data-i="${i}" aria-label="Remove">${IC.x}</button></td></tr>`).join("")}
      </tbody></table><button type="button" class="btn sm" data-act="brAdd" data-fy="${fy}">${IC.plus}Add bracket</button>
      <h3>Low income tax offset</h3><table class="rt"><tbody>
        <tr><td>Maximum</td><td>${ruleIn(`taxYears.${fy}.lito.max`, "money", R.lito && R.lito.max)}</td></tr>
        <tr><td>Full offset up to</td><td>${ruleIn(`taxYears.${fy}.lito.t1`, "money", R.lito && R.lito.t1)}</td></tr>
        <tr><td>Then reduces by (per $)</td><td>${ruleIn(`taxYears.${fy}.lito.r1`, "pct", R.lito && R.lito.r1)}</td></tr>
        <tr><td>Until</td><td>${ruleIn(`taxYears.${fy}.lito.t2`, "money", R.lito && R.lito.t2)}</td></tr>
        <tr><td>Then reduces by (per $)</td><td>${ruleIn(`taxYears.${fy}.lito.r2`, "pct", R.lito && R.lito.r2)}</td></tr></tbody></table>
      <h3>Medicare levy</h3><table class="rt"><tbody>
        <tr><td>Rate</td><td>${ruleIn(`taxYears.${fy}.medicare.rate`, "pct", R.medicare && R.medicare.rate)}</td></tr>
        <tr><td>Nil up to (single)</td><td>${ruleIn(`taxYears.${fy}.medicare.low`, "money", R.medicare && R.medicare.low)}</td></tr></tbody></table>
      <div class="field"><label>Note</label>${ruleIn(`taxYears.${fy}.note`, "text", R.note)}</div>
      <div class="row"><span class="small muted" style="flex:1">Tax on $100,000: <b>${money(Engine.incomeTax(100000, R))}</b> · on $150,000: <b>${money(Engine.incomeTax(150000, R))}</b></span><button type="button" class="btn sm danger" data-act="taxDel" data-fy="${fy}">Delete year</button></div>
    </div></details>`; }).join("")}`;
}
const nextFy = fy => { const y = +String(fy || fyOf(todayISO())).slice(0, 4) + 1; return `${y}-${p2((y + 1) % 100)}`; };
function viewDuty(s) {
  const st = S.dutyState, T = s.duty[st] || { bands: [] };
  return `<div class="card"><h2>Stamp duty tables</h2><p class="small muted" style="margin:0">General (investor) transfer duty — no first-home or owner-occupier concessions, no foreign-buyer surcharge. Rates are per $100 over the "from" amount; a "whole %" band charges that % of the whole price.</p>
    <div class="picks">${STATES.map(x => `<button type="button" class="pick ${x === st ? "on" : ""}" data-act="dutyState" data-s="${x}">${x}</button>`).join("")}</div></div>
    <div class="card"><h2>${st} <span class="sub">${esc(T.asAt || "")}</span></h2>
    ${T.ntFormulaTo ? `<div class="banner info"><span>Up to ${money(T.ntFormulaTo)} the NT uses a formula: 0.06571441 × V² + 15 × V, where V is the price ÷ 1,000.</span></div>` : ""}
    <table class="rt"><thead><tr><th>From</th><th>Base $</th><th>$ per $100</th><th>Whole %</th><th></th></tr></thead><tbody>
    ${(T.bands || []).map((b, i) => `<tr><td>${ruleIn(`duty.${st}.bands.${i}.from`, "money", b.from)}</td><td>${b.whole != null ? "" : ruleIn(`duty.${st}.bands.${i}.base`, "money", b.base)}</td><td>${b.whole != null ? "" : ruleIn(`duty.${st}.bands.${i}.rate`, "pct", b.rate)}</td><td>${b.whole != null ? ruleIn(`duty.${st}.bands.${i}.whole`, "pct", b.whole) : ""}</td><td><button type="button" class="iconbtn" data-act="bandDel" data-i="${i}" aria-label="Remove">${IC.x}</button></td></tr>`).join("")}
    </tbody></table>
    <div class="row"><button type="button" class="btn sm" data-act="bandAdd">${IC.plus}Add band</button><button type="button" class="btn sm" data-act="bandAdd" data-whole="1">${IC.plus}Add whole-% band</button></div>
    <div class="g2"><div class="field"><label>Rates apply from</label>${ruleIn(`duty.${st}.asAt`, "text", T.asAt)}</div><div class="field"><label>Source</label>${ruleIn(`duty.${st}.source`, "text", T.source)}</div></div>
    <label class="check"><input type="checkbox" data-rule="duty.${st}.ceil100" data-kind="bool" ${T.ceil100 ? "checked" : ""}> Round the amount over each threshold up to the next $100</label>
    <div class="row"><span class="small">Test a price</span><span class="inwrap pre" style="width:150px"><input id="dutyTest" type="text" inputmode="decimal" value="${esc(S.dutyTest || "700000")}" style="min-height:42px;border:1px solid var(--line-2);border-radius:9px;padding:0 8px 0 22px;width:100%;background:var(--surface)"><span class="u">$</span></span><b id="dutyOut">${money(Engine.stampDuty(num(S.dutyTest || "700000"), T))}</b></div>
    </div>`;
}
function viewLmi(s) {
  return `<div class="card"><h2>LMI estimate</h2><p class="small muted" style="margin:0">Used when a property's LMI line is set to <b>Estimate</b>. A rough guide only — premiums depend on the lender, insurer, loan size and whether it's an investment loan. A broker's quote is always better.</p>
    <table class="rt"><thead><tr><th>LVR above</th><th>Premium (% of loan)</th><th></th></tr></thead><tbody>
    ${s.lmi.map((l, i) => `<tr><td>${ruleIn(`lmi.${i}.above`, "pct", l.above)}</td><td>${ruleIn(`lmi.${i}.pct`, "pct", l.pct)}</td><td><button type="button" class="iconbtn" data-act="lmiDel" data-i="${i}" aria-label="Remove">${IC.x}</button></td></tr>`).join("")}</tbody></table>
    <button type="button" class="btn sm" data-act="lmiAdd">${IC.plus}Add step</button></div>
    <div class="card"><h2>Borrowing costs</h2><div class="field"><label>Written off for tax over</label><span class="inwrap">${ruleIn("borrowYears", "num", s.borrowYears)}<span class="u">yrs</span></span><span class="hint">Borrowing expenses over $100 are claimed over 5 years (or the loan term if shorter).</span></div></div>`;
}
function viewPeople(s) {
  return `<div class="card"><h2>People &amp; incomes</h2><p class="small muted" style="margin:0">Household people's taxable incomes (before the property) are used to work out each owner's tax refund. Family co-owners (like Shannan and Carlene on Moulden) only need a name — their tax isn't worked out.</p></div>
    ${s.people.map((p, i) => `<div class="card"><div class="g2"><div class="field"><label>Name</label>${ruleIn(`people.${i}.name`, "text", p.name)}</div>
      <div class="field"><label>Taxable income a year</label><span class="inwrap pre">${ruleIn(`people.${i}.income`, "money", p.income)}<span class="u">$</span></span></div></div>
      <div class="g2"><div class="field"><label>Income growth a year</label><span class="inwrap">${ruleIn(`people.${i}.incomeGrowth`, "pct", p.incomeGrowth || 0)}<span class="u">%</span></span></div>
      <div class="field"><span class="lab">&nbsp;</span><label class="check"><input type="checkbox" data-rule="people.${i}.household" data-kind="bool" ${p.household ? "checked" : ""}> Our household (work out tax)</label></div></div>
      ${p.household ? `<p class="xs muted" style="margin:0">Marginal rate this year: ${pct(Engine.marginalRate(N(p.income), Engine.rulesFor(fyOf(todayISO()), s.taxYears)), 1)} (incl. Medicare)</p>` : ""}
      ${S.props.some(x => (x.owners || []).some(o => o.who === p.id)) ? "" : `<button type="button" class="btn sm danger" data-act="personDel" data-i="${i}">Remove</button>`}</div>`).join("")}
    <button type="button" class="btn" data-act="personAdd">${IC.plus}Add person</button>`;
}
function viewDefaults(s) {
  const d = s.defaults, di = (k, label, kind, o = {}) => `<div class="field"><label>${label}</label><span class="inwrap ${kind === "money" ? "pre" : ""}">${ruleIn("defaults." + k, kind, d[k])}<span class="u">${kind === "money" ? "$" : kind === "pct" ? "%" : o.unit || ""}</span></span>${o.hint ? `<span class="hint">${o.hint}</span>` : ""}</div>`;
  return `<div class="card"><h2>Defaults</h2><p class="small muted" style="margin:0">Starting values for Quick Check and new properties. Changing them doesn't change properties already saved.</p>
    <div class="g2">${di("rate", "Interest rate", "pct")}${di("depositPct", "Deposit", "pct")}</div>
    <div class="g3">${di("capital", "Capital growth", "pct")}${di("rent", "Rent growth", "pct")}${di("cpi", "CPI", "pct")}</div>
    <div class="g2">${di("vacant", "Vacant weeks", "num", { unit: "wks" })}${di("termYears", "Loan term", "num", { unit: "yrs" })}</div>
    <div class="g2">${di("mgmtPct", "Management (incl GST)", "pct")}${di("lettingWeeks", "Letting fee", "num", { unit: "wks" })}</div>
    <div class="g2">${di("legals", "Legals", "money")}${di("valuation", "Valuation", "money")}</div>
    <div class="g2">${di("establishment", "Loan establishment", "money")}${di("landlordIns", "Landlord insurance", "money")}</div>
    <div class="g2">${di("buildingIns", "Building insurance (houses)", "money")}${di("ratesPct", "Council rates (% of price)", "pct")}</div>
    <div class="g2">${di("buffer", "Loan buffer (equity loan)", "money")}${di("buildPct", "Building cost (% of price)", "pct")}</div>
    <div class="g2">${di("plantNew", "Plant & equipment, yr 1 (new build)", "money")}${di("plantDecline", "Plant reduces each year by", "pct")}</div>
    <div class="g2">${di("availLVR", "Available equity at", "pct")}<div class="field"><label>Deposit & costs from</label><select data-rule="defaults.depositFund" data-kind="sel"><option value="equity" ${d.depositFund !== "cash" ? "selected" : ""}>Equity loan</option><option value="cash" ${d.depositFund === "cash" ? "selected" : ""}>Cash</option></select></div></div>
    <p class="xs muted" style="margin:0">New properties are owned ${(d.owners || []).map(o => esc(pName(o.who)) + " " + pct(o.share, 0)).join(", ")}; change owners per property.</p></div>`;
}

/* ================= yearly figures check ================= */
function viewCheck(s) {
  const due = checkDue();
  return `<div class="card" style="${due ? "border:2px solid var(--neg)" : ""}"><h2>Yearly figures check</h2>
    <p class="small" style="margin:0">${due ? `<b style="color:var(--neg)">Due for ${esc(curFy())}.</b>` : `Checked for <b>${esc(s.rulesCheckedFY)}</b> on ${fmtDate(s.rulesChecked)}. The red reminder comes back on 1 July.`}
    Every 1 July tax rates, stamp duty thresholds (NSW and the ACT change every year), the Medicare threshold and your own figures — interest rates, rents, fees, insurance, rates and land tax — can change.</p>
    <ol class="small" style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px">
      <li>Tap <b>Make check report</b> and save it as a PDF.</li>
      <li>Upload the PDF to Claude and ask it to check every value against official sources for ${esc(curFy())}.</li>
      <li>Type any new values in here — <b>Income tax rates</b> (use <b>Add ${esc(curFy())}</b> if the year is missing), <b>Stamp duty tables</b>, <b>People &amp; incomes</b>, and each property's Edit tab.</li>
      <li>Tap <b>Mark ${esc(curFy())} as checked</b>.</li></ol>
    ${missingYear() ? `<div class="banner bad"><span>There are no ${esc(curFy())} income tax rates yet — projections are using ${esc(Engine.rulesFor(curFy(), s.taxYears).from)}'s.</span></div>` : ""}
    <div class="row"><button type="button" class="btn primary" data-act="checkPdf">${IC.doc}Make check report</button><button type="button" class="btn" data-act="checkDone">Mark ${esc(curFy())} as checked</button></div></div>`;
}
function openModal(html) { closeModal(); const d = document.createElement("div"); d.className = "modal"; d.id = "modal"; d.innerHTML = `<div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="mTitle">${html}</div>`; document.body.appendChild(d); }
function closeModal() { const m = $("#modal"); if (m) m.remove(); }
function sessionGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
function annualPopup() {
  if (!checkDue() || sessionGet("mre-pop") === curFy()) return;
  sessionSet("mre-pop", curFy());
  openModal(`<div class="mhead"><span class="dot">!</span><h2 id="mTitle">Time to check your figures</h2></div>
    <p style="margin:0">It's a new financial year (<b>${esc(curFy())}</b>). Tax rates, stamp duty, the Medicare threshold and your own figures — interest rates, rents, fees and costs — may have changed.${missingYear() ? ` <b>There are no ${esc(curFy())} tax rates yet.</b>` : ""}</p>
    <p class="small" style="margin:0">Make the check report, upload the PDF to Claude to research the current values, then type in anything that's changed.</p>
    <div class="row"><button type="button" class="btn primary" data-act="checkPdf">Make check report</button><button type="button" class="btn" data-act="goCheck">Open the check</button><button type="button" class="btn ghost" data-act="modalClose">Later</button></div>`);
}
/* the PDF to upload to Claude: every rule and every property figure that can go out of date, with a blank column for the checked value */
function buildCheckPrint() {
  const s = SET(), fy = curFy(), today = todayISO();
  const t = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const chk = ["", ""]; const H = ["Item", "Value in the app", "Checked value", "Source"];
  const prevFy = (() => { const y = +fy.slice(0, 4) - 1; return `${y}-${p2((y + 1) % 100)}`; })();
  const yrs = Object.keys(s.taxYears).sort().filter(k => k >= prevFy);
  const taxRows = []; for (const k of yrs) { const R = s.taxYears[k];
    (R.brackets || []).forEach((b, i, a) => taxRows.push([`${k} — taxable income ${money(b.from)}${a[i + 1] ? " to " + money(a[i + 1].from) : " and over"}`, pct(b.rate, 1), ...chk]));
    taxRows.push([`${k} — low income tax offset`, `${money(R.lito.max)} up to ${money(R.lito.t1)}; then reduces ${pct(R.lito.r1, 1)} of each $ to ${money(R.lito.t2)}; then ${pct(R.lito.r2, 1)} of each $`, ...chk]);
    taxRows.push([`${k} — Medicare levy`, `${pct(R.medicare.rate, 1)}; nil up to ${money(R.medicare.low)} (single), phased in at 10c per $`, ...chk]); }
  if (missingYear()) taxRows.push([`${fy} — not in the app yet`, "missing", ...chk]);
  const duty = STATES.map(st => { const T = s.duty[st] || { bands: [] };
    const bands = (T.ntFormulaTo ? [`up to ${money(T.ntFormulaTo)}: 0.06571441 × V² + 15 × V (V = price ÷ 1,000)`] : []).concat((T.bands || []).map(b => b.whole != null ? `from ${money(b.from)}: ${pct(b.whole, 2)} of the whole value` : `from ${money(b.from)}: ${money(b.base)} + $${(b.rate * 100).toFixed(2)} per $100 over`));
    return [`<b>${st}</b><br>rates as at ${esc(T.asAt || "?")}`, bands.join("<br>"), "", esc(T.source || "")]; });
  const lmi = s.lmi.map(l => [`LVR above ${pct(l.above, 0)}`, pct(l.pct, 2) + " of the loan", ...chk]);
  const d = s.defaults;
  const defs = [["Interest rate (new properties)", pct(d.rate, 2)], ["Capital growth", pct(d.capital, 2)], ["Rent growth", pct(d.rent, 2)], ["CPI", pct(d.cpi, 2)], ["Property management incl GST", pct(d.mgmtPct, 2)], ["Letting fee", d.lettingWeeks + " weeks"], ["Legals", money(d.legals)], ["Valuation", money(d.valuation)], ["Loan establishment", money(d.establishment)], ["Landlord insurance", money(d.landlordIns)], ["Building insurance", money(d.buildingIns)], ["Council rates", pct(d.ratesPct, 2) + " of price"]].map(r => [...r, ...chk]);
  const ppl = people().filter(x => x.household).map(x => [`${esc(x.name)}'s taxable income`, money(x.income), "", "you"]);
  const props = S.props.filter(p => p.status !== "passed" && !p.sample).map(p => { const r = result(p), st = r.setup, L = p.loan || {}, E = p.equityLoan || {};
    const rows = [["Today's value", money(st.value)], ...(st.mainLoan ? [["Main loan", `${money(st.mainLoan)} at ${pct(N(L.rate), 2)} ${L.type === "PI" ? "P&I" : "interest only"}${L.type !== "PI" && N(L.ioYears) ? " for " + L.ioYears + " yrs" : ""}`]] : [["Loans", "None"]]),
      ...(st.equityLoan ? [["Equity loan", `${money(st.equityLoan)} at ${pct(E.rate !== "" && E.rate != null ? N(E.rate) : N(L.rate), 2)}`]] : []),
      ...(r.income ? [["Rent", `${money(N(p.rent.pw))}/wk, ${N(p.rent.vacant)} vacant weeks`], ["Management / letting fee", `${pct(N(p.mgmtPct), 2)} / ${numIn(p.lettingWeeks)} weeks`]] : [["Rented", "No (not income-producing)"]]),
      ...(p.expenses || []).map(e => [esc(e.label) + " (a year)", money(e.amount)]),
      ["Growth: capital / rent / CPI", `${pct(N(p.growth.capital), 2)} / ${pct(N(p.growth.rent), 2)} / ${pct(N(p.growth.cpi), 2)}`],
      [p.depStartFy ? "Depreciation from " + p.depStartFy : "Depreciation yrs 1–10", (p.depreciation || []).map(v => Math.round(N(v)).toLocaleString("en-AU")).join(", ") || "none"],
      ...(p.placeholders || []).map(x => ["Still to confirm", esc(x)])];
    return `<h2>${esc(p.name)} — ${esc(addrOf(p))} (${esc(STATUS[p.status] || "")})</h2>` + t(["Item", "Value in the app", "Checked value", "Where to check"], rows.map(r => [r[0], r[1], "", "your statements"])); }).join("");
  $("#print").innerHTML = `<div class="chkrep"><h1>My Real Estate — yearly figures check, ${esc(fy)}</h1>
    <div class="meta">Prepared ${fmtDate(today)} with My Real Estate ${APP_VERSION}. Last checked ${fmtDate(s.rulesChecked)} (${esc(s.rulesCheckedFY || "—")}).</div>
    <div class="ask"><b>Instructions for Claude:</b> This is the list of values my property app uses. Please research each value in sections 1 to 4 against official Australian sources (the ATO for income tax, the low income tax offset and the Medicare levy; each state or territory revenue office for general/investor transfer duty) for the ${esc(fy)} financial year and the later years shown. For each one, tell me whether it is still correct and, if not, the new value in the same format, with the source and the date it applies from. Note any change that has been announced but not yet legislated. For sections 5 and 6, flag anything that looks out of date (for example interest rates compared with current investor rates) — those figures come from my own statements.</div>
    <h2>1. Income tax (resident) — by financial year</h2>${t(H, taxRows)}
    <h2>2. Stamp (transfer) duty — general / investor rates, no concessions or foreign surcharge</h2>${t(["State", "Bands in the app", "Checked value", "Source in the app"], duty)}
    <h2>3. LMI estimate and borrowing costs</h2>${t(H, [...lmi, ["Borrowing costs written off over", s.borrowYears + " years", ...chk]])}
    <h2>4. Defaults for new properties and Quick Check</h2>${t(H, defs)}
    <h2>5. People</h2>${t(H, ppl)}
    <div class="pb"></div><h2>6. Our properties</h2>${props}
    <p class="note">Generated by My Real Estate. Type checked values back into the app, then mark ${esc(fy)} as checked in Settings → Yearly figures check.</p></div>`;
}

/* ================= PDF report (print view → Save as PDF) ================= */
function buildPrint(p) {
  const r = result(p), s = r.summary, st = r.setup;
  r.availLVR = p.availLVR;
  const rows = reportRows(r).map(([c, l, f, t]) => c === "grp" ? `<tr class="grp"><td colspan="${r.rows.length + 2}">${esc(l)}</td></tr>` : `<tr class="${c}"><td>${esc(l)}</td><td>${t || ""}</td>${r.rows.map(x => `<td>${f(x).replace(/<[^>]+>/g, "")}</td>`).join("")}</tr>`).join("");
  const kv = (l, v) => `<tr><td>${esc(l)}</td><td>${v}</td></tr>`;
  const L = p.loan || {};
  const ph = p.photo && S.urls[p.photo] ? `<img class="pphoto" src="${S.urls[p.photo]}" alt="">` : "";
  $("#print").innerHTML = `${ph}<h1>${esc(p.name)} — 10-year property report</h1>
    <div class="meta">${esc(addrOf(p))} · ${esc(STATUS[p.status] || "")} · prepared ${fmtDate(todayISO())} with My Real Estate ${APP_VERSION}${r.k < 0.999 ? ` · dollar figures are our ${pct(r.k, 1)} share` : ""}</div>
    <div class="tiles"><div class="tile"><small>After tax, yr 1</small><strong>${wk(s.weekly1)}</strong></div><div class="tile"><small>Before tax, yr 1</small><strong>${wk(s.pretaxWeekly1)}</strong></div>
    <div class="tile"><small>Turns positive</small><strong>${r.income ? (s.breakEven ? "Year " + s.breakEven : "Not in 10 yrs") : "—"}</strong></div><div class="tile"><small>Equity yr 10</small><strong>${money(s.equity10)}</strong></div>
    <div class="tile"><small>10-yr wealth gain</small><strong>${money(s.wealth10)}</strong></div><div class="tile"><small>Borrowed / LVR</small><strong>${money(st.totalDebt * r.k)} · ${pct(st.lvr)}</strong></div></div>
    <table><thead><tr><th>Year</th><th>Today</th>${r.rows.map(x => `<th>Yr ${x.y} (${x.fy})</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
    <div class="pb"></div><h2>Inputs</h2><div class="cols">
    <table><tbody>${kv("Purchase price", money(st.price))}${kv("Today's value", money(st.value))}${kv("Cash deposit", money(st.cashDep))}${kv("Equity deposit", money(st.eqDep))}
      ${st.items.concat(st.loanItems).filter(c => N(c.amount)).map(c => kv(c.label + (c.fund === "equity" ? " (equity)" : ""), money(c.amount))).join("")}
      ${kv("Total purchase expenses", money(st.totalPurchaseExpenses))}${kv("Cash needed", money(st.cashRequired))}${kv("Equity used", money(st.equityUsed))}</tbody></table>
    <table><tbody>${kv("Main loan", money(st.mainLoan))}${kv("Rate / type", pct(N(L.rate), 2) + " " + (L.type === "PI" ? "P&I" : "I/O") + (L.type !== "PI" && N(L.ioYears) ? ` for ${L.ioYears} yrs` : ""))}${kv("Loan term", N(L.termYears || 30) + " yrs")}
      ${kv("Equity loan", money(st.equityLoan))}${kv("Total borrowed / LVR", money(st.totalDebt) + " / " + pct(st.lvr))}
      ${kv("Rent", money(N(p.rent && p.rent.pw)) + "/wk, " + N(p.rent && p.rent.vacant) + " vacant wks")}${kv("Management / letting", pct(N(p.mgmtPct), 2) + " / " + numIn(p.lettingWeeks) + " wks")}
      ${(p.expenses || []).filter(e => N(e.amount)).map(e => kv(e.label, money(e.amount))).join("")}</tbody></table>
    <table><tbody>${kv("Capital growth", pct(N(p.growth && p.growth.capital), 2))}${kv("Rent growth", pct(N(p.growth && p.growth.rent), 2))}${kv("CPI", pct(N(p.growth && p.growth.cpi), 2))}
      ${kv(p.depStartFy ? "Depreciation from " + p.depStartFy : "Depreciation yrs 1–10", (p.depreciation || []).map(v => Math.round(N(v)).toLocaleString("en-AU")).join(", ") || "none")}
      ${kv("Owners", r.owners.map(o => esc(pName(o.who)) + " " + pct(o.share, 1)).join(", "))}
      ${people().filter(x => x.household && r.owners.some(o => o.who === x.id)).map(x => kv(x.name + "'s taxable income", money(x.income))).join("")}
      ${kv("Tax rules", [...new Set(r.rows.map(x => x.rules))].join(", ") + " (resident rates, LITO, Medicare)")}</tbody></table></div>
    ${(p.placeholders || []).length ? `<p class="note"><b>Still to confirm:</b> ${esc(p.placeholders.join("; "))}</p>` : ""}
    ${p.notes ? `<p class="note"><b>Notes:</b> ${esc(p.notes)}</p>` : ""}
    <p class="note">Estimates only, based on the assumptions above; not financial or tax advice. Tax refunds are the difference in each owner's income tax (including the low income tax offset and Medicare levy) with and without the property's net result. Check with a qualified accountant before making decisions.</p>`;
}

/* ================= events ================= */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, p = S.open && getP(S.open);
  switch (a) {
    case "tab": S.tab = el.dataset.tab; S.open = null; S.set = null; render(); break;
    case "goHome": S.tab = "home"; S.open = null; render(); break;
    case "filter": S.filter = el.dataset.f; S._keepScroll = true; render(); break;
    case "open": S.open = el.dataset.id; S.ptab = "report"; S.wi = null; render(); break;
    case "close": S.open = null; S.tab = "home"; render(); break;
    case "ptab": S.ptab = el.dataset.t; render(); break;
    case "setGo": S.set = el.dataset.k; render(); break;
    case "setBack": S.set = null; render(); break;
    case "goBackup": S.open = null; S.tab = "settings"; S.set = "backup"; render(); break;
    case "setMe": S.meta.me = el.dataset.id; await saveMeta(); S._keepScroll = true; render(); break;
    case "newProp": { const np = newProperty(); await saveProp(np); S.props.push(np); S.open = np.id; S.ptab = "edit"; S.editOpen = { details: true, purchase: true }; render(); break; }
    case "dup": if (p) { const c = clone(p); c.id = uid("pr"); await copyPhoto(c); c.name = p.name + " (copy)"; c.sample = false; if (c.status === "owned") c.status = "looking"; await saveProp(c); S.props.push(c); S.open = c.id; S.ptab = "report"; toast("Copy made — change it without touching the original"); render(); } break;
    case "delProp": if (p && confirm(`Delete ${p.name}? This removes it from both phones (Dropbox keeps daily snapshots).`)) { if (p.photo) await dbDel("files", p.photo); await dbDel("props", p.id); S.props = S.props.filter(x => x.id !== p.id); S.open = null; toast("Deleted"); render(); } break;
    case "pdf": if (p) { if (p.photo) await photoURL(p.photo); buildPrint(p); setTimeout(() => window.print(), 150); } break;
    case "lineAdd": if (p) { const arr = getPath(p, el.dataset.base) || []; arr.push(el.dataset.base === "expenses" ? { id: uid("e"), label: "", amount: 0 } : { id: uid("c"), label: "", amount: 0, fund: "cash", auto: null }); setPath(p, el.dataset.base, arr); await saveProp(p); S._keepScroll = true; render(); } break;
    case "lineDel": if (p) { const arr = getPath(p, el.dataset.base) || []; arr.splice(+el.dataset.i, 1); await saveProp(p); S._keepScroll = true; render(); } break;
    case "seasonAdd": if (p) { const ss = p.rent.shortStay = p.rent.shortStay || { mode: "add", seasons: [] }; ss.seasons = ss.seasons || []; ss.seasons.push({ name: ["Peak", "Mid", "Low"][ss.seasons.length] || "Season", weeks: 13, pw: 0, vacant: 3 }); await saveProp(p); S._keepScroll = true; render(); } break;
    case "autoOff": if (p) { const it = getPath(p, el.dataset.base)[+el.dataset.i]; const st = result(p).setup; it.amount = Math.round((el.dataset.base === "purchaseCosts" ? st.items : st.loanItems)[+el.dataset.i].amount); it.auto = null; await saveProp(p); S._keepScroll = true; render(); } break;
    case "autoOn": if (p) { const it = getPath(p, el.dataset.base)[+el.dataset.i]; it.auto = el.dataset.auto; await saveProp(p); S._keepScroll = true; render(); } break;
    case "eqManual": if (p) { p.equityLoan = p.equityLoan || {}; if (el.checked) { p.equityLoan.amountMode = "manual"; p.equityLoan.amount = Math.round(result(p).setup.equityLoan * 100) / 100; } else p.equityLoan.amountMode = "auto"; await saveProp(p); S._keepScroll = true; render(); } break;
    case "loanManual": if (p) { p.loan = p.loan || {}; if (el.checked) { p.loan.amountMode = "manual"; p.loan.amount = result(p).setup.mainLoan; } else p.loan.amountMode = "auto"; await saveProp(p); S._keepScroll = true; render(); } break;
    case "ownerAdd": if (p) { p.owners = p.owners || []; const used = new Set(p.owners.map(o => o.who)); const nx = people().find(x => !used.has(x.id)) || people()[0]; p.owners.push({ who: nx.id, share: 0 }); await saveProp(p); S._keepScroll = true; render(); } break;
    case "ownerSplit": if (p && (p.owners || []).length) { p.owners.forEach(o => o.share = 1 / p.owners.length); await saveProp(p); S._keepScroll = true; render(); } break;
    case "depFill": if (p) { const pc = (num($("#depPct").value) ?? 6) / 100, n = Math.max(10, $$(".dep input").length), d = Array.from({ length: n }, (_, i) => N((p.depreciation || [])[i]));
      let last = -1; for (let i = 0; i < n; i++) if (d[i]) last = i;
      if (last < 0) { toast("Enter the first year first"); break; } if (last === n - 1) { toast("Every year already has a figure"); break; }
      for (let i = last + 1; i < n; i++) d[i] = Math.round(d[i - 1] * (1 - pc)); p.depreciation = d; await saveProp(p); toast(`${n - last - 1} later years filled`); S._keepScroll = true; render(); } break;
    case "photoDel": if (p && confirm("Remove this photo?")) { await removePhoto(p); S._keepScroll = true; render(); } break;
    case "goCheck": closeModal(); S.open = null; S.tab = "settings"; S.set = "check"; render(); break;
    case "checkPdf": closeModal(); buildCheckPrint(); setTimeout(() => window.print(), 50); break;
    case "checkDone": if (confirm(`Mark the ${curFy()} figures as checked? The red reminder comes back on 1 July next year.`)) { await editSettings(x => { x.rulesCheckedFY = curFy(); x.rulesChecked = todayISO(); }); closeModal(); toast("Marked as checked for " + curFy()); render(); } break;
    case "modalClose": closeModal(); break;
    case "phDone": if (p) { p.placeholders.splice(+el.dataset.i, 1); await saveProp(p); S._keepScroll = true; render(); } break;
    case "phAdd": if (p) { const t = $("#phNew").value.trim(); if (t) { p.placeholders = p.placeholders || []; p.placeholders.push(t); await saveProp(p); S._keepScroll = true; render(); } } break;
    case "wiReset": if (p) { S.wi = { pid: p.id, ...wiBase(p) }; S._keepScroll = true; render(); } break;
    case "wiSave": if (p) { const w = S.wi, c = Engine.applyOver(p, { pw: w.pw, rate: w.rate, vacant: w.vacant, capital: w.capital, rentGrowth: w.rentGrowth, price: p.status !== "owned" ? w.price : undefined });
      c.id = uid("pr"); await copyPhoto(c); c.name = `${p.name} — ${money(w.pw)}/wk at ${pct(w.rate, 2)}`; c.sample = false; if (c.status === "owned") c.status = "looking"; await saveProp(c); S.props.push(c); S.open = c.id; S.ptab = "report"; S.wi = null; toast("Saved as a scenario"); render(); } break;
    case "quickSave": { const q = quickState(), np = quickProp(q); np.id = uid("pr"); np.name = `Quick check ${money(q.price)} ${q.state}`; await saveProp(np); S.props.push(np); S.open = np.id; S.ptab = "edit"; S.editOpen = { details: true }; toast("Saved — add the address and anything you know"); render(); break; }
    case "cmpPick": { const id = el.dataset.id; S.cmp = S.cmp.includes(id) ? S.cmp.filter(x => x !== id) : [...S.cmp, id].slice(-3); S._keepScroll = true; render(); break; }
    /* settings */
    case "taxAdd": { const s = SET(), ks = Object.keys(s.taxYears).sort(), last = ks[ks.length - 1], nf = nextFy(last); await editSettings(x => { x.taxYears[nf] = { ...clone(x.taxYears[last]), note: "Copied from " + last + " — change what the budget changed." }; }); toast(nf + " added"); render(); break; }
    case "taxDel": if (Object.keys(SET().taxYears).length > 1 && confirm("Delete the " + el.dataset.fy + " rates?")) { await editSettings(x => { delete x.taxYears[el.dataset.fy]; }); S._keepScroll = true; render(); } break;
    case "brAdd": await editSettings(x => { const b = x.taxYears[el.dataset.fy].brackets; b.push({ from: (b[b.length - 1] || { from: 0 }).from + 50000, rate: 0.45 }); }); S._keepScroll = true; render(); break;
    case "brDel": await editSettings(x => { x.taxYears[el.dataset.fy].brackets.splice(+el.dataset.i, 1); }); S._keepScroll = true; render(); break;
    case "rulesReset": if (confirm("Put the tax rates, stamp duty tables and LMI scale back to the ones built into this version? People and properties aren't changed.")) { await editSettings(x => { const d = SEED.SETTINGS; x.taxYears = clone(d.taxYears); x.duty = clone(d.duty); x.lmi = clone(d.lmi); x.borrowYears = d.borrowYears; x.rulesChecked = d.rulesChecked; }); toast("Rules reset"); render(); } break;
    case "dutyState": S.dutyState = el.dataset.s; render(); break;
    case "bandAdd": await editSettings(x => { const b = x.duty[S.dutyState].bands; const last = b[b.length - 1] || { from: 0 }; b.push(el.dataset.whole ? { from: last.from + 100000, whole: 0.05 } : { from: last.from + 100000, base: 0, rate: 0.05 }); }); S._keepScroll = true; render(); break;
    case "bandDel": await editSettings(x => { x.duty[S.dutyState].bands.splice(+el.dataset.i, 1); }); S._keepScroll = true; render(); break;
    case "lmiAdd": await editSettings(x => { x.lmi.push({ above: 0.95, pct: 0.05 }); }); S._keepScroll = true; render(); break;
    case "lmiDel": await editSettings(x => { x.lmi.splice(+el.dataset.i, 1); }); S._keepScroll = true; render(); break;
    case "personAdd": await editSettings(x => { x.people.push({ id: uid("p"), name: "New person", income: 0, incomeGrowth: 0, household: false }); }); S._keepScroll = true; render(); break;
    case "personDel": await editSettings(x => { x.people.splice(+el.dataset.i, 1); }); S._keepScroll = true; render(); break;
    case "restoreSeeds": { const have = new Set(S.props.map(x => x.id)); const add = SEED.PROPERTIES.filter(x => !have.has(x.id)); if (!add.length) { toast("All the preloaded properties are already here"); break; } for (const x of add) { const c = clone(x); await saveProp(c); S.props.push(c); } toast(`${add.length} added back`); render(); break; }
    case "checkUpdate": checkUpdate(); break;
    /* backup & sync */
    case "backupSave": backupSave(); break;
    case "dbxConnect": el.disabled = true; try { await dbxConnect(); } catch (err) { toast("Couldn't start Dropbox sign-in: " + (err.message || err)); } el.disabled = false; break;
    case "dbxSyncNow": dbxSync({ manual: true }); break;
    case "dbxSnap": el.disabled = true; maybeSnapshot(true).then(() => { toast("Snapshot saved to Dropbox"); render(); }).catch(x => { el.disabled = false; toast("Snapshot didn't save: " + (x.message || x)); }); break;
    case "dbxList": listSnapshots(); break;
    case "dbxUse": useSnapshot(el.dataset.path); break;
    case "conflictDropbox": resolveConflict(true); break;
    case "conflictPhone": resolveConflict(false); break;
    case "dbxDisconnect": if (confirm("Disconnect Dropbox? Everything already in Dropbox is kept, but new changes will only be on this phone.")) dbxDisconnect(); break;
  }
});
document.addEventListener("toggle", e => { const d = e.target; if (d.matches && d.matches("details.sec[data-sec]")) S.editOpen[d.dataset.sec] = d.open; }, true);
document.addEventListener("change", async e => {
  const el = e.target;
  if (el.dataset.path && S.open) {
    const p = getP(S.open); if (!p) return;
    const v = kinds[el.dataset.kind](el.value, el); setPath(p, el.dataset.path, v);
    await saveProp(p);
    const structural = /^(status|state|loan\.type|equityLoan\.type|rent\.shortStay\.mode|incomeProducing|name|depStartFy)$/.test(el.dataset.path) || el.dataset.path.endsWith(".fund") || el.dataset.path.endsWith(".who");
    if (structural) { S._keepScroll = true; render(); } else updateCalcs(p);
    return;
  }
  if (el.dataset.rule) {
    const v = kinds[el.dataset.kind](el.value, el);
    await editSettings(s => setPath(s, el.dataset.rule, v));
    resCache.clear();
    if (el.dataset.kind === "bool") { S._keepScroll = true; render(); } // only tick boxes change what's shown; typed values stay put so the keyboard doesn't jump
    else { const o = $("#dutyOut"); if (o) o.textContent = money(Engine.stampDuty(num(S.dutyTest || "700000"), SET().duty[S.dutyState])); }
    return;
  }
  if (el.id === "wifiOnly") { S.meta.wifiOnly = el.checked; await saveMeta(); paintStatus(); if (!el.checked) scheduleSync(500); return; }
  if (el.id === "restoreIn" && el.files[0]) { restoreFile(el.files[0]); el.value = ""; }
  if (el.id === "photoIn" && el.files[0] && S.open) { const p = getP(S.open); toast("Adding photo…"); try { await setPhoto(p, el.files[0]); toast("Photo saved"); } catch (err) { toast("That photo couldn't be added: " + (err.message || err)); } el.value = ""; S._keepScroll = true; render(); }
});
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.wi && S.wi) { const k = el.dataset.wi, v = Number(el.value); S.wi[k] = v; const o = $("#wo-" + k); if (o) o.textContent = k === "pw" ? money(v) + "/wk" : k === "vacant" ? v + " wk" : k === "price" ? money(v) : pct(v, 2); clearTimeout(paintWhatIf._t); paintWhatIf._t = setTimeout(paintWhatIf, 60); return; }
  if (el.dataset.q) { const q = quickState(); q[el.dataset.q] = el.dataset.kind === "sel" ? el.value : el.dataset.kind === "pct" ? (num(el.value) ?? 0) / 100 : (num(el.value) ?? 0); S.meta.quick = q; saveMeta(); clearTimeout(paintQuick._t); paintQuick._t = setTimeout(paintQuick, 120); return; }
  if (el.id === "dutyTest") { S.dutyTest = el.value; const o = $("#dutyOut"); if (o) o.textContent = money(Engine.stampDuty(num(el.value), SET().duty[S.dutyState])); }
});
document.addEventListener("change", e => { if (e.target.dataset && e.target.dataset.q && e.target.dataset.kind === "sel") e.target.dispatchEvent(new Event("input", { bubbles: true })); });

function newProperty() {
  const d = SET().defaults;
  return { id: uid("pr"), name: "New property", status: "looking", street: "", suburb: "", state: "NSW", postcode: "", type: "House", startDate: todayISO(), incomeProducing: true,
    price: 0, marketValue: 0, cashDeposit: 0, equityDeposit: 0,
    purchaseCosts: [{ id: uid("c"), label: "Legals (solicitor/conveyancer)", amount: d.legals, fund: d.depositFund }, { id: uid("c"), label: "Stamp duty", amount: 0, fund: d.depositFund, auto: "duty" }, { id: uid("c"), label: "Other costs", amount: 0, fund: d.depositFund }],
    loanCosts: [{ id: uid("c"), label: "Loan establishment fees", amount: d.establishment, fund: d.depositFund }, { id: uid("c"), label: "Property valuation", amount: d.valuation, fund: d.depositFund }, { id: uid("c"), label: "LMI", amount: 0, fund: d.depositFund, auto: "lmi" }],
    loan: { amountMode: "auto", rate: d.rate, type: d.type, ioYears: 0, termYears: d.termYears }, equityLoan: { rate: "", type: "IO" },
    rent: { weeks: 52, pw: 0, vacant: d.vacant, shortStay: { mode: "none", seasons: [] } }, mgmtPct: d.mgmtPct, lettingWeeks: d.lettingWeeks,
    expenses: [{ id: uid("e"), label: "Council rates", amount: 0 }, { id: uid("e"), label: "Building insurance", amount: d.buildingIns }, { id: uid("e"), label: "Landlord insurance", amount: d.landlordIns }, { id: uid("e"), label: "Strata / body corporate", amount: 0 }, { id: uid("e"), label: "Land tax", amount: 0 }],
    growth: { capital: d.capital, rent: d.rent, cpi: d.cpi }, depreciation: [], availLVR: d.availLVR, owners: clone(d.owners), placeholders: [], notes: "" };
}
async function checkUpdate() {
  try { const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (r) await r.update(); toast("Checking… the app will reload"); setTimeout(() => location.reload(), 1200); }
  catch (e) { toast("Couldn't check for an update: " + (e.message || e)); }
}

/* ================= backup file ================= */
function viewBackup() {
  return `${dropboxPanel()}
  <div class="card"><h2>Backup file</h2><p class="small muted" style="margin:0">One file with every property, photo and setting — an extra copy for the QNAP. Never upload it to GitHub.</p>
    <div class="row"><button type="button" class="btn" data-act="backupSave">Save backup file</button>
    <label class="btn">Restore from file…<input type="file" id="restoreIn" accept="application/json,.json" hidden></label></div>
    ${S.meta.lastBackup ? `<p class="xs muted" style="margin:0">Last backup file: ${esc(fmtWhen(S.meta.lastBackup))}</p>` : ""}</div>`;
}
async function backupSave() {
  const files = await dbAll("files"), photos = {};
  for (const f of files) photos[f.id] = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f.blob); });
  const blob = new Blob([wrap({ ...(await localData(files)), photos })], { type: "application/json" }), a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `my-real-estate-backup-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  S.meta.lastBackup = new Date().toISOString(); await saveMeta(); toast("Backup file saved to Downloads");
}
async function restoreFile(f) {
  try {
    const d = readPayload(JSON.parse(await f.text()));
    if (!confirm(`Restore ${d.props.length} properties from this file? It replaces everything on this phone${dbxOn() ? " and in Dropbox (the current copy is saved as a snapshot first)" : ""}.`)) return;
    if (!(await snapshotBeforeReplace())) return;
    await applyData(d, true);
    S.meta.tomb = {}; S.meta.conflict = null; S.meta.gen = uid("g"); S.meta.genPending = true; await saveMeta(); markDirty();
    toast(`Restored ${d.props.length} properties`); render();
  } catch (e) { toast("That file couldn't be restored: " + (e.message || e)); }
}

/* ================= Dropbox: live copy + snapshots (same approach as Our Tax and MyGarage) =================
   Dropbox › Apps › MyRealEstate
     live/myrealestate.json           properties and settings — sent a few seconds after every change (Wi‑Fi only unless switched off)
     snapshots/myrealestate-*.json    one per day, plus one before every restore (kept 60 days)
     archive/myrealestate-YYYY-MM.json   the last copy of each month (kept 8 years)   */
const DBX_APP_KEY = "k12i1gnu147hl61"; // public App key for the MyRealEstate Dropbox app (the App secret is never used)
const DBX_TOKEN = "https://api.dropboxapi.com/oauth2/token";
const DBX_REDIRECT = location.origin + location.pathname.replace(/index\.html$/, "");
const LIVE = "/live/myrealestate.json";
let syncing = false, syncT = null, retryT = null;
const appKey = () => DBX_APP_KEY || S.meta.dbxKey || "";
const dbxOn = () => !!(S.meta.dbx && S.meta.dbx.refresh);
const hasData = () => S.props.length > 0;
const ownerName = () => (S.meta.me ? pName(S.meta.me) + "'s phone" : "A phone") + ", set up " + fmtDate(S.meta.created || todayISO());
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
class DbxErr extends Error { constructor(m, s, sum) { super(m); this.status = s; this.summary = sum || ""; } }
const dbxArg = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtWhen = s => { if (!s) return "never"; const d = new Date(s); if (isNaN(d)) return "—"; const t = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }); return (isoOf(d) === todayISO() ? "today" : fmtDate(isoOf(d))) + ", " + t; };
const notFound = e => e instanceof DbxErr && e.status === 409 && /not_found/.test(e.summary);
function snapName(kind) { const d = new Date(); return `/snapshots/myrealestate-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}${kind ? "-" + p2(d.getHours()) + p2(d.getMinutes()) + "-" + kind : ""}.json`; }
const wifiOnly = () => S.meta.wifiOnly !== false;
const mobileBlocked = () => !!(wifiOnly() && navigator.connection && navigator.connection.type === "cellular");

function markDirty() { if (_quiet) return; S.meta.dirty = true; S.meta.changes = (S.meta.changes || 0) + 1; S.meta.seq = (S.meta.seq || 0) + 1; saveMeta().catch(() => {}); scheduleSync(); paintStatus(); }
function syncText() {
  if (!dbxOn()) return hasData() ? { t: "not backed up", c: "warn" } : { t: "not connected", c: "" };
  if (S.meta.conflict) return { t: "Dropbox copy differs · tap", c: "warn" };
  if (syncing) return { t: "syncing…", c: "" };
  if (S.meta.syncError) return { t: "sync failed · tap", c: "warn" };
  if (S.meta.dirty) { const n = S.meta.changes || 1; return { t: `${n} change${n === 1 ? "" : "s"} waiting${mobileBlocked() ? " for Wi‑Fi" : ""}`, c: "" }; }
  return { t: "in Dropbox ✓", c: "ok" };
}
function paintStatus() {
  const el = $("#sync"); if (!el) return; const s = syncText();
  el.innerHTML = (s.c === "ok" ? IC.wifi : "") + esc((S.meta.me ? pName(S.meta.me) + " · " : "") + s.t); el.className = "sync " + s.c;
  const pnl = $("#dbxStatus"); if (pnl) pnl.textContent = cap1(s.t.replace(" · tap", ""));
}
async function dbxConnect() {
  if (!navigator.onLine) { toast("You're offline. Connect Dropbox when you have internet."); return; }
  const key = DBX_APP_KEY || (($("#dbxKey") || {}).value || S.meta.dbxKey || "").trim();
  if (!/^[a-z0-9]{8,}$/i.test(key)) { toast("Paste the App key from the Dropbox App Console first"); return; }
  const v = b64url(crypto.getRandomValues(new Uint8Array(48))), state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  S.meta.dbxKey = key; S.meta.pkce = { v, state }; S.meta.syncError = null; await saveMeta();
  location.href = "https://www.dropbox.com/oauth2/authorize?" + new URLSearchParams({ client_id: key, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", redirect_uri: DBX_REDIRECT, token_access_type: "offline", state });
}
async function dbxReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.has("code") && !q.has("error")) return false;
  history.replaceState(null, "", DBX_REDIRECT);
  if (q.has("error")) { toast("Dropbox not connected: " + (q.get("error_description") || q.get("error")).replace(/\+/g, " ")); return true; }
  if (!S.meta.pkce || q.get("state") !== S.meta.pkce.state) { toast("That Dropbox sign-in didn't match. Tap Connect Dropbox again."); return true; }
  try {
    const r = await fetch(DBX_TOKEN, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: q.get("code"), client_id: appKey(), code_verifier: S.meta.pkce.v, redirect_uri: DBX_REDIRECT }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || "HTTP " + r.status);
    S.meta.dbx = { refresh: j.refresh_token, access: j.access_token, expires: Date.now() + (j.expires_in || 14400) * 1000 };
    S.meta.pkce = null; S.meta.dbxRev = null; S.meta.syncError = null; S.meta.conflict = null; S.meta.sentFiles = []; await saveMeta();
    toast(matchMedia("(display-mode: standalone)").matches ? "Dropbox connected" : "Dropbox connected. You can close this tab and open My Real Estate from your home screen.");
  } catch (e) { S.meta.pkce = null; S.meta.syncError = "Dropbox sign-in failed: " + (e.message || e); await saveMeta(); toast(S.meta.syncError); }
  return true;
}
async function dbxToken() {
  const d = S.meta.dbx; if (!d || !d.refresh) throw new Error("Dropbox is not connected");
  if (d.access && d.expires > Date.now() + 60000) return d.access;
  const r = await fetch(DBX_TOKEN, { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: d.refresh, client_id: appKey() }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (j.error === "invalid_grant") { S.meta.dbx = null; S.meta.syncError = "Dropbox access was removed or has expired. Connect Dropbox again."; await saveMeta(); } throw new Error(j.error_description || j.error || "HTTP " + r.status); }
  d.access = j.access_token; d.expires = Date.now() + (j.expires_in || 14400) * 1000; await saveMeta(); return d.access;
}
async function dbxCall(url, opt = {}, retry = true) {
  const tok = await dbxToken();
  const r = await fetch(url, { method: "POST", ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + tok } });
  if (r.status === 401 && retry) { S.meta.dbx.access = null; return dbxCall(url, opt, false); }
  if (r.status === 429 && retry) { await sleep(3000); return dbxCall(url, opt, false); }
  if (!r.ok) { const t = await r.text().catch(() => ""); let s = t; try { s = JSON.parse(t).error_summary || t; } catch {} throw new DbxErr("Dropbox " + r.status + ": " + String(s).slice(0, 120), r.status, String(s)); }
  return r;
}
async function dbxApi(ep, arg) { const r = await dbxCall("https://api.dropboxapi.com/2/" + ep, arg === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(arg) }); const t = await r.text(); return t ? JSON.parse(t) : null; }
async function dbxMeta(path) { try { return await dbxApi("files/get_metadata", { path }); } catch (e) { if (notFound(e)) return null; throw e; } }
async function dbxUpload(path, body, mode) { const r = await dbxCall("https://content.dropboxapi.com/2/files/upload", { headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": dbxArg({ path, mode: mode || "overwrite", autorename: false, mute: true }) }, body }); return r.json(); }
async function dbxDownload(path) { const r = await dbxCall("https://content.dropboxapi.com/2/files/download", { headers: { "Dropbox-API-Arg": dbxArg({ path }) } }); return r.blob(); }
async function dbxList(path) { try { let j = await dbxApi("files/list_folder", { path }), out = j.entries; while (j.has_more) { j = await dbxApi("files/list_folder/continue", { cursor: j.cursor }); out = out.concat(j.entries); } return out; } catch (e) { if (notFound(e)) return []; throw e; } }

/* Both phones can edit at the same time: each property carries the time it last changed (_t), deletions are remembered, and every sync
   merges the two copies property by property — the most recent change wins. Settings travel as one piece (latest wins). */
const filePath = f => `/live/photos/${f.id}.jpg`;
async function localData(files) { files = files || await dbAll("files"); return { props: await dbAll("props"), settings: S.meta.settings || null, deleted: S.meta.tomb || {}, gen: S.meta.gen || null, files: files.map(f => ({ id: f.id, type: f.type, path: filePath(f) })) }; }
async function pushFiles(files) {
  files = files || await dbAll("files"); const sent = new Set(S.meta.sentFiles || []); let n = 0;
  for (const f of files) { if (sent.has(f.id)) continue; await dbxUpload(filePath(f), f.blob, "overwrite"); sent.add(f.id); n++; }
  if (n) { S.meta.sentFiles = [...sent]; await saveMeta(); }
}
const wrap = d => JSON.stringify({ app: APP_ID, schema: BACKUP_VERSION, appVersion: APP_VERSION, updatedAt: new Date().toISOString(), owner: S.meta.deviceId, ownerName: ownerName(), data: d });
async function payloadJSON() { return wrap(await localData()); }
function readPayload(j) { const d = j && (j.data || j); if (!d || !Array.isArray(d.props)) throw new Error("That isn't a My Real Estate copy");
  return { props: d.props, settings: d.settings || null, deleted: d.deleted || {}, gen: d.gen || null, files: Array.isArray(d.files) ? d.files : [], photos: d.photos || null }; }
const tOf = r => (r && r._t) || 0;
function mergeData(L, R) {
  const deleted = { ...(R.deleted || {}) }; for (const [id, t] of Object.entries(L.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);
  const m = new Map(); for (const r of [...L.props, ...R.props]) { const c = m.get(r.id); if (!c || tOf(r) > tOf(c)) m.set(r.id, r); }
  const props = [...m.values()].filter(r => !(deleted[r.id] && deleted[r.id] >= tOf(r)));
  const settings = tOf(L.settings) >= tOf(R.settings) ? L.settings || R.settings : R.settings;
  const fm = new Map(); for (const f of [...(R.files || []), ...(L.files || [])]) if (!deleted[f.id]) fm.set(f.id, f);
  return { props, settings, deleted, gen: R.gen || L.gen, files: [...fm.values()] };
}
const sig = d => JSON.stringify([d.props.map(r => r.id + ":" + tOf(r)).sort(), (d.files || []).map(f => f.id).sort(), tOf(d.settings), Object.keys(d.deleted || {}).length, d.gen]);
async function applyData(d, wholesale) {
  const [lp, lf] = await Promise.all([dbAll("props"), dbAll("files")]);
  const have = new Set(lf.map(f => f.id)), want = new Set((d.files || []).map(f => f.id));
  const missing = (d.files || []).filter(f => !have.has(f.id));
  for (const f of missing) {
    if (d.photos && d.photos[f.id]) { f._blob = await (await fetch(d.photos[f.id])).blob(); continue; } // from a backup file
    if (dbxOn()) { try { f._blob = await dbxDownload(f.path || filePath(f)); f._fromDbx = true; } catch (e) { if (!notFound(e)) throw e; } }
  }
  _quiet++;
  try {
    const lm = new Map(lp.map(r => [r.id, r])), nm = new Set(d.props.map(r => r.id));
    for (const r of d.props) { const c = lm.get(r.id); if (!c || tOf(c) !== tOf(r) || wholesale) await dbPut("props", r); }
    for (const r of lp) if (!nm.has(r.id)) await dbDel("props", r.id);
    for (const f of lf) if (!want.has(f.id)) { await dbDel("files", f.id); if (S.urls[f.id]) { URL.revokeObjectURL(S.urls[f.id]); delete S.urls[f.id]; } }
    for (const f of missing) if (f._blob) await dbPut("files", { id: f.id, type: f.type || "image/jpeg", blob: new Blob([f._blob], { type: f.type || "image/jpeg" }) });
  } finally { _quiet--; }
  const sent = new Set(S.meta.sentFiles || []); for (const f of missing) if (f._fromDbx) sent.add(f.id); S.meta.sentFiles = [...sent];
  if (d.settings) S.meta.settings = d.settings;
  S.meta.tomb = d.deleted || {}; S.meta.gen = d.gen || S.meta.gen;
  await saveMeta(); S.props = await dbAll("props"); resCache.clear();
}
async function pushLive(mode, data) {
  const seq = S.meta.seq; await pushFiles();
  if (!S.meta.gen) S.meta.gen = uid("g");
  const res = await dbxUpload(LIVE, wrap(data || await localData()), mode || (S.meta.dbxRev ? { ".tag": "update", update: S.meta.dbxRev } : "add"));
  S.meta.dbxRev = res.rev; S.meta.lastSync = Date.now(); S.meta.syncError = null; S.meta.conflict = null; S.meta.genPending = false;
  if (S.meta.seq === seq) { S.meta.dirty = false; S.meta.changes = 0; }
  await saveMeta();
}
async function adoptRemote() {
  const rm = await dbxMeta(LIVE); if (!rm) return;
  const d = readPayload(JSON.parse(await (await dbxDownload(LIVE)).text()));
  await applyData(d, true); S.meta.gen = d.gen;
  S.meta.dbxRev = rm.rev; S.meta.dirty = false; S.meta.changes = 0; S.meta.seq = (S.meta.seq || 0) + 1; S.meta.conflict = null; S.meta.genPending = false; S.meta.lastSync = Date.now(); S.meta.syncError = null; await saveMeta();
  render();
}
function scheduleSync(ms = 4000) { clearTimeout(syncT); if (dbxOn()) syncT = setTimeout(() => dbxSync(), ms); }
async function syncOnce() {
  const rm = await dbxMeta(LIVE);
  if (!rm) { if (hasData() || S.meta.dirty) await pushLive("add"); else { S.meta.lastSync = Date.now(); S.meta.syncError = null; await saveMeta(); } return "pushed"; }
  if (rm.rev === S.meta.dbxRev && !S.meta.dirty && !S.meta.genPending) { S.meta.lastSync = Date.now(); S.meta.syncError = null; await saveMeta(); return "none"; }
  const R = readPayload(JSON.parse(await (await dbxDownload(LIVE)).text()));
  if (S.meta.genPending) { try { await dbxApi("files/copy_v2", { from_path: LIVE, to_path: snapName("replaced"), autorename: true }); } catch {} await pushLive({ ".tag": "update", update: rm.rev }); return "pushed"; }
  if (S.meta.gen && R.gen && R.gen !== S.meta.gen) {
    if (S.meta.dirty) { S.meta.conflict = { rev: rm.rev, when: rm.server_modified }; await saveMeta(); return "conflict"; }
    await adoptRemote(); return "adopted";
  }
  const L = await localData(), M = mergeData(L, R);
  if (sig(M) !== sig(L)) await applyData(M);
  if (sig(M) !== sig(R) || S.meta.dirty) await pushLive({ ".tag": "update", update: rm.rev }, { ...(await localData()), gen: M.gen });
  else { S.meta.dbxRev = rm.rev; S.meta.lastSync = Date.now(); S.meta.syncError = null; S.meta.dirty = false; S.meta.changes = 0; S.meta.gen = M.gen; await saveMeta(); }
  return sig(M) !== sig(L) ? "merged" : "pushed";
}
async function dbxSync(opts = {}) {
  if (!dbxOn() || syncing) return;
  if (!navigator.onLine) { if (opts.manual) toast("You're offline. Changes will go to Dropbox when you're back online."); paintStatus(); return; }
  if (mobileBlocked() && !opts.manual) { paintStatus(); return; }
  syncing = true; paintStatus(); let ok = false, failed = false, res = "";
  try {
    for (let i = 0; i < 4; i++) { try { res = await syncOnce(); break; } catch (e) { if (e instanceof DbxErr && e.status === 409 && /conflict/.test(e.summary) && i < 3) { await sleep(400 + Math.random() * 800); continue; } throw e; } }
    ok = res !== "conflict";
    if (res === "merged" || res === "adopted") toast("Updated with changes from the other phone");
  } catch (e) {
    failed = true; S.meta.syncError = (!navigator.onLine || e instanceof TypeError) ? "Couldn't reach Dropbox. It will try again shortly." : String(e.message || e);
    await saveMeta(); if (opts.manual) toast(S.meta.syncError);
  } finally { syncing = false; }
  if (ok && opts.manual) toast("Dropbox is up to date");
  if (ok && hasData()) maybeSnapshot(false).catch(() => {});
  if (res === "merged" || res === "adopted" || (S.tab === "settings" && S.set === "backup")) { S._keepScroll = true; render(); } else paintStatus();
  clearTimeout(retryT); if (failed && dbxOn()) retryT = setTimeout(() => dbxSync(), 120000);
  if (ok && S.meta.dirty) scheduleSync(1500);
}
async function maybeSnapshot(force) {
  const day = new Date().toDateString(); if (!force && S.meta.lastSnapDay === day) return; await pushFiles();
  const body = await payloadJSON(), d = new Date();
  await dbxUpload(snapName(force ? "manual" : ""), body, "overwrite");
  await dbxUpload(`/archive/myrealestate-${d.getFullYear()}-${p2(d.getMonth() + 1)}.json`, body, "overwrite");
  S.meta.lastSnapDay = day; S.meta.lastSnap = Date.now(); await saveMeta();
  pruneSnapshots().catch(() => {});
}
async function pruneSnapshots() {
  const cut = Date.now() - 60 * 864e5, acut = new Date(new Date().getFullYear() - 8, new Date().getMonth(), 1).getTime();
  for (const e of await dbxList("/snapshots")) { const m = e.name.match(/(\d{4})-(\d{2})-(\d{2})/); if (e[".tag"] === "file" && m && new Date(+m[1], m[2] - 1, +m[3]).getTime() < cut) { try { await dbxApi("files/delete_v2", { path: e.path_lower }); } catch {} } }
  for (const e of await dbxList("/archive")) { const m = e.name.match(/(\d{4})-(\d{2})\.json$/); if (e[".tag"] === "file" && m && new Date(+m[1], m[2] - 1, 1).getTime() < acut) { try { await dbxApi("files/delete_v2", { path: e.path_lower }); } catch {} } }
}
async function snapshotBeforeReplace() { if (!dbxOn() || !hasData()) return true; try { await pushFiles(); await dbxUpload(snapName("before-restore"), await payloadJSON(), "overwrite"); return true; } catch (e) { toast("Couldn't save a snapshot to Dropbox first, so nothing was changed. Check you're online."); return false; } }
async function listSnapshots() {
  const el = $("#snapList"); if (!el) return; el.innerHTML = `<p class="small muted" style="margin:0">Looking in Dropbox…</p>`;
  try {
    const list = [...(await dbxList("/snapshots")), ...(await dbxList("/archive"))].filter(e => e[".tag"] === "file" && /\.json$/i.test(e.name)).sort((a, b) => String(b.server_modified).localeCompare(String(a.server_modified)));
    el.innerHTML = list.length ? `<div class="list">${list.slice(0, 80).map(e => `<div class="li" style="cursor:default;padding-inline:0"><span class="t"><b>${esc(fmtWhen(e.server_modified))}</b><span>${/archive/.test(e.path_lower) ? "Monthly archive · " : /before-restore/.test(e.name) ? "Saved before a restore · " : /replaced/.test(e.name) ? "Dropbox copy that was replaced · " : /manual/.test(e.name) ? "Snapshot now · " : "Daily · "}${(e.size / 1024).toFixed(0)} KB</span></span><button type="button" class="btn sm" data-act="dbxUse" data-path="${esc(e.path_lower)}">Use this</button></div>`).join("")}</div>` : `<p class="small muted" style="margin:0">No snapshots in Dropbox yet.</p>`;
  } catch (e) { el.innerHTML = `<p class="small" style="color:var(--neg);margin:0">Couldn't list Dropbox snapshots: ${esc(e.message || e)}</p>`; }
}
async function useSnapshot(path) {
  if (!navigator.onLine) { toast("You're offline."); return; }
  if (!confirm("Use this snapshot? It replaces the properties on both phones. The current copy is saved as a snapshot first.")) return;
  try {
    const d = readPayload(JSON.parse(await (await dbxDownload(path)).text()));
    if (!(await snapshotBeforeReplace())) return;
    await applyData(d, true);
    S.meta.conflict = null; S.meta.gen = uid("g"); S.meta.genPending = true; markDirty();
    toast(`Snapshot restored: ${S.props.length} properties`); render();
  } catch (e) { toast("That snapshot couldn't be used: " + (e.message || e)); }
}
async function resolveConflict(useDropbox) {
  if (!navigator.onLine) { toast("You're offline. Try again when you're online."); return; }
  syncing = true; paintStatus();
  try {
    if (useDropbox) { if (hasData()) await dbxUpload(snapName("before-restore"), await payloadJSON(), "overwrite"); syncing = false; await adoptRemote(); toast("Using the Dropbox copy. This phone's copy was saved as a snapshot."); }
    else { try { await dbxApi("files/copy_v2", { from_path: LIVE, to_path: snapName("replaced"), autorename: true }); } catch {} S.meta.gen = uid("g"); await pushLive("overwrite"); toast("Kept this phone's copy. The Dropbox copy was saved as a snapshot."); }
  } catch (e) { toast("That didn't work: " + (e.message || e)); }
  syncing = false; render();
}
async function dbxDisconnect() {
  try { await dbxApi("auth/token/revoke"); } catch {}
  S.meta.dbx = null; S.meta.dbxRev = null; S.meta.conflict = null; S.meta.syncError = null; S.meta.sentFiles = []; await saveMeta();
  clearTimeout(syncT); render(); toast("Dropbox disconnected. Everything already in Dropbox is kept.");
}
function dropboxPanel() {
  const m = S.meta;
  if (!dbxOn()) return `<div class="card" id="dbxPanel"><h2>Dropbox</h2>
    <p style="margin:0" class="small">Connect Dropbox and every property, photo and setting is kept there as well as on this phone, and shared with the other phone. Changes go when you're on Wi‑Fi; a full snapshot is saved each day and one copy per month is kept for 8 years.</p>
    <p style="margin:0" class="small">Use the <b>same Dropbox account</b> on both phones. If a phone is lost, cleared or replaced, connect Dropbox on the new one and everything comes back.</p>
    ${DBX_APP_KEY ? "" : `<div class="field"><label for="dbxKey">Dropbox App key</label><input id="dbxKey" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(m.dbxKey || "")}" placeholder="from the Dropbox App Console"><span class="hint">Redirect URI to enter in the App Console: <b>${esc(DBX_REDIRECT)}</b></span></div>`}
    <div class="row"><button type="button" class="btn primary" data-act="dbxConnect">Connect Dropbox</button></div>
    <p class="xs muted" style="margin:0">My Real Estate can only see its own folder in Dropbox › Apps. It can't see anything else in your Dropbox.</p></div>`;
  const st = syncText();
  return `${m.conflict ? `<div class="card" style="border:2px solid var(--warn)"><h2>Which copy do you want to keep?</h2><p style="margin:0" class="small">Dropbox has a copy saved ${m.conflict.when ? fmtWhen(m.conflict.when) : "recently"} that's different from this phone, and this phone has changes that haven't been sent yet. Whichever you don't keep is saved as a snapshot first.</p><div class="row"><button type="button" class="btn primary" data-act="conflictDropbox">Use the Dropbox copy</button><button type="button" class="btn" data-act="conflictPhone">Keep this phone's copy</button></div></div>` : ""}
  <div class="card" id="dbxPanel"><h2>Dropbox</h2>
    <dl class="kv"><dt>Status</dt><dd id="dbxStatus">${esc(cap1(st.t.replace(" · tap", "")))}</dd><dt>Last sync</dt><dd>${esc(fmtWhen(m.lastSync))}</dd><dt>Last snapshot</dt><dd>${esc(fmtWhen(m.lastSnap))}</dd></dl>
    ${m.syncError ? `<div class="banner bad"><span>${esc(m.syncError)}</span></div>` : ""}
    <div class="row"><button type="button" class="btn primary" data-act="dbxSyncNow" ${syncing ? "disabled" : ""}>Sync now</button><button type="button" class="btn" data-act="dbxSnap">Snapshot now</button></div>
    <label class="check"><input type="checkbox" id="wifiOnly" ${wifiOnly() ? "checked" : ""}> Only sync on Wi‑Fi (Sync now still works on mobile data)</label>
    <div class="row"><button type="button" class="btn" data-act="dbxList">Restore a Dropbox snapshot…</button><button type="button" class="btn danger" data-act="dbxDisconnect">Disconnect</button></div>
    <div id="snapList"></div>
    <p class="xs muted" style="margin:0">In Dropbox › Apps › MyRealEstate: <b>live</b> is the current copy (photos in <b>live/photos</b>), <b>snapshots</b> holds one copy per day for 60 days, and <b>archive</b> one copy per month for 8 years.</p></div>`;
}

/* ================= start ================= */
/* newer figures for the preloaded properties: replace a preloaded property only if nobody has edited it on this phone (no _t);
   anything that's been changed, or deleted, is left alone. Never marks changes for Dropbox — each phone does the same. */
async function seedUpdate() {
  const v = SEED.SEED_VERSION || 1; if ((S.meta.seedVersion || 1) >= v) return;
  const tomb = S.meta.tomb || {}; let n = 0;
  _quiet++;
  try { for (const sp of SEED.PROPERTIES) { const cur = S.props.find(x => x.id === sp.id); if (tomb[sp.id] || (cur && cur._t)) continue; if (!cur && S.meta.seedVersion) continue;
      const c = clone(sp); if (cur && cur.photo) c.photo = cur.photo; await tx("props", "readwrite", os => os.put(c)); n++; } } finally { _quiet--; }
  // edited preloaded properties: replace only the fields that still hold an earlier version's preloaded figures
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const pt of SEED.PATCHES || []) {
    const cur = S.props.find(x => x.id === pt.id), sp = SEED.PROPERTIES.find(x => x.id === pt.id); if (!cur || !sp || !cur._t) continue;
    let ch = 0;
    for (const [f, olds] of Object.entries(pt.fields)) if (olds.some(o => same(cur[f], o)) && !same(cur[f], sp[f])) { cur[f] = clone(sp[f]); ch++; }
    let ph = (cur.placeholders || []).filter(t => !pt.resolved.includes(t));
    for (const [t, replaces] of pt.add || []) {
      if (ph.includes(t)) continue;
      if (replaces) { const i = ph.indexOf(replaces); if (i >= 0) ph[i] = t; continue; }
      if (/^Today's value/.test(t) && N(cur.marketValue) !== N(cur.price)) continue; // already entered
      ph.push(t);
    }
    if (!same(ph, cur.placeholders || [])) { cur.placeholders = ph; ch++; }
    if (ch) { await saveProp(cur); n++; }
  }
  // incomes: if Settings → People still holds the old preloaded figures, move them to the new ones
  if (S.meta.settings && S.meta.settings.people) { const old = SEED.OLD_INCOMES || {}; let ch = false;
    for (const sp of SEED.SETTINGS.people) { const cur = S.meta.settings.people.find(x => x.id === sp.id); if (cur && old[sp.id] != null && cur.income === old[sp.id] && cur.income !== sp.income) { cur.income = sp.income; delete cur.check; ch = true; } }
    if (ch) S.meta.settings._t = Date.now(); }
  S.meta.seedVersion = v; await saveMeta(); S.props = await dbAll("props"); resCache.clear();
  if (n && S.meta.created !== todayISO()) setTimeout(() => toast("Preloaded figures updated from your documents"), 600);
}
async function boot() {
  await openDB();
  const m = (await dbAll("meta")).find(x => x.id === "meta");
  S.meta = m || { created: todayISO(), deviceId: uid("d") };
  S.props = await dbAll("props");
  if (!m) { S.meta.seedVersion = SEED.SEED_VERSION || 1; // first open on this phone: preloaded properties (they carry fixed ids and _t 0, so any edit from either phone wins when syncing)
    _quiet++; try { for (const p of SEED.PROPERTIES) await tx("props", "readwrite", os => os.put(clone(p))); } finally { _quiet--; }
    S.props = await dbAll("props"); await saveMeta();
  }
  await seedUpdate();
  const back = await dbxReturn();
  if (back) { S.tab = "settings"; S.set = "backup"; }
  const q = new URLSearchParams(location.search);
  if (q.get("go") === "quick") S.tab = "quick";
  render();
  annualPopup();
  if (dbxOn()) dbxSync();
  addEventListener("online", () => scheduleSync(800));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && dbxOn()) scheduleSync(500); });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot().catch(e => { document.body.innerHTML = `<p style="padding:20px;font-family:sans-serif">My Real Estate couldn't start: ${esc(e.message || e)}</p>`; });
