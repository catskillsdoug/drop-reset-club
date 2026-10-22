# Property sections redesign — design

Date: 2026-10-21 · Status: draft for Doug's review
Source brief: `2026-10-21-property-sections/BRIEF.md` (copied from Doug's Downloads, unchanged). Artboards: `2026-10-21-property-sections/reference/*.dc.html`. The artboards are the spec for layout, type, spacing and copy; this document records where the brief was overridden or clarified in conversation, and how it maps onto the real code.

## 1. Intent

Each property on the reset.club homepage scroll needs a more compelling introduction: photos first, reviews that make an argument, and a short intro (eyebrow, title, mark, five-word tagline) instead of a paragraph. OwnerRez remains the checkout; the rest of the checkout is separate, ongoing work and is not part of this.

Success: a guest landing on a property section sees the house before they read about it, sees what other guests valued, and can reach Details, Availability or Reviews in one tap.

## 2. Where this lives

- **Property sections**: `drop-reset-club`, `v5/app.js` (the snapped full-screen property sections, `addPropRow` around line 2959, `openGallery` 4141, `openReviews` 3935). Not OwnerRez, not the proxy. The brief's mention of "the OwnerRez theme" for the header does not apply.
- **Header and footer**: canonical in `reset-brand` (`make/patterns.md` "Footer (universal)", served at `brand.reset.club/footer`, links from Supabase `site_pages`; `.reset-nav` styles in `public/ownz/styles.css` shared by `/n` and `/stay`). Local copies exist in `drop-reset-club` (`v5/app.js:754` FOOTER_HTML, `functions/_middleware.js:1534` content pages).
- **Reviews, photos and description data**: the unseen platform, `agent-booking` (book.reset.club, deploys from `main`), which already copies reviews to D1 and caches listings in KV per tenant.
- Work branch: `feat/property-sections` in worktree `~/drop-reset-club-property-sections`, off `origin/main` (`79054b5`). Deploy only from `main` after merge, per the ops state file.

## 3. Decisions made in conversation (Doug's)

1. **Header**: on a solid colour everywhere, as today, plus the new slide-over nav control (piece A). The property sections are the only place where the same header sits transparent over the photo.
2. **Footer**: headers and footers must match across every Reset Club page. The new one-line footer (`RESET CLUB  +`, links behind the +, © below a rule) replaces the current footer on every surface, via the canonical source, not per surface.
3. **Photos**: the OwnerRez listing gallery for now (order and captions from the listing), delivered through unseen (see Photos and Details text below), not the curated Supabase `media` set the current gallery overlay uses.
4. **Colours**: the official Reset colours, not the canvas values. Hill Studio panel `#019740`, text `#fcf6e9`, read per property from Supabase `properties.drops_color_bg` / `drops_color_text` as today (Zink `#9c9b34`, Cook `#ff551e`, Barn `#3f65f6`). The brief's `#4B9B4F`, `#F7F2E4` and `#141413` are not used (see §6).
5. **Reviews**: from unseen, never straight from OwnerRez; built as a shared platform piece with Reset as first user; the unseen reviews spec is the rulebook, with first names on quotes; the monthly summary sentence publishes automatically (piece C). This also replaces the hard-coded `reviewCounts = { COOK: 220, ZINK: 365, HILL4: 30, BARN: 5 }` at `v5/app.js:2992` (Hill Studio actually has 76).

## 4. What gets built

Three pieces, built in this order. B needs A's header control; C ships on its own, and B shows the "Five star" fallback until C is live. Pieces A and B are in `drop-reset-club` and `reset-brand`; piece C and the photo/description endpoint are in `agent-booking` (platform workspace).

### Piece A — the universal footer, the slide-over nav, and the over-photo header variant
Navigation and legal are split (Doug, 2026-10-21):
- **Footer** (end of every page, every surface): `RESET CLUB  +`; the + reveals the legal links Privacy · Disclaimer · Terms · Cookie settings (closed per page load); © Reset Club Holdings LLC below a 2px rule. Cookie settings must stay reachable from every page for consent.
- **Slide-over nav** (new, every surface): a control in the header opens a full-height panel from the right holding places to go: About · FAQ · News, the four houses, JOIN. This is how a guest mid-scroll on a property section reaches other pages. Its exact trigger, width and close behaviour are to be designed and shown to Doug before building.
- Update the canonical footer markup and CSS in `reset-brand` to the one-line form.
- `drop-reset-club` homepage and content pages stop carrying their own footer copies and consume the canonical one (same contract as `brand.reset.club/footer`). The OwnerRez `/stay` footer follows through `ownz/styles.css` and the OwnerRez footer HTML field.
- Add an over-photo modifier for the existing header: the same markup and type, transparent background, absolute, cream text over a top gradient. Used only by the property sections.
- Every surface must render identically after the change: homepage, content pages (About, Privacy, Terms, Disclaimer), `/n`, `/stay` checkout, and the platform booking page on book.reset.club.

### Piece B — the property section
Per property, inside the existing snap scroll:
- **Desktop ≥1024px** — `reference/Main.dc.html` (M2): photo fills the left 800px at full section height; the panel on the right holds JOIN (top right), eyebrow `KERHONKSON, NY`, title + mark on one line, tagline (`properties.drops_tagline`), Guests mention tags, then rows anchored to the bottom of the section. Click left/right half of the photo = previous/next (cursor changes), ← → keys too; caption bottom left, counter `01 — NN` bottom right, 2px segmented progress rule.
- **Phone** — J (`reference/Phone-J.dc.html`) or K (`Phone-K*.dc.html`), decided on a real device (see §6).
- **Rows**: Details · Availability · Reviews. Gallery row removed (the hero is the gallery). "Pick dates" renamed Availability and opens the existing house calendar (`openHouseCalendar`). Drops row not rendered; its code and data path stay.
- **Details** opens the description: its opening paragraph plus "What's here" (source below).
- Category tag (the rotating `propertyTags` flip tag next to the title) removed.
- Each section is exactly one viewport tall; no scroll inside a section on first paint at 1280×800, 390×707 (Safari first paint) and 375×667.

### Piece C — reviews data and the Reviews summary screen

**Rulebook: the unseen reviews spec** (`~/reset-club-context/platform/docs/guide-and-booking/specs/reviews.md`, 3 Oct 2026). Where it and the brief disagree, the unseen spec wins (Doug, 2026-10-21). In particular:
- Quotes **carry attribution**: preferred name (`guest_goes_by`) else first name, never a surname · season and month of the stay (from arrival) · the home. This overrides the brief's "never the guest".
- Quotes are verbatim, cut only at a sentence boundary with an ellipsis.
- Guests mention = the spec's "Words": merged themes (near-duplicate raw tags merged before counting), and a theme quote must come from a review carrying that theme.
- Tallies name their source in guest language (for example *Airbnb reviews · since Aug 2013*); no system names (OwnerRez, Supabase) on any guest surface.
- "All N reviews →" opens this home's full list using the spec's quote unit (all star ratings, first-name attribution), replacing the current 5-star-only overlay and its `reviews` table read.

**Built as a shared unseen platform piece, Reset as first user** (Doug, 2026-10-21). Reviews reach reset.club from unseen, never straight from OwnerRez.
- **Store**: `agent-booking` (book.reset.club, deploys from `main`) already copies reviews nightly per tenant into D1 `reservations`.`reviews` (first name, stay dates, group; `migrations/0001_reviews.sql`). This piece builds on that copy.
- **Tagging**: the platform tags its own copy per tenant (one Claude pass over new or changed reviews: themes and sentiment), stored beside the review. Reset's Supabase `guest_reviews` tags run in parallel as the check; theme counts are compared before the homepage switches over (parallel running).
- **Endpoint**: a public read endpoint on `agent-booking` returns, per tenant and home: tally (count, average, last 90 days, source and since-date), merged words with counts, selected quotes, the monthly summary sentence, and the paged full list. The reset.club homepage calls it like any host site would. Cached; recomputed nightly.
- **Theme config** per tenant, with per-home label overrides (Zink "Hot tub"). Reset defaults: The hosts · The view · Will come back · The design · Private & quiet · Welcome bottle · Cleanliness. The brief's SQL buckets are the starting definition of the merge.
- **Guests mention row**: top 3 buckets (phone one row) or top 4–6 (desktop / J two rows), excluding "Will come back".
- **Summary sentence**: one Claude call per property per month from the bucket counts, at most 2 sentences, plain, no superlatives; always shown with "Summary of N reviews · updated monthly". Publishes automatically, no approval step (Doug, 2026-10-21: it only restates the counts). The prompt receives only the counts and labels, so the sentence cannot claim anything the counts don't show; a test pins that the input carries no review text.
- **Quotes**: 1–2 bodies at most 90 chars after cutting at a sentence boundary, sentiment ≥ 0.85, prefer one non-5-star when a good one exists; stars plus the unseen spec's attribution line.
- **Reviews summary screen** (`reference/Reviews-Desktop.dc.html`, `Reviews-Phone.dc.html`) replaces the current `openReviews` overlay: back link, eyebrow, "Reviews", three numbers, sentence + provenance, ranked buckets with bars (max 116px), quotes, "All N reviews →".
- Until piece C is live, piece B's Reviews row tag reads "Five star" and the Guests mention row is hidden, not faked.

### Photos and Details text for piece B
From unseen, not straight from OwnerRez (Doug's rule, 2026-10-21; applying it to photos and description is *my call*). `agent-booking` already caches each home's listing in KV with only page-safe fields (`src/page.js` `pageListing`: photos `large_url` + `caption`, `descriptions`, amenities). The same public endpoint as the reviews returns, per home: photos in listing order with captions, and the description. Hero caption = the listing caption trimmed to one sentence; a photo without a caption shows none. The first two photos load eagerly, the rest lazily.
Details shows the description's opening paragraph plus the "What's here" section, extracted from the description HTML on the platform side and tested against all four Reset homes; a home whose description has no "What's here" heading shows the description alone.

## 5. Constraints

- Real data only: no invented review numbers, tags or captions. A missing caption shows no caption.
- Inter, inline stroke SVG icons (2.2–2.4px, square caps), no emoji, no icon font, 2px cream rules, never a rule between photo and first row (brief §3).
- `<meta name="theme-color">` per property from the hero photo's top-edge average colour (brief §6). On the homepage this changes as the snapped section changes.
- Screenshots at 375×667, 390×707 and desktop, before and after, for every state (rows, footer open/closed, K sheet/strip, Reviews screen) before anything is called done.
- TDD for data shaping (bucket ranking, tag exclusion, quote selection, caption trimming, counter format), with mutation checks.

## 6. Open: J vs K on phone

K's photo swipe must not fight the vertical snap between properties. *My call*: a throwaway preview of both on real data, Doug picks on his phone, then only the winner is built. This is the one decision still owed, and it happens during the build, not before planning.

Settled by the brand tokens (`reset-brand/tokens/color.json` canon): the dark for photo gradients and the slideshow strip is `nite` `#000000` (the brief's `#141413` is not a token). Panel colours are the canon tokens `tree` `#019740` (Hill), `moss` `#9c9b34` (Zink), `toma` `#ff551e` (Cook), `wave` `#3f65f6` (Barn); text `sand` `#fcf6e9`.

*My call*: the Reviews row tag reads "Five star" until piece C is live, then the live tally as average · count (for Hill today, "4.97 · 76").

Settled by data: the eyebrow comes from `properties.city` / `state` (all four read Kerhonkson, New York) rendered as `KERHONKSON, NY`.

## 6a. Builder calls (mine, for Doug to check)

- **Footer placement**: on the homepage the footer stays once at the end of the scroll (`v5/app.js` `isLast`); property sections do not each carry one and get that height back. Mid-scroll navigation comes from the slide-over nav, so piece B depends on piece A's header control.
- **Separate bug, not in this build**: `ownerrez-sync-worker` writes `/v2/listings/{id}` to Supabase `properties.listing_data` (`src/supabase.js:276`), but that column is null for all four houses on 2026-10-21 while the endpoint returns 200. A silent sync failure; this design no longer depends on it, so it goes to the ops list.
- **Footer rollout without breakage**: the new footer markup ships under a new class name so pages still on the old CSS never render half-styled; the + uses a no-JS `<details>` element so the OwnerRez `/stay` footer works from pasted HTML. Updating the OwnerRez footer HTML field is a manual step for Doug, listed in the plan.
- **Review counts**: live values replace the hard-coded ones on every surface (the hard-coded table says Hill 30; `guest_reviews` has 76 visible).

## 7. Non-goals

- The OwnerRez checkout and the rest of the checkout build.
- Removing Drops data or code.
- Changing the header anywhere beyond the slide-over nav control and the over-photo variant on property sections.
- Rewriting the curated `media` gallery; it stays for other uses.

## 8. Tabled (Doug, 2026-10-22)

- **Live chat on reset.club via HostBuddy.** HostBuddy documents no website widget; each property carries an undocumented `chatbot_key` described as the key for a guest chat widget. The partner API route needs HostBuddy-issued keys and a separate sub-account with the knowledge base re-pushed. Next step when revisited: ask HostBuddy whether the `chatbot_key` widget can be embedded for visitors without a reservation. Findings: `2026-10-21-property-sections/hostbuddy-livechat-findings.md`.
