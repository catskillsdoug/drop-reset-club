import { authMe } from '../_auth.js';

export async function onRequestGet(context) {
  const r = await authMe(context.env, context.request.headers.get('cookie'));
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (r.cookie) headers['Set-Cookie'] = r.cookie;
  return new Response(JSON.stringify(r.body), { status: r.status, headers });
}
