// One sign-in for every reset.club site (Doug, 28 Oct; platform/plans/2026-10-27-one-sign-in-plan.md): account.reset.club
// sets the one session, rc_at and rc_rt on .reset.club, and reset.club reads it. The old host-only reset_session retired
// 28 Oct. A refreshed token goes back on .reset.club, as account.reset.club writes it.
const YEAR = 60 * 60 * 24 * 365;

export function parseCookies(header) {
  return Object.fromEntries((header || '').split(';').map((c) => {
    const [k, ...v] = c.trim().split('=');
    return [k, v.join('=')];
  }));
}

// { access_token, refresh_token } or null. An hour on, rc_at has expired and only rc_rt is left.
export function readSession(cookieHeader) {
  const c = parseCookies(cookieHeader);
  return c.rc_at || c.rc_rt ? { access_token: c.rc_at || null, refresh_token: c.rc_rt || null } : null;
}

// the Set-Cookie lines for refreshed tokens; a preview host keeps them to itself
export function sessionCookies(t, url) {
  const host = new URL(url).hostname;
  const opts = `Path=/; HttpOnly; SameSite=Lax; Secure${host === 'reset.club' || host.endsWith('.reset.club') ? '; Domain=.reset.club' : ''}`;
  return [`rc_at=${t.access_token}; Max-Age=${t.expires_in || 3600}; ${opts}`, `rc_rt=${t.refresh_token}; Max-Age=${YEAR}; ${opts}`];
}
