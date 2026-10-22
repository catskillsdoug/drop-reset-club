# Plan D — measure bookings before and after the redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before Plans A and B ship, be able to answer "did the redesign bring more bookings?" — a pre-launch baseline and the events that connect a homepage visit to a booking.

**Why (Doug, 2026-10-22):** the goal of the redesign is more bookings. A PostHog read of 90 days (2026-07-24 to 10-22, `docs/superpowers/specs/2026-10-21-property-sections/posthog-nav-findings.md`) found: no booked or checkout event; About/FAQ/News/legal pages record zero pageviews; the join panel records nothing beyond `email_signup`; menu items are not named in clicks. Supabase `bookings` shows about 11 website bookings in 90 days (listing_site "The Reset Club website" 8, "reset.club" 2, "book.reset.club" 1) against 116 Airbnb, counted by `created_at` (to be confirmed as booking time in Task 4).

**Architecture:** Every event goes through the existing consent-gated PostHog setup (project 485877; `v5/index.html:40-95` inits and opts in or out from `resetConsent`), so nothing is captured before Accept. No PII in any event property: no names, emails, phones, booking ids that identify a guest. Bookings themselves are counted from Supabase `bookings` (source of truth); PostHog events give the path.

**Spec:** `docs/superpowers/specs/2026-10-21-property-sections-design.md` (goal and success); this plan is added scope approved by Doug on 2026-10-22.

**Order:** run before Plan A Task 4 and Plan B ship, so at least two weeks of baseline exist.

## Global Constraints

- Event names, exactly: `content_page_viewed` (automatic `$pageview` is fine if the snippet is loaded; then no custom event), `join_opened`, `login_opened`, `login_code_requested`, `login_completed`, `signup_completed`, `nav_clicked`, `stay_checkout_started`, `booking_completed`.
- Properties allowed: `surface` (`homepage`, `content`, `stay`), `item` (menu or footer item label), `property_code` (BARN, COOK, HILL4, ZINK), `nights`, `arrival_month` (YYYY-MM), `method` (`email` or `phone`). Nothing else.
- Capture only after consent (reuse the existing opt-in; never call `capture` before `resetConsent` reports granted).
- Website bookings = Supabase `bookings` where `listing_site` in ('The Reset Club website', 'reset.club', 'book.reset.club'), excluding cancelled.

## Review Focus

1. A visitor who declines consent → zero network calls to posthog.com on any surface. (Tasks 1–3)
2. A login or sign-up error → no `*_completed` event. (Task 2)
3. Reloading the OwnerRez confirmation page → one `booking_completed` per booking, not one per load. (Task 3)
4. No event property ever contains an email, phone, name or full booking id. (all tasks)
5. Bookings made on Airbnb are never counted as website bookings. (Task 4)

---

### Task 1: Content pages load the consent-gated PostHog snippet

**Files:** Modify `functions/_middleware.js` `renderPageShell` (~1440) to include the same snippet and consent wiring as `v5/index.html:40-95` (extract it to one shared string in `functions/` so the two cannot drift); test `tests/content-analytics.test.mjs`.

- [ ] **Step 1: Failing test** — `renderPageShell` output contains the PostHog init with the project key and the consent opt-in call; it appears once.
- [ ] **Step 2–4:** FAIL, implement, `npm test` PASS.
- [ ] **Step 5:** After deploy, with consent accepted in a fresh browser profile, visit /about and confirm a `$pageview` for `/about` in PostHog within 5 minutes; with consent declined, confirm none.
- [ ] **Step 6: Commit** `feat: content pages report pageviews after consent`

### Task 2: Join panel events

**Files:** Modify `v5/join.js` (mode switches ~59, 103-160, submit and logout handlers); test `tests/join-events.test.mjs` (fake `window.posthog` recording calls).

- [ ] **Step 1: Failing tests** — opening the panel in join mode captures `join_opened`; switching to login captures `login_opened`; requesting a code captures `login_code_requested` with `method`; a successful verify captures `login_completed`; a successful sign-up captures `signup_completed`; a failed verify or sign-up captures nothing completed; no captured property contains an `@` or a run of 7+ digits.
- [ ] **Step 2–4:** FAIL, implement (guard every call with `window.posthog && posthog.capture`), PASS.
- [ ] **Step 5: Commit** `feat: join and login funnel events`

### Task 3: `/stay` checkout and booking events (reset-club-proxy)

**Files:** reset-club-proxy `src/index.js` (the `/stay` HTML rewrite, beside the consent hold at ~848-906); test `test/stay-booking-events.test.mjs` with saved fixtures of the real OwnerRez booking form page and confirmation page.

- [ ] **Step 1: Discover** — in a browser, walk a real /stay booking to the payment form (do not pay) and record the URL pattern and a stable DOM marker of (a) the booking form page and (b) the confirmation page; for (b) use OwnerRez docs or Doug's next real direct booking. Save both HTML pages as fixtures with guest data removed. If (b) cannot be observed, stop and report; do not guess the pattern.
- [ ] **Step 2: Failing tests** — the form fixture through the rewriter gets one inline script that, after consent, captures `stay_checkout_started` with `property_code`, `nights`, `arrival_month`; the confirmation fixture captures `booking_completed` with the same properties once, guarded by a `sessionStorage` key per booking so reloads do not repeat; declined consent captures nothing.
- [ ] **Step 3–4:** implement, `npm test` PASS (baseline 97 plus new).
- [ ] **Step 5:** Deploy with `env -u CLOUDFLARE_API_TOKEN npx wrangler deploy` (Doug's go), then confirm `stay_checkout_started` appears for a test walk-through.
- [ ] **Step 6: Commit** `feat: /stay reports checkout started and booking completed`

### Task 4: Baseline and the before/after view

**Files:** none in repos; PostHog and Supabase only (read, then one saved insight and one dashboard with Doug's OK).

- [ ] **Step 1:** Confirm which `bookings` column is the booking time (compare `created_at` with OwnerRez `booked_utc` for 5 recent bookings via the OwnerRez API). Record it here.
- [ ] **Step 2:** Weekly website bookings for the 26 weeks before launch, and the Airbnb count beside it (so seasonality shows), by `listing_site` per Global Constraints. Write the table into this plan.
- [ ] **Step 3:** Save a PostHog funnel: homepage `$pageview` → `viewed_property` → `calendar_opened` or `viewed_dates` → `stay_checkout_started` → `booking_completed`, by device; and a dashboard "Bookings — redesign before/after" with that funnel, weekly `booking_completed`, and `nav_clicked` by `item`.
- [ ] **Step 4:** Doug sets the success bar (e.g. website bookings per week vs the same weeks last year) before Plan B goes live; record it here.

### Plan A addition

Plan A Task 3 `menu.js` also captures `nav_clicked` with `item` = the link's label (About, FAQ, News, Catskills Collection, a house name, JOIN, Sign in, Language) and `surface`; the footer + and each legal link capture `nav_clicked` with their label. Test: each item click captures exactly one event with the right `item`.
