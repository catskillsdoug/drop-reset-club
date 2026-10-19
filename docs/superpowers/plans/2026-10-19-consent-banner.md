# Consent Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nothing tracks on reset.club, drop.reset.club or reset.club/stay until a guest presses Accept; one choice covers all three.

**Architecture:** Every tracker script on our pages is written as `type="text/plain" data-consent="analytics"`, so the browser does not run it. One small script, `v5/consent.js` in drop-reset-club, reads a `.reset.club` cookie, shows the banner when there is no choice, and on Accept swaps each held-back script for a live copy in document order. `reset-club-proxy` applies the same hold-back to the OwnerRez HTML it serves on /stay and injects `consent.js`, so the OwnerRez tags stay where they are (Doug's decision).

**Tech Stack:** Plain browser JS (no dependencies), Cloudflare Pages Functions (drop-reset-club, vitest), Cloudflare Worker (reset-club-proxy, node --test), Playwright headless for screenshots and live checks.

**Spec:** `docs/superpowers/specs/2026-10-19-drops-consent-calendar-anchor-personalisation-design.md`, section 1 (commit 887f62a). This is plan 1 of 4; the house calendar, price anchor and returning-guest memory each get their own plan.

## Global Constraints

- Strict opt-in for every visitor, everywhere; one Accept for all; no per-category toggles.
- Before a choice nothing loads: no GA, no Meta Pixel, no PostHog.
- Accept and Decline: equal size and weight.
- Cookie `rc_consent` (my call on the name), values `granted` or `denied`, `Domain=reset.club`, `Path=/`, `Max-Age=31536000` (12 months), `SameSite=Lax`, `Secure`. Never renewed silently on return.
- A Decline is remembered, so the banner does not return on every page.
- Brand: all type `#000000` on sand `#fcf6e9`; no gold text; one border weight per page. Read `~/reset-club-context/shared-memory/ui-rules.md` before Task 2.
- Copy has no em dashes.
- drop-reset-club: work in a fresh worktree from `origin/main` (`git worktree add ~/drop-reset-club-worktree-consent -b feat/consent-banner origin/main`), never in `~/drop-reset-club`. Deploy only from a clean, pushed `main` worktree with `scripts/deploy.sh` (staging then production). Bump `app.js?v=` and `styles.css?v=` in `v5/index.html` only if those files change; `consent.js` carries its own `?v=`.
- reset-club-proxy: work in `git worktree add ~/reset-club-proxy-worktree-consent -b feat/consent-stay origin/main`, ff-merge to `main`, deploy from `main` with `env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`.
- Stage explicit paths, never `git add -A`. No backticks or semicolons in commit messages. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Baselines: drop-reset-club 79 tests (`npm test`), reset-club-proxy 63 tests (`npm test`). Every new test must be seen failing first, then mutate the code once and watch it go red.

## Review Focus

1. Cookies blocked or unavailable (Safari private mode, cookies off): the banner may show on every page but nothing may throw and no tracker may load. Test in Task 1.
2. Accept on drop.reset.club, then open reset.club/stay: no banner, trackers run. Pinned by the `Domain=reset.club` assertion in Task 1 and the live check in Task 6.
3. Activation order: the GA inline config needs its `dataLayer` stub first, and PostHog's stub must exist before the event-wiring code calls it. Activation must keep document order. Test in Task 1.
4. The OwnerRez page carries non-tracker Google scripts (Maps at `maps.googleapis.com`) and OwnerRez's own scripts; holding them back breaks the page. Negative test in Task 4.
5. The fixed banner covering the OwnerRez Book button or the drops rows at 375×667. Screenshot check in Tasks 2 and 6.

Also covered: a malformed cookie value (`rc_consent=yes`) counts as no choice (Task 1); Decline, then Cookie settings, then Accept loads trackers without a reload (Task 1).

---

### Task 1: consent.js core (cookie, state, activation)

**Files:**
- Create: `v5/consent.js`
- Test: `tests/consent.test.mjs`

**Interfaces:**
- Produces, on `window.resetConsent` in the browser and as `module.exports` under node:
  - `CONSENT_COOKIE = 'rc_consent'`
  - `readConsent(cookieString: string): 'granted' | 'denied' | null`
  - `consentCookie(value: 'granted' | 'denied', hostname: string): string`, adding `Domain=reset.club` only when `hostname` is `reset.club` or ends in `.reset.club`
  - `activateDeferred(doc): number`: replaces every `script[type="text/plain"][data-consent]` with a live `<script>` carrying the same attributes (minus `type` and `data-consent`) and the same text, in document order; marks done so a second call returns 0
  - `state(): 'granted' | 'denied' | null`, `accept()`, `decline()`, `open()` (shows the banner; Task 2 fills it)
- The file ends with `if (typeof module === 'object' && module.exports) module.exports = api; else { window.resetConsent = api; boot(); }`, so tests `createRequire` it without a DOM.

- [ ] **Step 1: Write the failing tests** in `tests/consent.test.mjs` (vitest, `createRequire(import.meta.url)('../v5/consent.js')`):
  - `readConsent('a=1; rc_consent=granted')` is `'granted'`; `'rc_consent=denied'` is `'denied'`; `''`, `'rc_consent=yes'` and `'xrc_consent=granted'` are `null`.
  - `consentCookie('granted', 'drop.reset.club')` equals `'rc_consent=granted; Domain=reset.club; Path=/; Max-Age=31536000; SameSite=Lax; Secure'`; for `'localhost'` it has no `Domain=`.
  - `activateDeferred` on a fake doc with three held scripts `[{src: 'https://www.googletagmanager.com/gtag/js?id=G-WCT8MYRETF', async: true}, {text: "gtag('config','G-WCT8MYRETF')"}, {text: 'posthog.init(...)'}]` inserts three live scripts in that order, with `src` and `async` kept and no `type`; returns 3; a second call returns 0.
  - When reading `document.cookie` throws, `state()` returns `null` and `accept()` does not throw (wrap cookie access in try/catch).
  - After `decline()` then `accept()` on the same fake doc, held scripts are live (no reload needed).
- [ ] **Step 2:** `npm test -- tests/consent.test.mjs`. Expected: FAIL, cannot find `../v5/consent.js`.
- [ ] **Step 3: Implement `v5/consent.js`.** `accept()` writes the cookie, calls `activateDeferred(document)`, hides the banner. `decline()` writes the cookie and hides the banner; trackers already running stay until the next page view (spec). `boot()`: `granted` activates at once; `null` shows the banner; `denied` does nothing. After a fresh Accept, call `window.posthog.capture('consent_accepted')` if PostHog exists (its stub queues the call). A Decline is not recorded anywhere, because recording it would itself be tracking.
- [ ] **Step 4:** `npm test`. Expected: 79 + new tests, all pass.
- [ ] **Step 5:** Mutate: change `Max-Age=31536000` to `Max-Age=1` and drop the order guarantee (reverse the list) one at a time; each must turn a test red. Restore.
- [ ] **Step 6: Commit** `git add v5/consent.js tests/consent.test.mjs` with message "consent.js reads the reset.club consent cookie and starts held-back trackers on Accept".

### Task 2: Banner and Cookie settings link

**Files:**
- Modify: `v5/consent.js` (banner markup and its inline `<style>`, built by `open()`)
- Test: `tests/consent.test.mjs`, plus screenshots

**Interfaces:**
- Consumes: Task 1 `accept()`, `decline()`, `open()`.
- Produces: `appendSettingsLink(doc): boolean`. Adds `<a href="#" data-consent-settings>Cookie settings</a>` (calls `open()`) to the first `.footer-links`, else the first `footer`; returns false when neither exists. On pages whose footer arrives late (drops fetch it from `brand.reset.club/footer`), retry once on `DOMContentLoaded` and once on `load`.

- [ ] **Step 1: Failing tests:** `appendSettingsLink` on a fake doc with `.footer-links` appends one link with text `Cookie settings`; calling it twice still leaves one; with no footer it returns false.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3: Build the banner** in `open()`: fixed to the bottom, full width, sand `#fcf6e9` background, `#000` type, Inter from the page or `system-ui`. Copy (Doug may edit): "We use cookies for analytics, ads measurement and remembering your choices." then a `Privacy` link to `https://reset.club/privacy`. Two buttons, `Accept` and `Decline`, identical size, weight and style. `role="dialog"`, `aria-label="Cookie choice"`, focus moves to the first button. Style lives in one injected `<style>` scoped under `#rc-consent` so it cannot leak into OwnerRez pages. High `z-index` so it sits above OwnerRez widgets.
- [ ] **Step 4:** `npm test`, all pass.
- [ ] **Step 5: Screenshots** at 375×667 and 1280×800 with headless Playwright (never the real Chrome app) against `npm run dev` on port 8788: page `/` before the change (from `main`) and after, banner open. Check the banner leaves the hero headline readable and does not cover a drop row's price on first view. Show Doug the screenshots before Task 6.
- [ ] **Step 6: Commit** `git add v5/consent.js tests/consent.test.mjs` with message "Consent banner with equal Accept and Decline, Cookie settings link in the footer".

### Task 3: Hold back the trackers on drops, apex and content pages

**Files:**
- Modify: `v5/index.html:15-36` (GA and Pixel), `v5/index.html:41-` (PostHog init block), add `<script src="/v5/consent.js?v=1"></script>` at the end of `<head>` after those blocks
- Modify: `functions/_middleware.js:1467-1489` (content-page GA and Pixel), same `consent.js` tag
- Test: `tests/consent-held.test.mjs`

**Interfaces:**
- Consumes: Task 1 activation contract (`type="text/plain" data-consent="analytics"`).

- [ ] **Step 1: Failing test** `tests/consent-held.test.mjs`: read `v5/index.html` and `functions/_middleware.js` as text; every `<script ...>...</script>` whose `src` matches `/googletagmanager\.com|connect\.facebook\.net|posthog\.com/` or whose body matches `/gtag\(\s*'(js|config)'|fbq\(\s*'init'|posthog\.init\(|fbevents\.js|array\.js/` must have `type="text/plain"` and `data-consent="analytics"`; neither file contains `facebook.com/tr?`; each file loads `/v5/consent.js?v=`. Guarded calls such as `if (window.gtag) gtag('event', ...)` in `join.js` and the middleware's link tracking stay as they are, because they no-op until the tracker loads.
- [ ] **Step 2:** Run, expect FAIL (scripts are live today).
- [ ] **Step 3:** Mark the GA loader, GA config, Pixel snippet and the PostHog init block held, and delete both Pixel `<noscript>` images (they would track without consent). Leave the PostHog event-wiring block at `index.html:145` live; it already checks `window.posthog`.
- [ ] **Step 4:** `npm test`, all pass. Mutate: remove `type="text/plain"` from the Pixel snippet, watch the test go red, restore.
- [ ] **Step 5:** Headless check against `npm run dev`: with no cookie, zero requests to `googletagmanager.com`, `facebook.net`, `facebook.com` and `posthog.com`; after clicking Accept, requests to all three appear; after a reload, they appear with no banner.
- [ ] **Step 6: Commit** `git add v5/index.html functions/_middleware.js tests/consent-held.test.mjs` with message "Trackers on drops, apex and content pages wait for consent".

### Task 4: Hold back the OwnerRez trackers on /stay (reset-club-proxy)

**Files:**
- Modify: `src/index.js` (`handleStay`, around the existing `rewriteStayAbsoluteUrls` and `stripTestLocationBanner` calls)
- Create: `test/fixtures/stay-cook.html` (raw HTML of `https://reset.club/stay/cook-house-orp5b5d7d1x`, captured with Playwright `response.text()` on the main document, since curl gets a CloudFront 403)
- Test: `test/stay-consent.test.mjs`

**Interfaces:**
- Produces: `export function holdTrackersForConsent(html: string): string` and `export function injectConsentScript(html: string): string` (inserts `<script src="/v5/consent.js?v=1"></script>` before `</head>`, once).
- Trackers on the live page on 2026-10-19: GA `G-D8VHCTMB3G`, Google Ads `AW-11082537937`, Meta Pixels `622278338536523` and `1607488640164289`, PostHog.

- [ ] **Step 1: Failing tests** against the fixture:
  - After `holdTrackersForConsent`, no live `<script>` has a `src` on `googletagmanager.com`, `connect.facebook.net` or `posthog.com`, and no live inline script contains `gtag(`, `fbq(` or `posthog.init`. Count the held scripts and assert the count equals the count found in the fixture before (no tracker missed, none invented).
  - `maps.googleapis.com` scripts and every other non-tracker script are byte-identical before and after.
  - A held script keeps its other attributes. A held script that had `type="text/javascript"` loses it, so it doesn't end up with two `type` attributes.
  - `<noscript>` blocks containing `facebook.com/tr` are removed.
  - `injectConsentScript` adds exactly one `consent.js` tag, and running it twice still leaves one.
- [ ] **Step 2:** `npm test`, expect FAIL.
- [ ] **Step 3:** Implement both with string rewriting, the same style as `rewriteStayAbsoluteUrls`. Call them in `handleStay` after `stripTestLocationBanner`. The `app.ownerrez.com` widget iframes are out of reach and stay as they are (accepted gap in the spec).
- [ ] **Step 4:** `npm test`, 63 + new, all pass. Mutate: drop `posthog` from the tracker match, watch the count test go red, restore.
- [ ] **Step 5: Commit** `git add src/index.js test/stay-consent.test.mjs test/fixtures/stay-cook.html` with message "Hold OwnerRez trackers on /stay until consent and load the consent banner".

### Task 5: Privacy page text

**Files:** none in git. The privacy body is a content page read by `functions/_middleware.js` (`page:privacy`). The builder finds where it is stored before editing.

- [ ] **Step 1:** Draft an added section naming: Google Analytics (`G-WCT8MYRETF`, `G-D8VHCTMB3G`), Google Ads, the Meta Pixel, PostHog, the `rc_consent` cookie (12 months), and that the OwnerRez booking window sets its own analytics cookies when opened. No em dashes, no claims beyond this list.
- [ ] **Step 2:** Show Doug the draft. Publish only after he approves, and only after Task 6's code deploy is live (deploy code before publishing data).
- [ ] **Step 3:** Load `https://reset.club/privacy` and confirm the new text renders.

### Task 6: Ship and verify live

- [ ] **Step 1:** Doug reviews the Task 2 screenshots. Merge `feat/consent-banner` to drop-reset-club `main`, push, then from a clean `main` worktree run `scripts/deploy.sh` (staging, then production).
- [ ] **Step 2:** Write the expected result down first: on `https://reset.club/` and `https://drop.reset.club/` with a fresh browser, the banner shows and there are zero tracker requests; after Accept, GA, Pixel and PostHog requests appear. Then check with headless Playwright at 375×667 and desktop. Remind Doug to purge the Cloudflare cache before judging the result.
- [ ] **Step 3:** Ff-merge `feat/consent-stay` to reset-club-proxy `main`, push, deploy with `env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`.
- [ ] **Step 4:** Live checks on `https://reset.club/stay/cook-house-orp5b5d7d1x`, expected result written first:
  - With a fresh browser, no requests from the page itself to `G-D8VHCTMB3G`, `AW-11082537937`, either Pixel or PostHog. Requests from inside the `app.ownerrez.com` frames are expected.
  - After Accept, all of them load.
  - Accepting on drop.reset.club means /stay shows no banner.
  - The Book button is visible with the banner open at 375×667.
- [ ] **Step 5:** Update the spec's "Left to the builder" lines this plan settled (own small script, no Google Consent Mode, proxy hold-back) and note the live versions in `ops/OPS.md`.
