# Plan B — homepage property section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each house's section in the reset.club homepage scroll opens with its photos, then eyebrow, title + mark, tagline, Guests mention and the rows Details · Availability · Reviews, with a Reviews summary screen behind the Reviews row.

**Architecture:** A new browser/CommonJS module `v5/property-section.js` (same wrapper as `v5/house-calendar.js:1-7`) holds pure helpers plus `buildPropertySection(doc, data, handlers)` and `openReviewsSummary(doc, data)`. `v5/app.js` keeps the snap scroll, data loading and existing overlays, and swaps the inline section build (`v5/app.js:2908-3100`) for one call. Data per home comes from the unseen feed (Plan C) `https://book.reset.club/v1/homes/<slug>`.

**Tech Stack:** vanilla JS + CSS in `v5/`, vitest ^1 with fake element trees (no jsdom), Playwright headless for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-21-property-sections-design.md` (piece B and the Reviews screen in piece C). Artboards in `docs/superpowers/specs/2026-10-21-property-sections/reference/` are the spec for layout, type, spacing and copy: `Main.dc.html` (desktop M2), `Phone-J.dc.html`, `Phone-K.dc.html`, `Phone-K2.dc.html`, `Reviews-Desktop.dc.html`, `Reviews-Phone.dc.html`.

**Depends on:** Plan C Task 4 deployed (feed live with photos, details, tally, quotes). Plan A Task 3 deployed (shared `nav.rc-over-photo` and the menu). Words (Guests mention) need Plan C Task 6; until then the row is hidden.

**Branch:** `feat/property-sections` in `~/drop-reset-club-property-sections`. Deploy only via `scripts/deploy.sh staging|prod` from a clean `main` worktree after merge.

## Global Constraints

- Colours from Supabase `properties.drops_color_bg` / `drops_color_text` (canon: Hill `tree #019740`, Zink `moss #9c9b34`, Cook `toma #ff551e`, Barn `wave #3f65f6`, text `sand #fcf6e9`). Photo gradients `rgba(0,0,0,.45)`–`rgba(0,0,0,.65)` → 0 (`nite`). Never `#4B9B4F`, `#F7F2E4`, `#141413`.
- Type: Inter. Title 800 54px desktop / 46px phone, −0.03em. Rows 800 32/28px, −0.02em. Tagline 600 19/17px. Body 400 19/15px, line-height 1.4. Labels, eyebrow 700 11–15px uppercase +0.02 to +0.06em.
- Eyebrow `KERHONKSON, NY` from `properties.city`/`state` ("New York" → "NY"), 11px 700 +0.06em, 10px above the title.
- Rules 2px sand between rows; never a rule between the photo and the first row. Tags: 2px sand outline, padding 3px 7px, 10px 700 uppercase +0.04em.
- Icons inline stroke SVG 2.2–2.4px square caps: → on every row, + / − for unfolding. No emoji, no icon font.
- Gutters 20px phone, 32/40px desktop. Rows 9px vertical padding phone, 12px desktop. Mark 48/52px on the title line, right-aligned.
- Rows: Details · Availability · Reviews. No Gallery row. Drops and Summer rows not rendered (code kept behind `SHOW_DROPS_ROW = false`). Category flip tag removed.
- Counter `index — total`, both zero-padded to 2 digits (`01 — 23`).
- Reviews row tag: "Five star" until the feed has `reviews.count > 0`, then `${average} · ${count}` (e.g. "4.97 · 76").
- Guests mention: feed `mention_words`, top 3 on phone (one row), top 6 on desktop; hidden when empty. Never invent tags.
- Each section is exactly one viewport tall, no inner scroll on first paint at 1280×800, 390×707, 375×667.
- No system names in any guest-facing string.

## Review Focus

1. Feed down or slow (>3s) → section renders with the Supabase tagline, colours and the existing `media` hero image, rows still work, Reviews tag "Five star", no Guests mention; nothing blank. (Task 2)
2. Home with one photo → no counter, no progress segments, clicks/swipes do nothing. (Task 1)
3. Very long caption or none → caption one line with ellipsis at the panel width; none → no caption element. (Task 1)
4. Horizontal swipe on the photo must not move the vertical snap; vertical swipe must still move to the next section. (Task 4)
5. Keyboard: ← → move photos only when the section is in view; focus outlines visible on rows on sand-on-colour. (Tasks 3, 4)

---

### Task 1: Pure helpers

**Files:** Create `v5/property-section.js`, `tests/property-section.test.mjs`.

**Interfaces (Produces):**
- `counterLabel(i: number, n: number): string` → `counterLabel(0, 23)` = `"01 — 23"`; `""` when `n < 2`.
- `heroCaption(caption: string|null, max = 90): string|null` — first sentence; longer than `max` cut at a word with "…".
- `eyebrow(city, state): string` → `"KERHONKSON, NY"`; uses a US state map for full names; unknown state passes through uppercased.
- `reviewsTag(reviews|null): string` → `"Five star"` or `"4.97 · 76"`.
- `mentionTags(mentionWords, {max}): string[]` → labels only, max items.
- `rowsFor(): {key:'details'|'availability'|'reviews', label}[]` → exactly Details, Availability, Reviews.
- `feedUrl(slug): string` → `https://book.reset.club/v1/homes/${slug}`; slug from `PROP_INFO[code].slug` with the trailing `-orp…x` removed (`hill-studio-orp5b646dax` → `hill-studio`).

- [ ] **Step 1: Failing tests** for every example above, plus `counterLabel(9, 60)` = `"10 — 60"`, `reviewsTag({count:0})` = "Five star", `mentionTags([], {max:3})` = [].
- [ ] **Step 2: Run** `npx vitest run tests/property-section.test.mjs` — FAIL.
- [ ] **Step 3: Implement** with the `house-calendar.js` wrapper so tests load it via `createRequire`.
- [ ] **Step 4: Run** `npm test` — PASS (baseline 299 + new); mutation: drop zero-padding → red.
- [ ] **Step 5: Commit** `feat: property section helpers`

### Task 2: Feed loading with fallback

**Files:** Modify `v5/property-section.js`, `v5/app.js` (near the properties fetch at 1993); test `tests/property-section.test.mjs`.

**Interfaces:**
- Produces: `loadHome(slug, {fetchImpl, timeoutMs = 3000}): Promise<Feed|null>` — null on error, non-200 or timeout. `Feed` = Plan C `/v1/homes/:slug` JSON.
- app.js starts all four `loadHome` calls in parallel with the existing Supabase fetch and passes results into the section builder.

- [ ] **Step 1: Failing tests** — fake fetch 200 → object; 500 → null; never-resolving fetch → null after timeout (fake timers); thrown error → null.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `feat: load the unseen home feed with a fallback`

### Task 3: Desktop section (M2) and rows

**Files:** Modify `v5/property-section.js` (`buildPropertySection`), `v5/app.js:2908-3100`, `v5/styles.css` (new `.ps-*` block, scoped); test `tests/property-section.test.mjs`.

**Interfaces:**
- Produces: `buildPropertySection(doc, data, handlers): HTMLElement` where `data = {code, info, feed|null, city, state, colours:{bg,text}}` and `handlers = {onDetails, onAvailability, onReviews}`. Returns `section.section#property-<code lowercase>` with `dataset.navBg/navText` set as today (`v5/app.js:2913-2914`) and `data-over-photo="1"`.
- Availability calls the existing `openHouseCalendar(code, info, colour, allDrops)`; Details calls a new `openDetails(doc, data)` overlay listing `details.intro` and `details.groups` (title + items), with the existing overlay close pattern; Reviews calls Task 5's `openReviewsSummary`.

- [ ] **Step 1: Failing tests** (fake tree): rows are exactly Details, Availability, Reviews, each with an `svg` arrow; no element with text "Gallery" or "Drops"; eyebrow text "KERHONKSON, NY"; Guests mention absent when `feed` null; title and mark share one row element; with `feed.photos` of 23 the counter reads "01 — 23" and there are 23 progress segments.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per `reference/Main.dc.html`: photo left 800px full height, panel right with eyebrow, title + mark, tagline, Guests mention, rows anchored to the bottom. Click left half = previous, right half = next (`cursor: w-resize`/`e-resize`), ← → when the section is the observed current section. Caption bottom left, counter bottom right, 2px segmented progress rule. First two images eager, rest `loading="lazy"`.
- [ ] **Step 4:** `npm test` PASS. Local serve, screenshots at 1280×800 for all four houses, before (current main) and after.
- [ ] **Step 5: Commit** `feat: desktop property section with photos first`

### Task 4: Phone layouts J and K for Doug's choice (gate)

**Files:** Modify `v5/property-section.js`, `v5/styles.css`.

- [ ] **Step 1:** Build both behind `?phone=j` / `?phone=k` (default J): J per `Phone-J.dc.html` (photo ~400px at 390×707, title block over the photo, panel below); K per `Phone-K.dc.html` / `Phone-K2.dc.html` (full-bleed photo, sheet, first swipe or tap drops the sheet to a 64px strip "Hill Studio ↑", tap restores). Horizontal swipe via pointer events with `touch-action: pan-y` on the photo, threshold 40px horizontal and dominant over vertical.
- [ ] **Step 2:** Failing-then-passing test for the swipe decision function `swipeIntent(dx, dy): 'next'|'prev'|null` (40px threshold, |dx| > |dy|).
- [ ] **Step 3:** Deploy to staging only (`scripts/deploy.sh staging`), screenshots at 375×667 and 390×707 for both, send Doug the two staging links.
- [ ] **Step 4: Gate** — Doug picks on his phone. Delete the losing layout's code and the query switch.
- [ ] **Step 5: Commit** `feat: phone property section (<winner>)`

### Task 5: Reviews summary screen

**Files:** Modify `v5/property-section.js` (`openReviewsSummary`, `renderReviewList`), `v5/app.js` (Reviews row no longer calls `openReviews` at 2994; the old `openReviews` stays unused until Plan C Task 6 parity is accepted, then is deleted); tests.

**Interfaces:**
- `openReviewsSummary(doc, data)` per `Reviews-Desktop.dc.html` / `Reviews-Phone.dc.html`: back link to the house, eyebrow, "Reviews", three numbers (average, count, last 90 days), summary text with "Summary of N reviews · updated monthly" when `feed.reviews.summary`, ranked words with bars (max width 116px, proportional to share, `return` included here), 1–2 quotes with stars and attribution, "All N reviews →" which pages `/v1/homes/<slug>/reviews?page=N` 20 at a time, and the footer.
- `barWidth(share, max = 116): number` → `Math.round(share / topShare * max)`.

- [ ] **Step 1: Failing tests** — `barWidth` for the top word = 116; summary line absent when `summary` null; quotes render attribution text exactly as the feed gives it; review text is set with `textContent` (a body with `<b>` renders literally); "All 76 reviews →" label uses `reviews.count`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5:** Screenshots at three sizes, summary present and absent.
- [ ] **Step 6: Commit** `feat: reviews summary screen from the unseen feed`

### Task 6: Over-photo header and theme-color

**Files:** Modify `v5/app.js` `showSection` (1803) and `v5/index.html` head.

- [ ] **Step 1: Failing test** — `topEdgeColour(pixels: Uint8ClampedArray, width): string` averages the top 8px rows to `#rrggbb`; a known 2×1 array returns the expected hex.
- [ ] **Step 2–3:** Implement; on section change, a section with `data-over-photo` adds `rc-over-photo` to `nav` and sets `<meta name="theme-color">` from the current photo's top-edge colour (computed once per photo via a 1×N canvas draw, CORS-safe images only; fallback `#000000`); other sections remove the class and set theme-color to the section's `navBg`.
- [ ] **Step 4:** Screenshot the nav over a photo and over the collection section; check iOS Safari on Doug's phone during the Task 4 gate.
- [ ] **Step 5: Commit** `feat: header over the photo and theme-color per section`

### Task 7: Ship

- [ ] **Step 1:** `npm test` full suite, record count; `python3 scripts/site-smoke.py` against staging (needs the venv path in OPS.md).
- [ ] **Step 2:** Merge to `main`; `scripts/deploy.sh staging`, then `prod`; verify the live homepage at three sizes, all four houses, every row; remind Doug to purge the CDN cache before checking visuals.
