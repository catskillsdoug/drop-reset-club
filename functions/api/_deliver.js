// Guest-facing delivery. On staging, log instead of send — never text real people
// from a preview deploy.
export async function sendSMS(env, to, body) {
  if (env.ENVIRONMENT === 'staging') {
    console.log('[staging] SMS suppressed', { to, body });
    return { ok: true, skipped: true };
  }
  const r = await fetch('https://api.openphone.com/v1/messages', {
    method: 'POST',
    headers: { Authorization: env.OPENPHONE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.OPENPHONE_FROM, to: [to], content: body }),
  });
  if (!r.ok) {
    console.log('openphone error', r.status, await r.text());
    return { ok: false };
  }
  return { ok: true };
}

export async function sendEmailEvent(env, email, eventName, props) {
  if (env.ENVIRONMENT === 'staging') {
    console.log('[staging] Klaviyo suppressed', { email, eventName });
    return { ok: true, skipped: true };
  }
  const r = await fetch('https://a.klaviyo.com/api/events/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${env.KLAVIYO_API_KEY}`,
      'Content-Type': 'application/json',
      revision: '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          properties: props,
          metric: { data: { type: 'metric', attributes: { name: eventName } } },
          profile: { data: { type: 'profile', attributes: { email } } },
        },
      },
    }),
  });
  if (!r.ok) {
    console.log('klaviyo error', r.status, await r.text());
    return { ok: false };
  }
  return { ok: true };
}
