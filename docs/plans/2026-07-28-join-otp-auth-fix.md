# Join panel OTP login fix — design

*2026-07-28. Approved in session.*

## Problem

The join panel (`v5/join.js`) POSTs to `apiBase() + '/request-otp'` / `'/verify-otp'`,
but no handler for these routes has ever existed in drop-reset-club. The only OTP
backend is reset-site's (2026.reset.club), which covers only the send half and uses
a different verify flow (client-side supabase-js). Compounding it, `linkBase()` uses
`_opts.linkBase || …`, so the apex's intentional `linkBase: ''` is treated as missing
and falls back to `/n` — whose 301 downgrades the POST to a GET.

## Fix

Native Pages Functions in drop-reset-club (no cross-worker proxying):

- `functions/api/_auth.js` — logic, exported for vitest:
  - `requestOtp(env, payload)` — normalize contact (`_lib.normalizeContact`), gate on
    known contact (guests/profiles by phone or email, bookings by guest_email — service
    key via `_supabase.sbSelect`), then POST Supabase `/auth/v1/otp` (anon key) which
    sends the SMS/email. Returns join.js's contract: `{success:true}`, 404 `{hint:'join'}`
    for unknown contacts, 502 on send failure.
  - `verifyOtp(env, payload)` — POST Supabase `/auth/v1/verify` (`type: sms|email`),
    on success set the standard `reset_session` HttpOnly cookie ({access_token,
    refresh_token}, Path=/, Secure, SameSite=Lax, Max-Age=86400 — same format the
    middleware admin check reads) and return `{success:true, user:{name}}` with
    first_name looked up from profiles/guests.
- `functions/api/auth/request-otp.js` + `verify-otp.js` — thin `onRequestPost` wrappers.
- `v5/join.js` — `linkBase()` honors empty string (`!= null` check); bump `?v=196 → 197`.

## Routing (no middleware changes)

- reset.club `/api/auth/*` → proxy worker forwards to drop.reset.club → function files.
- drop.reset.club `/v5/api/auth/*` → middleware already rewrites `/v5/api/*` → `/api/*`.
- `/n/api/*` stays broken-by-301 but nothing links to it after the join.js fix
  (HTML is no-store, so the new join.js loads immediately).

## Abuse control

Zone rate limit (POST `/api/*`, 5/10s/IP) + Supabase's own OTP throttling. No
in-function rate limiter (in-memory maps don't survive serverless isolates).

## Env

Requires `SUPABASE_ANON_KEY` (auth REST) + `SUPABASE_SERVICE_KEY` (contact gate).
Prod has both; preview needs `SUPABASE_ANON_KEY` added (publishable key).
