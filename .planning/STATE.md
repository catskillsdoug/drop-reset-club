# Drop Reset Club — Session State
*Updated: 2026-03-25*

## Current Objective
Launch `reset.club` — replace Squarespace with the drops v5 page + news + about + legal pages.

## Design Spec
`~/reset-club-context/docs/plans/2026-03-25-reset-club-launch-design.md`

## What's Done

### Phase 0 — Proxy (DONE)
- Worker at `~/reset-club-proxy/` deployed as `reset-club-proxy`
- `reset.club/n*` proxies to `drop.reset.club/v5/`
- Proxy has cache bypass (`cf: { cacheTtl: 0 }`, `no-cache` response headers)
- `/news` and other non-`/n` paths pass through to Squarespace

### Phase 1 — SEO Foundations (DONE)
- Lighthouse: SEO 100, Best Practices 100, Accessibility 95
- `robots.txt` — static file at repo root
- Meta description — unique per page/filter variant (middleware)
- Canonical URL — points to `reset.club` (middleware)
- Favicon link (middleware)
- JSON-LD structured data — Organization + LodgingBusiness (middleware)
- `sitemap.xml` — dynamically generated (middleware)
- ARIA `aria-checked` on all toggle switches
- GA4 (`G-WCT8MYRETF`), Facebook Pixel (`622278338536523`), Klaviyo onsite JS removed (popup was interfering)

### UX Polish (DONE this session)
- Arrow labels: full opacity, next section name on hero/seasons/events
- Arrows skip sold-out seasons
- Reviews: spring/summer bias, "Month, Micro-Season" format, weather filter, no 1970 dates
- In-page property filtering (Barn Drops, etc.) with breadcrumb (COLLECTION · BARN STUDIO)
- RESET click clears all filters
- Price status bar: uppercase
- Gallery subtitle: "Less words, more pictures"
- Toggle text: full color (no alpha)
- Property dividers: full width between properties, indented within
- Divider visibility fix: survives toggle switching (`offsetHeight > 0` check)

### New Event Sections (DONE this session)
- **Full Moon** — `#e9f782` on black, tag-based (`moon`)
- **First Light** — `#31e898` (mint) on black, waxing crescent moon phase calculator (2.5-5.5 days after new moon)
- **Star Flood** — `#3f65f6` on black, tag-based (`vibe` / DARK SKY)
- **Rainbows** — animated gradient (`melo→toma→tree→wave→mint`) on black text, late April 15 through mid May 15, HILL4 + ZINK only
- Rainbow has: black toggle pills with `#fff` text, transparent nav, `customMatch` filter
- Auto day-filter: events with >7 drops default to primary day (THU/SUN)
- Event toggle colors: `data-textColor`/`data-bgColor` attributes on sections, respected by global toggle handler

### Join Form (IN PROGRESS — needs polish)
- JOIN button in nav upper right
- Klaviyo subscribe to "Newsletter Main" list (`UpNBQ7`) via client API
- GA4 `sign_up` event + Facebook `Lead` pixel on success
- Current implementation: dynamically creates a full-viewport section, inserts before current section, smooth scrolls to it
- **ISSUE**: Doug wants it to be a compact card (not full viewport) that pushes the current page content down from the top, like the mockup at `~/Desktop/Screenshot 2026-03-25 at 2.26.20 PM.png`
- The card should be: opposite color of current page (light page → black card, dark page → cream card)
- Card has: SIGN-UP title, First Name, Last Name, Email, Phone fields (2-column grid), JOIN button
- When opened: page content should physically push down, card appears above the nav
- When closed: content slides back up
- Multiple approaches tried (fixed position, body padding-top, document flow, dynamic section insertion) — none perfectly achieved the "push down without scrolling" behavior yet
- **Next step**: Try making the join form a smaller non-full-height section (e.g., ~250px) inserted before the current section. When inserted, use `scrollBy` to offset. This is the closest working approach.

## What's Left

### Review Gate — Design review with Kristin
- Deploy to `reset.club/n` (already done)
- Doug + Kristin review together
- Apply HTML/design tweaks
- Fix join form UX

### Phase 2 — Server-rendered drops page
- Middleware fetches drops API, renders HTML skeleton into `<main>`
- Crawlers see real content without JS
- Footer with legal links + © 2026 Reset Club

### Phase 3 — Content pages + Supabase tables
- `news_posts` table — seed 16+ Squarespace articles
- `site_pages` table — privacy, disclaimer, terms, about, about/standard, faqs
- Middleware routes for `/news`, `/news/[slug]`, `/about`, `/privacy`, etc.

### Phase 4 — DNS cutover
- Point `reset.club` to Cloudflare Pages
- 301 redirects for old Squarespace URLs
- Google Search Console

## Key Files
- `~/drop-reset-club/v5/app.js` — all client JS (~3200 lines)
- `~/drop-reset-club/v5/styles.css` — all styles
- `~/drop-reset-club/v5/index.html` — page shell (v=179)
- `~/drop-reset-club/functions/_middleware.js` — SEO injection, OG tags, sitemap
- `~/drop-reset-club/robots.txt`
- `~/reset-club-proxy/src/index.js` — Worker proxy for reset.club/n

## Git Status
- Multiple uncommitted changes in drop-reset-club (events, join form, borders, toggles, SEO, tracking)
- Last commit: `2c08a90` — opacity fix
- Need to commit the full session's work

## Version Numbers
- Current: app.js?v=179, styles.css?v=179
- Always bump BOTH together in index.html before deploying
