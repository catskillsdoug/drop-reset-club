# Plan A — universal footer and slide-over nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Reset Club surface gets the one-line footer (legal links behind a +) and a right-side full-height slide-over nav, from one canonical source in reset-brand, plus a transparent over-photo header modifier used only by property sections.

**Architecture:** reset-brand gains two versioned fragments, `/footer/v2` and `/menu`, rendered by pure functions from Supabase `site_pages`, plus shared CSS in `public/main/styles.css` and a small shared script `public/main/menu.js`. The old `/footer` stays untouched until every surface has switched, so nothing renders half-styled. Surfaces switch one at a time: drop-reset-club homepage, drop-reset-club content pages, reset-club-proxy `/stay` (OwnerRez), agent-booking booking page.

**Tech Stack:** Cloudflare Worker + static assets (reset-brand), vanilla JS/CSS (drop-reset-club v5, Pages Functions), vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-property-sections-design.md` (piece A), artboards `docs/superpowers/specs/2026-10-21-property-sections/reference/` (footer on every artboard).

**Repos / branches:** reset-brand worktree `~/reset-brand-footer-v2` branch `feat/footer-v2` from `origin/main`; drop-reset-club `~/drop-reset-club-property-sections` branch `feat/property-sections`; reset-club-proxy worktree `~/reset-club-proxy-footer-v2` branch `feat/footer-v2`; agent-booking (Task 7 only) on its own branch. Never edit `~/drop-reset-club` (other work in progress).

## Global Constraints

- Footer copy, exactly: `RESET CLUB` and a + control; links Privacy · Disclaimer · Terms · Cookie settings; `© {year} Reset Club Holdings LLC` below a 2px rule. Closed on every page load.
- The + uses a native `<details>`/`<summary>`; it must work with no JavaScript (OwnerRez footer HTML is pasted).
- Legal links keep the class `footer-links` on their container so `v5/consent.js` `appendSettingsLink` still appends Cookie settings; the container sits inside the `<details>`.
- Header (Doug, 2026-10-22, mock `docs/superpowers/specs/2026-10-21-property-sections/nav-mock.html`): RESET left at the live size (18px Inter 700, letter-spacing 0, nav padding 16px top and bottom, 24px sides on phone, `max(48px, calc((100% - 1200px) / 2 + 48px))` at 1024px+); right side a globe (16px, 2.2px strokes, aria-label Language) then a three-line burger (16x13, 2.4px square-cap lines, aria-label Menu), 28px apart, 44x44 tap targets; no JOIN and no MENU word in the header. Close is an X in the burger's spot.
- Nav panel holds, in order (ordered by booking data, PostHog 90 days): CATSKILLS COLLECTION as a link to `https://reset.club/#collection`, then the four houses as large rows with their colour squares (Barn Studio, Cook House, Hill Studio, Zink Cabin); then About · FAQ · News as smaller rows; at the bottom JOIN as an outlined button and Sign in as text. Signed in, the bottom shows the first name, which opens the existing account view in `v5/join.js`. Full height, from the right; one third of the screen on desktop, full width on phone.
- Join, sign in and code forms open inside the panel, with the live fields and copy from `v5/join.js` (First Name, Last Name, Email, Phone; LOGIN by phone or email; ENTER CODE).
- Language: the globe opens a full-screen language sheet (endonym + code, active marked), the Rgui.de guide pattern. Which languages, and whether the globe ships before translations exist, is open with Doug.
- Colours only from brand canon: `sand #fcf6e9`, `nite #000000`, house colours `tree #019740`, `moss #9c9b34`, `toma #ff551e`, `wave #3f65f6`. All text #000 on sand, sand on house colours. No rounded corners. Inter. Rules 2px.
- Icons inline stroke SVG 2.2–2.4px square caps (+, −, →, ×); no emoji, no icon font.
- New `site_pages.nav_group` values `legal` and `menu` (names pending Doug's OK; see Task 1). The existing `footer` rows stay until Task 8.
- Screenshots at 375×667, 390×707 and 1280×800 for every surface, before and after, footer closed and open, nav closed and open, before any surface is called done.

## Review Focus

1. Brand `/footer/v2` or `/menu` fetch fails or is slow → the surface still shows its built-in fallback footer and a working nav built from the same fallback list; no blank band. (Tasks 2, 4)
2. Keyboard and screen reader → the nav control is a `<button aria-expanded aria-controls>`, Escape closes the panel and returns focus to the control, focus stays inside the open panel. (Task 3)
3. Nav open while the page is scroll-snapped → background does not scroll; closing restores `scroll-snap-type` to `y mandatory`. (Task 4)
4. Consent banner Cookie settings → still appears once, inside the legal links, after the footer is swapped in or redrawn. (Tasks 4, 5)
5. A `site_pages` title with `<` or `&` → escaped in both fragments. (Task 2)

---

### Task 1: Mock the slide-over nav and footer for Doug (gate) — DONE 2026-10-22 except the language question

**Files:** Create `docs/superpowers/specs/2026-10-21-property-sections/nav-mock.html` (drop-reset-club worktree).

- [ ] **Step 1:** Build a static mock at 390×707 and 1280×800: nav control in the header, panel open and closed, footer closed and open, over a sand page and over a Hill Studio photo section. Use real link titles from `site_pages` and real house names.
- [ ] **Step 2:** Screenshot all states; publish to Doug (artifact or canvas).
- [ ] **Step 3: Gate** — Doug approves trigger (label or icon), panel width, close behaviour and the nav_group names `legal` / `menu`. Record his answers at the top of this plan. Do not start Task 2 before.

### Task 2: reset-brand fragments `/footer/v2` and `/menu`

**Files:**
- Create: `src/fragments.js`, `test/fragments.test.js`, `vitest.config.js` (none exists); add `"test": "vitest run"` and `vitest` devDependency to `package.json`
- Modify: `src/index.js:22` (route `/footer/v2` and `/menu` before the assets fallback)

**Interfaces:**
- Produces: `export function footerV2Html(legalLinks: {title, external_url}[], year: number): string`; `export function menuHtml(menuLinks: {title, external_url}[], homes: {name, href}[]): string`; `export const HOMES` = the four houses with hrefs `https://reset.club/#property-barn`, `#property-cook`, `#property-hill4`, `#property-zink` (section ids are `property-` + lowercase code, `v5/app.js:2910`).
- `/footer/v2` markup (body-only): `<div class="rc-foot"><details class="rc-foot__more"><summary class="rc-foot__bar"><a class="rc-foot__brand" href="https://reset.club/">RESET CLUB</a><svg …+…></svg></summary><div class="footer-links rc-foot__links">…</div></details><div class="rc-foot__rule"></div><div class="rc-foot__copy">© {year} Reset Club Holdings LLC</div></div>`.
- `/menu` markup: `<div class="rc-menu" id="rc-menu" hidden role="dialog" aria-label="Menu">` with a close button, the menu links, the homes, and `<a data-join href="#">JOIN</a>`.
- Both reuse the existing href rule (relative → `https://reset.club` prefix) and `escapeHtml`; same cache and CORS headers as `/footer`.

- [ ] **Step 1: Failing tests** — `footerV2Html` with Privacy/Disclaimer/Terms rows contains them in order inside `.footer-links`, contains `<details`, contains `© 2026 Reset Club Holdings LLC` for year 2026, contains no About/FAQ/News; a title `A&B<` is escaped; `menuHtml` lists About, FAQ, News then the four homes then JOIN; routes return 200 `text/html` with `access-control-allow-origin: *` (fetch mocked); upstream failure → 502; `/footer` output unchanged (snapshot of today's markup).
- [ ] **Step 2: Run** `npx vitest run` — FAIL.
- [ ] **Step 3: Implement**; move the link-building and `escapeHtml` into `src/fragments.js` and have `handleFooter` call the same helper so `/footer` output stays byte-identical.
- [ ] **Step 4: Run** — PASS; mutation: drop `escapeHtml` → red.
- [ ] **Step 5: Data** — insert `site_pages` rows (after Doug's OK in Task 1): `legal` Privacy 1, Disclaimer 2, Terms 3; `menu` About 1, FAQ 2, News 3; `external_url` as the existing footer rows; unique `slug` values `nav/legal/<name>` and `nav/menu/<name>`. Do not alter the `footer` rows.
- [ ] **Step 6: Commit** `feat: footer v2 and menu fragments`

### Task 3: Shared CSS and `menu.js`

**Files:**
- Modify: `public/main/styles.css` (append `.rc-foot*`, `.rc-menu*`, `.rc-nav-toggle`, `nav.rc-over-photo` after line 120)
- Create: `public/main/menu.js`, `test/menu.test.js`

**Interfaces:**
- Produces: `window.resetMenu = { mount(doc, {menuUrl, toggle}), open(), close() }` (also `module.exports` for tests). `mount` fetches `/menu` HTML once, inserts it at the end of `body`, binds the toggle (`button.rc-nav-toggle`, `aria-expanded`), Escape and the close button, traps focus while open, sets `html.style.scrollSnapType = 'none'` on open and restores the previous value on close, and dispatches `rc-menu:join` on JOIN click.
- `nav.rc-over-photo`: `position:absolute; background:transparent; color:#fcf6e9` with a `nite` gradient `rgba(0,0,0,.55) → 0` behind it.

- [ ] **Step 1: Failing tests** (fake element tree like `drop-reset-club/tests/consent.test.mjs`, no jsdom): every menu and footer item click captures exactly one `nav_clicked` with `item` = its label (see Plan D); toggle sets `aria-expanded` true/false; Escape closes and focuses the toggle; open sets scroll-snap none, close restores `y mandatory`; JOIN click dispatches `rc-menu:join`; fetch failure → `mount` builds the panel from a built-in fallback list (same links as Global Constraints).
- [ ] **Step 2–4:** run FAIL, implement, run PASS; mutation: skip restoring snap → red.
- [ ] **Step 5: Deploy reset-brand** (Doug, from `main` after merge): `npx wrangler deploy`; verify `curl https://brand.reset.club/footer/v2` and `/menu` return the markup and `/footer` is unchanged.
- [ ] **Step 6: Commit** `feat: shared footer v2 and slide-over menu styles and script`

### Task 4: drop-reset-club homepage uses footer v2 and the menu

**Files:**
- Modify: `v5/app.js:754-762` (default `FOOTER_HTML` becomes the v2 shape with a local legal-links fallback; fetch `https://brand.reset.club/footer/v2`), `v5/index.html:134-141` (add `<button class="rc-nav-toggle" aria-controls="rc-menu" aria-expanded="false">` to the nav, load `https://brand.reset.club/main/menu.js`), `v5/app.js` near `setupScrollObserver` (1785) to call `resetMenu.mount` and handle `rc-menu:join` by opening the existing join panel
- Test: `tests/footer-v2.test.mjs`

- [ ] **Step 1: Failing tests** — reading `v5/app.js` as text: default `FOOTER_HTML` contains `<details` and `footer-links` and no `/about`; the fetch URL ends in `/footer/v2`; consent `appendSettingsLink` applied to the v2 fallback markup (fake tree) adds exactly one Cookie settings link inside `.footer-links`.
- [ ] **Step 2–4:** FAIL, implement, `npm test` PASS (baseline 299 plus new).
- [ ] **Step 5: Visual** — local serve, screenshots per Global Constraints; footer at the end of the scroll only; nav opens over any section; join panel still opens from JOIN.
- [ ] **Step 6: Commit** `feat: homepage uses footer v2 and the slide-over menu`

### Task 5: drop-reset-club content pages

**Files:** Modify `functions/_middleware.js:1375-1385` (`fetchCanonicalFooterHTML` → `/footer/v2`), `:1493-1503` (remove the inline footer CSS; the shared CSS now owns it, which also fixes the 3px line to 2px), `:1516-1521` (nav toggle + menu.js), `:1526-1538` (fallback = v2 shape). Test `tests/footer-v2.test.mjs`.

- [ ] **Step 1: Failing tests** — `renderPageShell` output (call it directly) contains the toggle button, `/footer/v2` fallback markup, and no `.footer-line{height:3px`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Visual** — About, Privacy, Terms, Disclaimer, FAQ, News at three sizes.
- [ ] **Step 6: Commit** `feat: content pages use footer v2 and the menu`
- [ ] **Step 7: Deploy** via `scripts/deploy.sh staging` then `prod` from a clean `main` worktree after merge; verify live and remind Doug about CDN cache purge.

### Task 6: OwnerRez `/stay` (reset-club-proxy + manual paste)

**Files:** reset-club-proxy `src/index.js` (where `/stay` HTML is rewritten: inject `<link>` to `https://brand.reset.club/main/styles.css`, `<script src=".../main/menu.js">`, the toggle into `.reset-nav`); test `test/stay-footer-v2.test.mjs`.

- [ ] **Step 1: Failing test** — a `/stay` fixture page through the rewriter contains the toggle and the menu script once.
- [ ] **Step 2–4:** FAIL, implement, `npm test` PASS (baseline 97 plus new).
- [ ] **Step 5: Manual (Doug)** — paste the `/footer/v2` markup into the OwnerRez footer HTML field (exact text delivered in the PR description). Scope the new CSS to `.rc-foot`/`.rc-menu` so OwnerRez Bootstrap and FontAwesome are untouched.
- [ ] **Step 6:** Deploy with `env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`; screenshot a `/stay` page at three sizes.
- [ ] **Step 7: Commit** `feat: /stay carries the slide-over menu`

### Task 7: agent-booking booking page

**Files:** agent-booking `src/page.js` (footer and nav of the rendered page); `test/page.test.js`.

- [ ] **Step 1:** Failing test — rendered page contains the v2 footer shape with `© {year} Reset Club Holdings LLC` and the nav toggle.
- [ ] **Step 2–4:** FAIL, implement (server-side fetch of `/footer/v2` with the v2 fallback, same pattern as `fetchCanonicalFooterHTML`), PASS.
- [ ] **Step 5: Commit** `feat: booking page uses footer v2 and the menu`

### Task 8: Retire footer v1

- [ ] **Step 1:** Confirm no surface still requests `/footer` (grep all four repos for `brand.reset.club/footer"` and check reset-brand logs for a week).
- [ ] **Step 2:** With Doug's OK, unpublish the `site_pages` rows with `nav_group = 'footer'` and remove the old footer CSS from `public/main/styles.css`; keep the `/footer` route returning v2 markup for any stray caller.
- [ ] **Step 3: Commit** `chore: retire footer v1`
