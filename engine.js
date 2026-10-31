"use strict";
/* My Real Estate — calculation engine. No screen code here: everything the 10-year report, What-If, Quick Check and Compare show comes from Engine.run().
   Works in the browser (window.Engine) and in Node (module.exports) so it can be tested against the original workbook. */
(function (root) {
  const p2 = n => String(n).padStart(2, "0");
  const N = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const sum = a => a.reduce((s, x) => s + N(x), 0);

  /* ---------- financial years ---------- */
  function fyOf(iso) { const y = +String(iso).slice(0, 4), m = +String(iso).slice(5, 7), s = m >= 7 ? y : y - 1; return `${s}-${p2((s + 1) % 100)}`; }
  function addMonths(iso, n) { const [y, m, d] = String(iso).split("-").map(Number); const dt = new Date(y, m - 1 + n, Math.min(d || 1, 28)); return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`; }
  /* the tax rules for a financial year: that year's, or the latest earlier year's, or (before the first) the earliest */
  function rulesFor(fy, taxYears) {
    const ks = Object.keys(taxYears || {}).sort(); if (!ks.length) return null;
    if (taxYears[fy]) return { fy, from: fy, ...taxYears[fy] };
    const before = ks.filter(k => k < fy), from = before.length ? before[before.length - 1] : ks[0];
    return { fy, from, inherited: true, ...taxYears[from] };
  }

  /* ---------- income tax ---------- */
  /* brackets: [{from, rate}] ascending; tax on each dollar above `from` at `rate` until the next bracket */
  function incomeTax(income, R) {
    const inc = Math.max(0, N(income)); if (!R) return 0;
    const b = (R.brackets || []).slice().sort((a, c) => a.from - c.from); let tax = 0;
    for (let i = 0; i < b.length; i++) { const lo = N(b[i].from), hi = i + 1 < b.length ? N(b[i + 1].from) : Infinity; if (inc > lo) tax += (Math.min(inc, hi) - lo) * N(b[i].rate); }
    const L = R.lito; let lito = 0;
    if (L && N(L.max) > 0) {
      if (inc <= N(L.t1)) lito = N(L.max);
      else if (inc <= N(L.t2)) lito = N(L.max) - (inc - N(L.t1)) * N(L.r1);
      else lito = N(L.max) - (N(L.t2) - N(L.t1)) * N(L.r1) - (inc - N(L.t2)) * N(L.r2);
      lito = Math.max(0, lito);
    }
    tax = Math.max(0, tax - lito);
    const M = R.medicare; let med = 0;
    if (M && N(M.rate) > 0) { const low = N(M.low); med = inc <= low ? 0 : Math.min(inc * N(M.rate), (inc - low) * N(M.shade || 0.1)); }
    return tax + med;
  }
  const avgRate = (inc, R) => inc > 0 ? incomeTax(inc, R) / inc : 0;
  function marginalRate(inc, R) { return (incomeTax(inc + 1000, R) - incomeTax(inc, R)) / 1000; }

  /* ---------- stamp duty ---------- */
  /* table: {bands:[{from, base, rate}] or {from, whole}, ntFormulaTo, ceil100} — rate is per dollar (4.5% = 0.045) */
  function stampDuty(value, table) {
    const v = N(value); if (!table || v <= 0) return 0;
    if (table.ntFormulaTo && v <= table.ntFormulaTo) { const V = v / 1000; return Math.round(0.06571441 * V * V + 15 * V); }
    const bands = (table.bands || []).slice().sort((a, b) => a.from - b.from); let band = null;
    for (const b of bands) if (v > N(b.from) || (N(b.from) === 0)) band = b;
    if (!band) return 0;
    if (band.whole != null) return Math.round(v * N(band.whole));
    let over = v - N(band.from); if (table.ceil100) over = Math.ceil(over / 100) * 100;
    return Math.max(N(table.min || 0), Math.round(N(band.base) + over * N(band.rate)));
  }
  /* LMI estimate from the loan-to-value ratio (a percentage of the loan); zero at or below the first threshold */
  function lmiEstimate(loan, value, scale) {
    if (!(value > 0) || !(loan > 0)) return 0; const lvr = loan / value; let pct = 0;
    for (const s of (scale || []).slice().sort((a, b) => a.above - b.above)) if (lvr > N(s.above)) pct = N(s.pct);
    return Math.round(loan * pct);
  }

  /* ---------- the property's set-up (purchase, funding, loans) ---------- */
  function setup(p, ctx) {
    const price = N(p.price), value = N(p.marketValue) || price;
    const cashDep = N(p.cashDeposit), eqDep = N(p.equityDeposit);
    const mainAuto = Math.max(0, price - cashDep - eqDep);
    const mainLoan = p.loan && p.loan.amountMode === "manual" ? N(p.loan.amount) : mainAuto;
    const items = (p.purchaseCosts || []).map(c => ({ ...c, amount: c.auto === "duty" ? stampDuty(N(p.dutyValue) || price, (ctx.duty || {})[p.state]) : N(c.amount) }));
    const loanItems = (p.loanCosts || []).map(c => ({ ...c, amount: c.auto === "lmi" ? lmiEstimate(mainLoan, value, ctx.lmi) : N(c.amount) }));
    const all = [...items, ...loanItems];
    const eqItems = sum(all.filter(c => c.fund === "equity").map(c => c.amount)), cashItems = sum(all.filter(c => c.fund !== "equity").map(c => c.amount));
    const equityLoan = p.equityLoan && p.equityLoan.amountMode === "manual" ? N(p.equityLoan.amount) : eqDep + eqItems;
    const purchaseTotal = cashDep + eqDep + sum(items.map(c => c.amount)), loanCostTotal = sum(loanItems.map(c => c.amount));
    return { price, value, cashDep, eqDep, mainAuto, mainLoan, equityLoan, totalDebt: mainLoan + equityLoan, items, loanItems,
      purchaseTotal, loanCostTotal, totalPurchaseExpenses: purchaseTotal + loanCostTotal, cashRequired: cashDep + cashItems, equityUsed: eqDep + eqItems,
      duty: sum(items.filter(c => c.auto === "duty" || /stamp|duty/i.test(c.label || "")).map(c => c.amount)),
      lvr: value > 0 ? (mainLoan + equityLoan) / value : 0 };
  }

  /* monthly loan schedule: interest-only for ioMonths, then principal & interest over what's left of the term */
  function schedule(amount, rate, type, ioYears, termYears, months) {
    const out = []; let bal = N(amount); const r = N(rate) / 12, term = Math.max(1, Math.round(N(termYears || 30) * 12));
    const io = type === "PI" ? 0 : (N(ioYears) > 0 ? Math.round(N(ioYears) * 12) : Infinity);
    let pmt = null;
    for (let k = 1; k <= months; k++) {
      const interest = bal * r; let principal = 0;
      if (k > io && bal > 0.005) {
        if (pmt === null) { const left = Math.max(1, term - (isFinite(io) ? io : 0)); pmt = r > 0 ? bal * r / (1 - Math.pow(1 + r, -left)) : bal / left; }
        principal = Math.min(bal, pmt - interest);
      }
      bal -= principal; out.push({ k, interest, principal, balance: Math.max(0, bal) });
    }
    return out;
  }

  function rentYear1(p) {
    const R = p.rent || {}; const std = Math.max(0, N(R.weeks || 52) - N(R.vacant)) * N(R.pw);
    const ss = R.shortStay || {}; const seasons = ss.seasons || [];
    const ssIncome = sum(seasons.map(s => Math.max(0, N(s.weeks) - N(s.vacant)) * N(s.pw)));
    const mode = ss.mode || "none";
    return mode === "replace" ? ssIncome : mode === "add" ? std + ssIncome : std;
  }

  /* ---------- the projection ---------- */
  /* ctx: { taxYears, people:[{id,name,income,incomeGrowth,household}], duty, lmi, borrowYears, compat:{expenses:'workbook', refund:'average', balance:'start'} } */
  function run(p, ctx, over) {
    ctx = ctx || {}; p = over ? applyOver(p, over) : p;
    const years = 10, S = setup(p, ctx), g = N(p.growth && p.growth.capital), rg = N(p.growth && p.growth.rent), cpi = N(p.growth && p.growth.cpi);
    const L = p.loan || {}, start = p.startDate || p.purchaseDate || new Date().toISOString().slice(0, 10);
    const sched = schedule(S.mainLoan, L.rate, L.type, L.ioYears, L.termYears, years * 12);
    const eqRate = p.equityLoan && p.equityLoan.rate != null && p.equityLoan.rate !== "" ? N(p.equityLoan.rate) : N(L.rate);
    const eqSched = schedule(S.equityLoan, eqRate, (p.equityLoan && p.equityLoan.type) || "IO", p.equityLoan && p.equityLoan.ioYears, (p.equityLoan && p.equityLoan.termYears) || L.termYears, years * 12);
    const income = p.incomeProducing !== false;
    const rent1 = income ? rentYear1(p) : N(p.otherIncome);
    const pw1 = N(p.rent && p.rent.pw);
    const fixed = (p.expenses || []).map(e => ({ label: e.label, amount: N(e.amount) }));
    const mgmtPct = N(p.mgmtPct), letWeeks = N(p.lettingWeeks);
    const dep = (p.depreciation || []).map(N); const borrowYears = N(ctx.borrowYears || 5);
    const capWorks = N(p.capWorksCost) > 0 ? N(p.capWorksCost) * (p.capWorksRate == null || p.capWorksRate === "" ? 0.025 : N(p.capWorksRate)) : 0; // Div 43 capital works, on top of the schedule figures
    const people = ctx.people || [];
    const owners = (p.owners || []).map(o => { const pr = people.find(x => x.id === o.who); return { ...o, profile: pr || null, household: !!(pr && pr.household !== false), share: N(o.share) }; });
    const k = owners.length ? sum(owners.filter(o => o.household).map(o => o.share)) : 1; // our share of the property
    const compat = ctx.compat || {};
    const rows = []; let value = S.value, rent = rent1, prevBal = S.mainLoan + S.equityLoan;
    const ssMode = (p.rent && p.rent.shortStay && p.rent.shortStay.mode) || "none";
    const exp1 = sum(fixed.map(e => e.amount)) + mgmtPct * rent1 + (rent1 > 0 && ssMode !== "replace" ? letWeeks * pw1 : 0);
    for (let y = 1; y <= years; y++) {
      const fy = fyOf(addMonths(start, 6 + (y - 1) * 12)), R = rulesFor(fy, ctx.taxYears);
      const vStart = value; value = value * (1 + g);
      if (y > 1) rent = rent * (1 + rg);
      const ms = sched.slice((y - 1) * 12, y * 12), es = eqSched.slice((y - 1) * 12, y * 12);
      const intMain = sum(ms.map(m => m.interest)), prinMain = sum(ms.map(m => m.principal)), intEq = sum(es.map(m => m.interest)), prinEq = sum(es.map(m => m.principal));
      const balEnd = (ms.length ? ms[ms.length - 1].balance : S.mainLoan) + (es.length ? es[es.length - 1].balance : S.equityLoan);
      let interest = intMain + intEq, principal = prinMain + prinEq;
      const debtShown = compat.balance === "start" ? prevBal : balEnd;
      if (compat.balance === "start") interest = prevBal * N(L.rate); // workbook: start-of-year balance × rate
      const infl = Math.pow(1 + cpi, y - 1);
      const items = fixed.map(e => ({ label: e.label, amount: e.amount * infl }));
      const mgmt = mgmtPct * rent, letting = rent > 0 && ssMode !== "replace" ? letWeeks * pw1 * Math.pow(1 + rg, y - 1) : 0;
      let expenses = compat.expenses === "workbook" ? exp1 * infl : sum(items.map(e => e.amount)) + mgmt + letting;
      const pretax = rent - interest - principal - expenses;
      const depY = (y <= dep.length ? dep[y - 1] : 0) + (income ? capWorks : 0);
      const borrow = y <= borrowYears ? S.loanCostTotal / borrowYears : 0;
      const deductions = interest + expenses + depY + borrow;
      const net = rent - deductions;
      const refunds = owners.filter(o => o.household && o.profile).map(o => {
        if (!income) return { id: o.who, name: o.profile.name, amount: 0 };
        const inc = N(o.profile.income) * Math.pow(1 + N(o.profile.incomeGrowth), y - 1), share = o.share * net;
        const amt = compat.refund === "average" ? o.share * avgRate(inc, R) * -net : incomeTax(inc, R) - incomeTax(inc + share, R);
        return { id: o.who, name: o.profile.name, amount: amt, marginal: marginalRate(inc, R) };
      });
      const refund = sum(refunds.map(r => r.amount));
      const outgoings = interest + principal + expenses;
      const after = pretax * k + refund;
      const growth = value - vStart;
      rows.push({ y, fy, rules: R ? R.from : null, rulesInherited: !!(R && R.inherited), value, debt: debtShown, lvr: value > 0 ? debtShown / value : 0, equity: value - debtShown,
        avail: value * N(p.availLVR || 0.8) - debtShown, rent, grossYield: S.price > 0 ? rent / S.price : 0, netYield: S.price > 0 ? (rent - expenses) / S.price : 0,
        debtYield: debtShown > 0 ? rent / debtShown : 0, interest, intMain, intEq, principal, expenses, items, mgmt, letting, pretax, depreciation: depY, borrow, deductions, net,
        refunds, refund, after, growth, wealth: after + growth * k,
        roc: S.totalPurchaseExpenses > 0 ? ((value - debtShown) - S.cashDep) / S.totalPurchaseExpenses : 0,
        tenant: outgoings > 0 ? rent / outgoings : 0, taxBack: outgoings > 0 && k > 0 ? refund / (outgoings * k) : 0 });
      rows[rows.length - 1].investor = Math.max(0, 1 - rows[rows.length - 1].tenant - rows[rows.length - 1].taxBack);
      prevBal = compat.balance === "start" ? prevBal - principal : balEnd;
    }
    const y0 = { value: S.value, debt: S.totalDebt, lvr: S.lvr, equity: S.value - S.totalDebt, avail: S.value * N(p.availLVR || 0.8) - S.totalDebt };
    const be = rows.find(r => r.after >= 0);
    return { setup: S, k, owners, rows, y0, income,
      summary: { weekly1: rows[0].after / 52, pretaxWeekly1: rows[0].pretax * k / 52, breakEven: be ? be.y : null, equity10: rows[years - 1].equity * k,
        wealth10: sum(rows.map(r => r.wealth)), growth10: sum(rows.map(r => r.growth)) * k, cash10: sum(rows.map(r => r.after)), grossYield1: rows[0].grossYield, netYield1: rows[0].netYield } };
  }

  /* What-If overrides on a copy of the property */
  function applyOver(p, o) {
    const q = JSON.parse(JSON.stringify(p));
    if (o.pw != null) { q.rent = q.rent || {}; q.rent.pw = o.pw; }
    if (o.vacant != null) { q.rent = q.rent || {}; q.rent.vacant = o.vacant; }
    if (o.rate != null) { q.loan = q.loan || {}; const d = o.rate - N(p.loan && p.loan.rate); q.loan.rate = o.rate; if (q.equityLoan && q.equityLoan.rate != null && q.equityLoan.rate !== "") q.equityLoan.rate = N(q.equityLoan.rate) + d; }
    if (o.capital != null) { q.growth = q.growth || {}; q.growth.capital = o.capital; }
    if (o.rentGrowth != null) { q.growth = q.growth || {}; q.growth.rent = o.rentGrowth; }
    if (o.price != null) { q.price = o.price; q.marketValue = o.price; }
    return q;
  }
  /* weekly rent that makes year-1 after-tax cash flow zero */
  function breakEvenRent(p, ctx, over) {
    let lo = 0, hi = 10000; const f = pw => run(p, ctx, { ...(over || {}), pw }).rows[0].after;
    if (f(hi) < 0) return null; if (f(lo) >= 0) return 0;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m) >= 0) hi = m; else lo = m; }
    return hi;
  }

  const api = { run, setup, schedule, incomeTax, avgRate, marginalRate, stampDuty, lmiEstimate, rulesFor, fyOf, addMonths, applyOver, breakEvenRent, rentYear1 };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== "undefined" ? window : globalThis);
