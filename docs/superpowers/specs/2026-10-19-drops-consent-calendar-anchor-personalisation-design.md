# Drops: consent, house calendar, price anchor, returning-guest memory

*2026-10-19, Doug + Claude. Four pieces, built in this order. Each ships on its own.*

## Why

Drops show a few well-chosen stays per two-week micro-season (3-night weekends, 2–3 night midweeks) so a guest does not have to decide between Thursday and Friday. Four gaps:

1. **The site tracks without consent.** reset.club, drop.reset.club and reset.club/stay load Google Analytics (`G-WCT8MYRETF`), the Meta Pixel and (apex and drops only) PostHog on page load.
2. **The guest who is ready to book has no calendar.** PostHog, 25 Jun to 19 Oct 2026: about 430 of 2,939 sessions open a house view. 62% tap Gallery, 13% Reviews, 27% Drops. Of those who tap Drops, about 40% reach a /stay booking page. The 73% who never tap Drops have no way to see open dates except the OwnerRez page, whose date boxes are empty until tapped.
3. **3-night prices have nothing to look cheap against.** Each drops view should carry one higher-priced long stay.
4. **Every visit starts from zero.** A returning guest has to find their house and their weekend/midweek view again.

## Goals, non-goals, anti-goals

- Goal: nothing tracks until a guest accepts, on every reset.club surface.
- Goal: a guest on a house page can see open dates and book in a few taps, with drops offered as the suggested picks.
- Goal: each drops view shows exactly one long, high-priced stay above the 3-night rows.
- Goal: a returning guest who accepted cookies lands on the view and house they used last.
- Non-goal: replacing OwnerRez checkout here. Book hands off to OwnerRez today, and to book.reset.club checkout once that project goes live.
- Non-goal: per-category consent toggles. One Accept covers everything.
- Non-goal: stray 1–2 night gap stays on the drops page. Gap nights stay with the gap-fill engine.
- Anti-goal: a fake or unbookable anchor. It is real inventory Doug is happy to sell.
- Anti-goal: hiding houses from a returning guest. Reorder, never filter.
- Anti-goal: showing a per-night price on the anchor or drop rows. Longer stays are cheaper per night (Hill: 3 nights $792/night, 5 nights $653/night), so totals only.
- Anti-goal: invented content. A value with no data source is left out.

## 1. Consent banner (first)

**Decided by Doug:** strict opt-in for every visitor, everywhere; one Accept for all; no per-category toggles.

- Surfaces: reset.club (apex, served by `reset-club-proxy` and the v5 app from `drop-reset-club`), drop.reset.club, and reset.club/stay/* (OwnerRez pages proxied by `reset-club-proxy`). Doug confirmed /stay carries Google and Meta tags. new.reset.club loads no trackers today and is out of scope.
- Before a choice, nothing loads: no GA, no Meta Pixel, no PostHog, no personalisation cookie (piece 4).
- Banner: Accept and Decline, equal size and weight. Short line saying what is used (analytics, ads measurement, remembering your choices) and a link to Privacy.
- The choice is stored in a first-party cookie on `.reset.club` so one answer covers apex, drop.reset.club and /stay. A Decline is remembered too, so the banner does not return on every page. Lifetime 12 months (my call; under the CNIL 13-month cap), not renewed silently on return.
- A "Cookie settings" link reopens the banner. The footer row (About · FAQ · News · Privacy · Disclaimer · Terms) is fetched from `brand.reset.club/footer` and shared with other sites, so the consent script appends the link to it on the in-scope surfaces only (my call), rather than editing the shared footer. On /stay, where OwnerRez draws its own footer, the proxy-injected script adds it. Changing to Decline stops loading trackers from the next page view.
- Every place that loads a tracker is gated, including the hard-coded GA and Pixel in `functions/_middleware.js` (content pages) and `v5/index.html`, where GA and the Pixel load before the existing `resetAnalyticsConsent()` hook runs.
- /stay, as found live on 2026-10-19 (headless load of the Cook page): the page itself loads GA `G-D8VHCTMB3G` (a second GA property, not `G-WCT8MYRETF`), Google Ads `AW-11082537937`, Meta Pixels `622278338536523` and `1607488640164289`, and PostHog. The OwnerRez booking widgets are iframes on `app.ownerrez.com` and carry their own `G-WCT8MYRETF`, `G-D8VHCTMB3G` and Pixel `622278338536523`.
- These are booking conversions, not just page views. OwnerRez's help docs say its Pixel fires Purchase on checkout confirmation, and its GA tracks quotes and bookings (https://www.ownerrez.com/support/articles/analytics-tracking). The Ads tag exists to count booking conversions.
- The proxy can gate what it serves on /stay pages. It cannot reach inside the `app.ownerrez.com` iframes or OwnerRez-hosted checkout; the only control there is OwnerRez's account tracking settings, all on or all off. Builder to confirm whether the checkout confirmation page passes through the proxy.
- **Decided by Doug:** keep the tags in OwnerRez; do not remove them. `reset-club-proxy` holds them back in the /stay HTML it serves (rewrite the tag scripts so they do not run, then run them on Accept), so the page tracks only after consent.
- Known gap, accepted (my call, following Doug's decision): the booking widget iframes on `app.ownerrez.com` keep their own tags, so tracking starts there when a guest opens the booking widget. Proxying the widget through reset.club would close the gap, but it carries payment, so it is out of scope. The gap closes when checkout moves to book.reset.club, which fires its booking conversions only after Accept.
- Privacy page text updated to name the trackers and the consent cookie.
- Analytics will drop after this ships, because many visitors never press Accept. Expected, accepted by Doug.

## 2. House calendar (second)

**Where:** the house view on the homepage (`reset.club/#property-<code>`, opened by tapping a house name; rows today: Gallery, Reviews, Drops). A new row, **Calendar**, goes second, under Gallery. Tapping it opens the calendar in place, in the house colour (from the `properties` data the page already loads, e.g. Cook `#ff551e` with text `#fcf6e9`). Gallery, Reviews and Drops stay as they are.

**The design to follow** is the booking-page calendar in the "unseen Template System" artifact (https://claude.ai/artifact/75UArf1799jCXhwMycCrJT, section 01 Booking): two date leaves (arrival day with "from 4 pm", departure with "by noon", nights and guests between); month header with arrows; a "3-night stays" / "Any dates" switch; Monday-first grid; suggested blocks drawn as dashed outlines on a tint; the chosen stay filled in the house colour; booked nights struck through; past days grey; guest counter (Adults, then "Anyone else coming along?" for children and infants); a Done/Book action. Encode every treatment in that design rather than re-deciding it. The house colour replaces the artifact's forest green.

**What the outlines are (decided by Doug):** the house's available drops, as suggestions. They replace the artifact's computed Fri–Mon / Mon–Thu blocks. One tap picks the whole drop, and dragging a picked stay slides it as in the artifact. "Any dates" shows the plain open calendar: any length the rules allow, tap a later day to change departure.

**Which service (my call, following the decision that reservations live in agent-booking):** the calendar's data and any-range quotes come from `agent-booking`, not `price-quote-worker`. `price-quote-worker` only prices dates that match an existing drop (`src/index.js:273-282`) and returns no alternatives. `agent-booking` already quotes any range (`/v1/quote`) and finds nearest valid stays (`alternatives()` in `src/availability.js`). Add a browser-callable calendar-days endpoint there (per house, date range, CORS for reset.club and drop.reset.club). Drop prices on the drops page keep coming from `price-quote-worker`. `agent-booking` is mid-merge on Stage 3: whether the new endpoint lands on main before or after that merge is the builder's call, but piece 2 cannot ship before the endpoint is live.

**Booking rules, two layers:**
1. Rules known in advance shade the grid before the guest taps: OwnerRez `/v2/calendar/{id}` day status and `rules.min_nights` / `rules.max_nights` (both are in the OwnerRez response; `agent-booking/src/availability.js` reads only `min_nights` today and must also enforce `max_nights`), plus Reset's `no_checkout_days` table in Supabase (read today by `price-quote-worker`). Once an arrival is picked, departures that break a rule grey out.
2. A live quote from `agent-booking` checks the chosen range before Book is enabled. If OwnerRez refuses it, say why and offer the nearest valid stays from `alternatives()`.

**Book** shows the dates and the real all-in total, then hands off to the OwnerRez booking URL with dates prefilled, the same way drop rows do today (`__rewriteBookingUrl`). When book.reset.club checkout goes live, Book points there instead; nothing else changes.

**One component, two homes.** Build the calendar so `agent-booking` (book.reset.club) can use it as the date picker its booking page still lacks (today its Book bar says "Choose dates"). Where the shared code lives is the builder's call; the house page ships first.

- How many months ahead: builder's call, at least through the furthest open drop.
- Mobile first: about 61% of house-view sessions are on phones.

## 3. Price anchor (third)

- Each drops view (each Weekend day toggle such as Thu/Fri, and Midweek) shows **one** anchor row at the **top** of the list, before the 3-night rows, in the same row style: no box, no badge.
- The anchor is a **longer version of a stay already on the page** (Doug's words): take the priciest 3-night drop in the view, by its live total, and extend it to **5 nights** from the same arrival (Thu–Sun becomes Thu–Tue). This is my call on how "the priciest house" is ranked: it uses prices the page already has, so only one extra quote per view is needed.
- If those 5 nights are not open, try the next-priciest drop in the view, and so on. If none extends, the view shows no anchor.
- 5-night quotes come from `agent-booking` (`price-quote-worker` cannot price non-drop ranges). Compute them server-side and cache them with the drops data, not in the browser, so the page does not wait on OwnerRez.
- Filtered views (my call): on a single-house list (`?property=HILL4`, the house view's Drops row) the anchor is that house's own extended drop. Event pages (`/e/<slug>`) show no anchor.
- If the 5 nights overlap an event already called out on drops (for example FIRST SNOWFALL), the row carries that tag.
- Chosen automatically from availability and live prices, not by hand. Price shown is the live all-in total, like every drop row.
- Worked example (live quotes, 18 Oct 2026): Hill Thu–Sun Nov 5–8 $2,376; Hill Thu–Tue Nov 5–10 $3,264, so +$888.
- The anchor stays fixed at the top for every visitor (see piece 4).

## 4. Returning-guest memory (fourth; needs pieces 1 and 3)

- Only after Accept. Declined or undecided visitors see the normal page.
- Remember two things: the house they last opened and whether they last chose Weekend or Midweek. One first-party cookie holding house code, view, and a timestamp. No identifier, nothing sent anywhere. Expire after about two micro-seasons (roughly a month; builder may set the exact figure).
- On return: open on the remembered view; move the remembered house's rows to the top of each list. Every other house stays visible.
- Show a small line saying what was remembered, with a way to clear it ("Showing Hill first · reset").
- The anchor does not move to the remembered house. Research (Mousavi et al., Information Systems Research 2023) found a decoy lowered demand once results were personalised. Test it separately later if wanted.

## Constraints

- `drop-reset-club` deploys from a clean `main` worktree with `scripts/deploy.sh` (staging then production), never from `~/drop-reset-club` (feature branch plus old work in progress). Bump `app.js?v=` and `styles.css?v=` in `v5/index.html` with every change.
- `reset-club-proxy` deploys from `main` with `env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`.
- `agent-booking` work follows its own handoff docs; its Stage 3 checkout branch is mid-merge.
- Brand: all type `#000000` on sand, or the house's text colour on its colour. No gold text. One border weight per page.
- Screenshots at 375×667 and desktop before and after every visual change, plus a live check after deploy.
- Tests can fail: mutate the code and watch each new test go red.

## Left to the builder

- Consent script implementation (own small script or a library), and whether GA uses Google Consent Mode.
- How /stay tags are moved behind consent (OwnerRez settings vs proxy strip).
- Where the shared calendar code lives and how it is packaged for agent-booking.
- Months shown ahead, the Midweek anchor start day, the exact personalisation cookie lifetime.
- Event names for new PostHog tracking, which is welcome: calendar opened, range picked, Book pressed, consent accepted or declined.
