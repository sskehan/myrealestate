# My Real Estate — investment property analyser (version 1.01)

It does what the 2025 Property Analyser Calculator workbook did: a 10-year report for each property showing value, loans, equity, yields, cash flow before and after tax, tax refunds per owner, wealth gained and who pays. On top of that it has:
- saved properties and scenarios
- What-If for rent, interest rates, vacancy and growth
- Quick Check for a listing
- Compare
- tax and stamp duty rules you can update yourself

It's for Shaun and Lyndsey, each on their own phone. It works offline and keeps a shared live copy in your own Dropbox.

App address: **https://sskehan.github.io/myrealestate/** (GitHub repo **sskehan/myrealestate**)

## Files in this repository
index.html · app.js · engine.js · data.js · sw.js · manifest.webmanifest · icon-192.png · icon-512.png · README.md

- `engine.js` does all the sums.
- `data.js` holds the starting tax rates, stamp duty tables and preloaded properties.

Only program files go in this repository. It is public, so **never upload a backup file to GitHub.**

## 1. Put it on GitHub (one time)
1. On GitHub: **New repository** → name **myrealestate** → **Public** → **Create repository**.
2. **Add file → Upload files** → drag in all the files above → **Commit changes**.
3. **Settings → Pages** → Source **Deploy from a branch** → Branch **main** / **(root)** → **Save**.
   After a minute or two, the app address above works.

## 2. The Dropbox app (one time)
1. Go to **dropbox.com/developers/apps** → **Create app**.
2. Choose **Scoped access** → **App folder** → name it **MyRealEstate** (if that name is taken, try **MyRealEstate Skehan**) → **Create app**.
3. **Permissions** tab: tick `files.metadata.read`, `files.content.read` and `files.content.write` → **Submit**.
4. **Settings** tab → **OAuth 2 → Redirect URIs**: add `https://sskehan.github.io/myrealestate/` exactly → **Add**.
   Leave **Allow public clients (Implicit Grant & PKCE)** set to **Allow**.
5. Copy the **App key**. You never need the App secret.

Until the App key is built in, paste it in the app: **Settings → Dropbox & backup file → Dropbox App key**. Send me the key and I'll build it into 1.01, like Our Tax.

## 3. Install on each phone
1. Open the app address in **Samsung Internet** (or Chrome).
2. Add it to your home screen:
   - **Samsung Internet:** **☰ → Add page to → Apps screen**.
   - **Chrome:** **⋮ → Add to Home screen → Install**.
   - If **Google Play Protect** shows a warning, tap **Install anyway**. The app asks for no phone permissions.
3. Open **My Real Estate** and tap whose phone it is.
4. **Settings → Dropbox & backup file → Connect Dropbox.** Sign in with the **same Dropbox account on both phones** → **Allow**.
5. Long-press the icon for the **Quick check** shortcut.

The first time it opens, it comes with **Schofields, Mt Duneed, Moulden** and the workbook's **sample** property. Each one lists what's **still to confirm**.

## 4. Using it
- **Properties:**
  - Portfolio totals (your shares) and a card for each property: Owned, Looking or Passed.
  - Tap one to open its **Report**, **What-If** and **Edit** tabs.
- **Report:**
  - Summary tiles.
  - Charts for value/loans/equity and for weekly cash flow.
  - The full 10-year table. Scroll it sideways; the "Today" column is first.
  - Purchase & funding.
  - **PDF report:** in the print screen, choose **Save as PDF**.
  - **Duplicate as scenario.**
- **What-If:**
  - Slide rent, interest rate, vacant weeks, capital growth, rent growth (and the price for a property you're looking at).
  - See the change against the saved figures, the rent needed to break even, a rate stress test (+0.5% to +3%), and a rent × rate grid of after-tax dollars per week.
  - **Save as scenario** keeps the slider settings as a separate property.
- **Edit:**
  - Every input from the workbook. Changes save as you go and sync.
  - Stamp duty and LMI can be **worked out** (tap **Type my own** to override them).
  - Purchase and loan costs are each marked **Cash** or **Equity**.
  - The equity loan can have its own rate.
- **Quick check:**
  - Enter the price, state, rent, deposit and rate, and see the result straight away.
  - **Save as a property I'm looking at** keeps it.
- **Compare:** pick two or three properties or scenarios to see them side by side. Green marks the best value.
- **Photos:** each property can have one photo (Edit → Details → **Add photo**). Take one or pick one from the gallery.
  - It shows on the property card, at the top of the property page and on its PDF report.
  - It's shrunk to a small size and synced through Dropbox like everything else.

## 5. Changing the rules
Nothing about tax is fixed in the program.

- **Settings → Income tax rates** holds each financial year's resident brackets, low income tax offset and Medicare levy.
  - Each projection year uses its own year's rates. Years after the last one use the latest.
  - When a budget changes the rates, tap **Add 2028-29** (or the next year). It copies the last year, so you only change what's different.
- **Settings → Stamp duty tables:** the general (investor) table for every state and territory, with a price tester.
  - NSW and the ACT change every 1 July.
- **Settings → LMI estimate & borrowing costs:** the rough LMI scale and the 5-year write-off.
- **Settings → People & incomes:** the incomes used for tax refunds.
  - Shannan and Carlene are listed as family co-owners, so their tax isn't worked out.
- **Settings → Defaults:** the starting values for Quick Check and new properties.
- **Reset to built-in** puts the rules back to this version's values. Properties aren't touched.

## 6. Yearly figures check (every 1 July)
From 1 July each year, the app shows a **red reminder** until that financial year's figures have been checked. It pops up when you open the app and stays as a red banner on the Properties and Settings screens.

1. **Settings → Yearly figures check → Make check report** → in the print screen choose **Save as PDF**.
   The report lists every value that can go out of date:
   - income tax brackets, the low income tax offset and Medicare for this year and later years
   - every state's stamp duty table
   - the LMI scale and borrowing-cost period
   - the defaults and the household incomes
   - each property's loan, rent, fees and costs

   It has a blank "Checked value" column and instructions for Claude at the top.
2. Upload the PDF to Claude and ask it to check the values.
3. Type in anything that's changed:
   - **Income tax rates** (tap **Add 2027-28** etc. if the year is missing)
   - **Stamp duty tables**
   - **People & incomes**
   - each property's **Edit** tab
4. Tap **Mark 2027-28 as checked**. The reminder comes back next 1 July.

## 7. How the sums differ from the old workbook
Run in "workbook mode", the engine reproduces the Schofields and Mt Duneed workbooks to the cent. On top of that, it fixes these:

- **Tax refunds.** Each owner's tax is now worked out with and without the property, using the current brackets, offset and Medicare. The workbook used its 2017-18 rates and each owner's *average* tax rate, which understated refunds.
- **P&I loans.** These use a correct month-by-month schedule. In the workbook, years 4–10 picked up the wrong months.
- **LMI.** It's based on the LVR (nothing at 80% or below). The workbook used a flat 2%.
- **Expenses.** Management fees and the letting fee follow the rent each year. Everything else grows with CPI.
- **Other changes:**
  - Short-stay income can replace the standard rent or add to it.
  - The loan term and interest-only years are inputs.
  - Borrowing costs show as their own line.
  - Part-owned properties show your share.

## 8. Dropbox, two phones and changing phones
- The app can only see its own folder, **Dropbox › Apps › MyRealEstate**:
  - `live/myrealestate.json` — the current copy (photos in `live/photos/`)
  - `snapshots/` — one a day for 60 days, plus one before every restore
  - `archive/` — the last copy of each month, kept for 8 years
- **Only sync on Wi‑Fi** is on by default. **Sync now** sends straight away.
- Both phones can edit at the same time. Each property is merged separately, and the latest change wins.
- **New phone or cleared browser:** install the app, connect Dropbox, and everything comes back.
- Photos go to `live/photos/`.
- **Backup file** (Dropbox & backup file) saves one file with everything, photos included, as an extra copy for the QNAP.

## 9. Updating the app
1. Make sure the status says **in Dropbox ✓**.
2. Upload the changed files to this repository (**Add file → Upload files → Commit changes**).
3. In the app: **Settings → Check for update**.

When a file changes, `APP_VERSION` in `app.js` and `VERSION` in `sw.js` change together. Versions go 1.0, 1.01, 1.02 and so on.

## Version history
- **1.01**
  - Red yearly figures check from each 1 July, with a pop-up, and a check report PDF to upload to Claude.
  - A photo for each property.
  - Capital works (construction cost × 2.5%) as its own field, so it can't be added twice.
  - "Fill" for depreciation now only fills the empty years after the last one entered.
  - Letting fee left out when short-stay income replaces the standard rent.
  - Cost lists are easier to read on a phone.
  - The red reminder is readable in dark mode.
  - Calculations independently cross-checked across 13 scenarios and all 8 stamp duty tables.
- **1.0**
  - First release: properties, the 10-year report, What-If, Quick Check, Compare, PDF report and editable tax/stamp duty/LMI rules.
  - Dropbox sync for two phones.
  - Preloaded Schofields, Mt Duneed, Moulden and the sample property.

*Estimates only. This is not financial or tax advice; check with your accountant before relying on the figures.*
