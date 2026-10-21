# Handoff: house calendar go-live and Pick dates share cards

Written 2026-10-21 (second session that day). Supersedes the "Next steps" of `2026-10-21-house-calendar-HANDOFF.md`.

## State at close
- **agent-booking** `a2797bb` LIVE on book.reset.club (Doug deployed 10-21, version `f840e306`). Checked: `/v1/calendar` CORS echoes reset.club and staging.reset.club, `/v1/quote` 200 in 1.3 s, `/health/stripe` present (test mode), MCP lists search_stays, get_quote, create_hold. Cook Dec 1 to 4 now $1,222.71 = OwnerRez widget (OwnerRez price changed since the first handoff's $1,233.78).
- **drops** `feat/house-calendar` = `main` = `ed8635d`, pushed, 299 vitest tests. **On staging** (staging PASS recorded for `ed8635d`), **not on prod**. The handoff commit after it is on the branch only, so main still matches the recorded staging pass.
- Interaction harness on `ed8635d`: 1,734 actions, only failure `page-panned-x` (pre-existing page width, P1 below). Prior bug ids `hint-hides-book`, `crumb-open`, `focus-lost`, `swipe-scrolled-page` gone.

## What shipped to staging this session (commits on main)
- `1fa04ec` nav crumb stays on an open calendar (middle-line observer).
- `c5f0ad9`, `51817a6` no-stays tap keeps price and Book; focus kept inside on disable or rebuild; the strip holds its place on screen while its height eases (scroll anchoring caused the swipe jump).
- `d9c13b1` harness live-region check: a hint shown beside the price is what the live region speaks.
- `7d46890` calmer layout (Doug): two rules only, no underlines (whole Arrive/Depart side is the tap target), one small-caps label style, time on the label line (ARRIVE · 4 PM).
- `434c547` the earliest open stay is pre-selected and priced on open (Doug: "show the first available"), tracked `calendar_stay_preset`.
- `7766f68` Children/Infants rows keep the 4px gap; opening Anyone else scrolls them above the pinned bar.
- `fa0827f` Save and Share off on staging: staging follows the admin flag `save_share_enabled` like prod (flag is off).
- `ed8635d` Pick dates link: the open calendar writes `?stay=cook&arrive=…&depart=…&adults=…&children=…#property-cook` (replaceState), close clears it, a page loaded with it opens that stay (or the first open one with "Those dates aren't open any more").

## Next steps, in order
1. **Prod deploy of drops** (Doug runs; auto mode blocks Claude): `cd ~/drop-reset-club-worktree-summer-fix && PYTHONPATH=~/.cache/drop-smoke-venv/lib/python3.15/site-packages scripts/deploy.sh prod`. Then cache purge, then Claude checks all four houses live at 375 and desktop (Pick dates opens with a stay priced, link writes to the URL, a shared link opens it).
2. **reset-image template change (Doug: apply on all posters)**: `HEADLINE_BOTTOM` 296 to 216 in `~/reset-image/src/cards/render.ts`. Render one poster of every class (event, drop, stay, venue, news, area, guide, home, listing) before and after for Doug, run its 47 tests, then deploy (`npx wrangler deploy` from `~/reset-image`, Doug runs).
3. **New `dates` card class in reset-image** (design B, approved): route like `/og/dates/<code>?arrive=&depart=`. Layout = the billboard template with the image hero (full photo, template fade), wordmark RESET CLUB, club mark top right (the site's `LOGO_SVG`, cream, 64 px at x = W-PAD-64, y 52), kicker `KERHONKSON, NY` (from `properties.city`/`state`, all four houses), headline = house label, **no rule**, bottom row: the month (`NOV`, or `NOV·DEC` across a month) on the link-row baseline (1276) in the link-row type (44/700/2.2), then every day of the stay with its weekday letter above (24/700), circles (r 28) on arrival and departure filled sand with black numbers, one continuous band (sand 0.28) centre to centre, then the template arrow at the right. The strip's width leaves the arrow its place; 7 nights fit. Photo = `properties.thumbnail_url` upgraded `-Small` to `-Large` (as the stay class). Working prototype: `2026-10-21-share-cards/prototype-gen.ts` (bundles render.ts with esbuild and post-processes the SVG; the real build should be a proper renderer option, not string surgery). Reference renders: `B-cook-3-nights.jpg`, `B-barn-7-nights.jpg`.
4. **Point Pick dates links at it**: in drops `functions/_middleware.js`, when the URL has `?stay=`, `og:image` = `https://image.reset.club/og/dates/<code>?arrive=…&depart=…` (dimensions 1080x1350). Also: the existing house share images `https://drop.reset.club/v5/og/<house>.png` return an HTML page, not an image (checked 10-21), so plain house links likely unfurl with no picture; point them at the `stay` class.
5. Run the harness on whatever goes to prod after `ed8635d`.

## Decisions Doug made (share cards)
- No price on the card (prices change too much). No urgency lines ("feel off"), no guest count, no amenities, no "3 autumn nights". So no rule engine is needed: the card is deterministic.
- Vertical format, house photo, type consistent with the other share posters (render through reset-image), Reset once (wordmark) plus the club mark, the calendar look kept (weekday letters, circles, band), arrow at the end, rule dropped, gap above the info tightened for all posters.
- Explorations kept on the canvas https://claude.ai/artifact/2LD22CvP7cNJ9iXb3dnL59 (private), bottom section = the chosen design.

## Findings worth keeping
- PostHog, 30 days to 10-21, live hosts: ~921 visitors, 127 property viewers, 46 with booking intent; since the consent banner (10-20) only consented visitors count. An A/B test of the default stay is not realistic at this traffic. Drop `views`/`clicks` fields are all 0 (not populated).
- One-night stays mostly exist only as last-minute gaps (December quotes refused 1 night: min 2 or 3).
- The deploy script waits for app.js but not for the SSR flag, so a smoke right after deploy can read the old page (a Save/Share false fail on 10-21; rerun passed). Worth adding a wait on `__nData` too.

## Open, not blocking
- P1: page ~401 px wide at 375 from the season drop rows; pans after rotation (pre-existing, also on prod).
- Nav has no background (content slides under it).
- "Today" is the UTC date.
- Local preview servers (8788 proxy, 8790 pages dev, 8787 agent-booking dev) were left running; stop them.
