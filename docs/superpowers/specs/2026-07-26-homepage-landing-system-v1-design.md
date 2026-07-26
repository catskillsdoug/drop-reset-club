# Homepage Landing System v1 — Design
*2026-07-26 · Approved by Doug in session. Marketing context: `~/.agents/product-marketing.md`. Voice canon: `~/reset-brand/say/`.*

## Goal

The homepage's measurable job is to turn anonymous visits into reachable identities (phone or email) without impeding the ready-to-book path.

- **North star:** identities captured per week (`save_created` + `share_sent` with a new contact)
- **Co-metric (protected):** `booking_intent` — must not decline
- **Guardrails:** desktop bounce rate (70% at baseline), session duration
- **Baseline week (2026-07-19..26):** 163 visitors · 54% bounce (desktop 70% / mobile 31%) · 72% direct traffic · `viewed_pricing` ~150 · `booking_intent` 16 · `email_signup` 0

Strategy rationale: a 3-night stay is a considered purchase; 72% of traffic already knows the brand. Capture > first-visit conversion. Save/share also exploits the two-person booking dynamic (Initiator shares to Approver) and bridges desktop (worst bounce) to mobile (best engagement) via "text it to your phone."

## 1. Save / Share UX

- Every drop row and each property section gains two actions in existing brand style: `SAVE` and `SHARE` — text buttons with arrow icons, no new colors, data in mono. No emoji, no exclamation marks (voice canon).
- **Save** → minimal sheet: one field accepting phone or email (auto-detect), one button. Copy direction: "Save this for later. We'll text you the link." Delivery: link that reopens reset.club with the saved drop pinned.
- **Share** → same sheet plus a "send to" field and optional note. On mobile, offer the native OS share sheet first (tokenized link); form is the fallback and the desktop path. Desktop framing: "Text it to your phone."
- No login, no password, no account. One field, one tap.

## 2. Data model (Supabase)

Built as the future membership upgrade path — contact identity is the join key.

- **`contacts`**: `id uuid pk` · `kind text check (kind in ('phone','email'))` · `value text` (E.164 / lowercased email) · `source text check (source in ('save','share_recipient'))` · `klaviyo_synced_at timestamptz` · `created_at timestamptz`. Unique `(kind, value)`.
- **`saved_drops`**: `id uuid pk` · `contact_id uuid fk → contacts` · `property_code text` · `arrival date` · `share_token text unique` · `shared_by_save_id uuid nullable fk → saved_drops` (pairs recipient to sharer) · `status text check (status in ('active','expired','booked'))` · `last_notified_at timestamptz` · `created_at timestamptz`.

Notes: check existing tables before creating (RETRO); RLS with permissive service-role policy — writes go through the worker only, anon key gets no direct access.

## 3. Backend & delivery

- New Pages Functions in drop-reset-club: `POST /api/save` and `POST /api/share`. Validate (E.164 normalize / email lowercase), upsert contact, insert saved_drop with generated token, dispatch delivery, return `{ok, token}` with diagnostic counts.
- **SMS:** OpenPhone API (same API used by ops-digest; do NOT route through the internal alert hub — these are guest-facing). Include STOP-handling note in message footprint per compliance; messages are user-initiated single sends.
- **Email:** Klaviyo events API — create/update profile, fire `Saved Drop` event with drop metadata (property, arrival, token). This plugs saves into the existing email engine.
- **Link format:** `https://reset.club/?sv=<token>`. SSR middleware recognizes `sv`, resolves the saved drop server-side, injects a pinned-drop payload into `__nData`; app.js renders it above the fold and fires the return event.
- **Notifications v1 — exactly two** (honest-urgency doctrine, no manufactured scarcity):
  1. Immediate save/share confirmation (the link itself).
  2. One window-closing reminder via cron (e.g. "COOK · AUG 14–17 · closes in 3 days"), guarded by `last_notified_at`.
  Price-drop alerts are deferred until pricing history exists; schema already supports them.

## 4. Personalization-lite

No persona inference. Two behaviors only:

1. Arrival via `?sv=` (or matching localStorage token) → pinned card at top: saved drop, live price, single booking CTA.
2. If the saved drop's window has passed or sold → pinned slot shows the same property's next comparable window instead ("This window closed. The next one:").

Segment personalization (returning guests, microseason affinity) is a later cycle.

## 5. Homepage CRO quick wins (same cycle)

- **Trust strip near hero:** `2,000+ FIVE-STAR REVIEWS · VOGUE · DWELL · NYT` in the existing chip style. (Homepage currently shows zero proof; highest-impact cheap fix.)
- **Fix `email_signup` instrumentation** on the JOIN flow — zero events all week means broken tracking or broken flow; determine which.
- **Desktop bounce diagnosis:** review ~10 desktop session replays; findings decide cycle 2 (visuals/imagery). No visual redesign in this cycle.

## 6. Instrumentation & weekly cadence

New PostHog events: `save_sheet_opened` · `save_created` · `share_sent` · `share_opened` · `save_returned`. All carry `property_code`, `arrival`, `device`.

Funnel: pageview → sheet opened → captured → returned → booking_intent.

**Weekly loop (Mondays, ~30 min):** read funnel + WoW trends → watch 5–10 replays of the worst step → pick ONE swing → ship → annotate the release in PostHog. Directional decisions (funnels + replays), not p-values — traffic is ~163 visitors/week. A PostHog dashboard ("Homepage Weekly") holds: funnel, identities/week, booking_intent, bounce by device, top pages.

## 7. Staging environment & release discipline

Requirement: no code reaches reset.club without passing on a live staging URL.

- **Staging = Cloudflare Pages branch deployment.** `wrangler pages deploy . --branch=staging` → stable URL `staging.drop-reset-club.pages.dev`. Production remains `--branch=main`.
- **Env separation:** Pages "preview" environment variables (separate scope from production) set `ENVIRONMENT=staging`. The save/share API tags rows created on staging (`contacts.source` suffix or `is_test` flag) so smoke-test data never pollutes real lists; Klaviyo/OpenPhone dispatch is a no-op on staging (log instead of send).
- **Release gate:** `scripts/deploy.sh [staging|prod]` — staging deploy runs `scripts/site-smoke.py https://staging.drop-reset-club.pages.dev`; prod deploy refuses to run unless the same commit passed staging smoke. Prod deploy re-runs smoke against reset.club afterward.
- Smoke test gains a check for the save sheet (opens, validates input) using a designated test contact excluded from analytics (`filterTestAccounts` covers PostHog; test contact excluded from Klaviyo sync).

## 8. Out of scope

Membership / $75 join gate · imagery & visual redesign · price-drop alerts · segment personalization · A/B testing infrastructure · native apps.

## 9. Risks

- SMS compliance: user-initiated transactional-style sends; include STOP handling; volume tiny.
- Token leakage: `sv` tokens pin content only, expose no PII, and are single-drop scoped.
- OpenPhone/Klaviyo failures: delivery is best-effort with logged errors; the save row persists regardless (retry later).
- Data pollution: staging flag + test-contact exclusion (see §7).

## Success criteria (cycle 1)

1. Save/share live on prod, passing staging gate.
2. ≥1 real identity captured in week 1 (beats current 0/week).
3. `booking_intent` does not decline week-over-week.
4. Weekly dashboard exists; first Monday readout completed.
