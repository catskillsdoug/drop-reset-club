# House Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The house view's Calendar row opens an in-place calendar that shows the house's open dates, offers its drops as dashed suggestions, checks the chosen range with a live quote, and hands off to the OwnerRez booking page with the dates and the real all-in total.

**Architecture:** `agent-booking` gains a browser-callable `GET /v1/calendar` (day status, min/max nights, no-checkout days, max guests) and enforces `max_nights`. `drop-reset-club` gains a pure, DOM-free `v5/calendar-core.js` (date maths, rules, grid cells, suggestions, colours) and a DOM layer `v5/house-calendar.js` that opens the calendar as an overlay like Gallery and Reviews, using `/v1/calendar` and the existing `/v1/quote`. Neither file reads drops-site globals, so book.reset.club can load the same two files later as its date picker.

**Tech Stack:** Cloudflare Worker (plain ES modules, vitest 3.2.4) for agent-booking; plain browser JS, no build, vitest for drop-reset-club; Supabase (one read-only policy).

**Spec:** `docs/superpowers/specs/2026-10-19-drops-consent-calendar-anchor-personalisation-design.md`, section 2. Design reference: "unseen Template System" artifact, section 01 Booking (https://claude.ai/artifact/75UArf1799jCXhwMycCrJT); its CSS and calendar JS are quoted where a task needs them.

**Branches and worktrees (name them twice in every subagent prompt and verify with `git branch --show-current`):**
- agent-booking: branch `feat/calendar-days`, worktree `~/agent-booking/.claude/worktrees/calendar-days`, from main `f7c147d`. Baseline 201 tests (`npx vitest run --dir test`).
- drop-reset-club: branch `feat/house-calendar`, worktree `~/drop-reset-club-worktree-house-calendar`, from main `b16ed0f` plus the docs branch merged in. Baseline 119 tests (`npx vitest run`).
- ownerrez-sync-worker: branch `feat/no-checkout-anon-read`, worktree `~/ownerrez-sync-worker-worktree-no-checkout-read` (Task 2 creates it from `main`).

## Global Constraints

- No production deploy, no `wrangler deploy`, no Supabase migration applied, no push to `main`. Feature branches may be pushed.
- Brand: all type `#000000` on sand `#fcf6e9`, or the house's text colour on its colour. No gold text. One border weight per page: 2px, dashed outlines included.
- The house colour replaces the artifact's forest green: `--c` = house `bg` (`info.color.bg`), `--c-ink` = house `text` (`info.color.text`). Cook is `#ff551e` / `#fcf6e9`. Tint and deep shades are derived with the artifact's formula (Task 4), never typed in.
- Totals only, never a per-night price, anywhere in the calendar.
- No invented content: a value with no data source is left out.
- Dates are `YYYY-MM-DD` strings throughout; date maths in UTC (`Date.parse(iso)` and `toISOString().slice(0,10)`), never local `new Date(y,m,d)`, so DST and the viewer's timezone cannot shift a day.
- Monday-first grid. Arrival "from 4 pm", departure "by noon" (house facts already used on the site and in agent-booking).
- Mobile first: build and check at 375×667 before desktop.
- `drop-reset-club`: bump `app.js?v=` and `styles.css?v=` in `v5/index.html` with every change to those files (today 260 and 205); new scripts carry their own `?v=1`.
- Never put backticks or semicolons in commit messages. Stage explicit paths, never `git add -A`.
- Each new test must be seen red: mutate the code it covers, watch it fail, restore.

## Review Focus

1. **Drops data older than the calendar.** A drop in `data.drops` whose nights OwnerRez now shows booked must not be drawn or offered. Test: `suggestions()` drops a drop with a booked night (Task 4).
2. **Overlapping drops for one house** (Thu–Sun and Fri–Mon of the same weekend). Tapping a day must pick the drop that arrives that day, else the earliest one covering it; the grid must not throw or double-draw. Test: `suggestionAt()` with two overlapping drops (Task 4).
3. **Departure on a day someone else arrives.** A booked day whose previous night is free is a valid departure. Test: `cellsForMonth()` with `pick` set renders that booked day as a button (Task 4).
4. **Viewer in another timezone / DST change week.** Day keys must not shift. Test: `addDays('2026-11-01', 1) === '2026-11-02'` and `addDays('2026-03-08', 1) === '2026-03-09'` run with `process.env.TZ = 'America/New_York'` (Task 4).
5. **agent-booking or OwnerRez down.** The calendar must say so and keep a working way to book: the old `calendarHref(code)` link. Test: `calendarFallback()` copy and link (Task 5); `/v1/calendar` answers 502 JSON, not a thrown error (Task 1).

---

### Task 1: agent-booking — enforce max_nights and add `GET /v1/calendar`

Repo `~/agent-booking/.claude/worktrees/calendar-days`, branch `feat/calendar-days`.

**Files:**
- Modify: `src/availability.js` (`checkStay`)
- Create: `src/calendar.js`
- Modify: `src/index.js` (route)
- Modify: `wrangler.toml` (`[vars]` `SUPABASE_URL`, `SUPABASE_ANON`)
- Test: `test/availability.test.js`, create `test/calendar.test.js`

**Interfaces:**
- Produces: `checkStay(days, checkin, checkout)` now also returns `{ ok: false, reason: 'max_nights', max_nights }` when nights exceed the arrival day's `rules.max_nights`.
- Produces: `GET /v1/calendar?property_code=COOK&from=YYYY-MM-DD&to=YYYY-MM-DD` → 200
  ```json
  { "property_code": "COOK", "from": "...", "to": "...", "max_guests": 6,
    "days": [{ "date": "2026-11-05", "status": "available", "min_nights": 3, "max_nights": 29, "no_checkout": false }] }
  ```
  `status` is OwnerRez's value passed through (`available` / `booked` / other). No rate or price fields. 400 `{error}` for a bad code, bad dates, `to <= from`, `from` in the past (before today per `env.NOW`/`Date.now()`), or a span over 400 days. 502 `{error}` when OwnerRez fails. Header `cache-control: public, max-age=60`.
- CORS: `access-control-allow-origin` echoes the request `Origin` only when it is `https://reset.club` or `https://drop.reset.club`; `vary: origin`; `OPTIONS` → 204 with `access-control-allow-methods: GET, OPTIONS`. Other origins get no allow-origin header. `/v1/quote` keeps its `*`.
- `no_checkout`: `true` for dates in Supabase `no_checkout_days.day`, read with `GET ${SUPABASE_URL}/rest/v1/no_checkout_days?select=day&day=gte.<from>&day=lte.<to>` and headers `apikey`/`Authorization: Bearer ${SUPABASE_ANON}`. On any read failure, every day is `false` and the response still 200s (same degrade as price-quote-worker `getNoCheckoutDays`). `SUPABASE_URL = "https://uakybfvpamxablrzzetn.supabase.co"`; `SUPABASE_ANON` is the public anon JWT already shipped in `drop-reset-club/v5/app.js` line 6 (copy it exactly). It only works once Task 2's policy is applied, which is why the degrade matters.

- [ ] **Step 1: Write failing tests**
  - `test/availability.test.js`: `checkStay` on the Barn fixture (`max_nights: 29`) for a 30-night open range returns `{ ok: false, reason: 'max_nights', max_nights: 29 }`; a 29-night range is not refused for `max_nights`. Build the days array in the test (all `available`, `rules: { min_nights: 2, max_nights: 29 }`) so the range is fully known.
  - `test/calendar.test.js` (stub `fetch` like `test/v1.test.js`, `NOW: '2026-10-10T12:00:00Z'`, Supabase stub returns `[{ day: '2026-10-12' }]`):
    - `calendar returns days with status, min, max and no_checkout, no rates` — BARN `from=2026-10-10&to=2026-10-20`; day `2026-10-12` has `no_checkout: true`, `status: 'available'`, `min_nights: 2`, `max_nights: 29`; `2026-10-10` is `booked`; no day object has a `rate` key; `max_guests` equals the fixture property's `max_guests`.
    - `echoes allowed origins only` — `Origin: https://drop.reset.club` → header equals it; `Origin: https://evil.example` → header is `null`.
    - `OPTIONS preflight 204 with GET, OPTIONS`.
    - `rejects bad input with 400` — unknown code `NOPE`, `from=2026-10-01` (past), `to` before `from`, 401-day span.
    - `degrades when Supabase fails` — Supabase stub 401 → 200, every `no_checkout` false.
    - `502 JSON when OwnerRez fails` — calendar stub 500 → status 502, body has `error`.
- [ ] **Step 2: Run** `npx vitest run --dir test` — expect the new tests to FAIL (no route, no max check).
- [ ] **Step 3: Implement** `checkStay` max check (read `rules.max_nights` from the arrival day, like `min_nights`), `src/calendar.js` exporting `handleCalendar(request, env)` (returns `null` for other paths) using `ownerrez(env).calendar` and `.properties()`, `propertyByCode`, and the route in `src/index.js` before `handleConnect`. Add the two vars to `wrangler.toml` with a comment saying they are public values.
- [ ] **Step 4: Run** the full suite — expect 201 + new, all green. Mutate: remove the max check, then the Origin allowlist, then the no_checkout mapping; each must turn a test red. Restore.
- [ ] **Step 5: Commit** `src/availability.js src/calendar.js src/index.js wrangler.toml test/availability.test.js test/calendar.test.js` — "feat: GET /v1/calendar for the house calendar, day status and min max nights and no-checkout days, CORS for reset.club and drop.reset.club; checkStay enforces max_nights". Push the branch.

### Task 2: Supabase — anon may read `no_checkout_days`

Repo `~/ownerrez-sync-worker`, new worktree `~/ownerrez-sync-worker-worktree-no-checkout-read` on new branch `feat/no-checkout-anon-read` from `main`. Not applied in this plan.

**Files:**
- Create: `migrations/2026-10-20-no-checkout-days-anon-read.sql`

**Interfaces:**
- Produces: policy `no_checkout_days_public_read` — `for select to anon using (true)`. RLS stays enabled (it is on today, with no policies, so anon reads return nothing). The table holds only bank-holiday dates (30 future rows, 2026-11-11 to 2028-12-25).

- [ ] **Step 1:** Write the migration: one `create policy` statement plus a comment naming the reader (`agent-booking /v1/calendar`) and that writes stay service-role only.
- [ ] **Step 2:** Verify it parses without applying: run it inside `begin; ... rollback;` through the Supabase MCP `execute_sql`, then confirm with `select count(*) from pg_policies where tablename = 'no_checkout_days'` that the count is still 0.
- [ ] **Step 3: Commit** the file — "migration: anon may read no_checkout_days, for the house calendar in agent-booking". Push the branch.

### Task 3: drops — calendar styles

Repo `~/drop-reset-club-worktree-house-calendar`, branch `feat/house-calendar`.

**Files:**
- Modify: `v5/styles.css` (append a `/* House calendar */` block)
- Modify: `v5/index.html` (`styles.css?v=206`)

**Interfaces:**
- Produces CSS classes used by Task 5, all scoped under `.hc` (the calendar root): `.hc-when .hc-leaf .hc-span .hc-panel .hc-head .hc-mode .hc-dow .hc-grid .hc-who .hc-guests .hc-step .hc-more .hc-foot .hc-hint .hc-book .hc-alts .hc-msg`, and grid cell classes `past off nob blk bs bm be sel sel-s sel-e nodep`, plus `.hc-grid.dragging`. Colour variables on `.hc`: `--c --c-ink --c-tint --c-deep`.

- [ ] **Step 1:** Port the artifact's booking calendar CSS (rules for `.when .leaf .span .arrow .sh-head .mode .dow .grid .guests .step .who .more-link .sh-foot` and the grid cell classes, quoted in the artifact at lines 109–185) under `.hc` with these changes: font sizes reuse ones `v5/styles.css` already uses (the `.section-description` size for body, the house-view tag size for small labels, the `.hero-option-label` size for the leaf day numbers), no new sizes and no `--u` unit; every border 2px (rules `2px solid #000`, outlines `2px dashed color-mix(in srgb,var(--c) 55%,#fff)`); `#1A1A1A` → `#000`; `past` and `off` greys kept from the artifact (`#D0D0D0`, `#C4C4C4` struck through); `nodep` = same as `off` without the strike. Panel background sand `#fcf6e9`, type `#000`. Book button: `background:var(--c);color:var(--c-ink)`; disabled at opacity .3.
- [ ] **Step 2:** Bump `styles.css?v=206`. No test for CSS; Task 6 screenshots cover it.
- [ ] **Step 3: Commit** `v5/styles.css v5/index.html` — "House calendar styles from the template system booking calendar, house colour, one 2px border weight".

### Task 4: drops — `v5/calendar-core.js`, the rules and grid model

**Files:**
- Create: `v5/calendar-core.js`
- Test: create `tests/calendar-core.test.mjs`

**Interfaces:**
- Module shape: a classic script that sets `window.CalendarCore` in the browser and `module.exports` under Node (`typeof module === 'object'`), loaded in tests with `createRequire(import.meta.url)('../v5/calendar-core.js')`. No DOM, no globals read.
- Produces (all dates `YYYY-MM-DD`):
  - `addDays(iso, n) -> string`, `nightsBetween(a, b) -> number`
  - `dayMap(days) -> Map<string, {status, min_nights, max_nights, no_checkout}>` from `/v1/calendar` `days`
  - `stayCheck(map, arrival, departure, today) -> { ok: true } | { ok: false, reason }` — reasons, checked in this order: `'past'` (arrival < today), `'unknown'` (a night missing from the map), `'booked'` (a night not `available`), `'min_nights'`, `'max_nights'` (both from the arrival day), `'no_checkout'` (departure day's `no_checkout`). Departure day itself need not be available.
  - `suggestions(drops, map, today) -> [{ arrival, departure, nights, total, dropId }]` — from drops-API objects (`arrival`, `departure`, `nights`, `pricing.total`, `dropId`, `dropStatus`), keeping `dropStatus === 'Available'` and `stayCheck(...).ok`, sorted by arrival.
  - `suggestionAt(list, date) -> suggestion | null` — the one arriving on `date`, else the earliest whose nights cover `date`.
  - `slide(map, sel, offset, today) -> { arrival, departure } | null` — same length moved by `offset` days; `null` unless `stayCheck` ok.
  - `cellsForMonth(year, month1, state) -> Array<null | { date, day, cls: string[], button: boolean }>` — leading `null`s for a Monday-first grid. `state = { map, today, mode: 'sug' | 'any', suggestions, sel: {arrival, departure} | null, pick: string | null }`. Classes: `past`; `off` (night not available); in `sug` mode, days in a suggestion's nights get `blk` plus `bs` (its arrival), `be` (its last night) or `bm`, other open days `nob`; days in `sel` nights get `sel`, plus `sel-s` / `sel-e` on first / last night, and lose `blk bs bm be`. When `pick` is set: days after `pick` are buttons only if `stayCheck(map, pick, date, today).ok`, else get `nodep` and `button: false`; days before or equal to `pick` follow the normal rules. Otherwise `button` is false for `past` and `off`.
  - `monthSpan(today, list) -> { from, to }` — `from` = first of today's month; `to` = last day of the month holding the later of the furthest suggestion departure and `today + 180 days`.
  - `colours(bg, text) -> { c, ink, tint, deep }` — the artifact's `applyColor`: `tint = mix(bg, #fff, .88)`, `deep = mix(bg, #000, .35)`, or `.6` when `.35` gives contrast under 4.5 against white; `ink = text` (the house pair is already chosen, do not recompute it). Hex in, lowercase hex out.

- [ ] **Step 1: Write failing tests** in `tests/calendar-core.test.mjs`. Build a 60-day `days` array starting `2026-11-01` in the test (all `available`, `min_nights: 3`, `max_nights: 7`), then mark specific dates. Cases:
  - `addDays` across the Nov 1 and Mar 8 DST changes with `process.env.TZ = 'America/New_York'` set before the require (Review Focus 4).
  - `stayCheck` returns each reason: past, unknown, booked, min_nights (2 nights), max_nights (8 nights), no_checkout (departure `2026-11-11` marked `no_checkout`), and ok for a 3-night open stay whose departure day is booked.
  - `suggestions` keeps an open Available drop with its `pricing.total` as `total`, drops a `dropStatus: 'Booked'` drop, and drops an Available drop with a booked night (Review Focus 1).
  - `suggestionAt` with Thu 11-05→11-08 and Fri 11-06→11-09: `11-06` → the Fri one; `11-07` → the Thu one; `11-20` → null (Review Focus 2).
  - `slide` by +1 into open nights returns the moved stay; by an offset that hits a booked night returns null.
  - `cellsForMonth(2026, 11, …)`: Nov 1 2026 is a Sunday so there are 6 leading nulls; a booked day has `off` and no button; a past day has `past`; in `sug` mode a 3-night suggestion arriving 11-05 gives `bs`, `bm`, `be` on 11-05/06/07 and `nob` on an open day outside it; with `sel` 11-05→11-08 those days have `sel`, `sel-s`, `sel-e` and no `bs`; with `pick: '2026-11-05'` and 11-08 booked by a guest arriving that day (11-07 night free), 11-08 is a button (Review Focus 3) while 11-06 (1 night, under min) has `nodep`.
  - `monthSpan` with today `2026-10-20` and a suggestion departing `2027-06-02` gives `{ from: '2026-10-01', to: '2027-06-30' }`; with no suggestions `to` is `2027-04-30`.
  - `colours('#ff551e', '#fcf6e9')`: `ink` is `#fcf6e9`; `tint` equals the formula's value computed in the test from the same mix; `deep` has contrast ≥ 4.5 against white.
- [ ] **Step 2: Run** `npx vitest run tests/calendar-core.test.mjs` — FAIL (module missing).
- [ ] **Step 3: Implement** `v5/calendar-core.js` to the interfaces above.
- [ ] **Step 4: Run** the full suite — 119 + new, green. Mutate `stayCheck` (drop the `no_checkout` check), `suggestions` (skip the `stayCheck` filter) and `cellsForMonth` (start the week on Sunday); each must go red. Restore.
- [ ] **Step 5: Commit** `v5/calendar-core.js tests/calendar-core.test.mjs` — "calendar-core: stay rules, drop suggestions, Monday-first month cells and house colours for the house calendar".

### Task 5: drops — `v5/house-calendar.js` and the Calendar row

**Files:**
- Create: `v5/house-calendar.js`
- Modify: `v5/app.js` (Calendar row, `calendarHref` kept as fallback)
- Modify: `v5/index.html` (load `calendar-core.js?v=1` and `house-calendar.js?v=1` with `defer` before `app.js`; `app.js?v=261`)
- Test: create `tests/house-calendar.test.mjs`; modify `tests/calendar-row.test.mjs`

**Interfaces:**
- Consumes: Task 1's `/v1/calendar` and the existing `POST https://book.reset.club/v1/quote` (`{property_code, checkin, checkout, guests}` → 200 `{available: true, total, total_cents, checkout_url, ...}` or 200 `{available: false, reason, message, alternatives: [{checkin, checkout, total}]}`, 422 `{error, reason: 'rules'}`, 400/502 `{error}`); Task 4's `window.CalendarCore`; Task 3's classes.
- Produces: `window.HouseCalendar.open({ code, name, colour: {bg, text}, drops, maxMonths, api, fallbackHref, track, onClose })` builds the overlay and returns `{ close }`. `api` defaults to `'https://book.reset.club'`; `track(name, props)` is passed in (app.js's `track`), so the module never touches PostHog itself. Also exports pure helpers for tests (same dual export as Task 4): `leafText(iso) -> { dow, day, mon }` (e.g. `'2026-11-05'` → `{ dow: 'Thu', day: '5', mon: 'Nov' }`), `guestCount({ad, ch, inf}) -> number` (adults + children; infants are not counted toward the house limit or sent), `guestLabel({ad, ch, inf}) -> string` (`'2 guests'`, `'3 guests + 1 infant'`), `quoteView(status, body) -> { kind: 'ok' | 'gone' | 'refused' | 'error', total?, href?, message?, alternatives? }`, `calendarFallback(href) -> { message, href }` with message `"The calendar didn't load. See open dates on the booking page."`.

Behaviour, in order of the artifact's own UI:
1. Overlay built like `openReviews` in app.js (`gallery-overlay`, sand nav with `RESET · <HOUSE>` and ×, `gallery-open` on body and html, close restores scroll), body sand `#fcf6e9` with `.hc` root carrying `colours()` as CSS variables.
2. Leaves: arrival `dow / day / "Mon · from 4 pm"`, departure `dow / day / "Mon · by noon"`, nights and guest label between. Before a choice: "Choose dates" in place of the leaves' day numbers (one place only, not repeated on the Book button).
3. Month header with prev/next arrows limited to `monthSpan`; mode switch "3-night stays" (default) / "Any dates"; `M T W T F S S`; grid from `cellsForMonth`. Opens on the month of the first suggestion, else today's month.
4. "3-night stays": tap a day → `suggestionAt`; picks the whole drop. Tap with no suggestion there → hint "No drop on that day. Try Any dates". Drag a selected stay → `slide` (pointer events as in the artifact lines 1071–1076, including the 350 ms click suppression after a drag).
5. "Any dates": first tap sets `pick` (departure leaf shows "Checkout · – · choose a day"); a later valid day sets the stay; a tap on or before `pick` moves `pick`. With a stay set, tapping a later day re-extends only if `stayCheck` ok.
6. Guests: Adults stepper (min 1), "Anyone else coming along?" reveals Children (Ages 2–12) and Infants (Under 2 · crib on request), toggling back with "Just adults". `+` disabled when `guestCount` reaches `max_guests` from `/v1/calendar`; infants max 2. No pets line (no data source on this page).
7. Every new stay or guest change → quote (ignore responses that are not the latest request). While waiting, Book is disabled and the hint reads "Checking price". `ok` → foot shows `"$X,XXX.XX all in · N nights"` and Book becomes a link to `checkout_url` (absolute reset.club URL, correct on both sites). `gone` → `message` plus the alternatives as rows (`Thu, Nov 5 – Sun, Nov 8 · $2,376.00`) that set the stay when tapped. `refused` → the OwnerRez `error` text. `error` → "Couldn't check the price. Try again." with a retry.
8. `/v1/calendar` failure → the panel shows `calendarFallback(fallbackHref)` as text plus a link; nothing else.
9. Events through `track`: `calendar_opened {house}`, `calendar_range_picked {house, nights, from_drop: boolean}`, `calendar_book_pressed {house, nights, total}`. They only send when the consent banner has loaded PostHog, as with every existing `track` call.

In `v5/app.js`, the house view's Calendar row becomes `addPropRow('Calendar', null, calendarHref(code), { onClick: () => openHouseCalendar(code, info, et, data.drops) })` where `openHouseCalendar` (new, inside the `test:calendar-row` markers) calls `window.HouseCalendar.open({...})` with `drops` filtered to `d.property.code === code`, and falls back to `location.href = calendarHref(code)` when `window.HouseCalendar` is missing. Use the unfiltered `data.drops` from `init`, not the filtered `drops`. Check `info.label` / `info.color` names against the code before using them.

- [ ] **Step 1: Write failing tests.**
  - `tests/house-calendar.test.mjs`: `leafText`, `guestCount` (`{ad:2,ch:1,inf:1}` → 3), `guestLabel` for 2 adults, 1 adult, 2+1 child+1 infant; `quoteView` for the four kinds using bodies shaped exactly as agent-booking's `/v1/quote` returns them (copy a 200 body's field names from `agent-booking/test/v1.test.js`, a 422 `{error: 'Minimum stay is 3 nights.', reason: 'rules'}`, a 502 `{error}`), checking `href` is the body's `checkout_url` and `total` is formatted `"$2,376.00"`; `calendarFallback('https://reset.club/stay/cook')`.
  - `tests/calendar-row.test.mjs`: keep the order test; replace the href test with: the Calendar row line passes `calendarHref(code)` as href and an `onClick` calling `openHouseCalendar(code`; `openHouseCalendar` is defined inside the markers; `v5/index.html` loads `calendar-core.js` and `house-calendar.js` before `app.js`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `v5/house-calendar.js`, the app.js change and the index.html script tags and version bumps.
- [ ] **Step 4: Run** the full suite green. Mutate `quoteView` (treat 422 as `error`) and `guestCount` (count infants); each must go red. Restore.
- [ ] **Step 5: Local browser check against live agent-booking quote only:** `npx wrangler pages dev . --port 8788`; in a Playwright headless shell (never the Chrome app) at 375×667 open `http://localhost:8788/#property-COOK`, tap Calendar. Because `/v1/calendar` is not deployed, set `api` to a local `wrangler dev` of the agent-booking worktree (`npx wrangler dev --port 8787` in `~/agent-booking/.claude/worktrees/calendar-days`, which reads OwnerRez through the remote KV) for this check. Expected: the grid shows Cook's real booked nights struck through and its drops dashed; picking a drop shows a total equal to that drop's quote on `/v1/quote`.
- [ ] **Step 6: Commit** `v5/house-calendar.js v5/app.js v5/index.html tests/house-calendar.test.mjs tests/calendar-row.test.mjs` — "House view Calendar opens the house calendar in place: open dates from agent-booking, drops as dashed suggestions, live quote before Book, OwnerRez page as the fallback".

### Task 6: Visual QA and handoff (orchestrator, not a subagent)

- [ ] **Step 1:** Screenshots at 375×667 and 1440×900 of every state, for Cook and one light house: closed house view (before, from main) and after; calendar open with suggestions; drop picked with total; Any dates with `pick` set and greyed departures; dates gone with alternatives; refused; calendar failure fallback; guests expanded. Save under `docs/superpowers/plans/2026-10-20-house-calendar-shots/`. Check against the artifact and ui-rules (`~/reset-club-context/shared-memory/ui-rules.md`): one border weight, all type black on sand, no per-night price.
- [ ] **Step 2:** Whole-branch review of both repos (hardcoded offsets, cross-repo field names between `/v1/calendar` and `calendar-core`, no changed test assertions outside this plan).
- [ ] **Step 3:** Stop. Report the deploy order for Doug: (1) apply Task 2's policy, (2) agent-booking: decide the open Stage 3 question (`stripe_account` sandbox vs `null`, see `docs/HANDOFF-stage3-merge.md`) because main already carries Stage 3, then merge `feat/calendar-days` and deploy, check `/v1/calendar` live, (3) drops: merge `feat/house-calendar`, `scripts/deploy.sh`, live check, cache purge.
