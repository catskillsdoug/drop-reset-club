import { normalizeContact, makeToken } from './_lib.js';
import { sbInsert } from './_supabase.js';
import { sendSMS, sendEmailEvent } from './_deliver.js';

const PROPS = { COOK: 'Cook House', ZINK: 'Zink Cabin', HILL4: 'Hill Studio', BARN: 'Barn Studio' };

function fmtDate(arrival) {
  const d = new Date(arrival + 'T12:00:00Z');
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${M[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export async function createSave(env, { contact, property_code, arrival, source, shared_by_save_id }) {
  const norm = normalizeContact(contact);
  if (!norm) return { status: 400, body: { ok: false, error: 'invalid_contact' } };
  if (!Object.prototype.hasOwnProperty.call(PROPS, property_code) || !/^\d{4}-\d{2}-\d{2}$/.test(arrival || '')) {
    return { status: 400, body: { ok: false, error: 'invalid_drop' } };
  }
  const row = await sbInsert(env, 'contacts',
    { kind: norm.kind, value: norm.value, source, is_test: env.ENVIRONMENT === 'staging' },
    { upsertOn: 'kind,value' });
  const token = makeToken();
  const saved = await sbInsert(env, 'saved_drops', {
    contact_id: row.id, property_code, arrival, share_token: token,
    shared_by_save_id: shared_by_save_id || null,
  });
  const link = `https://reset.club/?sv=${token}`;
  const label = `${PROPS[property_code].toUpperCase()} · ${fmtDate(arrival)}`;
  if (norm.kind === 'phone') {
    await sendSMS(env, norm.value, `Reset Club. Saved for later: ${label}. ${link}`);
  } else {
    await sendEmailEvent(env, norm.value, 'Saved Drop',
      { property_code, arrival, link, label });
  }
  return { status: 200, body: { ok: true, token }, savedId: saved.id };
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const res = await createSave(context.env, { ...body, source: 'save' });
    return Response.json(res.body, { status: res.status });
  } catch (e) {
    console.log('save error', e.message);
    return Response.json({ ok: false, error: 'server' }, { status: 500 });
  }
}
