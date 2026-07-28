import { requestOtp } from '../_auth.js';

export async function onRequestPost(context) {
  let payload = null;
  try { payload = await context.request.json(); } catch { /* falls through to 400 */ }
  const r = await requestOtp(context.env, payload);
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
