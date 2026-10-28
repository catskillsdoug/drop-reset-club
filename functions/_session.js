// One sign-in for every reset.club site (Doug, 28 Oct; platform/plans/2026-10-27-one-sign-in-plan.md): account.reset.club
// sets the one session, rc_at and rc_rt on .reset.club, and reset.club reads it first. reset_session, the old host-only
// cookie, is read second until it retires. A refreshed token goes back to the cookie it came from.
const YEAR = 60 * 60 * 24 * 365;

export function parseCookies(header) {
  return Object.fromEntries((header || '').split(';').map((c) => {
    const [k, ...v] = c.trim().split('=');
    return [k, v.join('=')];
  }));
}

// { access_token, refresh_token, shared } or null. An hour on, rc_at has expired and only rc_rt is left.
export function readSession(cookieHeader) {
  const c = parseCookies(cookieHeader);
  if (c.rc_at || c.rc_rt) return { access_token: c.rc_at || null, refresh_token: c.rc_rt || null, shared: true };
  if (!c.reset_session) return null;
  try {
    const s = JSON.parse(decodeURIComponent(c.reset_session));
    return s && s.access_token ? { access_token: s.access_token, refresh_token: s.refresh_token || null, shared: false } : null;
  } catch { return null; }
}

// the Set-Cookie lines for refreshed tokens, written as account.reset.club writes them; a preview host keeps them to itself
export function sessionCookies(t, shared, url) {
  if (!shared) {
    const v = encodeURIComponent(JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token }));
    return [`reset_session=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`];
  }
  const host = new URL(url).hostname;
  const opts = `Path=/; HttpOnly; SameSite=Lax; Secure${host === 'reset.club' || host.endsWith('.reset.club') ? '; Domain=.reset.club' : ''}`;
  return [`rc_at=${t.access_token}; Max-Age=${t.expires_in || 3600}; ${opts}`, `rc_rt=${t.refresh_token}; Max-Age=${YEAR}; ${opts}`];
}
