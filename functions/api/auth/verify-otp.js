import { verifyOtp } from '../_auth.js';

export async function onRequestPost(context) {
  let payload = null;
  try { payload = await context.request.json(); } catch { /* falls through to 400 */ }
  const r = await verifyOtp(context.env, payload);
  const headers = { 'Content-Type': 'application/json' };
  if (r.cookie) headers['Set-Cookie'] = r.cookie;
  return new Response(JSON.stringify(r.body), { status: r.status, headers });
}
