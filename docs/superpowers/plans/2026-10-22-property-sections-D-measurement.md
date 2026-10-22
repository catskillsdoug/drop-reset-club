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
3. Reloading the booked page, or guessing booking ids → one `booking_completed` per real booking, and a guessed id reveals no dates or names. (Task 3b)
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

### Task 3a: `/stay` reports checkout started (reset-club-proxy)

Discovery 2026-10-22 (`~/drop-reset-club-property-sections/docs/superpowers/specs/2026-10-21-property-sections/ownerrez-checkout-markers.md`): the booking form is an OwnerRez iframe (`div.ownerrez-widget[data-widget-type="Booking/Inquiry"]` > `iframe.ownerrez-widget-iframe`, src on `https://app.ownerrez.com/widgets/...`). On Book the iframe posts a message `{id, seq, url}` to the parent and OwnerRez's `widget.js` sets `window.top.location = data.url` (checkout on app.ownerrez.com, which the proxy never sees).

**Files:** reset-club-proxy `src/index.js` (the `/stay/<slug>` HTML rewrite, beside the consent hold ~848-906); test `test/stay-checkout-event.test.mjs`. Worktree `~/reset-club-proxy-measurement`, branch `feat/booking-measurement` from `origin/main`.

- [ ] **Step 1: Failing tests** — a `/stay/hill-studio-orp5b646dax` fixture through the rewriter contains exactly one injected listener script; evaluated with a fake window and posthog, a `message` event from origin `https://app.ownerrez.com` whose data has a string `url` captures `stay_checkout_started` with `{surface: 'stay', property_code: 'HILL4'}` once (a second message in the same page load does not repeat); a message from any other origin, or without `url`, captures nothing; with posthog absent (consent declined) nothing throws and nothing is captured. Slug → code: barn-studio-orp5b72cb5x BARN, cook-house-orp5b5d7d1x COOK, hill-studio-orp5b646dax HILL4, zink-cabin-orp5b5d7dfx ZINK.
- [ ] **Step 2–4:** FAIL, implement, `npm test` PASS (baseline 97 plus new). Mutation: accept any origin → red.
- [ ] **Step 5: Commit** `feat: /stay reports checkout started when OwnerRez hands off to payment`

### Task 3b: Booked page for OwnerRez direct bookings (agent-booking)

**Files:** agent-booking `src/checkout.js` (route beside `booked` ~358-390), `src/ownerrez.js` (booking read if missing), test `test/booked-ownerrez.test.js`. Worktree `~/agent-booking-booked`, branch `feat/ownerrez-booked` from `origin/main`.

**Interfaces:**
- `GET /<slug>/booked?bookingId=ORB<digits>` where slug is in `feedHomes(tenant)`. OwnerRez appends `?bookingId=ORB123456` to the Redirect After Booking URL (OwnerRez support docs). Numeric id = digits after `ORB`; read `GET /v2/bookings/{id}`.
- Shows the full confirmation only when all hold: the booking exists, its `property_id` is the slug's property, `type` is `booking`, status not cancelled, and it was booked within the last 24 hours (`booked_utc`, else `created_utc`). Otherwise, including a malformed or unknown id or an OwnerRez error, it renders the generic page: same shell, "Thank you. Check your email for your confirmation." Same 200 status either way, so the response reveals nothing about which ids exist.
- Full confirmation content (reuse `shell` and the copy at `src/checkout.js:376-377`): "You are booked at {home name}"; "Check your email for your confirmation and rental agreement. Your door code arrives once the agreement is signed."; the tenant contact line "Texts about your stay come from {phone}. Save the number so your door code is not filtered." Never: dates, guest name, total, address, or the contact-card (vCard) link — the address card stays limited to platform checkouts.
- Logging: `logEvent(env, tenantKey(tenant), slug, 'booked_ownerrez')` once per booking id (store the id in KV `QUOTES` key `booked-or:<id>` for 30 days to dedupe), full-confirmation case only.
- PostHog: when the request cookie `rc_consent` grants analytics (read the value format from `drop-reset-club/v5/consent.js`), the page includes the PostHog snippet (project key and api_host as `drop-reset-club/v5/index.html`) and captures `booking_completed` with `{surface: 'stay', property_code}` once per booking (`sessionStorage` key). No snippet at all without consent.

- [ ] **Step 1: Failing tests** — fixture booking for 470197 booked 2 hours before `env.NOW` → full page with "You are booked at Barn Studio", no arrival or departure date strings, no guest name, no `contact.vcf`; booked 3 days before → generic page; property mismatch → generic; `bookingId=ORBabc` and missing id → generic without any OwnerRez call; OwnerRez 500 → generic 200; consent cookie granted → snippet and `booking_completed` with `property_code: 'BARN'` present; no cookie → no `posthog` string in the page; second load of the same id → one funnel row; slug not in feedHomes → 404.
- [ ] **Step 2–4:** FAIL, implement, `npx vitest run --dir test` PASS (baseline 270 plus new). Mutation: drop the 24-hour check → red.
- [ ] **Step 5: Commit** `feat: confirmation page for OwnerRez direct bookings`

### Task 3c: Point OwnerRez at the page (Doug)

Only after 3a and 3b are deployed and the page is checked live (generic page for `?bookingId=ORB1`):
- [ ] Doug sets each property's Redirect After Booking URL (OwnerRez > Property > Rules) to `https://book.reset.club/<slug>/booked` for barn-studio, cook-house, hill-studio, zink-cabin.
- [ ] Pre-register, then confirm on the next real direct booking: the guest lands on "You are booked at {home}", the D1 funnel has one `booked_ownerrez` row, PostHog has one `booking_completed` (if the guest consented), and Supabase `bookings` shows the booking with listing_site "The Reset Club website".

### Task 4: Baseline and the before/after view

**Files:** none in repos; PostHog and Supabase only (read, then one saved insight and one dashboard with Doug's OK).

- [ ] **Step 1:** Confirm which `bookings` column is the booking time (compare `created_at` with OwnerRez `booked_utc` for 5 recent bookings via the OwnerRez API). Record it here.
- [ ] **Step 2:** Weekly website bookings for the 26 weeks before launch, and the Airbnb count beside it (so seasonality shows), by `listing_site` per Global Constraints. Write the table into this plan.
- [x] **Step 1 (done 2026-10-22):** booking time = Supabase `bookings.booked_at` (matches OwnerRez `booked_utc` to the second; 2,050 of 2,057 rows set). `created_at` is NOT usable: it holds the February 2026 import dates. Status values are `confirmed` / `cancelled` (two l's).
- [x] **Step 2 (done 2026-10-22):** non-cancelled bookings by `booked_at` week (Monday start). Website = listing_site in ('The Reset Club website', 'reset.club', 'book.reset.club').
  - Last 26 full weeks (weeks of 2026-04-20 to 2026-10-12): website **13** (0.50 a week), Airbnb 178, other 2; website share **6.7%**.
  - Same 26 weeks a year earlier (2025-04-21 to 2025-10-13): website **9** (0.35 a week), Airbnb 161, other 16; website share 4.8%.
  - The three website rows on 2026-10-19 are cancelled platform-checkout tests and are excluded. Exclude the test `stay_checkout_started` at 2026-10-22T10:59:41Z.
  - At about one website booking every two weeks, a change will take months to show in counts alone; the PostHog funnel (checkout started per visitor) is the faster signal.
- [ ] **Step 3:** Save a PostHog funnel: homepage `$pageview` → `viewed_property` → `calendar_opened` or `viewed_dates` → `stay_checkout_started` → `booking_completed`, by device; and a dashboard "Bookings — redesign before/after" with that funnel, weekly `booking_completed`, and `nav_clicked` by `item`.
- [ ] **Step 4:** Doug sets the success bar (e.g. website bookings per week vs the same weeks last year) before Plan B goes live; record it here.

### Plan A addition

Plan A Task 3 `menu.js` also captures `nav_clicked` with `item` = the link's label (About, FAQ, News, Catskills Collection, a house name, JOIN, Sign in, Language) and `surface`; the footer + and each legal link capture `nav_clicked` with their label. Test: each item click captures exactly one event with the right `item`.
