# Handoff: house calendar (drops plan 2 of 4)

Written 2026-10-21 by the session that built it. Nothing of the calendar is deployed yet.

## Where everything is
- **drops** `feat/house-calendar` at `af203ce`, pushed, 278 vitest tests (`npx vitest run`). Worktree `~/drop-reset-club-worktree-house-calendar`.
- **drops main** at `ed9120b` (fast-forwarded and pushed 10-21, NOT deployed). It is 6 commits behind the branch: before deploying, fast-forward main again to the branch (`git merge --ff-only origin/feat/house-calendar` in `~/drop-reset-club-worktree-summer-fix`), run the suite, push.
- **agent-booking main** at `a2797bb` (calendar endpoint, faster quotes, fixes), pushed, 215 tests (`npx vitest run --dir test`), NOT deployed. `.claude/` is in `.git/info/exclude` so the deploy gate sees a clean tree.
- **Supabase**: `no_checkout_days_public_read` policy APPLIED 10-21 (anon select only, anon write 401 verified). Migration file on ownerrez-sync-worker `feat/no-checkout-anon-read` `c536175` (pushed, not merged).
- Spec: `docs/superpowers/specs/2026-10-19-drops-consent-calendar-anchor-personalisation-design.md` section 2. Original plan: `docs/superpowers/plans/2026-10-20-house-calendar.md` (the design moved on a lot since, see below).

## What it is now (Doug's live direction, 10-20 and 10-21)
- House view row reads **Pick dates**. Tapping it expands the house section in place to fill the page, scrolls the row under the nav, hides the other rows and footer; × or the row closes. Nav crumb reads RESET · <HOUSE> while open. One house at a time; filters and crumb navigation close it.
- Drawn on the house colour (cream type). Month blocks: big `OCT ... 2026` header, weekday letters the size of the numbers. Phones swipe one month (scroll-snap); desktop shows two with ← → paging. Resizing between one and two keeps the selected stay month (else the month in view).
- Open days bold; past and booked regular, crossed out. Stays drawn Airbnb-style: solid circles on arrival and checkout, pale band centre to centre. Drop arrival days carry a dot. No outlines.
- Tap rule: with a stay, a tap on or after checkout extends through that night if valid; else 3 nights from the day, else the shortest valid length, else the drop arriving that day, else "No stays from that day". Drag slides the stay.
- Under the grid: ARRIVE (left) → DEPART (right), dates editable (tap a date, then a day); rule; Nights − + (pulls back from the end); Adults − +; "Anyone else coming along?" (children count, infants shown not sent). Steppers are 44px circles with a fixed two-digit number slot.
- Price: big all-in total with "ALL IN · N NIGHTS", square cream Book (house colour text). Pinned to the bottom of the screen once a stay is picked, with its top rule (Doug: keep the line).
- Accessibility: day labels with state, keyboard roving, live region, focus to the months on open without a visible ring until keys are used. axe: only the brand colour-contrast pairs fire (Cook 2.97, Zink 2.73, Hill 3.54, Barn 4.43 cream on colour) — brand question, not fixed.

## Decisions Doug made
- book.reset.club is not public yet: deploy agent-booking main as it stands, Stage 3 with the sandbox Stripe account included.
- Keep the pinned bar's top line. Steppers round, the size of the day circles. Past days crossed out. No "3-night stays / Any dates" switch. "Arrive / Depart" labels.

## Verified (10-21, local preview against real OwnerRez)
- Calendar price = OwnerRez widget price to the cent (Cook Dec 1–4 $1,233.78, Dec 7–9 $889.28, Hill Dec 6–10 $1,757.05). Book links carry the right dates and or_guests (adults + children).
- House rules on real data, failure messages, fallback link, MCP tools (search_stays, get_quote, create_hold) all PASS. Consent: nothing tracks before Accept; calendar events fire after Accept. Other rows, event pages, site-smoke: PASS.
- Reports: `.superpowers/sdd/golive/` (booking-checks.md, site-checks.md, fixpass-report.md, tall-a11y-report.md). That folder is git-ignored; it survives on disk only.

## Interaction test results (harness `f652cf1`, ~1,800 actions on af203ce)
Run: `E2E_DEPS=~/.claude/jobs/fdaa83d4/tmp node tests/e2e/calendar.e2e.mjs --ref <commit> [--seed N --runs N --actions N]` (output in `tests/e2e/out/<stamp>/`). Full repro steps, expected vs actual, file:line: `docs/superpowers/plans/2026-10-21-house-calendar-interaction-bugs.md`. Booking safety held (no stale price, Book href always matched). Fix in this order:
1. Blocks booking: a tap on a day with no stays sets the hint and hides the price, disabling Book for the stay still selected (`house-calendar.js:693`, `:73`). The hint must not kill a valid quote.
2. Wrong data: the nav flips to RESET · DROPS in season colours over an open calendar after expanding "Anyone else" and rotating (the observer's 0.3 ratio, `app.js:1769`/`:1791`). While a calendar is open the crumb must stay RESET · <HOUSE>.
3. Keyboard: focus drops to body when a stepper hits its limit (button disables under focus) or after Try again / an alternative (`house-calendar.js:416`, `:479-480`, `:498`).
4. Cosmetic: a sideways swipe while scrolled into the calendar makes the grid jump ~45px vertically (paintHeight, `:386-390`).
5. Page-level (pre-existing): page ~401px wide at 375 from the season drop rows; pans after rotation, JOIN clipped.
6. Page-level, headless only: sections above shift ~41px every few seconds (rotating tags); Chrome's scroll anchoring hides it.

## Next steps, in order
1. Read the interaction bug list, fix, re-run the harness and the vitest suite.
2. Doug's phone test on the local preview (below).
3. Deploy agent-booking: from `~/agent-booking` on clean main, `env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`. Claude Code's auto-mode blocked Claude from running this; Doug runs it with `! cd ~/agent-booking && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy` or allows it. Then check: `/v1/calendar?property_code=COOK&from=<today>&to=<+60d>` with `Origin: https://reset.club` echoes the origin; `/v1/quote` answers in ~1–2 s; `/health/stripe` still `present`; MCP tools/list has 3 tools.
4. Fast-forward drops main to the branch, test, push, then `scripts/deploy.sh staging` from `~/drop-reset-club-worktree-summer-fix` (smoke needs `PYTHONPATH=~/.cache/drop-smoke-venv/lib/python3.15/site-packages`). Check Pick dates on staging.reset.club with real data. Running tests leaves `node_modules/.vite/` and pages dev touches `node_modules/.mf/cf.json` in that worktree: remove/restore them so the deploy gate sees a clean tree.
5. Ask Doug, then `scripts/deploy.sh prod`, remind about the Cloudflare cache purge, live check of all four houses at 375 and desktop.

## Local preview (still running for Doug)
- `http://localhost:8788` (phone on the same Wi-Fi: `http://192.168.1.202:8788/#property-cook`). A node proxy (`/Users/dougjaeger/.claude/jobs/fdaa83d4/tmp/dev-proxy.mjs`) on 8788 serves `wrangler pages dev` on 8790 (the branch worktree) and sends `/v1/*` to a local agent-booking `wrangler dev` on 8787 (`--compatibility-date=2026-04-01 --persist-to /Users/dougjaeger/.claude/jobs/fdaa83d4/tmp/ab-state`, run with `env -u CLOUDFLARE_API_TOKEN`). It rewrites `api: 'https://book.reset.club'` in app.js to the page origin; nothing in the repos changed for it.
- Headless checks use playwright-core with `~/Library/Caches/ms-playwright/chromium_headless_shell-1243/*/chrome-headless-shell` (never the real Chrome app). Working scripts in `/Users/dougjaeger/.claude/jobs/fdaa83d4/tmp/` (pricecheck.mjs, extcheck.mjs, resizecheck.mjs, heightcheck.mjs).

## Open, not blocking
- The fixed nav has no background, so content slides under it when scrolled (known, Doug has not ruled).
- The page is ~400px wide at 375 on main too (drop rows and the Reviews arrow overflow).
- Infants are not passed to OwnerRez (no known link parameter).
- "Today" is the UTC date: from ~8 pm ET same-night stays are not offered (matches agent-booking).
- Cache in agent-booking: house list and cancellation policy cached 1 h, so OwnerRez edits to max guests or policy take up to an hour.
- Plans 3 (price anchor) and 4 (returning-guest memory) of the drops spec are not started.
