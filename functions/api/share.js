import { createSave } from './save.js';
import { normalizeContact } from './_lib.js';

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    // Recipient gets the saved drop + link.
    const recip = await createSave(context.env, {
      contact: body.to, property_code: body.property_code,
      arrival: body.arrival, source: 'share_recipient',
    });
    if (recip.status !== 200) return Response.json(recip.body, { status: recip.status });
    // Sharer (optional) is captured too, linked to the recipient's save.
    if (body.from_contact && normalizeContact(body.from_contact)) {
      await createSave(context.env, {
        contact: body.from_contact, property_code: body.property_code,
        arrival: body.arrival, source: 'save', shared_by_save_id: recip.savedId,
      });
    }
    return Response.json(recip.body, { status: 200 });
  } catch (e) {
    console.log('share error', e.message);
    return Response.json({ ok: false, error: 'server' }, { status: 500 });
  }
}
