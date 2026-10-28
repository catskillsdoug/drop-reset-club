// Who is signed in on reset.club (GET /api/auth/me), from the one session account.reset.club sets on .reset.club
// (Doug, 28 Oct). Signing in is the menu's panel against account.reset.club; the old code routes, join.js and the
// reset_session cookie retired 28 Oct.
import { normalizeContact } from './_lib.js';
import { readSession, sessionCookies } from '../_session.js';

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
  return queries;
}

async function lookupFirstName(env, contact) {
  for (const [table, query] of contactQueries(contact, 'first_name')) {
    const rows = await sbRows(env, table, query);
    if (rows.length > 0 && rows[0].first_name) return rows[0].first_name;
  }
  return null;
}

// Session check for the menu and the inline editors (GET /api/auth/me).
// Reads the one session, refreshes an expired access token once, and
// answers with the shape the injected scripts expect: { authenticated, guest }.
export async function authMe(env, cookieHeader, url = 'https://reset.club/') {
  const anon = { status: 200, body: { authenticated: false } };

  const session = readSession(cookieHeader);
  if (!session) return anon;

  const fetchUser = (token) => fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });

  let userRes = session.access_token ? await fetchUser(session.access_token) : null;
  let refreshed = null;
  if (!(userRes && userRes.ok) && session.refresh_token) {
    const refreshRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: anonHeaders(env),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!refreshRes.ok) return anon;
    refreshed = await refreshRes.json();
    userRes = await fetchUser(refreshed.access_token);
  }
  if (!userRes || !userRes.ok) return anon;

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
    body: {
      authenticated: true,
      isAdmin,
      guest: { firstName, name: firstName },
      // app.js's inline season-editing admin check reads user.phone
      user: { phone: user.phone || null, email: user.email || null },
    },
  };
  if (refreshed) result.cookie = sessionCookies(refreshed, url);
  return result;
}
