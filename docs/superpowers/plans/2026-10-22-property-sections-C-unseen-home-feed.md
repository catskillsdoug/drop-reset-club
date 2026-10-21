# Plan C — unseen home feed (photos, details, reviews) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, per-tenant read feed on `agent-booking` that serves each home's photos, Details text and reviews (tally, words, quotes, monthly summary, full list), so reset.club reads them from unseen and never straight from OwnerRez.

**Architecture:** Two GET routes on the existing worker, `/v1/homes/:slug` and `/v1/homes/:slug/reviews`, built from the existing lazy KV listing cache (`loadProperty`) and the existing D1 `reviews` copy. Theme tags and monthly summaries are written into D1 by a local script on Doug's Mac using Claude Code on his plan (no API key in the worker for now); the worker only reads them. Pure shaping lives in `src/home-feed.js`; the local script's pure parts live in `scripts/review-tags/lib.mjs`.

**Tech Stack:** Cloudflare Worker (ES modules), D1 `reservations`, KV `QUOTES`, vitest 3 with `test/d1-shim.js`.

**Spec:** `~/drop-reset-club-property-sections/docs/superpowers/specs/2026-10-21-property-sections-design.md` (piece C, "Photos and Details text"), rulebook `~/reset-club-context/platform/docs/guide-and-booking/specs/reviews.md`.

**Repo / branch:** `~/agent-booking`, new worktree `~/agent-booking-home-feed` on branch `feat/home-feed` from `origin/main` (`a2797bb`). Deploy source stays `main` after merge.

**Order:** Tasks 1–4 need no model and unblock Plan B (photos, Details, tally, quotes, list). Tasks 5–6 add words, sentiment and the summary.

## Global Constraints

- Tenant from request host via `tenantForHost(url.hostname, env)`; D1 `tenant` column = `tenantKey(tenant)` (`'reset'`).
- Never return: guest surname, `wifi_password`, `check_in_instructions`, `directions`, `house_manual`, address street or coordinates. Only fields listed in this plan's response shapes.
- Attribution: preferred name else first name, never a surname · `${Season} stay, ${Mon YYYY}` from arrival (`seasonOf`, Dec–Feb Winter, Mar–May Spring, Jun–Aug Summer, Sep–Nov Fall) · home name. Missing arrival: drop the season part, keep name and home.
- Quotes verbatim; cut only at a sentence boundary with " …".
- Source line in guest language from distinct `listing_site` values, e.g. "Airbnb reviews · since Aug 2013". No system names (OwnerRez, Supabase, D1) in any response string.
- CORS: echo origin only for `https://reset.club`, `https://drop.reset.club`, `https://staging.reset.club`; `vary: origin`; OPTIONS 204 with `GET, OPTIONS`; `cache-control: public, max-age=300`.
- Theme keys and Reset labels: `hosts` The hosts · `view` The view · `return` Will come back · `design` The design · `quiet` Private & quiet · `welcome` Welcome bottle · `clean` Cleanliness; Zink (`ZINK`) adds `hot_tub` Hot tub. `return` is never in `mention_words`.
- Summary: at most 2 sentences, plain, no superlatives, input = counts and labels only, never review text. Shown with "Summary of N reviews · updated monthly". Publishes automatically.
- Model access (Doug, 2026-10-22): Claude Code on Doug's plan, run locally; no API key on agent-booking until other hosts join. The child process never sees `ANTHROPIC_API_KEY`.
- Adding homes must not publish new booking pages: the booking page keeps reading `tenant.homes` only.

## Review Focus

1. A home with zero reviews → `reviews.count` 0, `average` null, `quotes` [], `words` []; no division by zero, 200 not 500. (Task 3)
2. Review body with HTML or a script tag → returned as plain text, never interpreted; tests assert `<script>` does not survive. (Task 3)
3. OwnerRez listing fetch fails or KV empty → `/v1/homes/:slug` still answers with reviews and `photos: []`, `details: null`, `status 200`. (Task 2)
4. Unknown slug or a slug of another tenant → 404 JSON, no stack trace. (Task 2)
5. Model returns malformed JSON or an unknown theme key → the review stays untagged and is retried next run; unknown keys are dropped; failures counted per review consecutively, reset on success, give up after 3. (Task 6)

---

### Task 1: Site homes on the tenant, synced for reviews

**Files:**
- Modify: `src/tenants.js` (add `site_homes`), `src/reviews.js:36` (`syncReviews` home list)
- Test: `test/tenants.test.js`, `test/reviews.test.js`

**Interfaces:**
- Produces: `TENANTS.reset.site_homes = { 'barn-studio':'BARN', 'cook-house':'COOK', 'hill-studio':'HILL4', 'zink-cabin':'ZINK' }`; `export function feedHomes(tenant): Record<slug, code>` = `{...tenant.homes, ...tenant.site_homes}` in `src/tenants.js`.

- [ ] **Step 1: Failing tests** — `feedHomes(TENANTS.reset)` has the four slugs above; `syncReviews` requests `/v2/reviews` with `property_id` 470197, 382929, 411354 and 382943; `handlePage` for `GET https://book.reset.club/hill-studio` still returns 404 (booking pages unchanged).
- [ ] **Step 2: Run** `npx vitest run test/tenants.test.js test/reviews.test.js` — expect FAIL.
- [ ] **Step 3: Implement** `feedHomes` and make `syncReviews` iterate `Object.values(feedHomes(tenant))` deduplicated.
- [ ] **Step 4: Run** the full suite `npx vitest run` — expect PASS; record the count.
- [ ] **Step 5: Commit** `feat: tenant site homes feed the review sync`

### Task 2: Route `/v1/homes/:slug` with photos and Details

**Files:**
- Create: `src/home-feed.js`, `test/home-feed.test.js`
- Modify: `src/index.js:65-83` (add `handleHomeFeed` before `handlePage`), `src/page.js` (export `plain`)
- Test fixture: `fixtures/listing-barn.json` (existing); add `fixtures/listing-hill.json` captured once from `/v2/listings/411354?includeAmenities=true&includeDescriptions=true` with the forbidden fields deleted before commit.

**Interfaces:**
- Consumes: `loadProperty(env, propertyId) -> {p, listing}` (`src/page.js:328`), `tenantForHost`, `feedHomes`.
- Produces: `export async function handleHomeFeed(request, env): Response|null`; `export function heroPhotos(listing): {url, caption}[]` (caption = first sentence of `caption`, `null` when empty; url = `large_url`); `export function detailsOf(descriptionHtml): {intro: string, groups: {title: string, items: string[]}[]} | null`.
- Response `GET /v1/homes/:slug`:
  `{ home: {slug, code, name, city, state}, photos: [{url, caption}], details: {intro, groups} | null, reviews: <Task 3 shape> }`

- [ ] **Step 1: Failing tests** — `heroPhotos` keeps listing order and trims "Autumn sunrise from the primary bedroom. Shot in October." to "Autumn sunrise from the primary bedroom."; `detailsOf(hill description)` returns intro starting "The most architecturally striking" and a group titled "Architecture & Materials" whose first item is "Nine-foot floor-to-ceiling windows throughout"; a description with no "What's Here" heading returns `{intro, groups: []}`; route returns 404 JSON for `/v1/homes/nope`; CORS header echoes `https://reset.club` and is absent for `https://evil.example`; OPTIONS → 204; listing load failure → 200 with `photos: []`, `details: null`; response JSON never contains the strings `wifi`, `check_in_instructions`, `directions`.
- [ ] **Step 2: Run** `npx vitest run test/home-feed.test.js` — expect FAIL.
- [ ] **Step 3: Implement** in `src/home-feed.js`. `detailsOf`: split on the `What's Here` `<h2>`; intro = first non-empty paragraph through `plain`; groups = each bold `<p>` title followed by its `<ul>` items through `plain`. Reuse the `reply`/CORS pattern from `src/calendar.js:13-24` (copy into `home-feed.js`; do not change calendar).
- [ ] **Step 4: Run** full suite — PASS. Mutation check: make `heroPhotos` return `cropped_url`; the order/url test must go red; revert.
- [ ] **Step 5: Commit** `feat: /v1/homes/:slug serves photos and details from the listing cache`

### Task 3: Tally and quotes in the feed

**Files:**
- Modify: `src/home-feed.js`, `src/page.js` (export `monYear`, `loadReviews`)
- Test: `test/home-feed.test.js`

**Interfaces:**
- Consumes: `loadReviews(env, tenantKey, propertyId)`, `seasonOf`, `cutQuote`, `esc` not used (JSON, plain text).
- Produces: `export function tally(rows, now): {count, average, last_90, source}` (average rounded to 2 places, null at 0; `source` = e.g. "Airbnb reviews · since Aug 2013"); `export function attribution(row, homeName): string`; `export function pickQuotes(rows, {max=2, maxLen=90, tagged}): {stars, text, attribution}[]`.
- Response `reviews`: `{ count, average, last_90, source, quotes, words: [], mention_words: [], summary: null }` (words/summary filled by Tasks 6–7).

- [ ] **Step 1: Failing tests** — with rows built from `fixtures/reviews-barn.json` through the real sync into the d1 shim: `tally` count/average match a hand count of the fixture; `last_90` uses `env.NOW`; `attribution({first_name:'Tyler', arrival:'2025-08-14'}, 'Zink Cabin')` = "Tyler · Summer stay, Aug 2025 · Zink Cabin"; missing arrival → "Tyler · Zink Cabin"; `pickQuotes` returns ≤2 items each ≤90 chars cut at a sentence end, prefers one non-5-star when one qualifies, and before tagging exists (no sentiment) uses stars ≥4 only; zero rows → count 0, average null, quotes []; a body containing `<script>x</script>` returns as text with the tags stripped.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; when Task 5 lands, `pickQuotes` additionally requires `sentiment >= 0.85` where a tag row exists.
- [ ] **Step 4: Run** full suite — PASS; mutation: flip the non-5-star preference, see red, revert.
- [ ] **Step 5: Commit** `feat: home feed tally and attributed quotes`

### Task 4: Full list `/v1/homes/:slug/reviews`

**Files:** Modify `src/home-feed.js`; Test `test/home-feed.test.js`

**Interfaces:**
- Produces: `GET /v1/homes/:slug/reviews?page=N` → `{ items: [{stars, text, attribution}], page, pages, total }`, 20 per page, newest first, all star ratings, `text` via `cutQuote`.

- [ ] **Step 1: Failing tests** — page 1 has 20 items newest first; `page=999` → `items: []` with correct `pages`; `page=abc` → page 1; includes a 4-star review when one exists in the fixture.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** full suite — PASS.
- [ ] **Step 5: Commit** `feat: paged review list per home`
- [ ] **Step 6: Deploy gate (Doug)** — merge to `main`, `env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`, then the first sync for the new homes: `curl https://book.reset.club/v1/homes/hill-studio` must show `reviews.count` = the D1 count for 411354 and ≥1 photo. Pre-register: Hill count equals the OwnerRez visible guest review count (Supabase showed 76 on 2026-10-21). Plan B can start here.

### Task 5: Theme storage and words in the feed (worker side)

**Files:**
- Create: `migrations/0003_review_tags.sql`, `migrations/0004_home_summaries.sql`, `src/themes.js`, `test/words.test.js`
- Modify: `test/d1-shim.js:5` (append `'0003_review_tags.sql'`, `'0004_home_summaries.sql'` to `MIGRATIONS`), `src/home-feed.js` (fill `words`, `mention_words`, `summary`; `pickQuotes` uses sentiment)

**Interfaces:**
- Schema: `review_tags(tenant TEXT, review_id INTEGER, themes TEXT /* JSON array of keys */, sentiment REAL, model TEXT, tagged_utc TEXT, review_updated_utc TEXT, failures INTEGER DEFAULT 0, PRIMARY KEY(tenant, review_id))`; `home_summaries(tenant TEXT, property_id INTEGER, month TEXT /* YYYY-MM */, text TEXT, n INTEGER, created_utc TEXT, PRIMARY KEY(tenant, property_id, month))`.
- `src/themes.js`: `export const THEMES = { reset: { default: [{key, label} x7 per Global Constraints], homes: { ZINK: [{key:'hot_tub', label:'Hot tub'}] } } }`; `export function themesFor(tenantKey, code): {key,label}[]`.
- `export function words(rows, tagsById, themes): {key,label,count,share}[]` sorted by count desc, share = count / tagged review count; `mention_words` = `words` without `return`, top 6. Feed `summary` = latest `home_summaries` row → `{text, n, month}` or null.

- [ ] **Step 1: Failing tests** — with tag rows inserted into the shim: `words` counts and shares; `return` absent from `mention_words`; Zink includes Hot tub, Hill does not; a tag key not in `themesFor` is ignored; no tag rows → `words: []`; `pickQuotes` skips reviews with `sentiment < 0.85` when tagged; feed returns the latest month's summary.
- [ ] **Step 2–4:** FAIL, implement, full suite PASS; mutation: include `return` in `mention_words` → red.
- [ ] **Step 5: Commit** `feat: theme tags and summaries read into the home feed`

### Task 6: Local tagging on Doug's Claude plan

Runs on Doug's Mac with Claude Code on his subscription (Doug, 2026-10-22). Moves into the worker with an API key once other hosts are on the platform; only this task's runner changes then.

**Files:**
- Create: `scripts/review-tags/lib.mjs`, `scripts/review-tags/run.mjs`, `scripts/review-tags/club.reset.review-tags.plist`, `test/review-tags.test.js`

**Interfaces:**
- `lib.mjs` (pure, tested):
  - `pendingSql(tenant): string` — reviews with no tag row, or `review_tags.review_updated_utc != reviews.updated_utc`, and `failures < 3`, limit 50.
  - `tagPrompt(review, themes): string` — the review body plus the closed key list; asks for JSON `{"themes": [...keys], "sentiment": 0..1}` only.
  - `parseTagReply(text, themes): {themes: string[], sentiment: number} | null` — first JSON object; drops unknown keys; sentiment clamped to 0..1; null when unparseable.
  - `upsertTagSql(tenant, reviewId, reviewUpdatedUtc, tag | null, model, nowIso): string` — success writes themes, sentiment, `failures = 0`; null increments `failures`. Only keys from the closed list, numbers and ISO timestamps reach the SQL; `reviewUpdatedUtc` validated against `^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$`.
  - `summaryPrompt(homeName, words, count): string` — home name, count and `label: count` lines only, never review text; ≤2 sentences, plain, no superlatives.
  - `insertSummarySql(tenant, propertyId, month, text, n, nowIso): string` — the only place model text reaches SQL; single quotes doubled, NUL and control characters stripped.
  - `acceptSummary(text): boolean` — false for more than 2 sentences or any of: best, amazing, incredible, perfect, stunning, unforgettable.
- `run.mjs`: reads pending rows with `env -u CLOUDFLARE_API_TOKEN npx wrangler d1 execute reservations --remote --json --command "<sql>"` (cwd `~/agent-booking`), calls `claude -p --output-format json "<prompt>"` once per review with `ANTHROPIC_API_KEY` removed from the child env (so it bills Doug's plan, never the API), writes results with one `wrangler d1 execute --remote --file` per batch. Then, for each feed home with no `home_summaries` row for the current month, one summary call; accepted text inserted, rejected text logged and retried next run. Logs counts (tagged, failed, summaries) to `~/Library/Logs/reset-review-tags.log`.
- `club.reset.review-tags.plist`: launchd job, daily at 06:30 local, `RunAtLoad` false, runs `node scripts/review-tags/run.mjs`. A missed night catches up on the next run.

- [ ] **Step 1: Failing tests** for every `lib.mjs` function: unknown key `"pool"` dropped; `"sentiment": 1.4` → 1; malformed reply → null; null tag SQL increments failures and success SQL resets to 0; a review body containing `'; DROP TABLE reviews; --` never appears in any SQL (body is not part of any SQL); `summaryPrompt` output contains no substring of any fixture review body; `acceptSummary` rejects 3 sentences and "amazing"; `insertSummarySql` with text `It's quiet'); DROP TABLE reviews; --` produces SQL that, run against the d1 shim, inserts that exact text and leaves `reviews` intact.
- [ ] **Step 2: Run** `npx vitest run test/review-tags.test.js` — FAIL.
- [ ] **Step 3: Implement** `lib.mjs`, then `run.mjs` around it (no logic in `run.mjs` beyond calling lib and shelling out).
- [ ] **Step 4: Run** full suite — PASS; mutation: remove the unknown-key filter → red.
- [ ] **Step 5: First run (Doug present)** — apply migrations remotely first (`env -u CLOUDFLARE_API_TOKEN npx wrangler d1 migrations apply reservations --remote`), deploy Task 5 from `main`, then `node scripts/review-tags/run.mjs` by hand. Pre-register: every visible review for the four homes gets a tag row or a failure count; Hill gets a summary row for the current month.
- [ ] **Step 6: Parallel check** — compare Hill per-theme counts with the brief's Supabase buckets (hosts 44, view 37, return 35, design 31, quiet 20, welcome 10, clean 11 of 76). Record both in the PR; Doug decides whether the gap is acceptable before Plan B shows Guests mention.
- [ ] **Step 7: Install** — Doug copies the plist to `~/Library/LaunchAgents/` and runs `launchctl load`; confirm one scheduled run in the log the next morning.
- [ ] **Step 8: Commit** `feat: nightly review tagging and monthly summary on Doug's Claude plan`
