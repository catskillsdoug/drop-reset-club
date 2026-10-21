# Hill Studio property page — build brief

Redesign of the property pages on reset.club (`/stay/<property>`), starting with Hill Studio and then applied to Zink Cabin, Cook House and Barn Studio. The direction was settled on a design canvas; the `reference/` folder beside this file holds the exact artboards as self-contained HTML (inline styles, one file per screen). Treat those as the spec for layout, type, spacing and copy. This document is the spec for behaviour, data and decisions.

Canvas: https://claude.ai/artifact/3hhbi5bNACYy52eDRwntaC (private; ask Doug for access)

## 1. What changes

The current page stacks a green header (title, tag, tagline, paragraph, mark) over a list of rows (Gallery, Pick dates, Reviews, Drops) and a full footer. The new page:

- Opens with the **photo**, not the paragraph. The gallery is no longer a separate page; the hero *is* the gallery.
- Keeps the **five-word tagline** ("All glass. All mountain. All yours.") and drops the paragraph from the first screen. The paragraph becomes the content behind **Details**.
- Drops the category tag ("Cinema screen" / "Mountain views").
- Adds a **Kerhonkson, NY** eyebrow above the title on every property page.
- Rows become **Details · Availability · Reviews**. "Pick dates" is renamed Availability. **Drops is hidden** for now (not deleted — keep the data path, just don't render the row).
- Footer collapses to one line, **RESET CLUB  +**, with About · FAQ · News · Privacy · Disclaimer · Terms · Cookie settings behind the +, and the © line below a rule.
- Adds a **Guests mention** tag row and a **Reviews summary** screen, both driven by the enriched reviews in Supabase.

## 2. Layouts

### Desktop (≥1024px) — `reference/Main.dc.html` ("M2")
Split screen, no scroll on first paint at 1280×800. Photo fills the left 800px full height; the green panel on the right carries JOIN (top right), eyebrow, title + mark, tagline, Guests mention, then the rows **anchored to the bottom** above the footer line. Photo navigation: click the left half = previous, right half = next (cursor changes), caption bottom-left, counter `01 — 60` bottom-right, 2px segmented progress rule under both.

### Phone — two candidates, decide on a real device
- **J** — `reference/Phone-J.dc.html`. Photo takes the top ~480px edge to edge; nav, eyebrow, title, mark and tagline sit on the photo over gradients. Below, in green: Guests mention (two rows of tags allowed), then rows anchored to the bottom, then footer. Swipe the photo for the next one.
- **K** — `reference/Phone-K.dc.html` and `Phone-K2.dc.html`. Photo fills the whole screen; the green rises as a bottom sheet with eyebrow, title, mark, tagline, rows (Reviews row carries the top two mentions as its tag), footer. Progress rule + counter sit on the photo just above the sheet. On first swipe/tap the sheet drops to a 64px strip ("Hill Studio ↑") and the photo gets the desktop treatment: caption, counter, rule (K2). Tap the strip to bring the sheet back.
- Lean: J is closer to the current site; K is the stronger "app" feel. Test both at Safari's first-paint height (see §6) before choosing.

### Reviews summary — `reference/Reviews-Desktop.dc.html`, `reference/Reviews-Phone.dc.html`
The destination behind the Reviews row. Back link to the property, eyebrow, "Reviews", three numbers (average, count, last 90 days), one generated summary sentence with a provenance line, "What guests mention" as ranked rows with bar + share, one or two short quotes with month and star count, "All N reviews →", footer.

## 3. System

- **Colours.** Property green `#4B9B4F` (Hill Studio; each property keeps its own panel colour — Zink is the olive on the current site). Cream text `#F7F2E4`. Dark `#141413` for photo gradients and the slideshow strip. Gradients on photos only: `rgba(0,0,0,.45–.65) → 0`.
- **Type.** Inter. Title 800 at 54/46px, letter-spacing −0.03em. Rows 800 at 32/28px, −0.02em. Tagline 600 at 19/17px. Body 400 at 19/15px, line-height 1.4. Labels, nav, eyebrow and footer 700 at 11–15px, uppercase, tracking +0.02 to +0.06em.
- **Rules.** 2px cream, between rows and above the footer. Never a rule between the photo and the first row.
- **Tags.** 2px cream outline, 3px 6–7px padding, 10px 700 uppercase +0.04em. Used for row annotations ("Five star", "Next week") and Guests mention.
- **Icons.** Inline stroke SVG, 2.2–2.4px, square caps: → on every row, + / − for anything that unfolds, ↑ on the slideshow strip. No emoji, no icon font.
- **Spacing.** 20px page gutter on phone, 32/40px on desktop. Rows 9px vertical padding on phone, 12px on desktop. Mark 48/52px, always on the title line, right-aligned.
- **Eyebrow.** `KERHONKSON, NY` 11px 700 uppercase +0.06em, 10px above the title, on every property page and the Reviews screen.

## 4. Data

### Photos
From the OwnerRez property (id 411354 for Hill Studio). Order = the listing's order. **Captions come from the listing's photo captions** ("Autumn sunrise from the primary bedroom…"); strip them to one sentence for the hero caption. Counter is `index — total`, zero-padded to two digits.

### Guests mention + Reviews summary
Source: Supabase project `uakybfvpamxablrzzetn`, table `guest_reviews`, filtered `ownerrez_property_id = '411354' and visible`. Each row is enriched (`other_tags text[]`, `sentiment`, `intent`). Group the raw tags into display buckets by substring, then rank:

```sql
select
  count(*) total,
  round(avg(stars),2) avg_stars,
  count(*) filter (where review_date >= now() - interval '90 days') last_90,
  count(*) filter (where exists (select 1 from unnest(other_tags) t where t ilike '%host%' or t ilike '%communication%' or t ilike '%responsive%')) hosts,
  count(*) filter (where exists (select 1 from unnest(other_tags) t where t ilike '%view%' or t ilike '%sunrise%')) views,
  count(*) filter (where 'will_return' = any(other_tags) or 'would_recommend' = any(other_tags) or 'will_recommend' = any(other_tags)) will_return,
  count(*) filter (where exists (select 1 from unnest(other_tags) t where t ilike '%design%' or t ilike '%architect%' or t ilike '%detail%')) design,
  count(*) filter (where exists (select 1 from unnest(other_tags) t where t ilike '%peace%' or t ilike '%quiet%' or t ilike '%private%' or t ilike '%remote%' or t ilike '%serene%')) quiet,
  count(*) filter (where exists (select 1 from unnest(other_tags) t where t ilike '%welcome%' or t ilike '%gift%')) welcome,
  count(*) filter (where exists (select 1 from unnest(other_tags) t where t ilike '%clean%')) clean
from guest_reviews
where ownerrez_property_id = '411354' and visible;
```

Hill Studio on 2026-10-21: 76 reviews, 4.97, 15 in 90 days; hosts 44 (58%), views 37 (49%), will return 35 (46%), design 31 (41%), quiet 20 (26%), welcome 10 (13%), clean 11.

Display labels for the buckets: The hosts · The view · Will come back · The design · Private & quiet · Welcome bottle · Cleanliness. Bucket→label mapping is config, per property if needed (Zink will want "Hot tub").

- **Guests mention** row = top 3 buckets by count (phone, one row) or top 4–6 (desktop / J two rows). Exclude "Will come back" from the tag row — it's a trend, not an amenity — but keep it in the summary.
- **Reviews summary numbers** = the query above. Bars are proportional to share, max width 116px.
- **Summary sentence**: generated (one call, monthly) from the bucket counts, ≤ 2 sentences, plain, no superlatives. Always show the provenance line "Summary of N reviews · updated monthly".
- **Quotes**: pick 1–2 review bodies ≤ 90 characters after trimming to one sentence, sentiment ≥ 0.85, no guest names; prefer one that is not 5 stars when a good one exists (the 4-star "contemporary art museum" line is the model). Show month + star count, never the guest.
- Refresh nightly; cache the result per property.

## 5. Behaviours

- Rows are links. Details opens the description (the current paragraph plus "What's here"); Availability opens the calendar/quote flow; Reviews opens the summary screen.
- Footer + toggles the links row; state is per page load, closed by default.
- K: first horizontal swipe on the photo, or a tap, puts the page in slideshow state (sheet → strip). Tap the strip, or swipe the sheet up, to return. Each artboard in `reference/` has the working toggle in its `<script>` block if useful.
- Desktop photo: keyboard ← → also navigate; click halves as above.

## 6. Browser chrome

- `<meta name="theme-color">` per property, derived from the hero photo's top-edge average colour (dark, e.g. `#1F1F1D` for the sunrise) rather than the panel green, so the photo reads to the top of the glass on iOS. Safari's bottom bar samples the page bottom and goes green on its own; Android Chrome tints the top bar only. See `reference/Chrome-Green.dc.html` vs `Chrome-Dark.dc.html`.
- The site header must sit **over** the hero (transparent, absolute), not push it down. If the OwnerRez theme can't do that, fall back to a solid green bar with the photo starting directly under it, no padding.
- Safari first paint is ~707px tall at 390 wide, not 844. Phone layouts must fit that before the chrome collapses: J needs the photo at ~400px there; K is unaffected.

## 7. Open items

1. J vs K for phone — decide on device.
2. Drops row — hidden, not removed; decide when Drops has a cadence worth showing.
3. Reviews count on the row tag: "Five star" today; could become "76 · 4.97" once the summary data is live.
4. Per-property eyebrow: Kerhonkson, NY applies to all four; confirm.
5. Zink/Cook/Barn taglines and panel colours — reuse what the current site has.

## 8. Reference files

| File | What it is |
|---|---|
| `reference/Main.dc.html` | Desktop property page (M2) |
| `reference/Phone-J.dc.html` | Phone, photo + rows |
| `reference/Phone-K.dc.html` / `Phone-K2.dc.html` | Phone, sheet; browsing and slideshow states |
| `reference/Reviews-Desktop.dc.html` / `Reviews-Phone.dc.html` | Reviews summary |
| `reference/Chrome-Green.dc.html` / `Chrome-Dark.dc.html` | J inside iOS Safari, two theme-color options |
| `reference/canvas.json` | Board sizes and titles |

The `.dc.html` files use a small design-canvas runtime (`{{green}}` holes, `<sc-if>`, `<x-dc>`); read them as annotated HTML+CSS, not as code to ship. Image `src` values point at canvas assets — swap for the OwnerRez photo URLs (`https://uc.orez.io/i/<id>-Large`).
