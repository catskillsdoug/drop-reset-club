import { authMe } from '../_auth.js';

export async function onRequestGet(context) {
  const r = await authMe(context.env, context.request.headers.get('cookie'), context.request.url);
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  // the one session refreshes as two cookies, the old one as one
  for (const c of [].concat(r.cookie || [])) headers.append('Set-Cookie', c);
  return new Response(JSON.stringify(r.body), { status: r.status, headers });
}
