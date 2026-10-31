"use strict";
/* My Real Estate — starting settings and the preloaded properties. Everything here can be changed in the app (Settings → Tax & rules, People, Defaults);
   these values are only used the first time the app opens on a phone (or after "Reset rules to built-in"). */
(function (root) {
  /* ---- income tax: resident rates, per financial year. Add a new year in the app when a budget changes them. ---- */
  const LITO = { max: 700, t1: 37500, r1: 0.05, t2: 45000, r2: 0.015 };
  const MED = { rate: 0.02, low: 27222, shade: 0.1 };
  const br = r1 => [{ from: 0, rate: 0 }, { from: 18200, rate: r1 }, { from: 45000, rate: 0.30 }, { from: 135000, rate: 0.37 }, { from: 190000, rate: 0.45 }];
  const TAX_YEARS = {
    "2025-26": { brackets: br(0.16), lito: { ...LITO }, medicare: { ...MED }, note: "Stage 3 rates (from 1 July 2024)." },
    "2026-27": { brackets: br(0.15), lito: { ...LITO }, medicare: { ...MED }, note: "16% rate cut to 15% from 1 July 2026 (legislated March 2025)." },
    "2027-28": { brackets: br(0.14), lito: { ...LITO }, medicare: { ...MED }, note: "15% rate cut to 14% from 1 July 2027 (legislated). Medicare low-income threshold is last year's until announced." }
  };

  /* ---- stamp (transfer) duty for an investor (no first-home or owner-occupier concessions, no foreign surcharge). Rate is per $1 (4.5% = $4.50 per $100). ---- */
  const DUTY = {
    NSW: { asAt: "2026-27", source: "Revenue NSW (thresholds indexed each 1 July)", ceil100: true, min: 20, bands: [
      { from: 0, base: 0, rate: 0.0125 }, { from: 18000, base: 225, rate: 0.015 }, { from: 38000, base: 525, rate: 0.0175 }, { from: 103000, base: 1662, rate: 0.035 },
      { from: 387000, base: 11602, rate: 0.045 }, { from: 1290000, base: 52237, rate: 0.055 }, { from: 3870000, base: 194137, rate: 0.07 }] },
    VIC: { asAt: "2026-27", source: "State Revenue Office Victoria — general (non-PPR) rates", ceil100: false, bands: [
      { from: 0, base: 0, rate: 0.014 }, { from: 25000, base: 350, rate: 0.024 }, { from: 130000, base: 2870, rate: 0.06 }, { from: 960000, whole: 0.055 }, { from: 2000000, base: 110000, rate: 0.065 }] },
    QLD: { asAt: "2026-27", source: "Queensland Revenue Office — general transfer duty", ceil100: true, bands: [
      { from: 0, base: 0, rate: 0 }, { from: 5000, base: 0, rate: 0.015 }, { from: 75000, base: 1050, rate: 0.035 }, { from: 540000, base: 17325, rate: 0.045 }, { from: 1000000, base: 38025, rate: 0.0575 }] },
    SA: { asAt: "2026-27", source: "RevenueSA", ceil100: true, bands: [
      { from: 0, base: 0, rate: 0.01 }, { from: 12000, base: 120, rate: 0.02 }, { from: 30000, base: 480, rate: 0.03 }, { from: 50000, base: 1080, rate: 0.035 }, { from: 100000, base: 2830, rate: 0.04 },
      { from: 200000, base: 6830, rate: 0.0425 }, { from: 250000, base: 8955, rate: 0.0475 }, { from: 300000, base: 11330, rate: 0.05 }, { from: 500000, base: 21330, rate: 0.055 }] },
    WA: { asAt: "2026-27", source: "RevenueWA — general rate", ceil100: true, bands: [
      { from: 0, base: 0, rate: 0.019 }, { from: 120000, base: 2280, rate: 0.0285 }, { from: 150000, base: 3135, rate: 0.038 }, { from: 360000, base: 11115, rate: 0.0475 }, { from: 725000, base: 28453, rate: 0.0515 }] },
    TAS: { asAt: "2026-27", source: "State Revenue Office Tasmania", ceil100: true, bands: [
      { from: 0, base: 50, rate: 0 }, { from: 3000, base: 50, rate: 0.0175 }, { from: 25000, base: 435, rate: 0.0225 }, { from: 75000, base: 1560, rate: 0.035 }, { from: 200000, base: 5935, rate: 0.04 },
      { from: 375000, base: 12935, rate: 0.0425 }, { from: 725000, base: 27810, rate: 0.045 }] },
    ACT: { asAt: "2026-27", source: "ACT Revenue Office — non-owner-occupier residential (changes every 1 July)", ceil100: true, bands: [
      { from: 0, base: 0, rate: 0.012 }, { from: 200000, base: 2400, rate: 0.022 }, { from: 300000, base: 4600, rate: 0.034 }, { from: 500000, base: 11400, rate: 0.0432 },
      { from: 750000, base: 22200, rate: 0.059 }, { from: 1000000, base: 36950, rate: 0.064 }, { from: 1455000, whole: 0.0454 }] },
    NT: { asAt: "2026-27", source: "Territory Revenue Office — formula to $525,000, then a share of the whole value", ceil100: false, ntFormulaTo: 525000, bands: [
      { from: 525000, whole: 0.0495 }, { from: 3000000, whole: 0.0575 }, { from: 5000000, whole: 0.0595 }] }
  };

  /* ---- LMI: a rough guide only (premiums vary by lender, insurer and loan size) — % of the loan once the LVR is above each level ---- */
  const LMI = [{ above: 0.80, pct: 0.010 }, { above: 0.85, pct: 0.020 }, { above: 0.90, pct: 0.035 }, { above: 0.95, pct: 0.045 }];

  const PEOPLE = [
    { id: "p-shaun", name: "Shaun", income: 148000, incomeGrowth: 0, household: true, check: true },
    { id: "p-lyndsey", name: "Lyndsey", income: 155000, incomeGrowth: 0, household: true, check: true },
    { id: "p-shannan", name: "Shannan", income: 0, household: false },
    { id: "p-carlene", name: "Carlene", income: 0, household: false }
  ];

  /* defaults for a new property / Quick Check (the original workbook's starting values unless noted) */
  const DEFAULTS = { capital: 0.05, rent: 0.05, cpi: 0.03, rate: 0.06, type: "IO", termYears: 30, vacant: 2, mgmtPct: 0.077, lettingWeeks: 1.1, availLVR: 0.80,
    legals: 2500, valuation: 380, establishment: 600, buildingIns: 1200, landlordIns: 450, ratesPct: 0.0045, depositPct: 0.20, depositFund: "equity",
    owners: [{ who: "p-shaun", share: 0.5 }, { who: "p-lyndsey", share: 0.5 }] };

  const SETTINGS = { taxYears: TAX_YEARS, duty: DUTY, lmi: LMI, people: PEOPLE, defaults: DEFAULTS, borrowYears: 5, rulesChecked: "2026-11-01", rulesCheckedFY: "2026-27" };

  const fill = (first, n, pct) => { const a = first.slice(); while (a.length < n) a.push(Math.round(a[a.length - 1] * (1 - pct))); return a; };
  const ex = (label, amount) => ({ id: "e-" + label.toLowerCase().replace(/[^a-z]+/g, "-"), label, amount });
  const pc = (label, amount, fund, auto) => ({ id: "c-" + label.toLowerCase().replace(/[^a-z]+/g, "-"), label, amount, fund, auto: auto || null });

  const PROPERTIES = [
    { id: "pr-schofields", name: "Schofields", status: "owned", street: "Unit 227/4 Taupe Glade", suburb: "Schofields", state: "NSW", postcode: "2762",
      type: "Unit", beds: 2, baths: 2, parking: "Single car space", purchaseDate: "", startDate: "2026-11-01", incomeProducing: true,
      price: 714000, marketValue: 714000, cashDeposit: 0, equityDeposit: 144000,
      purchaseCosts: [pc("Legals (solicitor/conveyancer)", 2750, "equity"), pc("Stamp duty", 26778, "equity"), pc("Other costs", 20000, "equity"), pc("Capital improvements", 0, "cash")],
      loanCosts: [pc("Loan establishment fees", 1500, "equity"), pc("Property valuation", 300, "equity"), pc("LMI", 0, "equity"), pc("Other loan costs", 0, "cash")],
      loan: { amountMode: "auto", rate: 0.0579, type: "IO", ioYears: 0, termYears: 30 }, equityLoan: { rate: "", type: "IO" },
      rent: { weeks: 52, pw: 700, vacant: 3, shortStay: { mode: "none", seasons: [] } }, mgmtPct: 0.077, lettingWeeks: 1.5714,
      expenses: [ex("Council rates", 1231), ex("Building insurance", 0), ex("Landlord insurance", 300), ex("Strata / body corporate", 4184), ex("Land tax", 370), ex("Other expenses", 3480)],
      growth: { capital: 0.05, rent: 0.07, cpi: 0.04 }, depreciation: fill([15418, 18685, 16437, 14744, 13639], 10, 0.06), availLVR: 0.8,
      owners: [{ who: "p-shaun", share: 0.5 }, { who: "p-lyndsey", share: 0.5 }],
      placeholders: ["Purchase date", "Today's value", "Aland management % (7.7% is the template default)", "Years left on loan", "Building insurance (blank — strata?)", "What the $3,480 'Other' and $20,000 'Other costs' are"],
      notes: "Previously 38 Manchester Road. Managed by Aland. Strata $1,046 a quarter. Letting fee kept at $1,100 (shown as weeks of rent)." },
    { id: "pr-mtduneed", name: "Mt Duneed", status: "owned", street: "19 Foxtail Street (Lot 32, Coastal Rise)", suburb: "Mt Duneed", state: "VIC", postcode: "3217",
      type: "House", beds: 4, baths: 2, parking: "Double garage", landSize: 336, buildSize: 176.91, purchaseDate: "", startDate: "2026-11-15", incomeProducing: true,
      price: 690140, marketValue: 690140, dutyValue: 320000, cashDeposit: 0, equityDeposit: 138028,
      purchaseCosts: [pc("Legals (solicitor/conveyancer)", 3650, "cash"), pc("Stamp duty", 0, "cash", "duty"), pc("Other costs", 20000, "cash"), pc("Capital improvements", 0, "cash")],
      loanCosts: [pc("Loan establishment fees", 0, "cash"), pc("Property valuation", 380, "cash"), pc("LMI", 0, "cash"), pc("Other loan costs", 970, "cash")],
      loan: { amountMode: "auto", rate: 0.06, type: "IO", ioYears: 0, termYears: 30 }, equityLoan: { rate: "", type: "IO" },
      rent: { weeks: 52, pw: 625, vacant: 2, shortStay: { mode: "none", seasons: [] } }, mgmtPct: 0.066, lettingWeeks: 1.65,
      expenses: [ex("Council rates", 2400), ex("Building insurance", 1000), ex("Landlord insurance", 621), ex("Strata / body corporate", 0), ex("Land tax", 1410)],
      growth: { capital: 0.05, rent: 0.05, cpi: 0.03 }, depreciation: fill([14000, 13000, 12000, 11000, 10000], 10, 0.06), availLVR: 0.8,
      owners: [{ who: "p-shaun", share: 0.5 }, { who: "p-lyndsey", share: 0.5 }],
      placeholders: ["Interest rate (6% is the template default)", "Handover / settlement date", "Rent ($625 is the middle of Ray White's $600–650)", "Depreciation schedule", "What the $20,000 'Other costs' is"],
      notes: "Brooklyn 177 Mantra by Royston Homes. Land $320,000 + build $370,140; stamp duty on the land only. Ray White Highton — 6.60% management, 1.65 weeks letting fee (incl GST)." },
    { id: "pr-moulden", name: "Moulden", status: "owned", street: "Unit 8, 16 McGuire Circuit", suburb: "Moulden", state: "NT", postcode: "0830",
      type: "Unit", beds: null, baths: null, parking: "", purchaseDate: "2025-04-01", startDate: "2026-11-01", incomeProducing: false,
      price: 275000, marketValue: 275000, cashDeposit: 275000, equityDeposit: 0,
      purchaseCosts: [pc("Stamp duty", 0, "cash", "duty"), pc("Legals (solicitor/conveyancer)", 0, "cash")],
      loanCosts: [], loan: { amountMode: "auto", rate: 0, type: "IO", ioYears: 0, termYears: 30 }, equityLoan: { rate: "", type: "IO" },
      rent: { weeks: 52, pw: 0, vacant: 0, shortStay: { mode: "none", seasons: [] } }, mgmtPct: 0, lettingWeeks: 0,
      expenses: [ex("Council rates", 0), ex("Body corporate", 0), ex("Building insurance", 0)],
      growth: { capital: 0.05, rent: 0, cpi: 0.03 }, depreciation: [], availLVR: 0.8,
      owners: [{ who: "p-shaun", share: 1 / 3 }, { who: "p-shannan", share: 1 / 3 }, { who: "p-carlene", share: 1 / 3 }],
      placeholders: ["Today's value", "Annual costs and how they're shared", "How the purchase was paid for (shown as cash, no loan)", "Bedrooms, bathrooms, parking"],
      notes: "Family home for Dad, rent-free, so not income-producing: no deductions or tax refunds. Owned in thirds with Shannan and Carlene." },
    { id: "pr-sample", name: "Sample — Success St", status: "looking", sample: true, street: "Success St", suburb: "Equity North", state: "NSW", postcode: "",
      type: "Unit", beds: 3, baths: 2, parking: "Double car space", purchaseDate: "", startDate: "2026-11-01", incomeProducing: true,
      price: 700000, marketValue: 700000, cashDeposit: 190000, equityDeposit: 0,
      purchaseCosts: [pc("Legals (solicitor/conveyancer)", 3000, "cash"), pc("Stamp duty", 0, "cash", "duty"), pc("Other costs", 28000, "cash"), pc("Capital improvements", 0, "cash")],
      loanCosts: [pc("Loan establishment fees", 1000, "cash"), pc("Property valuation", 380, "cash"), pc("LMI", 0, "cash", "lmi"), pc("Other loan costs", 0, "cash")],
      loan: { amountMode: "auto", rate: 0.06, type: "IO", ioYears: 0, termYears: 30 }, equityLoan: { rate: "", type: "IO" },
      rent: { weeks: 52, pw: 600, vacant: 1, shortStay: { mode: "none", seasons: [] } }, mgmtPct: 0.077, lettingWeeks: 1.1,
      expenses: [ex("Council rates", 4000), ex("Building insurance", 1200), ex("Landlord insurance", 400), ex("Strata / body corporate", 0), ex("Land tax", 500)],
      growth: { capital: 0.05, rent: 0.05, cpi: 0.03 }, depreciation: fill([15000, 14000, 13000, 12000, 11000], 10, 0.06), availLVR: 0.8,
      owners: [{ who: "p-shaun", share: 0.5 }, { who: "p-lyndsey", share: 0.5 }], placeholders: [],
      notes: "The example from the original 2025 Property Analyser Calculator, with stamp duty and LMI now worked out automatically." }
  ];

  const api = { SETTINGS, PROPERTIES };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SEED = api;
})(typeof window !== "undefined" ? window : globalThis);
