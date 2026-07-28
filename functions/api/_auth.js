// OTP login for the join panel (v5/join.js). Send half gates on known contacts
// (guests/profiles/bookings) then lets Supabase auth deliver the code; verify
// half exchanges the code for a session and sets the site-standard
// reset_session cookie that the middleware admin/session checks already read.
import { normalizeContact } from './_lib.js';

const SB_URL = 'https://uakybfvpamxablrzzetn.supabase.co';

// Mirrors the middleware's ADMIN_PHONES — normalized to digits with country code.
const ADMIN_PHONES = ['12122031247', '19178921620'];

function anonHeaders(env) {
  return { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
}

async function sbRows(env, table, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!r.ok) return [];
  return r.json();
}

function contactQueries(contact, select) {
  if (contact.kind === 'phone') {
    const last10 = contact.value.replace(/\D/g, '').slice(-10);
    return [
      ['guests', `phone=ilike.*${last10}&select=${select}&limit=1`],
      ['profiles', `phone=ilike.*${last10}&select=${select}&limit=1`],
    ];
  }
  const em = encodeURIComponent(contact.value);
  const queries = [
    ['guests', `email=ilike.${em}&select=${select}&limit=1`],
    ['profiles', `email=ilike.${em}&select=${select}&limit=1`],
  ];
  // bookings carries guest_email, not email, and has no first_name
  if (select === 'id') queries.push(['bookings', `guest_email=ilike.${em}&select=id&limit=1`]);
  return queries;
}

async function isKnownContact(env, contact) {
  for (const [table, query] of contactQueries(contact, 'id')) {
    const rows = await sbRows(env, table, query);
    if (rows.length > 0) return true;
  }
  return false;
}

async function lookupFirstName(env, contact) {
  for (const [table, query] of contactQueries(contact, 'first_name')) {
    const rows = await sbRows(env, table, query);
    if (rows.length > 0 && rows[0].first_name) return rows[0].first_name;
  }
  return null;
}

export async function requestOtp(env, payload) {
  const contact = normalizeContact((payload && (payload.phone || payload.email)) || '');
  if (!contact) return { status: 400, body: { success: false, error: 'invalid_contact' } };

  if (!(await isKnownContact(env, contact))) {
    return { status: 404, body: { success: false, hint: 'join' } };
  }

  const otpBody = contact.kind === 'phone'
    ? { phone: contact.value, create_user: true }
    : { email: contact.value, create_user: true };
  const r = await fetch(`${SB_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: anonHeaders(env),
    body: JSON.stringify(otpBody),
  });
  if (!r.ok) return { status: 502, body: { success: false, error: 'otp_send_failed' } };
  return { status: 200, body: { success: true } };
}

export async function verifyOtp(env, payload) {
  const contact = normalizeContact((payload && (payload.phone || payload.email)) || '');
  const token = String((payload && payload.token) || '').trim();
  if (!contact || !/^\d{6,8}$/.test(token)) {
    return { status: 400, body: { success: false, error: 'invalid_request' } };
  }

  const verifyBody = contact.kind === 'phone'
    ? { type: 'sms', phone: contact.value, token }
    : { type: 'email', email: contact.value, token };
  const r = await fetch(`${SB_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: anonHeaders(env),
    body: JSON.stringify(verifyBody),
  });
  if (!r.ok) return { status: 401, body: { success: false, error: 'invalid_code' } };

  const session = await r.json();
  if (!session.access_token) return { status: 401, body: { success: false, error: 'invalid_code' } };

  let name = null;
  try { name = await lookupFirstName(env, contact); } catch { /* name is cosmetic */ }

  const cookieValue = encodeURIComponent(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }));
  return {
    status: 200,
    body: { success: true, user: { name } },
    cookie: sessionCookie(session),
  };
}

function sessionCookie(session) {
  const value = encodeURIComponent(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }));
  return `reset_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
}

// Session check for the join panel + inline editors (GET /api/auth/me).
// Reads the reset_session cookie, refreshes an expired access token once, and
// answers with the shape the injected scripts expect: { authenticated, guest }.
export async function authMe(env, cookieHeader) {
  const anon = { status: 200, body: { authenticated: false } };

  let session = null;
  try {
    const cookies = Object.fromEntries(
      (cookieHeader || '').split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );
    if (cookies.reset_session) session = JSON.parse(decodeURIComponent(cookies.reset_session));
  } catch { /* malformed cookie → unauthenticated */ }
  if (!session || !session.access_token) return anon;

  const fetchUser = (token) => fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });

  let userRes = await fetchUser(session.access_token);
  let refreshed = null;
  if (!userRes.ok && session.refresh_token) {
    const refreshRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: anonHeaders(env),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!refreshRes.ok) return anon;
    refreshed = await refreshRes.json();
    userRes = await fetchUser(refreshed.access_token);
  }
  if (!userRes.ok) return anon;

  const user = await userRes.json();
  const digits = String(user.phone || '').replace(/\D/g, '');
  const withCountry = digits.length === 10 ? '1' + digits : digits;
  const isAdmin = ADMIN_PHONES.includes(withCountry);

  let firstName = null;
  try {
    const contact = normalizeContact(user.phone ? `+${withCountry}` : (user.email || ''));
    if (contact) firstName = await lookupFirstName(env, contact);
  } catch { /* name is cosmetic */ }

  const result = {
    status: 200,
    body: { authenticated: true, isAdmin, guest: { firstName, name: firstName } },
  };
  if (refreshed) result.cookie = sessionCookie(refreshed);
  return result;
}
