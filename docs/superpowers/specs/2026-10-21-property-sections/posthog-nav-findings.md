# PostHog nav research, reset.club (read-only), run 2026-10-22

## Method and caveats
- Tool: mcp__posthog__exec. `learn` run first. `metric-list` FAILED: MCP key lacks scope data_catalog:read, so the governed catalog was not consulted. Every number below is a one-off, noncanonical query (HogQL via execute-sql, all with timestamp bounds).
- Events confirmed with read-data-schema: $pageview, $autocapture (exists in raw data, was omitted from the schema event list), $pageleave, viewed_property (prop: property), viewed_pricing (section, property), viewed_dates, booking_intent (section, property), calendar_opened / calendar_book_pressed (prop: house), email_signup, $identify, consent_accepted, $rageclick. Device = properties.$device_type. Bots excluded with NOT coalesce(properties.$virt_is_bot,false). Host filter = properties.$host = 'reset.club'. Sessions = properties.$session_id. Visitors = person_id.
- Data window starts 2026-07-24 (first event), so "90 days" is about 91 days.
- Consent: first consent_accepted 2026-10-19 (user says banner live 10-20). reset.club pageviews before 10-19: 3,011 of 3,103 (97.0%); sessions 1,920 of 1,973. Only 3 days of consenting-only data; treat post-banner numbers as noise.
- Excluded: 160 bot pageviews on reset.club; stay.reset.club host (939 pageviews, 520 sessions, a separate older host with /stay + home pages); drop.reset.club (55 pv); staging/localhost.
- 30-day figures use sessions that STARTED in the last 30 days.

## 1. Visitors and sessions (reset.club, non-bot, $pageview)
- 90d: 1,779 visitors, 1,973 sessions, 3,103 pageviews. 30d: 659 visitors, 760 sessions, 1,157 pageviews.
- Visitors by $device_type, 90d / 30d: Desktop 968 / 317, Mobile 794 / 327, Tablet 18 / 15 (a visitor on two devices counts in both).
- Sessions by device (any event, so 2,186 total vs 1,973 pageview sessions; 213 sessions have only custom events and no pageview): 90d Desktop 1,133, Mobile 1,031, Tablet 22. 30d Desktop 388, Mobile 431, Tablet 19.

## 2. Funnel (sessions; no "booked" event exists)
Steps and the event used:
- Landed: any session. Home: $pageview pathname '/'.
- Property interaction: viewed_property (a house section scrolled into view; property = BARN/HILL4/COOK/ZINK).
- Availability/pricing seen: viewed_dates OR viewed_pricing OR calendar_opened.
- Booking intent: booking_intent (click on a season/event row; section + property) OR calendar_book_pressed.
- Stay page: $pageview pathname LIKE '/stay%' (OwnerRez listing/checkout proxy).
- Stay with dates: $pageview with $current_url containing or_arrival= (dates carried into /stay; the closest proxy for quote/checkout).
- Booked: NOT TRACKED.

90d (sessions): 
| device | sessions | viewed_property | avail seen | intent | /stay | /stay+dates |
| Desktop | 1133 | 169 (14.9%) | 196 (17.3%) | 59 (5.2%) | 399 (35.2%) | 152 (13.4%) |
| Mobile | 1031 | 261 (25.3%) | 303 (29.4%) | 74 (7.2%) | 554 (53.7%) | 91 (8.8%) |
| Tablet | 22 | 3 | 5 | 3 | 14 | 2 |
| Total | 2186 | 433 | 504 | 136 (6.2%) | 967 | 245 (11.2%) |
30d (sessions started in last 30d):
| Desktop | 388 | 57 (14.7%) | 71 (18.3%) | 23 (5.9%) | 127 (32.7%) | 36 (9.3%) |
| Mobile | 431 | 94 (21.8%) | 105 (24.4%) | 30 (7.0%) | 277 (64.3%) | 42 (9.7%) |
| Tablet | 19 | 2 | 4 | 2 | 13 | 1 |
Cautions: the steps are not strictly nested (sessions can reach /stay without home, e.g. direct or ad links to /stay). Of 90d sessions, entry on '/' = 1,139; entry straight on a /stay page = about 800. "/stay with dates" is a listing page with dates in the URL, not a confirmed checkout or booking. Booking completion lives in OwnerRez; PostHog has no booking_confirmed event. Desktop views more of /stay (listing) with dates than mobile on 90d, mobile is higher on 30d only slightly.
Calendar events (calendar_opened 45, calendar_range_picked 167, calendar_book_pressed 7, calendar_stay_preset, calendar_shared_opened) only exist from 2026-10-19; on host reset.club just 10 calendar_opened, so the new house calendar has almost no production data yet (most is localhost/staging).

## 3. Navigation use (autocapture clicks, $event_type = click, 90d, sessions of 2,187)
Autocapture exists, so nav clicks are measurable by $el_text. Verified by elements_chain: About/FAQ/News are in div.footer-links; RESET = a.nav-logo#nav-reset (and the "/" link); JOIN = a#nav-join and button#rj-btn.
Pageviews of /about /faqs /news /privacy /terms /disclaimer: ZERO in 90d (those pages do not send $pageview, or posthog is not loaded there). So viewing them is NOT measurable by pageview; only the click that leaves the page is.
| click label | sessions | share of all sessions |
| RESET (nav) | 87 | 4.0% |
| About (footer) | 42 | 1.9% |
| FAQ (footer) | 15 | 0.7% |
| News (footer) | 2 | 0.1% |
| JOIN | 18 | 0.8% |
| Privacy/Terms/Disclaimer | 2 combined (label may differ) | 0.1% |
| "sign in/log in" | 2 | 0.1% |
Do About/FAQ/News clickers book more? Among engaged sessions (saw property/pricing/dates, n=514): clickers n=51 vs non-clickers n=463. Booking intent 17 (33.3%) vs 119 (25.7%); /stay+dates 16 (31.4%) vs 119 (25.7%); any /stay 22 (43.1%) vs 149 (32.2%). Small n and self-selection (engaged people click more), so this does not show causation. Booked itself is unmeasurable.

## 4. JOIN / sign-in
- Join panel open: no dedicated event. Proxy = click on JOIN: 24 clicks, 18 sessions (nav-join 17+ and rj-btn). Login panel open, code requested, login complete, account view: NOT TRACKED (no events).
- Sign-ups: email_signup on reset.club 11 events (events fire twice or thrice per submit), 5 $identify events (2026-07-28, 07-31, 09-19, 10-07, 10-16) = about 5 identified sign-ups in 90d; 2 in the last 30d. 15 email_signup incl. staging.
- Identified share: $is_identified true on 24 of 3,103 pageviews, 3 of 1,779 persons (0.2%). Too few to compare conversion of logged-in visitors.
- Sessions that clicked JOIN: 9 of 18 had booking_intent (50%) vs 6.2% all sessions; selection bias, not an effect.
Needed events: join_opened, login_opened, login_code_requested, login_completed, signup_completed (with method), account_viewed.

## 5. Interaction by section / row, entries, referrers
- House sections in view (viewed_property sessions, 90d): BARN 393, HILL4 346, COOK 317, ZINK 253 (events 547 / 474 / 431 / 342).
- Availability row: viewed_dates 1,456 events / 405 sessions (reset.club); click "availability" 15 sessions. Pricing blocks: viewed_pricing 1,626 events; top rows season-late-autumn BARN 122 sessions, season-early-fall BARN 89, season-golden-hour COOK 83, season-late-autumn COOK 84.
- Booking intent by property (sessions): BARN highest (e.g. late-autumn 25, peak-foliage 20, early-fall 11, golden-hour 7, harvest 10); HILL4 golden-hour 8; ZINK and COOK single digits. 224 booking_intent events on reset.club (+11 staging/local).
- Gallery: click "gallery"/"photos" 153 sessions (172 + 59 clicks); Reviews: "reviews" click 13 sessions; Drops: "drops" click 40 sessions; Availability click 15; Details 22; Location 19; Amenities 11. Gallery and Reviews and Drops have NO view events, only click labels.
- Calendar paging: "next" clicks 1,678 (159 sessions), "previous" 124: date row heavy use.
- Entry page of sessions reaching /stay with dates: entry '/' 126, /stay/barn-studio 45, /stay/hill-studio 29, /stay/cook-house 26, /stay/zink-cabin 13. Entry '/stay/zink' (291 sessions) and '/stay/barn' (111): 4 and 0 reached dates (likely ad or QR direct landings).
- Referrer (session entry $referring_domain, sessions / reached dated / intent): $direct 1,466 / 162 / 67; www.google.com 249 / 43 / 43; l.instagram.com 73 / 16 / 13; reset.club 41 / 18 / 8; facebook 38 / 0 / 0; visitulstercountyny.com 15 / 0 / 0; chatgpt.com 4 / 1 / 1. (213 sessions have no pageview, so no referrer.)

## Not measurable now, event needed
- Completed booking: booking_completed (from OwnerRez webhook or confirmation page, with property, amount_cents, session/person id).
- Quote/checkout reached on /stay: stay_quote_viewed, stay_checkout_started (OwnerRez page is third-party; or_arrival= URL is the only proxy).
- Pageviews of /about /faqs /news /privacy /terms /disclaimer: load posthog on those pages.
- Join/login funnel events listed in section 4; per-row view events for Gallery, Reviews, Drops; nav_opened (burger), nav_item_clicked with item name, footer_link_clicked.
