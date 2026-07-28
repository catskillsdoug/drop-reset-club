import { authLogout } from '../_auth.js';

export async function onRequestPost(context) {
  const r = await authLogout(context.env, context.request.headers.get('cookie'));
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': r.cookie },
  });
}
