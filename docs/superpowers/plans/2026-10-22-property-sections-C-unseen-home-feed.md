# Plan C — unseen home feed (photos, details, reviews) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, per-tenant read feed on `agent-booking` that serves each home's photos, Details text and reviews (tally, words, quotes, monthly summary, full list), so reset.club reads them from unseen and never straight from OwnerRez.

**Architecture:** Two GET routes on the existing worker, `/v1/homes/:slug` and `/v1/homes/:slug/reviews`, built from the existing lazy KV listing cache (`loadProperty`) and the existing D1 `reviews` copy. A new nightly step tags new or changed reviews with themes and sentiment through one model call each; a monthly step writes one summary sentence per home from counts only. Pure shaping lives in `src/home-feed.js`; the model call is isolated in `src/model.js`.

**Tech Stack:** Cloudflare Worker (ES modules), D1 `reservations`, KV `QUOTES`, vitest 3 with `test/d1-shim.js`.

**Spec:** `~/drop-reset-club-property-sections/docs/superpowers/specs/2026-10-21-property-sections-design.md` (piece C, "Photos and Details text"), rulebook `~/reset-club-context/platform/docs/guide-and-booking/specs/reviews.md`.

**Repo / branch:** `~/agent-booking`, new worktree `~/agent-booking-home-feed` on branch `feat/home-feed` from `origin/main` (`a2797bb`). Deploy source stays `main` after merge.

**Order:** Tasks 1–4 need no model and unblock Plan B (photos, Details, tally, quotes, list). Tasks 5–7 need the model decision (open, see Global Constraints) and add words and the summary.

## Global Constraints

- Tenant from request host via `tenantForHost(url.hostname, env)`; D1 `tenant` column = `tenantKey(tenant)` (`'reset'`).
- Never return: guest surname, `wifi_password`, `check_in_instructions`, `directions`, `house_manual`, address street or coordinates. Only fields listed in this plan's response shapes.
- Attribution: preferred name else first name, never a surname · `${Season} stay, ${Mon YYYY}` from arrival (`seasonOf`, Dec–Feb Winter, Mar–May Spring, Jun–Aug Summer, Sep–Nov Fall) · home name. Missing arrival: drop the season part, keep name and home.
- Quotes verbatim; cut only at a sentence boundary with " …".
- Source line in guest language from distinct `listing_site` values, e.g. "Airbnb reviews · since Aug 2013". No system names (OwnerRez, Supabase, D1) in any response string.
- CORS: echo origin only for `https://reset.club`, `https://drop.reset.club`, `https://staging.reset.club`; `vary: origin`; OPTIONS 204 with `GET, OPTIONS`; `cache-control: public, max-age=300`.
- Theme keys and Reset labels: `hosts` The hosts · `view` The view · `return` Will come back · `design` The design · `quiet` Private & quiet · `welcome` Welcome bottle · `clean` Cleanliness; Zink (`ZINK`) adds `hot_tub` Hot tub. `return` is never in `mention_words`.
- Summary: at most 2 sentences, plain, no superlatives, input = counts and labels only, never review text. Shown with "Summary of N reviews · updated monthly". Publishes automatically.
- **Open (Doug):** model access — a new `ANTHROPIC_API_KEY` secret on agent-booking, or the keyless Workers AI binding `AI`. Only `src/model.js` (Task 5) and `wrangler.toml` change with the answer.
- Adding homes must not publish new booking pages: the booking page keeps reading `tenant.homes` only.

## Review Focus

1. A home with zero reviews → `reviews.count` 0, `average` null, `quotes` [], `words` []; no division by zero, 200 not 500. (Task 3)
2. Review body with HTML or a script tag → returned as plain text, never interpreted; tests assert `<script>` does not survive. (Task 3)
3. OwnerRez listing fetch fails or KV empty → `/v1/homes/:slug` still answers with reviews and `photos: []`, `details: null`, `status 200`. (Task 2)
4. Unknown slug or a slug of another tenant → 404 JSON, no stack trace. (Task 2)
5. Model returns malformed JSON or an unknown theme key → the review stays untagged and is retried next night; unknown keys are dropped; retries counted per review consecutively, give up after 3. (Task 6)

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
- [ ] **Step 3: Implement**; when Task 6 lands, `pickQuotes` additionally requires `sentiment >= 0.85` where a tag row exists.
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

### Task 5: Model access (blocked on Doug's choice)

**Files:** Create `src/model.js`, `test/model.test.js`; modify `wrangler.toml`.

**Interfaces:**
- Produces: `export async function completeJson(env, {system, user, maxTokens}): object` — one call, parses the first JSON object in the reply, throws `ModelError` on transport or parse failure.
- Anthropic option: `POST https://api.anthropic.com/v1/messages`, header `x-api-key: env.ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, model `claude-haiku-5-5`. Workers AI option: `env.AI.run(<model>, {messages})`, `[ai] binding = "AI"`.

- [ ] **Step 1: Failing tests** with a mocked `fetch` (or fake `env.AI`): returns parsed object; non-200 → `ModelError`; reply without JSON → `ModelError`; the request body never contains `env` secrets beyond the auth header.
- [ ] **Step 2–4:** run FAIL, implement, run full suite PASS.
- [ ] **Step 5: Commit** `feat: single model call helper`

### Task 6: Nightly tagging and words

**Files:**
- Create: `migrations/0003_review_tags.sql`, `src/themes.js`, `src/tagging.js`, `test/tagging.test.js`
- Modify: `test/d1-shim.js:5` (append `'0003_review_tags.sql'` to `MIGRATIONS`), `src/index.js:84` (`scheduled` runs `syncReviews` then `tagReviews`), `src/home-feed.js` (words)

**Interfaces:**
- Schema: `review_tags(tenant TEXT, review_id INTEGER, themes TEXT /* JSON array of keys */, sentiment REAL, model TEXT, tagged_utc TEXT, failures INTEGER DEFAULT 0, updated_utc TEXT, PRIMARY KEY(tenant, review_id))`.
- `src/themes.js`: `export const THEMES = { reset: { default: [{key, label}...7], homes: { ZINK: [{key:'hot_tub', label:'Hot tub'}] } } }`; `export function themesFor(tenantKey, code): {key,label}[]`.
- `export async function tagReviews(env, {limit=50}): {tagged, failed}` — picks reviews with no tag row or `review_tags.updated_utc != reviews.updated_utc`, and `failures < 3`; one `completeJson` per review asking for `{themes: string[], sentiment: number}` from the closed key list; drops unknown keys; on error increments `failures` (reset to 0 on success).
- `export function words(rows, tagsById, themes): {key,label,count,share}[]` sorted by count desc; `mention_words` = words without `return`, top 6.

- [ ] **Step 1: Failing tests** — tagging writes themes and sentiment for fixture reviews with a mocked model; unknown key `"pool"` dropped; malformed reply increments `failures`, third failure stops retries, success resets to 0; unchanged `updated_utc` is not re-tagged; `words` shares are count/total reviews; `return` absent from `mention_words`; Zink includes Hot tub, Hill does not.
- [ ] **Step 2–4:** FAIL, implement, full suite PASS; mutation: remove the unknown-key filter → red.
- [ ] **Step 5: Parallel check** — after the first live run, compare Hill per-theme counts with the brief's Supabase buckets (hosts 44, view 37, return 35, design 31, quiet 20, welcome 10, clean 11 of 76). Record both in the PR description; Doug decides if the gap is acceptable before Plan B shows words.
- [ ] **Step 6: Commit** `feat: nightly theme tagging and words per home`

### Task 7: Monthly summary sentence

**Files:** Create `migrations/0004_home_summaries.sql`, `src/summary.js`, `test/summary.test.js`; modify `test/d1-shim.js` MIGRATIONS, `src/index.js` scheduled, `src/home-feed.js`.

**Interfaces:**
- Schema: `home_summaries(tenant TEXT, property_id INTEGER, month TEXT /* YYYY-MM */, text TEXT, n INTEGER, created_utc TEXT, PRIMARY KEY(tenant, property_id, month))`.
- `export function summaryPrompt(homeName, words, count): {system, user}` — user text contains only the home name, count and `label: count` lines.
- `export async function writeSummaries(env, now)`: for each feed home without a row for the current month, one `completeJson` returning `{text}`; rejects text with more than 2 sentences or any of: best, amazing, incredible, perfect, stunning, unforgettable (retry next night).
- Feed `summary`: latest row → `{text, n, month}`; the page renders "Summary of {n} reviews · updated monthly".

- [ ] **Step 1: Failing tests** — `summaryPrompt` output contains no substring of any review body from the fixture; a 3-sentence reply is rejected; a reply with "amazing" is rejected; a second run in the same month makes no model call; feed returns the latest month's row.
- [ ] **Step 2–4:** FAIL, implement, full suite PASS.
- [ ] **Step 5: Commit** `feat: monthly summary sentence per home from counts only`
- [ ] **Step 6: Deploy gate (Doug)** — merge, apply migrations to remote D1 before deploying code (`npx wrangler d1 migrations apply reservations --remote`), set the model secret or binding, deploy, verify `/v1/homes/hill-studio` returns `words` and, after the monthly step runs, `summary`.
