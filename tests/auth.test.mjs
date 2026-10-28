import { describe, it, expect, beforeEach, vi } from 'vitest';

const ENV = { SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_KEY: 'svc-key' };

// Route-aware fetch mock: handlers keyed by URL substring, first match wins.
function mockFetch(routes) {
  return vi.fn(async (url, opts = {}) => {
    for (const [needle, handler] of routes) {
      if (String(url).includes(needle)) return handler(String(url), opts);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

beforeEach(() => vi.unstubAllGlobals());

describe('authMe', () => {
  const cookieFor = (session) => `foo=1; rc_at=${session.access_token}; rc_rt=${session.refresh_token}; bar=2`; // Rewritten: the old sign-in retired, /me reads the one session (Doug, 28 Oct)

  it('reports unauthenticated with no cookie and no network calls', async () => {
    const { authMe } = await import('../functions/api/_auth.js');
    const f = mockFetch([]);
    vi.stubGlobal('fetch', f);
    const r = await authMe(ENV, '');
    expect(r).toEqual({ status: 200, body: { authenticated: false } });
    expect(f).not.toHaveBeenCalled();
  });

  it('returns guest name and isAdmin for a valid admin-phone session', async () => {
    const { authMe } = await import('../functions/api/_auth.js');
    const f = mockFetch([
      ['/auth/v1/user', (u, opts) => {
        expect(opts.headers.Authorization).toBe('Bearer at-1');
        return json({ id: 'u1', phone: '12122031247' });
      }],
      ['/rest/v1/guests', () => json([])],
      ['/rest/v1/profiles', () => json([{ first_name: 'Doug' }])],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await authMe(ENV, cookieFor({ access_token: 'at-1', refresh_token: 'rt-1' }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ authenticated: true, isAdmin: true, guest: { firstName: 'Doug', name: 'Doug' }, user: { phone: '12122031247', email: null } });
  });

  it('refreshes an expired session, re-issues the cookie, and marks non-admin phones', async () => {
    const { authMe } = await import('../functions/api/_auth.js');
    let userCalls = 0;
    const f = mockFetch([
      ['/auth/v1/user', () => (++userCalls === 1
        ? json({ error: 'expired' }, 401)
        : json({ id: 'u2', phone: '15559990000' }))],
      ['/auth/v1/token', (u, opts) => {
        expect(JSON.parse(opts.body)).toEqual({ refresh_token: 'rt-old' });
        return json({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 3600 });
      }],
      ['/rest/v1/', () => json([])],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await authMe(ENV, cookieFor({ access_token: 'at-old', refresh_token: 'rt-old' }));
    expect(r.status).toBe(200);
    expect(r.body.authenticated).toBe(true);
    expect(r.body.isAdmin).toBe(false);
    expect(r.cookie.map(c => c.split(';')[0])).toEqual(['rc_at=at-new', 'rc_rt=rt-new']); // Rewritten: the old sign-in retired, /me reads the one session (Doug, 28 Oct)
  });

  it('reports unauthenticated when the refresh also fails', async () => {
    const { authMe } = await import('../functions/api/_auth.js');
    const f = mockFetch([
      ['/auth/v1/user', () => json({ error: 'expired' }, 401)],
      ['/auth/v1/token', () => json({ error: 'invalid' }, 400)],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await authMe(ENV, cookieFor({ access_token: 'at-old', refresh_token: 'rt-old' }));
    expect(r).toEqual({ status: 200, body: { authenticated: false } });
  });
});
