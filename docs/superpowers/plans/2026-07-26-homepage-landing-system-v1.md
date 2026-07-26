# Homepage Landing System v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save/Share identity capture (phone or email) on the reset.club homepage, with SSR pinned-drop return links, a trust strip, delivery via OpenPhone SMS + Klaviyo email, a staging→prod deploy gate, and PostHog instrumentation.

**Architecture:** Vanilla-JS SPA (`v5/app.js`) served by Cloudflare Pages with an SSR middleware (`functions/_middleware.js`). New Pages Functions under `functions/api/` write to Supabase via REST (service key) and dispatch SMS/email. A tiny scheduled Worker sends window-closing reminders. Staging is a Pages branch deploy gated by the behavioral smoke test.

**Tech Stack:** Cloudflare Pages Functions (ESM), Supabase (PostgREST), OpenPhone API, Klaviyo Events API, PostHog (already on page), vitest (new, unit tests only), Python smoke test (`scripts/site-smoke.py`).

## Global Constraints

- Work in `~/drop-reset-club-worktree-summer-fix` (clean worktree tracking origin/main). The `~/drop-reset-club` checkout is stale/dirty — do not touch it.
- Deploys: `env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy . --branch=<staging|main>` from repo root. NEVER deploy without `--branch` (detached HEAD defaults to a junk preview branch).
- Every change to `v5/app.js` shipped to prod requires bumping the cache-bust in `v5/index.html` (`app.js?v=248` → `?v=249`; bump once for this whole plan, in Task 10).
- Copy rules (brand canon, non-negotiable): no exclamation marks, no emoji, no em dashes; banned words include *curated, escape, retreat, getaway, stunning, perks, stop*. Data (dates, prices) in the existing mono style. See `~/.agents/product-marketing.md`.
- CSS: no `border-radius` (except existing sanctioned circles), 2px black borders, existing color tokens only — no new hex values.
- Supabase project: `uakybfvpamxablrzzetn` (URL `https://uakybfvpamxablrzzetn.supabase.co`). All API writes use the service key from env — the anon key gets no access to the new tables.
- PostHog is already initialized in `v5/index.html:79`. Fire events defensively: `try { window.posthog && posthog.capture(...) } catch (e) {}`.
- Staging must never send real SMS/email: every dispatch function is a logged no-op when `env.ENVIRONMENT === 'staging'`.

## File Structure

- `supabase/migrations/2026-07-26-contacts-saved-drops.sql` — new tables (applied via Supabase MCP/psql, kept in repo for record)
- `functions/api/_lib.js` — pure helpers: `normalizeContact`, `makeToken` (unit-tested)
- `functions/api/_supabase.js` — thin REST helpers: `sbInsert`, `sbSelect`, `sbPatch`
- `functions/api/_deliver.js` — `sendSMS`, `sendEmailEvent` (OpenPhone / Klaviyo; staging no-op)
- `functions/api/save.js`, `functions/api/share.js` — `onRequestPost` endpoints
- `functions/_middleware.js` — add `/api/` passthrough + `?sv=` pinned-drop injection
- `v5/app.js` — save/share bar + capture sheet + pinned card + trust strip + events
- `v5/styles.css` — sheet + pinned card styles
- `v5/index.html` — cache-bust bump (Task 10)
- `workers/saved-drops-cron/` — `wrangler.toml` + `src/index.js` (reminders)
- `scripts/deploy.sh` — staging-gated deploy
- `scripts/site-smoke.py` — extend with save-sheet check
- `tests/lib.test.mjs` — vitest unit tests

---

### Task 1: Database tables

**Files:**
- Create: `supabase/migrations/2026-07-26-contacts-saved-drops.sql`

**Interfaces:**
- Produces: tables `contacts(id, kind, value, source, is_test, klaviyo_synced_at, created_at)` and `saved_drops(id, contact_id, property_code, arrival, share_token, shared_by_save_id, status, last_notified_at, created_at)`.

- [ ] **Step 1: Check for collisions** — run via Supabase MCP `execute_sql` (or psql):

```sql
select table_name from information_schema.tables
where table_schema='public' and table_name in ('contacts','saved_drops');
```

Expected: zero rows. If `contacts` exists, STOP and report — do not create; the table name needs a session decision.

- [ ] **Step 2: Write the migration file** with exactly:

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('phone','email')),
  value text not null,
  source text not null check (source in ('save','share_recipient')),
  is_test boolean not null default false,
  klaviyo_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

create table saved_drops (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id),
  property_code text not null,
  arrival date not null,
  share_token text not null unique,
  shared_by_save_id uuid references saved_drops(id),
  status text not null default 'active' check (status in ('active','expired','booked')),
  last_notified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table contacts enable row level security;
alter table saved_drops enable row level security;
-- no anon policies on purpose: only the service key (bypasses RLS) reads/writes
create index saved_drops_arrival_idx on saved_drops (arrival) where status = 'active';
```

- [ ] **Step 3: Apply** via Supabase MCP `apply_migration` (name `contacts_saved_drops`). Verify:

```sql
select count(*) from contacts; select count(*) from saved_drops;
```

Expected: `0` and `0`.

- [ ] **Step 4: Commit** the SQL file: `git add supabase/ && git commit -m "feat(save): contacts + saved_drops schema"`

---

### Task 2: Validation lib + vitest

**Files:**
- Create: `functions/api/_lib.js`, `tests/lib.test.mjs`
- Modify: `package.json` (add vitest devDependency + `"test": "vitest run"` script)

**Interfaces:**
- Produces: `normalizeContact(raw: string) -> {kind:'phone'|'email', value:string} | null` (E.164 for US phones, lowercased trimmed email); `makeToken() -> string` (12-char base62, crypto-random).

- [ ] **Step 1: Write failing tests** in `tests/lib.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeContact, makeToken } from '../functions/api/_lib.js';

describe('normalizeContact', () => {
  it('normalizes 10-digit US phones to E.164', () => {
    expect(normalizeContact('(212) 203-1247')).toEqual({ kind: 'phone', value: '+12122031247' });
  });
  it('accepts 11-digit with leading 1', () => {
    expect(normalizeContact('1 212 203 1247')).toEqual({ kind: 'phone', value: '+12122031247' });
  });
  it('passes through +E.164', () => {
    expect(normalizeContact('+12122031247')).toEqual({ kind: 'phone', value: '+12122031247' });
  });
  it('lowercases and trims email', () => {
    expect(normalizeContact('  Doug@Reset.Club ')).toEqual({ kind: 'email', value: 'doug@reset.club' });
  });
  it('rejects garbage', () => {
    expect(normalizeContact('hello')).toBeNull();
    expect(normalizeContact('123')).toBeNull();
    expect(normalizeContact('a@b')).toBeNull();
  });
});

describe('makeToken', () => {
  it('makes 12-char base62 tokens, unique-ish', () => {
    const t = makeToken();
    expect(t).toMatch(/^[0-9A-Za-z]{12}$/);
    expect(makeToken()).not.toEqual(t);
  });
});
```

- [ ] **Step 2: Install vitest and verify tests fail**: `npm install -D vitest && npx vitest run` → FAIL (module not found).

- [ ] **Step 3: Implement** `functions/api/_lib.js`:

```js
export function normalizeContact(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.includes('@')) {
    const email = s.toLowerCase();
    // pragmatic check: something@something.tld
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
    return { kind: 'email', value: email };
  }
  const digits = s.replace(/[^\d]/g, '');
  if (s.startsWith('+') && digits.length >= 11 && digits.length <= 15) {
    return { kind: 'phone', value: '+' + digits };
  }
  if (digits.length === 10) return { kind: 'phone', value: '+1' + digits };
  if (digits.length === 11 && digits.startsWith('1')) return { kind: 'phone', value: '+' + digits };
  return null;
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function makeToken() {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += B62[b % 62];
  return out;
}
```

- [ ] **Step 4: Run tests** → all PASS. Add `"test": "vitest run"` to package.json scripts.

- [ ] **Step 5: Commit**: `git add functions/api/_lib.js tests/ package.json package-lock.json && git commit -m "feat(save): contact normalization + token lib with vitest"`

---

### Task 3: Supabase REST + delivery helpers

**Files:**
- Create: `functions/api/_supabase.js`, `functions/api/_deliver.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `sbInsert(env, table, row, {upsertOn}) -> row` · `sbSelect(env, table, query) -> rows[]` · `sbPatch(env, table, query, patch)` · `sendSMS(env, to, body) -> {ok, skipped?}` · `sendEmailEvent(env, email, eventName, props) -> {ok, skipped?}`.
- Env vars used: `SUPABASE_SERVICE_KEY`, `OPENPHONE_API_KEY`, `OPENPHONE_FROM`, `KLAVIYO_API_KEY`, `ENVIRONMENT`.

- [ ] **Step 1: Write** `functions/api/_supabase.js`:

```js
const SB_URL = 'https://uakybfvpamxablrzzetn.supabase.co';

function headers(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function sbInsert(env, table, row, opts = {}) {
  const params = new URLSearchParams();
  let prefer = 'return=representation';
  if (opts.upsertOn) {
    params.set('on_conflict', opts.upsertOn);
    prefer += ',resolution=merge-duplicates';
  }
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, {
    method: 'POST',
    headers: { ...headers(env), Prefer: prefer },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`supabase insert ${table} ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows[0];
}

export async function sbSelect(env, table, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: headers(env) });
  if (!r.ok) throw new Error(`supabase select ${table} ${r.status}`);
  return r.json();
}

export async function sbPatch(env, table, query, patch) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: headers(env),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`supabase patch ${table} ${r.status}`);
}
```

- [ ] **Step 2: Write** `functions/api/_deliver.js`:

```js
// Guest-facing delivery. On staging, log instead of send — never text real people
// from a preview deploy.
export async function sendSMS(env, to, body) {
  if (env.ENVIRONMENT === 'staging') {
    console.log('[staging] SMS suppressed', { to, body });
    return { ok: true, skipped: true };
  }
  const r = await fetch('https://api.openphone.com/v1/messages', {
    method: 'POST',
    headers: { Authorization: env.OPENPHONE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.OPENPHONE_FROM, to: [to], content: body }),
  });
  if (!r.ok) {
    console.log('openphone error', r.status, await r.text());
    return { ok: false };
  }
  return { ok: true };
}

export async function sendEmailEvent(env, email, eventName, props) {
  if (env.ENVIRONMENT === 'staging') {
    console.log('[staging] Klaviyo suppressed', { email, eventName });
    return { ok: true, skipped: true };
  }
  const r = await fetch('https://a.klaviyo.com/api/events/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${env.KLAVIYO_API_KEY}`,
      'Content-Type': 'application/json',
      revision: '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          properties: props,
          metric: { data: { type: 'metric', attributes: { name: eventName } } },
          profile: { data: { type: 'profile', attributes: { email } } },
        },
      },
    }),
  });
  if (!r.ok) {
    console.log('klaviyo error', r.status, await r.text());
    return { ok: false };
  }
  return { ok: true };
}
```

- [ ] **Step 3: Syntax check both** (`cp` to `.mjs` then `node --check`, as the repo is commonjs): expect clean.

- [ ] **Step 4: Commit**: `git add functions/api/_supabase.js functions/api/_deliver.js && git commit -m "feat(save): supabase REST + OpenPhone/Klaviyo delivery helpers"`

---

### Task 4: /api/save and /api/share endpoints + middleware passthrough

**Files:**
- Create: `functions/api/save.js`, `functions/api/share.js`
- Modify: `functions/_middleware.js` (add `/api/` passthrough near the existing `/v5/api/` passthrough, ~line 539)

**Interfaces:**
- Consumes: `normalizeContact`, `makeToken` (Task 2); `sbInsert`, `sbSelect` (Task 3); `sendSMS`, `sendEmailEvent` (Task 3).
- Produces: `POST /api/save` body `{contact, property_code, arrival}` → `{ok, token}`. `POST /api/share` body `{to, from_contact?, property_code, arrival, note?}` → `{ok, token}`. Both 400 on invalid contact, 500 with `{ok:false,error}` on server error. Link format produced: `https://reset.club/?sv=<token>`.

- [ ] **Step 1: Middleware passthrough.** In `functions/_middleware.js`, find the block `if (url.pathname.startsWith('/v5/api/'))` (~line 539–541) and add directly above it:

```js
  // Save/share API — handled by functions/api/*.js route files
  if (url.pathname.startsWith('/api/')) {
    return context.next();
  }
```

Note: `context.next()` is correct here — it falls through to the sibling route Functions. (The "always ASSETS.fetch" rule applies to static assets, not Function routes.)

- [ ] **Step 2: Write** `functions/api/save.js`:

```js
import { normalizeContact, makeToken } from './_lib.js';
import { sbInsert } from './_supabase.js';
import { sendSMS, sendEmailEvent } from './_deliver.js';

const PROPS = { COOK: 'Cook House', ZINK: 'Zink Cabin', HILL4: 'Hill Studio', BARN: 'Barn Studio' };

function fmtDate(arrival) {
  const d = new Date(arrival + 'T12:00:00Z');
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${M[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export async function createSave(env, { contact, property_code, arrival, source, shared_by_save_id }) {
  const norm = normalizeContact(contact);
  if (!norm) return { status: 400, body: { ok: false, error: 'invalid_contact' } };
  if (!PROPS[property_code] || !/^\d{4}-\d{2}-\d{2}$/.test(arrival || '')) {
    return { status: 400, body: { ok: false, error: 'invalid_drop' } };
  }
  const row = await sbInsert(env, 'contacts',
    { kind: norm.kind, value: norm.value, source, is_test: env.ENVIRONMENT === 'staging' },
    { upsertOn: 'kind,value' });
  const token = makeToken();
  const saved = await sbInsert(env, 'saved_drops', {
    contact_id: row.id, property_code, arrival, share_token: token,
    shared_by_save_id: shared_by_save_id || null,
  });
  const link = `https://reset.club/?sv=${token}`;
  const label = `${PROPS[property_code].toUpperCase()} \u00b7 ${fmtDate(arrival)}`;
  if (norm.kind === 'phone') {
    await sendSMS(env, norm.value, `Reset Club. Saved for later: ${label}. ${link}`);
  } else {
    await sendEmailEvent(env, norm.value, 'Saved Drop',
      { property_code, arrival, link, label });
  }
  return { status: 200, body: { ok: true, token }, savedId: saved.id };
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const res = await createSave(context.env, { ...body, source: 'save' });
    return Response.json(res.body, { status: res.status });
  } catch (e) {
    console.log('save error', e.message);
    return Response.json({ ok: false, error: 'server' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Write** `functions/api/share.js`:

```js
import { createSave } from './save.js';
import { normalizeContact } from './_lib.js';

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    // Recipient gets the saved drop + link.
    const recip = await createSave(context.env, {
      contact: body.to, property_code: body.property_code,
      arrival: body.arrival, source: 'share_recipient',
    });
    if (recip.status !== 200) return Response.json(recip.body, { status: recip.status });
    // Sharer (optional) is captured too, linked to the recipient's save.
    if (body.from_contact && normalizeContact(body.from_contact)) {
      await createSave(context.env, {
        contact: body.from_contact, property_code: body.property_code,
        arrival: body.arrival, source: 'save', shared_by_save_id: recip.savedId,
      });
    }
    return Response.json(recip.body, { status: 200 });
  } catch (e) {
    console.log('share error', e.message);
    return Response.json({ ok: false, error: 'server' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Set secrets** (HUMAN STEP — needs interactive wrangler; values in 1Password). Production:

```bash
cd ~/drop-reset-club-worktree-summer-fix
env -u CLOUDFLARE_API_TOKEN npx wrangler pages secret put SUPABASE_SERVICE_KEY --project-name=drop-reset-club
env -u CLOUDFLARE_API_TOKEN npx wrangler pages secret put OPENPHONE_API_KEY --project-name=drop-reset-club
env -u CLOUDFLARE_API_TOKEN npx wrangler pages secret put OPENPHONE_FROM --project-name=drop-reset-club
env -u CLOUDFLARE_API_TOKEN npx wrangler pages secret put KLAVIYO_API_KEY --project-name=drop-reset-club
```

Then in the Cloudflare dashboard → Pages → drop-reset-club → Settings → Environment variables → **Preview** scope: add the same four secrets PLUS plain var `ENVIRONMENT=staging`. (Preview-scope secrets aren't settable via wrangler CLI.)

- [ ] **Step 5: Deploy to staging and curl-test**:

```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy . --branch=staging
curl -s -X POST https://staging.drop-reset-club.pages.dev/api/save \
  -H 'content-type: application/json' \
  -d '{"contact":"212 203 1247","property_code":"COOK","arrival":"2026-08-14"}'
```

Expected: `{"ok":true,"token":"..."}`. Then verify the row landed with `is_test=true` (Supabase MCP): `select kind, value, is_test from contacts order by created_at desc limit 1;` → `phone | +12122031247 | true`. Bad input check: same curl with `"contact":"hello"` → 400 `{"ok":false,"error":"invalid_contact"}`.

- [ ] **Step 6: Commit**: `git add functions/api/ functions/_middleware.js && git commit -m "feat(save): /api/save + /api/share endpoints"`

---

### Task 5: SSR pinned-drop injection (?sv=)

**Files:**
- Modify: `functions/_middleware.js`

**Interfaces:**
- Consumes: `sbSelect` (Task 3).
- Produces: on HTML page requests with `?sv=<token>`, a `<script>window.__pinnedDrop = {property_code, arrival, token, status}</script>` tag injected immediately after the `__nData` SSR block. app.js (Task 7) reads `window.__pinnedDrop`.

- [ ] **Step 1: Implement.** In `functions/_middleware.js`, find where the SSR hydration block from `buildSSRHydrationBlock(env)` is inserted into the HTML response (grep `buildSSRHydrationBlock` call site). Add before the HTML is returned:

```js
  // Saved-drop return link: ?sv=<token> pins the saved drop above the fold.
  const svToken = url.searchParams.get('sv');
  if (svToken && /^[0-9A-Za-z]{12}$/.test(svToken)) {
    try {
      const { sbSelect } = await import('./api/_supabase.js');
      const rows = await sbSelect(env, 'saved_drops',
        `share_token=eq.${svToken}&select=property_code,arrival,status`);
      if (rows[0]) {
        const pin = { ...rows[0], token: svToken };
        html = html.replace('</head>',
          `<script>window.__pinnedDrop = ${JSON.stringify(pin).replace(/</g, '\\u003c')};<\/script></head>`);
      }
    } catch (e) { console.log('sv resolve failed', e.message); }
  }
```

Adapt variable names (`html`, `env`, `url`) to the surrounding code — the middleware already has the URL parsed and the HTML as a string at the injection point for SSR pages. If the middleware streams instead of holding a string at that point, use an `HTMLRewriter` on `head` `append` instead; either mechanism is acceptable, same payload.

- [ ] **Step 2: Deploy staging + verify**:

```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy . --branch=staging
curl -s "https://staging.drop-reset-club.pages.dev/?sv=<token-from-task-4>" | grep -o '__pinnedDrop[^<]*'
```

Expected: the JSON with property_code COOK. A bogus token must inject nothing.

- [ ] **Step 3: Commit**: `git add functions/_middleware.js && git commit -m "feat(save): SSR pinned-drop injection for ?sv= return links"`

---

### Task 6: Save/Share UI — buttons + capture sheet

**Files:**
- Modify: `v5/app.js`, `v5/styles.css`

**Interfaces:**
- Consumes: `POST /api/save`, `POST /api/share` (Task 4).
- Produces: `window.__openCaptureSheet({mode, property_code, arrival, label})` and per-drop `SAVE` / `SHARE` actions; PostHog events `save_sheet_opened`, `save_created`, `share_sent` (all with `{property_code, arrival, mode}`).

- [ ] **Step 1: Styles.** Append to `v5/styles.css`:

```css
/* Save/share capture sheet */
.cap-actions{display:flex;gap:16px;margin-top:6px}
.cap-btn{font-family:inherit;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:none;border:none;color:inherit;cursor:pointer;padding:2px 0;border-bottom:2px solid currentColor}
.cap-sheet{position:fixed;inset:auto 0 0 0;background:#fcf6e9;color:#000;border-top:2px solid #000;padding:24px;z-index:1000;transform:translateY(100%);transition:transform .25s ease}
.cap-sheet.open{transform:translateY(0)}
.cap-sheet form{display:flex;flex-direction:column;gap:12px;max-width:480px;margin:0 auto}
.cap-sheet label{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.cap-sheet input{font-family:inherit;font-size:17px;padding:12px;border:2px solid #000;background:#fff;color:#000}
.cap-sheet .cap-submit{font-family:inherit;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:#000;color:#fcf6e9;border:2px solid #000;padding:14px;cursor:pointer}
.cap-sheet .cap-close{position:absolute;top:12px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;color:#000}
.cap-sheet .cap-done{font-size:17px;text-align:center;padding:24px 0}
```

- [ ] **Step 2: Sheet + tracking code.** Add to `v5/app.js` (module scope, near the other top-level helpers around line 230):

```js
function track(name, props) {
  try { if (window.posthog && posthog.capture) posthog.capture(name, props || {}); } catch (e) {}
}

window.__openCaptureSheet = function ({ mode, property_code, arrival, label }) {
  track('save_sheet_opened', { property_code, arrival, mode });
  document.querySelectorAll('.cap-sheet').forEach(el => el.remove());
  const sheet = document.createElement('div');
  sheet.className = 'cap-sheet';
  const isShare = mode === 'share';
  sheet.innerHTML = `
    <button class="cap-close" aria-label="Close">\u00d7</button>
    <form>
      <label>${label}</label>
      ${isShare ? '<input name="to" placeholder="Their phone or email" autocomplete="off">' : ''}
      <input name="contact" placeholder="${isShare ? 'Your phone or email (optional)' : 'Phone or email'}" autocomplete="off">
      <button type="submit" class="cap-submit">${isShare ? 'Send it' : 'Save it'}</button>
    </form>`;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
  sheet.querySelector('.cap-close').onclick = () => sheet.remove();
  sheet.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const payload = isShare
      ? { to: f.to.value, from_contact: f.contact.value || undefined, property_code, arrival }
      : { contact: f.contact.value, property_code, arrival };
    const r = await fetch(isShare ? '/api/share' : '/api/save', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(x => x.json()).catch(() => ({ ok: false }));
    if (r.ok) {
      track(isShare ? 'share_sent' : 'save_created', { property_code, arrival, mode });
      sheet.querySelector('form').outerHTML =
        `<div class="cap-done">${isShare ? 'Sent. They get the link by text or email.' : 'Saved. The link is on its way.'}</div>`;
      setTimeout(() => sheet.remove(), 2500);
    } else {
      f.querySelector('.cap-submit').textContent = 'Check the number or email';
    }
  };
};

function buildCaptureActions(drop) {
  const wrap = document.createElement('div');
  wrap.className = 'cap-actions';
  const mk = (mode, text) => {
    const b = document.createElement('button');
    b.className = 'cap-btn';
    b.textContent = text;
    b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const args = {
        mode,
        property_code: drop.property.code,
        arrival: drop.arrival,
        label: `${(PROP_LABELS[drop.property.code] || drop.property.code).toUpperCase()} \u00b7 ${formatDropDates(drop)}`,
      };
      if (mode === 'share' && navigator.share && /Mobi/.test(navigator.userAgent)) {
        navigator.share({ title: 'Reset Club', url: location.origin + '/?p=' + drop.property.code })
          .then(() => track('share_sent', { ...args, native: true }))
          .catch(() => window.__openCaptureSheet(args));
        return;
      }
      window.__openCaptureSheet(args);
    };
    return b;
  };
  wrap.appendChild(mk('save', 'Save'));
  wrap.appendChild(mk('share', 'Share'));
  return wrap;
}
```

Adapt: `PROP_LABELS` and the drop date formatter already exist in app.js (grep `PROP_LABELS` and `formatDropSubtitle`/`MONTHS`) — use the existing formatter that renders `THU\u2013SUN \u00b7 AUG 14\u201317`; the exact function name is visible at ~line 220.

- [ ] **Step 3: Attach to drop rows.** Grep `drop-row` in `v5/app.js` to find where each drop row element is assembled inside `buildSection` (~line 1157+). After the row's main content is appended (not inside the booking link), append `buildCaptureActions(drop)` for non-sold drops: `if (!drop._sold) rowEl.appendChild(buildCaptureActions(drop));` — attach to the row container so clicks don't trigger the booking navigation (the `stopPropagation` in the handler guards this).

- [ ] **Step 4: Verify locally-ish.** Run `npm run dev` (wrangler pages dev, port 8788), open `http://localhost:8788/v5/`, confirm: SAVE/SHARE render on drop rows in brand style, sheet opens/closes, bogus contact shows the inline error (API will 500 locally without secrets — the visible failure state is enough here; full round-trip happens on staging in Task 10).

- [ ] **Step 5: Commit**: `git add v5/app.js v5/styles.css && git commit -m "feat(save): save/share actions + capture sheet on drop rows"`

---

### Task 7: Pinned drop render (return links)

**Files:**
- Modify: `v5/app.js`

**Interfaces:**
- Consumes: `window.__pinnedDrop` (Task 5) — `{property_code, arrival, status, token}`.
- Produces: pinned card above the hero content; PostHog event `save_returned` `{property_code, arrival, status}`; localStorage `reset_sv` remembered for future visits.

- [ ] **Step 1: Implement.** In the main render flow of `v5/app.js`, right after the hero section is appended (`main.appendChild(heroSection)` at ~line 2364), add:

```js
      // Pinned saved drop — the ?sv= return path (or a remembered token).
      const pin = window.__pinnedDrop;
      if (pin) {
        try { localStorage.setItem('reset_sv', pin.token); } catch (e) {}
        track('save_returned', { property_code: pin.property_code, arrival: pin.arrival, status: pin.status });
        const pinned = document.createElement('section');
        pinned.className = 'section';
        pinned.id = 'pinned-drop';
        pinned.style.backgroundColor = '#000000';
        pinned.style.color = '#fcf6e9';
        const pinInner = document.createElement('div');
        pinInner.className = 'section-inner';
        const h = document.createElement('h2');
        h.className = 'text-scaled';
        h.textContent = 'Saved';
        pinInner.appendChild(h);
        // Find the live drop matching the pin; fall back to next window for the property.
        const all = [];
        for (const w of activeWindows) all.push(...(windowDrops.get(w.slug) || []));
        let match = all.find(d => !d._sold && d.property.code === pin.property_code && d.arrival === pin.arrival);
        let note = '';
        if (!match) {
          match = all.find(d => !d._sold && d.property.code === pin.property_code);
          note = 'That window closed. The next one:';
        }
        if (match) {
          if (note) {
            const p = document.createElement('p');
            p.className = 'section-description';
            p.textContent = note;
            pinInner.appendChild(p);
          }
          const row = document.createElement('a');
          row.className = 'hero-option';
          row.href = __rewriteBookingUrl(match.bookingUrl);
          row.target = '_blank';
          const lbl = document.createElement('span');
          lbl.className = 'hero-option-label';
          lbl.textContent = `${PROP_LABELS[match.property.code] || match.property.code}`;
          const sub = document.createElement('div');
          sub.style.cssText = 'font-size:14px;font-weight:500;margin-top:2px';
          sub.textContent = `${match.thru || ''} \u00b7 ${match.arrival}`;
          lbl.appendChild(sub);
          row.appendChild(lbl);
          const arrow = document.createElement('span');
          arrow.className = 'hero-option-arrow';
          arrow.innerHTML = HERO_ARROW_SVG;
          row.appendChild(arrow);
          pinInner.appendChild(row);
        } else {
          const p = document.createElement('p');
          p.className = 'section-description';
          p.textContent = 'Nothing open at that house right now. Browse the calendar below.';
          pinInner.appendChild(p);
        }
        pinned.appendChild(pinInner);
        main.insertBefore(pinned, heroSection.nextSibling);
      }
```

Adapt: `__rewriteBookingUrl`, `HERO_ARROW_SVG`, `PROP_LABELS`, `activeWindows`, `windowDrops` all exist in scope at that point (verify with grep; `activeWindows`/`windowDrops` are defined earlier in the same function, ~lines 1717–1763).

- [ ] **Step 2: Deploy staging, verify visually**: open `https://staging.drop-reset-club.pages.dev/?sv=<token>` in headless Chrome, screenshot, confirm the black Saved section renders under the hero with the drop row. Bogus/missing token → no section.

- [ ] **Step 3: Commit**: `git add v5/app.js && git commit -m "feat(save): pinned saved-drop section for return visits"`

---

### Task 8: Trust strip + email_signup instrumentation

**Files:**
- Modify: `v5/app.js` (trust strip in hero), `v5/join.js` (event instrumentation)

**Interfaces:**
- Consumes: `track()` from Task 6 (app.js); PostHog global (join.js fires directly).
- Produces: trust strip in hero; `email_signup` events with `{source: 'join_panel', method: 'phone'|'email'}` on successful join.

- [ ] **Step 1: Trust strip.** In `buildHeroSection` in `v5/app.js` (grep `function buildHeroSection`), after the hero description row is appended (`container.appendChild(descRow)` ~line 872), add:

```js
  // Proof strip — the only place the homepage states evidence. Keep to facts.
  const proof = document.createElement('p');
  proof.className = 'section-meta';
  proof.style.cssText = 'margin:12px 0 0;opacity:.85';
  proof.textContent = '2,000+ FIVE-STAR REVIEWS \u00b7 VOGUE \u00b7 DWELL \u00b7 NYT';
  container.appendChild(proof);
```

- [ ] **Step 2: email_signup fix.** In `v5/join.js`, find `submitJoin` and `submitOTP` (grep; ~lines 119–150 region). At each success path (the point where the UI flips to a logged-in/confirmed state), add:

```js
      try {
        if (window.posthog && posthog.capture) {
          posthog.capture('email_signup', { source: 'join_panel', method: _loginMode });
        }
      } catch (e) {}
```

First READ the existing flow: `v5/index.html:119` already captures `email_signup` with `source: 'join_card'` — determine whether that call is on a dead code path (likely, since the event count is 0 with real traffic). Report what you find in the commit message; do not remove the existing call.

- [ ] **Step 3: Deploy staging; verify** the proof strip renders (screenshot, hero) and no console errors. Note: join OTP flow can't complete on staging without real OTP — code-review the event placement instead.

- [ ] **Step 4: Commit**: `git add v5/app.js v5/join.js && git commit -m "feat(home): hero proof strip + email_signup instrumentation on join panel"`

---

### Task 9: Window-closing reminder cron worker

**Files:**
- Create: `workers/saved-drops-cron/wrangler.toml`, `workers/saved-drops-cron/src/index.js`

**Interfaces:**
- Consumes: `saved_drops`/`contacts` tables; OpenPhone + Klaviyo (same APIs as Task 3 — code is duplicated here intentionally, the worker bundles separately from Pages Functions).
- Produces: daily 15:00 UTC cron; texts/emails one reminder when a saved active drop's arrival is exactly 3 days out and `last_notified_at` is null.

- [ ] **Step 1: wrangler.toml**:

```toml
name = "saved-drops-cron"
main = "src/index.js"
compatibility_date = "2026-07-01"

[triggers]
crons = ["0 15 * * *"]
```

- [ ] **Step 2: src/index.js**:

```js
const SB_URL = 'https://uakybfvpamxablrzzetn.supabase.co';
const PROPS = { COOK: 'Cook House', ZINK: 'Zink Cabin', HILL4: 'Hill Studio', BARN: 'Barn Studio' };

function sbHeaders(env) {
  return { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };
}

export default {
  async scheduled(event, env, ctx) {
    const target = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    const rows = await fetch(
      `${SB_URL}/rest/v1/saved_drops?status=eq.active&arrival=eq.${target}&last_notified_at=is.null` +
      `&select=id,property_code,arrival,share_token,contacts(kind,value,is_test)`,
      { headers: sbHeaders(env) }).then(r => r.json());
    for (const row of rows) {
      const c = row.contacts;
      if (!c || c.is_test) continue;
      const label = `${(PROPS[row.property_code] || row.property_code).toUpperCase()} \u00b7 ${row.arrival}`;
      const link = `https://reset.club/?sv=${row.share_token}`;
      try {
        if (c.kind === 'phone') {
          await fetch('https://api.openphone.com/v1/messages', {
            method: 'POST',
            headers: { Authorization: env.OPENPHONE_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: env.OPENPHONE_FROM, to: [c.value], content: `Reset Club. Your saved window closes in 3 days: ${label}. ${link}` }),
          });
        } else {
          await fetch('https://a.klaviyo.com/api/events/', {
            method: 'POST',
            headers: { Authorization: `Klaviyo-API-Key ${env.KLAVIYO_API_KEY}`, 'Content-Type': 'application/json', revision: '2024-10-15' },
            body: JSON.stringify({ data: { type: 'event', attributes: {
              properties: { label, link, closes_in_days: 3 },
              metric: { data: { type: 'metric', attributes: { name: 'Saved Drop Closing' } } },
              profile: { data: { type: 'profile', attributes: { email: c.value } } },
            } } }),
          });
        }
        await fetch(`${SB_URL}/rest/v1/saved_drops?id=eq.${row.id}`, {
          method: 'PATCH', headers: sbHeaders(env),
          body: JSON.stringify({ last_notified_at: new Date().toISOString() }),
        });
      } catch (e) { console.log('reminder failed', row.id, e.message); }
    }
    console.log(`reminders processed: ${rows.length}`);
  },
};
```

- [ ] **Step 3: Deploy + secrets** (HUMAN STEP for secrets):

```bash
cd ~/drop-reset-club-worktree-summer-fix/workers/saved-drops-cron
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy
env -u CLOUDFLARE_API_TOKEN npx wrangler secret put SUPABASE_SERVICE_KEY
env -u CLOUDFLARE_API_TOKEN npx wrangler secret put OPENPHONE_API_KEY
env -u CLOUDFLARE_API_TOKEN npx wrangler secret put OPENPHONE_FROM
env -u CLOUDFLARE_API_TOKEN npx wrangler secret put KLAVIYO_API_KEY
```

Verify with a dry trigger: `env -u CLOUDFLARE_API_TOKEN npx wrangler tail saved-drops-cron` in one shell, `curl` nothing — instead run `npx wrangler dev --test-scheduled` locally OR wait for the next cron and check the tail shows `reminders processed: N`. Test rows are excluded by `is_test`.

- [ ] **Step 4: Commit**: `git add workers/ && git commit -m "feat(save): window-closing reminder cron worker"`

---

### Task 10: Staging gate — deploy.sh + smoke extension + cache-bust

**Files:**
- Create: `scripts/deploy.sh`
- Modify: `scripts/site-smoke.py` (save-sheet check), `v5/index.html` (cache-bust v248 → v249)

**Interfaces:**
- Consumes: `scripts/site-smoke.py` (accepts a base URL argument), staging URL `https://staging.drop-reset-club.pages.dev`.
- Produces: `./scripts/deploy.sh staging` and `./scripts/deploy.sh prod`; prod refuses unless HEAD passed staging.

- [ ] **Step 1: deploy.sh**:

```bash
#!/usr/bin/env bash
# Staging-gated deploy for drop-reset-club.
#   ./scripts/deploy.sh staging   deploy to staging + run smoke against it
#   ./scripts/deploy.sh prod      allowed only after this commit passed staging
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:?usage: deploy.sh staging|prod}"
SHA=$(git rev-parse HEAD)
PASS_FILE=".staging-passed"

if [ "$MODE" = "staging" ]; then
  env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy . --branch=staging
  python3 scripts/site-smoke.py https://staging.drop-reset-club.pages.dev
  echo "$SHA" > "$PASS_FILE"
  echo "staging PASS recorded for $SHA"
elif [ "$MODE" = "prod" ]; then
  if [ ! -f "$PASS_FILE" ] || [ "$(cat "$PASS_FILE")" != "$SHA" ]; then
    echo "REFUSED: HEAD ($SHA) has not passed staging smoke. Run ./scripts/deploy.sh staging first." >&2
    exit 1
  fi
  env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy . --branch=main
  python3 scripts/site-smoke.py https://reset.club
  echo "prod deployed + smoked: $SHA"
else
  echo "unknown mode: $MODE" >&2; exit 1
fi
```

`chmod +x scripts/deploy.sh`. Add `.staging-passed` to `.gitignore` (create or append).

- [ ] **Step 2: Smoke extension.** In `scripts/site-smoke.py`, at the end of Phase C (after the lane loop, before `finally`), add:

```python
    # Save sheet: opens and validates input
    print("\n=== Phase D: save sheet ===")
    load(BASE + "/")
    has_save = js("!!document.querySelector('.cap-btn')")
    if not has_save:
        fail("save button", "no .cap-btn rendered on homepage")
    else:
        js("document.querySelector('.cap-btn').click()")
        time.sleep(1)
        opened = js("!!document.querySelector('.cap-sheet.open')")
        if not opened:
            fail("save sheet", "clicking SAVE did not open the capture sheet")
        else:
            ok("save sheet opens")
            js("document.querySelector('.cap-sheet .cap-close').click()")
```

Also make BASE default respect an argument (it already does: `sys.argv[1]`).

- [ ] **Step 3: Cache-bust**: in `v5/index.html` change `/v5/app.js?v=248` → `/v5/app.js?v=249`.

- [ ] **Step 4: Full gate run**: `./scripts/deploy.sh staging` → expect ALL PASS including Phase D. Then `./scripts/deploy.sh prod` → deploys and prod smoke passes. (If Phase D fails on staging, prod stays untouched — that is the system working.)

- [ ] **Step 5: Commit**: `git add scripts/ v5/index.html .gitignore && git commit -m "feat(deploy): staging-gated deploy script + save-sheet smoke check + v249"`

---

### Task 11: PostHog dashboard + verification round-trip (orchestrator task)

**Files:** none (PostHog MCP + live checks)

- [ ] **Step 1: Live round-trip on prod** with a real test contact (Doug's phone `2122031247`): save a drop from reset.club, receive the SMS, open the `?sv=` link, confirm the pinned Saved section renders. Verify rows in Supabase (`is_test=false`, then mark that row `is_test=true` so it stays out of counts).

- [ ] **Step 2: Create insights + dashboard "Homepage Weekly"** via PostHog MCP: funnel (`$pageview` → `save_sheet_opened` → `save_created` → `booking_intent`), trends (identities/week = `save_created`+`share_sent`, `booking_intent`/week, `email_signup`/week), web overview bounce by device. Add all to one new dashboard.

- [ ] **Step 3: Annotate the release** in PostHog (annotation on deploy date: "Landing System v1 live") so next Monday's readout attributes changes.

- [ ] **Step 4: Push all commits** (`git push origin HEAD:main`), update `LIVE.md` State of Play + write the Obsidian session note (session-close skill).

---

## Self-Review Notes

- Spec §1 UX → Tasks 6; §2 schema → Task 1; §3 backend/delivery → Tasks 3–4; SSR link → Task 5; §4 personalization-lite → Task 7; §5 CRO quick wins → Task 8 (replay review is a Monday-loop activity, not code); §6 instrumentation/cadence → Tasks 6/8/11; §7 staging → Task 10; reminders → Task 9. Desktop replay diagnosis and the Monday ritual are operational, not tasks here.
- Type consistency: `createSave` returns `{status, body, savedId}` and share.js consumes it; token regex `[0-9A-Za-z]{12}` matches `makeToken`; event names match spec (`save_sheet_opened`, `save_created`, `share_sent`, `save_returned`; `share_opened` from spec is renamed → `save_returned` covers link-opens since both paths use `?sv=` — PostHog funnel uses `save_returned`).
- Grep-anchors are given where app.js line drift is likely; implementers must verify anchors before editing.
