# House calendar interaction bugs (harness run 2026-10-21)

Code under test: feat/house-calendar at **af203ce** (calendar files pinned to that commit with `--ref af203ce`; line numbers below are at af203ce). Preview http://localhost:8788 (drops site, /v1/* to local agent-booking, real OwnerRez data as of 2026-10-21).
Harness: `tests/e2e/calendar.e2e.mjs` + `tests/e2e/driver.mjs` (commit f652cf1). Run:
`E2E_DEPS=<folder with node_modules/playwright-core> node tests/e2e/calendar.e2e.mjs --ref af203ce [--seed N --runs N --actions N]` (or `npm run test:e2e`). Artifacts land in `tests/e2e/out/<stamp>/` (gitignored).
Screenshots referenced below: `.superpowers/sdd/golive/interaction-shots/`.

Actions run: about 1,800 (scripted against the real API on cook and hill4, phone 375x667, phone 390x844, desktop 1440x900; monkey with a stubbed out-of-order quote, 500 actions per viewport over 5 seeds).

What held everywhere (no failure in ~1,800 actions, including out-of-order quote responses): Book never live for a stale stay or guest count or while a quote was in flight; Book href or_arrival / or_departure / or_guests always matched the screen; shown total always the quote of the shown stay; selection always one contiguous run matching Arrive / Depart / Nights; never over a booked or past night, min / max nights and no_checkout respected; month headers and grids correct; only one calendar open; close restores rows, footer, snap and crumb; no console or page errors; steppers aligned; resize across 768 px keeps the stay month.
Negative controls (the harness can fail): removing the `my !== st.seq` guard in requestQuote fails `book-in-flight` within 31 monkey actions; widening the Nights number slot fails `stepper-align`.

---

## 1. A tap on a day with no stays takes the price and Book away from the stay still selected
**Severity:** blocks booking (until the guest finds a workaround)
**Harness id:** `hint-hides-book` (monkey phone390 seed 22 step 81, desktop seed 21 step 64)

**Repro (phone 375x667, real data of 2026-10-21; any "no stays" day works, Cook had 2026-10-29, 11-05, 11-11, 11-16, 2027-01-06):**
1. Cook House, tap Pick dates. Swipe to November 2026.
2. Tap Nov 29. Stay Nov 29 to Dec 2, $1,241.19, Book live.
3. Tap Nov 5.

**Expected:** the selected stay keeps its price and live Book (the hint "No stays from that day" can show, but the valid stay stays bookable), or the selection clears.
**Actual:** Nov 29 to Dec 2 stays highlighted and in Arrive / Depart, but the price disappears, the foot says "No stays from that day" and Book is disabled. Nothing on screen says how to get Book back. Tapping Arrive twice brings the old price and Book back (no new quote), which shows the quote was still valid.
**Screens:** `hint-1-priced.png` (before), `hint-2-no-stays-tap.png` (after, price gone, Book dimmed), `hint-3-after-arrive-toggle.png`, `hint-monkey-desktop.png`.
**Likely code:** `v5/house-calendar.js:693` (click handler sets `st.hint = r.hint` and keeps the stay), `:73-74` (`bookLive` is false whenever `st.hint` is set), `paintFoot` around `:498-510` (hint text replaces the total).

## 2. Keyboard focus is dropped to the page when the focused control disables itself or is rebuilt
**Severity:** confusing (keyboard and screen reader users lose their place; Tab can leave the calendar)
**Harness id:** `focus-lost` (scripted desktop plan 2, step 37)

**Repro (desktop 1440x900):**
1. Cook House, Pick dates, click any open day (stay set, Adults 2).
2. Tab to "Fewer adults", press Enter (Adults 2 to 1, the button disables).
   Result: `document.activeElement` is `<body>`.
3. Same with "Fewer nights" / "More nights" on the step that hits the limit, with "Try again" after a failed quote, and with a "Nearest open stays" alternative button: after Enter, focus is `<body>`.
4. In one scripted run, after Enter on More nights then Tab, focus jumped out of the calendar to the next house's Gallery row (Zink), skipping Adults, Anyone else and Book.

**Expected:** focus stays on a control inside the calendar (the other stepper button, the Book bar, or the new foot content).
**Actual:** focus goes to body (Chrome keeps a sequential starting point, so the next Tab sometimes recovers, sometimes skips out).
**Screens:** `focus-try-again.png` (after Enter on Try again, nothing focused).
**Likely code:** `v5/house-calendar.js:416` (stepper paint sets `minus.disabled` / `plus.disabled` on the focused button), `:479-480` (Nights buttons), `:498` (`foot.innerHTML = ''` and the messages box rebuilt every paint, which removes a focused Try again `:546` or alternative `:539`).

## 3. Nav crumb says RESET · DROPS (season colours) while an open house calendar fills the screen
**Severity:** wrong data shown
**Harness id:** `crumb-open` (shrunk from monkey phone375 seed 12 to 3 actions; scripted plan 4)

**Repro A (shrunk, phone 375x667):**
1. Hill Studio, tap Pick dates. Nav reads RESET · HILL STUDIO.
2. Tap "Anyone else coming along?".
3. Rotate to landscape (667x375).

**Repro B (phone 390x844 rotated to 844x390):** open Hill Studio, pick a day, scroll the page down about 600 px into the next season section, scroll back up so the calendar fills the screen again.

**Expected:** RESET · HILL STUDIO with the house colours whenever the open house section is the one on screen.
**Actual:** RESET · DROPS in the season section's colours, while only the open calendar is visible, and it never comes back until the page is scrolled to another property section.
**Screens:** `crumb-1-open-landscape.png` (correct after open), `crumb-3-back-at-calendar.png` (DROPS over the open calendar).
**Likely code:** `v5/app.js:1769` (the scroll observer only acts on `intersectionRatio >= 0.3`; thresholds `[0.3, 0.5, 0.7]` at `:1843`). An open section taller than viewport / 0.3 (landscape, or with Anyone else open) can never reach 0.3, so `:1791` never sets `houseCalOpen.crumb` back, and whichever section last crossed 0.3 owns the nav.

## 4. The month grid jumps up or down on a sideways swipe when the page is scrolled into the calendar
**Severity:** cosmetic (confusing: the grid moves vertically under the finger)
**Harness id:** `swipe-scrolled-page` (monkey phone375 seed 11 step 31, phone390 seed 21 step 11; shrinking did not reproduce it, the direct repro below does every time)

**Repro (phone 375x667):**
1. Cook House, Pick dates (October 2026 shows, 5 week rows).
2. Scroll the page down about 250 px so the month header is above the screen.
3. Swipe the grid left to November (6 rows): the strip top moves from -107 to -149 (42 px up).
4. Swipe left to December (5 rows): the trip block and foot move from 252 to 204 (48 px up).

**Expected:** a sideways swipe moves only sideways; nothing jumps vertically.
**Actual:** the strip's height follows the month in view, and with the page scrolled into the calendar the change lands as a 42 to 48 px vertical jump (scroll anchoring moves the grid one way, the rows below the other). With the month header on screen (no page scroll) it does not happen.
**Screens:** `swipe-jump-after.png`.
**Likely code:** `v5/house-calendar.js:386-390` (`paintHeight` sets `strip.style.height` from the month in view, run on every scroll), `v5/styles.css:865` (`transition:height .2s`), plus the browser's scroll anchoring.

---

## Page-level findings (not the calendar's code, seen through it)

### P1. The page is wider than the phone, so it pans sideways after a rotation
**Severity:** cosmetic. **Harness id:** `page-panned-x` (shrunk to: open Cook House calendar, rotate).
At 375 wide the layout is 401 px (the nav, `.drop-row` and `.property-divider` in season sections reach x=400; JOIN is clipped at the right edge in every phone screenshot). At 667 landscape the layout is 789 px (`season-bare-branches` drop rows). After rotating and back, the visual viewport stays panned 19 to 41 px sideways, with or without a calendar open. documentElement.scrollLeft stays 0. Likely in the season drop-row layout in `v5/app.js` / `v5/styles.css`, not in house-calendar.js.

### P2. Sections above an open calendar change height every few seconds
**Severity:** cosmetic, unverified on iOS. With `overflow-anchor:none` the open calendar drifts 41 px up and down while idle: the hero and collection sections alternate between two heights (rotating tag lines). Chrome hides it with scroll anchoring, so in Chrome nothing moves; a browser without scroll anchoring would show the calendar drifting. Measured in headless Chrome only.

### Note: working-tree bug seen during the run, already fixed
For about 10 minutes before af203ce the preview served a house-calendar.js where `var inView` shadowed `function inView`, so every day tap threw "inView is not a function" and the calendar showed "The calendar didn't load". Fixed in af203ce; all findings above were re-run against af203ce.

## Harness limits worth knowing
- On a phone only one month is visible, so a stay drag can only reach days in that month; "across a month boundary" is exercised by dragging a stay that spans two months or ends at the month's last day.
- The Children and Infants steppers are only exercised after "Anyone else coming along?" is open (they are hidden otherwise).
- The nav crumb tap is sometimes skipped on phones as not reachable; filter-while-open is covered by the Drops row.
- The monkey stubs /v1/quote (total = nights x 400 + guests x 10, random 50 to 800 ms delay); scripted passes use the real API.
