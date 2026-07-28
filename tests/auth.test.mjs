import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestOtp, verifyOtp } from '../functions/api/_auth.js';

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

describe('requestOtp', () => {
  it('rejects a malformed contact without touching the network', async () => {
    const f = mockFetch([]);
    vi.stubGlobal('fetch', f);
    const r = await requestOtp(ENV, { phone: '12' });
    expect(r).toEqual({ status: 400, body: { success: false, error: 'invalid_contact' } });
    expect(f).not.toHaveBeenCalled();
  });

  it('returns hint join for an unknown contact and never sends an OTP', async () => {
    const f = mockFetch([
      ['/rest/v1/', () => json([])],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await requestOtp(ENV, { phone: '212 203 1247' });
    expect(r).toEqual({ status: 404, body: { success: false, hint: 'join' } });
    expect(f.mock.calls.some(([u]) => String(u).includes('/auth/v1/otp'))).toBe(false);
  });

  it('sends a phone OTP for a known guest, matching on last 10 digits', async () => {
    const f = mockFetch([
      ['/rest/v1/guests', (u) => {
        expect(u).toContain('phone=ilike.*2122031247');
        return json([{ id: 'g1' }]);
      }],
      ['/auth/v1/otp', (u, opts) => {
        expect(JSON.parse(opts.body)).toEqual({ phone: '+12122031247', create_user: true });
        expect(opts.headers.apikey).toBe('anon-key');
        return json({});
      }],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await requestOtp(ENV, { phone: '(212) 203-1247' });
    expect(r).toEqual({ status: 200, body: { success: true } });
  });

  it('sends an email OTP for a known booking email', async () => {
    const f = mockFetch([
      ['/rest/v1/guests', () => json([])],
      ['/rest/v1/profiles', () => json([])],
      ['/rest/v1/bookings', (u) => {
        expect(u).toContain('guest_email=');
        return json([{ id: 'b1' }]);
      }],
      ['/auth/v1/otp', (u, opts) => {
        expect(JSON.parse(opts.body)).toEqual({ email: 'doug@reset.club', create_user: true });
        return json({});
      }],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await requestOtp(ENV, { email: 'Doug@Reset.club' });
    expect(r).toEqual({ status: 200, body: { success: true } });
  });

  it('maps a Supabase send failure to 502', async () => {
    const f = mockFetch([
      ['/rest/v1/guests', () => json([{ id: 'g1' }])],
      ['/auth/v1/otp', () => json({ error: 'sms provider down' }, 500)],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await requestOtp(ENV, { phone: '212 203 1247' });
    expect(r).toEqual({ status: 502, body: { success: false, error: 'otp_send_failed' } });
  });
});

describe('verifyOtp', () => {
  it('rejects a malformed token without touching the network', async () => {
    const f = mockFetch([]);
    vi.stubGlobal('fetch', f);
    const r = await verifyOtp(ENV, { phone: '212 203 1247', token: 'abc' });
    expect(r.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('maps a bad code to 401 invalid_code', async () => {
    const f = mockFetch([
      ['/auth/v1/verify', () => json({ error: 'otp expired' }, 403)],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await verifyOtp(ENV, { phone: '212 203 1247', token: '123456' });
    expect(r).toEqual({ status: 401, body: { success: false, error: 'invalid_code' } });
  });

  it('verifies sms type for phones, sets the reset_session cookie, returns first name', async () => {
    const f = mockFetch([
      ['/auth/v1/verify', (u, opts) => {
        expect(JSON.parse(opts.body)).toEqual({ type: 'sms', phone: '+12122031247', token: '123456' });
        return json({ access_token: 'at-1', refresh_token: 'rt-1', user: { id: 'u1' } });
      }],
      ['/rest/v1/guests', () => json([{ first_name: 'Doug' }])],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await verifyOtp(ENV, { phone: '(212) 203-1247', token: '123456' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, user: { name: 'Doug' } });
    const cookieVal = JSON.parse(decodeURIComponent(r.cookie.match(/^reset_session=([^;]+);/)[1]));
    expect(cookieVal).toEqual({ access_token: 'at-1', refresh_token: 'rt-1' });
    expect(r.cookie).toContain('HttpOnly');
    expect(r.cookie).toContain('SameSite=Lax');
    expect(r.cookie).toContain('Path=/');
  });

  it('verifies email type for emails and still succeeds when no name is found', async () => {
    const f = mockFetch([
      ['/auth/v1/verify', (u, opts) => {
        expect(JSON.parse(opts.body)).toEqual({ type: 'email', email: 'doug@reset.club', token: '654321' });
        return json({ access_token: 'at-2', refresh_token: 'rt-2', user: { id: 'u1' } });
      }],
      ['/rest/v1/', () => json([])],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await verifyOtp(ENV, { email: 'doug@reset.club', token: '654321' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, user: { name: null } });
  });

  it('treats a 200 without an access_token as a failed verify', async () => {
    const f = mockFetch([
      ['/auth/v1/verify', () => json({ msg: 'ok but empty' })],
    ]);
    vi.stubGlobal('fetch', f);
    const r = await verifyOtp(ENV, { phone: '212 203 1247', token: '123456' });
    expect(r).toEqual({ status: 401, body: { success: false, error: 'invalid_code' } });
  });
});
