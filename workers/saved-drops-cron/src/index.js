const SB_URL = 'https://uakybfvpamxablrzzetn.supabase.co';
const PROPS = { COOK: 'Cook House', ZINK: 'Zink Cabin', HILL4: 'Hill Studio', BARN: 'Barn Studio' };

function sbHeaders(env) {
  return { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };
}

export default {
  async scheduled(event, env, ctx) {
    const target = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    const rows = await fetch(
      `${SB_URL}/rest/v1/saved_drops?status=eq.active&arrival=eq.${target}&last_notified_at=is.null` +
      `&select=id,property_code,arrival,share_token,contacts(kind,value,is_test)`,
      { headers: sbHeaders(env) }).then(r => r.json());
    for (const row of rows) {
      const c = row.contacts;
      if (!c || c.is_test) continue;
      const label = `${(PROPS[row.property_code] || row.property_code).toUpperCase()} · ${row.arrival}`;
      const link = `https://reset.club/?sv=${row.share_token}`;
      try {
        if (c.kind === 'phone') {
          // Sanctioned exception to the brand's no-"stop"-in-marketing-copy rule:
          // TCPA/CTIA compliance requires an opt-out instruction on every SMS.
          const smsRes = await fetch('https://api.openphone.com/v1/messages', {
            method: 'POST',
            headers: { Authorization: env.OPENPHONE_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: env.OPENPHONE_FROM, to: [c.value], content: `Reset Club. Your saved window closes in 3 days: ${label}. ${link} Reply STOP to opt out.` }),
          });
          if (!smsRes.ok) { console.log('reminder send failed', row.id, smsRes.status, await smsRes.text()); continue; }
        } else {
          const klavRes = await fetch('https://a.klaviyo.com/api/events/', {
            method: 'POST',
            headers: { Authorization: `Klaviyo-API-Key ${env.KLAVIYO_API_KEY}`, 'Content-Type': 'application/json', revision: '2024-10-15' },
            body: JSON.stringify({ data: { type: 'event', attributes: {
              properties: { label, link, closes_in_days: 3 },
              metric: { data: { type: 'metric', attributes: { name: 'Saved Drop Closing' } } },
              profile: { data: { type: 'profile', attributes: { email: c.value } } },
            } } }),
          });
          if (!klavRes.ok) { console.log('reminder send failed', row.id, klavRes.status, await klavRes.text()); continue; }
        }
        await fetch(`${SB_URL}/rest/v1/saved_drops?id=eq.${row.id}`, {
          method: 'PATCH', headers: sbHeaders(env),
          body: JSON.stringify({ last_notified_at: new Date().toISOString() }),
        });
      } catch (e) { console.log('reminder failed', row.id, e.message); }
    }
    console.log(`reminders processed: ${rows.length}`);
  },
};
