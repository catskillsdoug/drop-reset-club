import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { readSession, sessionCookies } from '../functions/_session.js';
import { authMe } from '../functions/api/_auth.js';
import { onRequest } from '../functions/_middleware.js';

// One sign-in for every reset.club site (Doug, 28 Oct; platform/plans/2026-10-27-one-sign-in-plan.md): account.reset.club
// sets rc_at and rc_rt on .reset.club, and reset.club reads only that; the old host-only reset_session and its sign-in
// retired 28 Oct. A refreshed token goes back on .reset.club. The menu draws the one sign-in panel, phone and newsletter on.
const ENV = { SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_KEY: 'svc-key' };
const old = (s) => `reset_session=${encodeURIComponent(JSON.stringify(s))}`;
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
function mockFetch(routes) {
  return vi.fn(async (url, opts = {}) => {
    for (const [needle, handler] of routes) if (String(url).includes(needle)) return handler(String(url), opts);
    throw new Error(`unexpected fetch: ${url}`);
  });
}
beforeEach(() => vi.unstubAllGlobals());

describe('readSession', () => {
  it('reads the one session, and the old cookie is no session any more', () => { // Rewritten: the old sign-in retired (Doug, 28 Oct)
    expect(readSession(`a=1; rc_at=at-1; rc_rt=rt-1; ${old({ access_token: 'old-at', refresh_token: 'old-rt' })}`))
      .toEqual({ access_token: 'at-1', refresh_token: 'rt-1' });
    expect(readSession(old({ access_token: 'old-at', refresh_token: 'old-rt' }))).toBeNull();
  });
  it('an hour on, only rc_rt is left, and that is still a session', () => {
    expect(readSession('rc_rt=rt-1')).toEqual({ access_token: null, refresh_token: 'rt-1' });
  });
  it('nothing, or a broken old cookie, is no session', () => {
    expect(readSession('')).toBeNull();
    expect(readSession(null)).toBeNull();
  });
});

describe('sessionCookies', () => {
  const t = { access_token: 'at-2', refresh_token: 'rt-2', expires_in: 3600 };
  it('the one session goes back on .reset.club, as account.reset.club sets it', () => {
    const [at, rt] = sessionCookies(t, 'https://reset.club/v5/api/save-page');
    expect(at).toBe('rc_at=at-2; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax; Secure; Domain=.reset.club');
    expect(rt).toBe('rc_rt=rt-2; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax; Secure; Domain=.reset.club');
  });
  it('a preview host keeps it to itself', () => {
    for (const c of sessionCookies(t, 'https://abc.drop-reset-club.pages.dev/')) expect(c).not.toContain('Domain=');
  });
});

describe('/api/auth/me reads the one session', () => {
  it('signed in on a guide is signed in here, with the admin check by phone', async () => {
    vi.stubGlobal('fetch', mockFetch([
      ['/auth/v1/user', (u, o) => { expect(o.headers.Authorization).toBe('Bearer at-1'); return json({ id: 'u1', phone: '12122031247' }); }],
      ['/rest/v1/guests', () => json([])],
      ['/rest/v1/profiles', () => json([{ first_name: 'Doug' }])],
    ]));
    const r = await authMe(ENV, 'rc_at=at-1; rc_rt=rt-1', 'https://reset.club/api/auth/me');
    expect(r.body.authenticated).toBe(true);
    expect(r.body.isAdmin).toBe(true);
    expect(r.body.guest.firstName).toBe('Doug');
    expect(r.cookie).toBeUndefined();
  });
  it('with only rc_rt left, it refreshes and sets the one session again', async () => {
    const f = mockFetch([
      ['/auth/v1/token', (u, o) => { expect(JSON.parse(o.body)).toEqual({ refresh_token: 'rt-1' }); return json({ access_token: 'at-9', refresh_token: 'rt-9', expires_in: 3600 }); }],
      ['/auth/v1/user', (u, o) => { expect(o.headers.Authorization).toBe('Bearer at-9'); return json({ id: 'u1', email: 'maria@example.com' }); }],
      ['/rest/v1/', () => json([])],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await authMe(ENV, 'rc_rt=rt-1', 'https://reset.club/api/auth/me');
    expect(r.body.authenticated).toBe(true);
    expect(r.cookie).toEqual(sessionCookies({ access_token: 'at-9', refresh_token: 'rt-9', expires_in: 3600 }, 'https://reset.club/'));
  });
  it('me.js sends each cookie as its own header', async () => {
    vi.stubGlobal('fetch', mockFetch([
      ['/auth/v1/token', () => json({ access_token: 'at-9', refresh_token: 'rt-9', expires_in: 3600 })],
      ['/auth/v1/user', () => json({ id: 'u1', email: 'maria@example.com' })],
      ['/rest/v1/', () => json([])],
    ]));
    const { onRequestGet } = await import('../functions/api/auth/me.js');
    const res = await onRequestGet({ env: ENV, request: new Request('https://reset.club/api/auth/me', { headers: { cookie: 'rc_rt=rt-1' } }) });
    expect(res.headers.getSetCookie().map(c => c.split(';')[0])).toEqual(['rc_at=at-9', 'rc_rt=rt-9']);
  });
});

describe('admin saves read the one session', () => {
  const save = (cookie) => onRequest({
    env: ENV,
    request: new Request('https://reset.club/v5/api/save-page', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'about', title: 'About' }) }),
  });
  it('an admin signed in by phone through the panel can save, and a refresh goes back to .reset.club', async () => {
    vi.stubGlobal('fetch', mockFetch([
      ['/auth/v1/token', () => json({ access_token: 'at-9', refresh_token: 'rt-9', expires_in: 3600 })],
      ['/auth/v1/user', () => json({ id: 'u1', phone: '12122031247' })],
      ['/rest/v1/site_pages', (u, o) => { expect(o.method).toBe('PATCH'); return json(null, 204); }],
    ]));
    const res = await save('rc_rt=rt-1');
    expect(res.status).toBe(200);
    const set = res.headers.getSetCookie();
    expect(set).toEqual(sessionCookies({ access_token: 'at-9', refresh_token: 'rt-9', expires_in: 3600 }, 'https://reset.club/'));
  });
  it('someone who is not an admin cannot', async () => {
    vi.stubGlobal('fetch', mockFetch([
      ['/auth/v1/user', () => json({ id: 'u2', phone: '15559990000' })],
      ['/rest/v1/profiles', () => json([{ role: 'guest' }])],
    ]));
    expect((await save('rc_at=at-1; rc_rt=rt-1')).status).toBe(401);
  });
  it('no session is unauthorised, and nothing is asked of Supabase', async () => {
    const f = mockFetch([]);
    vi.stubGlobal('fetch', f);
    expect((await save('a=1')).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('every session read goes through readSession', () => {
  it('the middleware never parses reset_session itself', () => {
    const MW = readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
    expect(MW).not.toMatch(/cookies\.reset_session/);
    expect(MW.match(/readSession\(/g).length).toBeGreaterThanOrEqual(3);
  });
});

describe('the menu draws the one sign-in panel', () => {
  const APP = readFileSync(new URL('../v5/app.js', import.meta.url), 'utf8');
  const MW = readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
  const HTML = readFileSync(new URL('../v5/index.html', import.meta.url), 'utf8');
  for (const [where, src, surface] of [['the homepage', APP, 'home'], ['content pages', MW, 'content']]) {
    it(`${where}: phone and newsletter on, join.js out of the menu`, () => {
      expect(src).toContain(`surface: '${surface}', signIn: { phone: true, newsletter: true }`);
      expect(src).not.toContain('ResetJoin');
      expect(src).not.toContain("'rc-menu:join'");
    });
    it(`${where}: a new sign-in shows the name, and sign out forgets it, with no old session left to end`, () => { // Rewritten: the old sign-in retired (Doug, 28 Oct)
      expect(src).toMatch(/addEventListener\('rc-signin:done'[^\n]*__loggedInName = /);
      const out = src.slice(src.indexOf("addEventListener('rc-menu:signout'"));
      expect(out).toMatch(/^addEventListener\('rc-menu:signout', function\(\) \{ window\.__loggedInName = null; \}\);/);
      expect(src).not.toContain('/logout');
    });
  }
  it('no page loads join.js any more', () => {
    expect(HTML).not.toContain('/v5/join.js');
    expect(MW).not.toContain('/v5/join.js');
  });
});

describe('the old sign-in is gone', () => {
  const has = (f) => { try { readFileSync(new URL(`../${f}`, import.meta.url)); return true; } catch { return false; } };
  it('its code request, code check and logout routes, and join.js', () => {
    for (const f of ['functions/api/auth/request-otp.js', 'functions/api/auth/verify-otp.js', 'functions/api/auth/logout.js', 'v5/join.js']) expect(has(f), f).toBe(false);
    expect(readFileSync(new URL('../_headers', import.meta.url), 'utf8')).not.toContain('join.js');
  });
  it('/api/auth/me stays, as reset.club asks who is signed in, and the old cookie alone is signed out', async () => {
    const f = mockFetch([]);
    vi.stubGlobal('fetch', f);
    expect((await authMe(ENV, old({ access_token: 'old-at', refresh_token: 'old-rt' }))).body).toEqual({ authenticated: false });
    expect(f).not.toHaveBeenCalled();
    expect(has('functions/api/auth/me.js')).toBe(true);
  });
  it('nothing writes the old cookie', () => {
    for (const f of ['functions/_session.js', 'functions/api/_auth.js', 'functions/_middleware.js']) expect(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), f).not.toContain('reset_session=');
  });
});
