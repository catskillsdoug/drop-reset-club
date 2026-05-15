// Middleware to inject dynamic OG meta tags based on URL parameters

// Dashboard password - set via environment variable DASH_PASSWORD
const DASH_REALM = 'Reset Home Dashboard';

const ADMIN_PHONES = ['12122031247', '19178921620'];

async function checkAdminSession(context) {
  const r = await checkAdminSessionDetail(context);
  return r.ok;
}

async function checkAdminSessionDetail(context) {
  try {
    const cookies = Object.fromEntries(
      (context.request.headers.get('cookie') || '').split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );
    if (!cookies.reset_session) {
      const hdr = context.request.headers.get('cookie') || '';
      const names = Object.keys(cookies).join(',') || '(none)';
      return { ok: false, reason: 'no-cookie', detail: 'names=' + names + ' hdr_len=' + hdr.length };
    }
    let session;
    try { session = JSON.parse(decodeURIComponent(cookies.reset_session)); }
    catch (e) { return { ok: false, reason: 'cookie-parse', detail: e.message }; }
    if (!session.access_token) return { ok: false, reason: 'no-access-token' };
    const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
    const sbKey = context.env.SUPABASE_ANON_KEY || context.env.SUPABASE_SERVICE_KEY;
    let userRes = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { 'apikey': sbKey, 'Authorization': `Bearer ${session.access_token}` },
    });
    if (!userRes.ok && session.refresh_token) {
      const refreshRes = await fetch(`${sbUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': sbKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (refreshRes.ok) {
        const newSession = await refreshRes.json();
        userRes = await fetch(`${sbUrl}/auth/v1/user`, {
          headers: { 'apikey': sbKey, 'Authorization': `Bearer ${newSession.access_token}` },
        });
        if (userRes.ok) context.__refreshedSession = newSession;
      } else {
        return { ok: false, reason: 'refresh-failed', detail: 'status=' + refreshRes.status };
      }
    }
    if (!userRes.ok) return { ok: false, reason: 'auth-user-fetch', detail: 'status=' + userRes.status };
    const user = await userRes.json();
    const phone = (user.phone || '').replace(/\D/g, '');
    const withCountry = phone.length === 10 ? '1' + phone : phone;
    if (ADMIN_PHONES.includes(withCountry)) return { ok: true, user };

    // Phone didn't match. Fall back to profiles.role='admin' check (Supabase service-role lookup).
    const svcKey = context.env.SUPABASE_SERVICE_KEY;
    if (svcKey && user.id) {
      const profRes = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`, {
        headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`, 'Accept': 'application/json' },
      });
      if (profRes.ok) {
        const profs = await profRes.json();
        if (profs.length && profs[0].role === 'admin') return { ok: true, user };
        return { ok: false, reason: 'not-admin', detail: 'id=' + user.id + ' phone=' + JSON.stringify(user.phone) + ' role=' + (profs.length ? profs[0].role : 'null') };
      }
      return { ok: false, reason: 'profiles-lookup', detail: 'status=' + profRes.status };
    }
    return { ok: false, reason: 'not-admin', detail: 'phone=' + JSON.stringify(user.phone) + ' withCountry=' + withCountry };
  } catch (e) { return { ok: false, reason: 'exception', detail: e.message }; }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Admin save season API — uses Supabase auth session from cookie
  if ((url.pathname === '/v5/api/save-season' || url.pathname === '/n/api/save-season') && context.request.method === 'POST') {
    const adminCheck = await checkAdminSession(context);
    if (!adminCheck) return new Response('Unauthorized', { status: 401 });
    try {
      const { slug, name, description } = await context.request.json();
      if (!slug) return new Response('Missing slug', { status: 400 });
      const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
      const svcKey = context.env.SUPABASE_SERVICE_KEY;
      if (!svcKey) return new Response('No service key', { status: 500 });
      const patch = {};
      if (name !== undefined) patch.name = name;
      if (description !== undefined) patch.description = description;
      const res = await fetch(`${sbUrl}/rest/v1/season_windows?slug=eq.${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return new Response('Save failed: ' + await res.text(), { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  }

  // Admin save page API — uses Supabase auth session from cookie.
  // Accepts: { slug (required), body?, title?, nav_group?, nav_order?, external_url?, is_published? }
  // Only the fields present in the request are updated.
  if ((url.pathname === '/v5/api/save-page' || url.pathname === '/n/api/save-page') && context.request.method === 'POST') {
    const adminCheck = await checkAdminSession(context);
    if (!adminCheck) return new Response('Unauthorized', { status: 401 });
    try {
      const payload = await context.request.json();
      const { slug } = payload;
      if (!slug) return new Response('Missing slug', { status: 400 });

      const update = { updated_at: new Date().toISOString() };
      const updatable = ['body', 'title', 'nav_group', 'nav_order', 'external_url', 'is_published'];
      for (const k of updatable) {
        if (Object.prototype.hasOwnProperty.call(payload, k)) update[k] = payload[k];
      }
      if (Object.keys(update).length === 1) {
        return new Response('Nothing to update', { status: 400 });
      }

      const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
      const svcKey = context.env.SUPABASE_SERVICE_KEY;
      if (!svcKey) return new Response('No service key', { status: 500 });
      const res = await fetch(`${sbUrl}/rest/v1/site_pages?slug=eq.${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(update),
      });
      if (!res.ok) return new Response('Save failed: ' + await res.text(), { status: 500 });
      const pageHeaders = { 'Content-Type': 'application/json' };
      if (context.__refreshedSession) {
        const cv = JSON.stringify({ access_token: context.__refreshedSession.access_token, refresh_token: context.__refreshedSession.refresh_token });
        pageHeaders['Set-Cookie'] = `reset_session=${encodeURIComponent(cv)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
      }
      return new Response(JSON.stringify({ ok: true }), { headers: pageHeaders });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  }

  // Admin save nav group API — atomic sync of all rows in a nav_group.
  // Body: { group: 'about', items: [{ id?, title, slug?, external_url?, nav_order, is_published? }] }
  // Rules:
  //   - items with id → PATCH (update title, slug, external_url, nav_order, is_published)
  //   - items without id → INSERT (slug auto-generated as nav/<group>/<rand> if not supplied)
  //   - rows in DB with nav_group=group whose id is NOT in payload → DELETE
  if ((url.pathname === '/v5/api/save-nav-group' || url.pathname === '/n/api/save-nav-group') && context.request.method === 'POST') {
    const adminCheck = await checkAdminSessionDetail(context);
    if (!adminCheck.ok) return new Response('Unauthorized (' + adminCheck.reason + (adminCheck.detail ? ': ' + adminCheck.detail : '') + ')', { status: 401 });
    try {
      const { group, items } = await context.request.json();
      if (!group) return new Response('Missing group', { status: 400 });
      if (!Array.isArray(items)) return new Response('Missing items', { status: 400 });

      const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
      const svcKey = context.env.SUPABASE_SERVICE_KEY;
      if (!svcKey) return new Response('No service key', { status: 500 });
      const sbHeaders = { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`, 'Content-Type': 'application/json' };

      // Existing rows in this group, plus rows referenced by slug in the payload
      // (so a "new" item whose slug already exists can be promoted to an update).
      const payloadSlugs = items.map(i => i.slug).filter(Boolean);
      const groupRes = await fetch(
        `${sbUrl}/rest/v1/site_pages?nav_group=eq.${encodeURIComponent(group)}&select=id,slug`,
        { headers: sbHeaders },
      );
      if (!groupRes.ok) return new Response('Lookup failed: ' + await groupRes.text(), { status: 500 });
      const groupRows = await groupRes.json();
      let slugRows = [];
      if (payloadSlugs.length) {
        const inList = payloadSlugs.map(s => `"${s.replace(/"/g, '%22')}"`).join(',');
        const slugRes = await fetch(
          `${sbUrl}/rest/v1/site_pages?slug=in.(${encodeURIComponent(inList)})&select=id,slug`,
          { headers: sbHeaders },
        );
        if (slugRes.ok) slugRows = await slugRes.json();
      }
      const slugToId = new Map();
      for (const r of [...groupRows, ...slugRows]) slugToId.set(r.slug, r.id);
      const existingIds = new Set(groupRows.map(r => r.id));
      const keepIds = new Set();
      // First pass: resolve any item without id but whose slug matches an existing row.
      for (const item of items) {
        if (!item.id && item.slug && slugToId.has(item.slug)) item.id = slugToId.get(item.slug);
        if (item.id) keepIds.add(item.id);
      }
      const deleteIds = [...existingIds].filter(id => !keepIds.has(id));

      const errors = [];
      const nowIso = new Date().toISOString();

      // Updates / inserts
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const order = typeof item.nav_order === 'number' ? item.nav_order : i + 1;
        if (item.id) {
          // PATCH — never touch body here; nav editor doesn't own page content.
          const patch = {
            title: item.title,
            nav_group: group,
            nav_order: order,
            external_url: item.external_url || null,
            is_published: item.is_published !== false,
            updated_at: nowIso,
          };
          if (item.slug) patch.slug = item.slug;
          const r = await fetch(`${sbUrl}/rest/v1/site_pages?id=eq.${encodeURIComponent(item.id)}`, {
            method: 'PATCH',
            headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify(patch),
          });
          if (!r.ok) errors.push(`update ${item.id}: ${await r.text()}`);
        } else {
          // INSERT: derive slug if not given (must be unique).
          const slug = item.slug || `nav/${group}/${Math.random().toString(36).slice(2, 8)}`;
          const insert = {
            slug,
            title: item.title || 'Untitled',
            body: '',
            nav_group: group,
            nav_order: order,
            external_url: item.external_url || null,
            is_published: item.is_published !== false,
          };
          const r = await fetch(`${sbUrl}/rest/v1/site_pages`, {
            method: 'POST',
            headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify(insert),
          });
          if (!r.ok) errors.push(`insert ${slug}: ${await r.text()}`);
        }
      }

      // Deletes
      for (const id of deleteIds) {
        const r = await fetch(`${sbUrl}/rest/v1/site_pages?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        });
        if (!r.ok) errors.push(`delete ${id}: ${await r.text()}`);
      }

      if (errors.length) return new Response('Partial failure: ' + errors.join('; '), { status: 500 });

      const respHeaders = { 'Content-Type': 'application/json' };
      if (context.__refreshedSession) {
        const cv = JSON.stringify({ access_token: context.__refreshedSession.access_token, refresh_token: context.__refreshedSession.refresh_token });
        respHeaders['Set-Cookie'] = `reset_session=${encodeURIComponent(cv)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
      }
      return new Response(JSON.stringify({ ok: true, updated: items.length, deleted: deleteIds.length }), { headers: respHeaders });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  }

  // Public contact form submission. No auth required; anti-spam via honeypot + min-time + CF threat score.
  if ((url.pathname === '/v5/api/contact' || url.pathname === '/n/api/contact') && context.request.method === 'POST') {
    try {
      const payload = await context.request.json().catch(() => null);
      if (!payload) return new Response(JSON.stringify({ ok: false, error: 'invalid body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

      // 1. Honeypot — if filled, silently accept (don't tell bots they failed).
      if (payload.website && String(payload.website).trim().length > 0) {
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      // 2. Min-time — page must have been open ≥ 3s before submit.
      const renderedAt = Number(payload._t);
      const now = Date.now();
      if (!renderedAt || now - renderedAt < 3000) {
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      // 3. CF threat score — drop anything ≥ 30.
      const cf = context.request.cf || {};
      const threatScore = typeof cf.threatScore === 'number' ? cf.threatScore : null;
      if (threatScore !== null && threatScore >= 30) {
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      // 4. Required-field validation.
      const name = String(payload.name || '').trim().slice(0, 200);
      const email = String(payload.email || '').trim().slice(0, 200);
      const message = String(payload.message || '').trim().slice(0, 5000);
      if (!name || !email || !message) {
        return new Response(JSON.stringify({ ok: false, error: 'Please fill out every field.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ ok: false, error: 'Please enter a valid email address.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      // 5. Optional: capture user_id if logged in.
      let userId = null;
      const cookies = Object.fromEntries(
        (context.request.headers.get('cookie') || '').split(';').map(c => {
          const [k, ...v] = c.trim().split('=');
          return [k, v.join('=')];
        })
      );
      const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
      const sbAnon = context.env.SUPABASE_ANON_KEY || context.env.SUPABASE_SERVICE_KEY;
      if (cookies.reset_session && sbAnon) {
        try {
          const session = JSON.parse(decodeURIComponent(cookies.reset_session));
          if (session.access_token) {
            const uRes = await fetch(`${sbUrl}/auth/v1/user`, {
              headers: { 'apikey': sbAnon, 'Authorization': `Bearer ${session.access_token}` },
            });
            if (uRes.ok) { const u = await uRes.json(); userId = u.id || null; }
          }
        } catch {}
      }

      const svcKey = context.env.SUPABASE_SERVICE_KEY;
      if (!svcKey) return new Response(JSON.stringify({ ok: false, error: 'Server misconfigured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

      const row = {
        name,
        email,
        message,
        source_url: payload.source_url ? String(payload.source_url).slice(0, 500) : null,
        user_id: userId,
        user_agent: (context.request.headers.get('user-agent') || '').slice(0, 500) || null,
        ip: context.request.headers.get('cf-connecting-ip') || null,
        cf_threat_score: threatScore,
      };

      const insertRes = await fetch(`${sbUrl}/rest/v1/contact_submissions`, {
        method: 'POST',
        headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(row),
      });
      if (!insertRes.ok) {
        const t = await insertRes.text();
        console.error('contact insert failed:', t);
        return new Response(JSON.stringify({ ok: false, error: 'Could not save your message. Try again?' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      // Fan-out: email hello@reset.club + SMS ops. Best-effort, parallel, never
      // fails the user-facing response. Both go through the ops-digest hub.
      const inboxAddress = 'hello@reset.club';
      const alertToken = context.env.INTERNAL_ALERT_TOKEN;
      let emailDelivered = false;
      if (alertToken) {
        const emailBody = `From: ${name} <${email}>\nSource: ${row.source_url || '(unknown)'}\n\n${message}`;
        const subjectPreview = message.replace(/\s+/g, ' ').slice(0, 60);
        const emailPromise = fetch('https://hnd.reset.club/internal/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Token': alertToken },
          body: JSON.stringify({
            to: inboxAddress,
            replyTo: email,
            subject: `Reset Club contact: ${name} — ${subjectPreview}`,
            body: emailBody,
          }),
        }).then(r => { emailDelivered = r.ok; if (!r.ok) console.error('email fan-out failed:', r.status); })
          .catch(err => console.error('email fan-out error:', err.message));

        const smsBody = `Reset Club contact from ${name} (${email}) — emailed ${inboxAddress}. "${message.slice(0, 80)}${message.length > 80 ? '…' : ''}"`;
        const smsPromise = fetch('https://hnd.reset.club/internal/alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Token': alertToken },
          body: JSON.stringify({ message: smsBody, audience: 'ops' }),
        }).then(r => { if (!r.ok) console.error('sms fan-out failed:', r.status); })
          .catch(err => console.error('sms fan-out error:', err.message));

        await Promise.allSettled([emailPromise, smsPromise]);
      } else {
        console.warn('contact: INTERNAL_ALERT_TOKEN not set; skipping email/SMS fan-out');
      }

      return new Response(
        JSON.stringify({ ok: true, deliveredTo: emailDelivered ? inboxAddress : null }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: 'Error: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Admin save news API
  if ((url.pathname === '/v5/api/save-news' || url.pathname === '/n/api/save-news') && context.request.method === 'POST') {
    const adminCheck = await checkAdminSession(context);
    if (!adminCheck) return new Response('Unauthorized', { status: 401 });
    try {
      const payload = await context.request.json();
      const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
      const svcKey = context.env.SUPABASE_SERVICE_KEY;
      if (!svcKey) return new Response('No service key', { status: 500 });
      const headers = { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };

      if (payload.id) {
        // Update existing
        const { id, ...fields } = payload;
        const res = await fetch(`${sbUrl}/rest/v1/news_posts?id=eq.${id}`, {
          method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(fields),
        });
        if (!res.ok) return new Response('Save failed: ' + await res.text(), { status: 500 });
      } else {
        // Create new
        const res = await fetch(`${sbUrl}/rest/v1/news_posts`, {
          method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return new Response('Create failed: ' + await res.text(), { status: 500 });
        const created = await res.json();
        return new Response(JSON.stringify({ ok: true, post: created[0] }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  }

  // Toggle media.marketing_allowed=true so the picker promotes it from the
  // "all" pool to the featured set. Admin-only.
  if ((url.pathname === '/v5/api/approve-media' || url.pathname === '/n/api/approve-media') && context.request.method === 'POST') {
    const adminCheck = await checkAdminSession(context);
    if (!adminCheck) return new Response('Unauthorized', { status: 401 });
    try {
      const { id } = await context.request.json();
      if (!id) return new Response('Missing id', { status: 400 });
      const sbUrl = context.env.SUPABASE_URL;
      const svcKey = context.env.SUPABASE_SERVICE_KEY;
      if (!svcKey) return new Response('No service key', { status: 500 });
      const res = await fetch(`${sbUrl}/rest/v1/media?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ marketing_allowed: true }),
      });
      if (!res.ok) return new Response('Approve failed: ' + await res.text(), { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response('Error: ' + (e.message || e), { status: 500 });
    }
  }

  // Admin media upload — receives a file + metadata, stores to R2, registers
  // a media row, returns the row so the editor can insert it inline.
  if ((url.pathname === '/v5/api/upload-media' || url.pathname === '/n/api/upload-media') && context.request.method === 'POST') {
    const adminCheck = await checkAdminSession(context);
    if (!adminCheck) return new Response('Unauthorized', { status: 401 });
    if (!context.env.MEDIA_BUCKET) return new Response('R2 binding missing', { status: 500 });
    try {
      const form = await context.request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return new Response('Missing file', { status: 400 });
      const contentType = file.type || 'image/jpeg';
      if (!contentType.startsWith('image/')) return new Response('File must be an image', { status: 400 });
      const caption = (form.get('caption') || '').toString().trim() || null;
      const credit = (form.get('credit') || '').toString().trim() || null;
      const creditUrl = (form.get('credit_url') || '').toString().trim() || null;
      const altText = (form.get('alt_text') || '').toString().trim() || caption || null;
      const category = (form.get('category') || '').toString().trim() || 'news';

      const id = crypto.randomUUID();
      const extByType = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
      const ext = extByType[contentType.toLowerCase()] || 'jpg';
      const r2Key = `news/${id}.${ext}`;
      const bytes = await file.arrayBuffer();

      await context.env.MEDIA_BUCKET.put(r2Key, bytes, { httpMetadata: { contentType } });

      const r2Url = `https://pub-e11155ba60cf4f258fb0e4e599e2ed1f.r2.dev/${r2Key}`;
      const sbUrl = context.env.SUPABASE_URL;
      const svcKey = context.env.SUPABASE_SERVICE_KEY;
      if (!svcKey) return new Response('No service key', { status: 500 });
      const insertRes = await fetch(`${sbUrl}/rest/v1/media`, {
        method: 'POST',
        headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          id,
          type: 'photo',
          r2_key: r2Key,
          r2_url: r2Url,
          content_type: contentType,
          file_size: bytes.byteLength,
          category,
          alt_text: altText,
          caption,
          credit,
          credit_url: creditUrl,
          marketing_allowed: true,
          source: 'editor-upload',
        }),
      });
      if (!insertRes.ok) {
        const err = await insertRes.text();
        return new Response('DB insert failed: ' + err, { status: 500 });
      }
      const rows = await insertRes.json();
      return new Response(JSON.stringify({ ok: true, media: rows[0] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response('Upload error: ' + (e.message || e), { status: 500 });
    }
  }

  // Password protect /dash routes
  if (url.pathname.startsWith('/dash')) {
    const authResult = checkBasicAuth(context.request, context.env);
    if (!authResult.authorized) {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': `Basic realm="${DASH_REALM}", charset="UTF-8"`,
        },
      });
    }
  }

  // Debug endpoint
  if (url.pathname === '/debug-path') {
    return new Response(JSON.stringify({ pathname: url.pathname, href: url.href }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // OG image for v5 — handled entirely in middleware
  if (url.pathname === '/v5/og' || url.pathname === '/ogv5') {
    try {
      return handleV5OgImage(url);
    } catch (e) {
      return new Response('OG Error: ' + e.message, { status: 500 });
    }
  }

  // Sitemap.xml — generated dynamically
  if (url.pathname === '/sitemap.xml' || url.pathname === '/v5/sitemap.xml') {
    return handleSitemap();
  }

  // API routes — pass through to Pages Functions (not ASSETS)
  // /v5/api/ comes from the proxy (reset.club/n/api/ → drop.reset.club/v5/api/)
  if (url.pathname.startsWith('/v5/api/')) {
    const apiUrl = new URL(context.request.url);
    apiUrl.hostname = 'drop.reset.club';
    apiUrl.pathname = url.pathname.replace(/^\/v5/, '');
    return fetch(new Request(apiUrl, {
      method: context.request.method,
      headers: context.request.headers,
      body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
    }));
  }
  if (url.pathname.startsWith('/api/')) {
    return context.next();
  }

  // Check auth session for content pages
  let userName = null;
  let userEmail = null;
  let isAdmin = false;
  try {
    const cookies = Object.fromEntries(
      (context.request.headers.get('cookie') || '').split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );
    if (cookies.reset_session) {
      const session = JSON.parse(decodeURIComponent(cookies.reset_session));
      if (session.access_token) {
        const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
        const sbKey = context.env.SUPABASE_ANON_KEY || context.env.SUPABASE_SERVICE_KEY;
        // Look up guest name from the auth user's phone/email
        const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
          headers: { 'apikey': sbKey, 'Authorization': `Bearer ${session.access_token}` },
        });
        if (userRes.ok) {
          const user = await userRes.json();
          const phone = user.phone;
          const email = user.email;
          if (email) userEmail = email;
          // Check admin status by phone
          if (phone) {
            const normalizedPhone = phone.replace(/\D/g, '');
            const withCountry = normalizedPhone.length === 10 ? '1' + normalizedPhone : normalizedPhone;
            if (ADMIN_PHONES.includes(withCountry)) isAdmin = true;
          }
          if (phone || email) {
            const svcKey = context.env.SUPABASE_SERVICE_KEY;
            if (svcKey) {
              // Check profiles first (has first_name for authenticated users)
              const profileRes = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${user.id}&limit=1`, {
                headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`, 'Accept': 'application/json' },
              });
              if (profileRes.ok) {
                const profiles = await profileRes.json();
                if (profiles.length > 0 && profiles[0].first_name) {
                  userName = profiles[0].first_name.trim();
                }
              }
              // Fall back to guests table
              if (!userName) {
                let filter = phone ? `phone=eq.${encodeURIComponent(phone)}` : `email=eq.${encodeURIComponent(email)}`;
                const gRes = await fetch(`${sbUrl}/rest/v1/guests?${filter}&limit=1`, {
                  headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`, 'Accept': 'application/json' },
                });
                if (gRes.ok) {
                  const guests = await gRes.json();
                  if (guests.length > 0 && guests[0].first_name) {
                    userName = guests[0].first_name.trim();
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (e) { /* auth check is best-effort */ }

  // Compute normalized path for content pages
  // Strips /v5/n, /v5, or /n prefix to get the bare route (e.g. /news, /faqs, /about)
  // Links use /v5 prefix — the reset.club proxy rewrites /v5/ → /n/ automatically
  // for users on reset.club, and drop.reset.club serves /v5/* directly.
  const normalizedPath = url.pathname.replace(/^\/v5\/n(?=\/)/, '').replace(/^\/v5(?=\/)/, '').replace(/^\/n(?=\/)/, '');
  const linkPrefix = '/v5';

  // Contact form page
  if (/^\/contact\/?$/.test(normalizedPath) || /^\/contact\/?$/.test(url.pathname)) {
    try {
      // Pull about nav_group siblings so the user can navigate back.
      const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
      const sbKey = context.env.SUPABASE_ANON_KEY || context.env.SUPABASE_SERVICE_KEY;
      let navItems = [];
      if (sbKey) {
        const navRes = await fetch(
          `${sbUrl}/rest/v1/site_pages?nav_group=eq.about&is_published=eq.true&order=nav_order.asc&select=slug,title,external_url`,
          { headers: { 'apikey': sbKey, 'Accept': 'application/json' } },
        );
        if (navRes.ok) navItems = await navRes.json();
      }
      return new Response(await renderContactPage(userName, userEmail, linkPrefix, navItems), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } catch (e) {
      console.error('Contact page error:', e.message);
    }
  }

  // FAQ page — rendered from Supabase faqs table (editable at new.reset.club/admin/faqs)
  if (/^\/faqs\/?$/.test(normalizedPath) || /^\/faqs\/?$/.test(url.pathname)) {
    try {
      const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
      const sbKey = context.env.SUPABASE_ANON_KEY || context.env.SUPABASE_SERVICE_KEY;
      if (sbKey) {
        const res = await fetch(`${sbUrl}/rest/v1/faqs?is_active=eq.true&order=category.asc,sort_order.asc`, {
          headers: { 'apikey': sbKey, 'Accept': 'application/json' },
        });
        if (res.ok) {
          const faqs = await res.json();
          return new Response(await renderFAQPage(faqs, userName, linkPrefix), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      }
    } catch (e) {
      console.error('FAQ page error:', e.message);
    }
  }

  // News page — rendered from Supabase news_posts table (editable at new.reset.club/admin/news)
  if (/^\/news\/?$/.test(normalizedPath) || /^\/news\/?$/.test(url.pathname)) {
    try {
      const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
      const sbKey = context.env.SUPABASE_ANON_KEY || context.env.SUPABASE_SERVICE_KEY;
      if (sbKey) {
        const res = await fetch(`${sbUrl}/rest/v1/news_posts?status=eq.published&order=published_at.desc`, {
          headers: { 'apikey': sbKey, 'Accept': 'application/json' },
        });
        if (res.ok) {
          const posts = await res.json();
          return new Response(await renderNewsPage(posts, userName, linkPrefix), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      }
    } catch (e) {
      console.error('News page error:', e.message);
    }
  }

  // News article page — individual post by slug
  const newsArticleMatch = normalizedPath.match(/^\/news\/([a-z0-9-]+)$/);
  if (newsArticleMatch) {
    const slug = newsArticleMatch[1];
    try {
      const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
      const sbKey = context.env.SUPABASE_ANON_KEY || context.env.SUPABASE_SERVICE_KEY;
      if (sbKey) {
        const res = await fetch(`${sbUrl}/rest/v1/news_posts?slug=eq.${encodeURIComponent(slug)}&select=*,image_media:media!image_media_id(id,credit,credit_url,alt_text,caption)&limit=1`, {
          headers: { 'apikey': sbKey, 'Accept': 'application/json' },
        });
        if (res.ok) {
          const posts = await res.json();
          if (posts.length > 0) {
            return new Response(await renderNewsArticlePage(posts[0], userName, linkPrefix, sbKey), {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          }
        }
      }
    } catch (e) {
      console.error('News article error:', e.message);
    }
  }

  // Content pages — served from Supabase site_pages table.
  // Matches /privacy, /disclaimer, /terms, /about, and any /about/<slug>.
  // Adding a new about/* page = insert a row in site_pages; no middleware change needed.
  // Accept an optional trailing slash so /about/ etc. work the same as /about.
  const contentRouteRe = /^\/(privacy|disclaimer|terms|about(?:\/[a-z0-9-]+)*)\/?$/;
  const candidatePath = contentRouteRe.test(normalizedPath) ? normalizedPath
                     : (contentRouteRe.test(url.pathname) ? url.pathname : null);
  if (candidatePath) {
    const slug = candidatePath.replace(/^\//, '').replace(/\/+$/, '');
    try {
      const sbUrl = context.env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
      const sbKey = context.env.SUPABASE_ANON_KEY || context.env.SUPABASE_SERVICE_KEY;
      if (sbKey) {
        const res = await fetch(`${sbUrl}/rest/v1/site_pages?slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&limit=1`, {
          headers: { 'apikey': sbKey, 'Accept': 'application/json' },
        });
        if (res.ok) {
          const pages = await res.json();
          // Routable rows have a body and no external_url (external_url = nav-only entry).
          if (pages.length > 0 && pages[0].body && !pages[0].external_url) {
            const page = pages[0];
            let body = page.body;
            let navItems = null;
            // If this page is in a nav_group, append sibling nav from site_pages.
            if (page.nav_group) {
              const lp = linkPrefix !== undefined ? linkPrefix : '/v5';
              const navRes = await fetch(
                `${sbUrl}/rest/v1/site_pages?nav_group=eq.${encodeURIComponent(page.nav_group)}&order=nav_order.asc&select=id,slug,title,external_url,nav_order,is_published`,
                { headers: { 'apikey': sbKey, 'Accept': 'application/json' } },
              );
              if (navRes.ok) {
                navItems = await navRes.json();
                const publishedLinks = navItems
                  .filter(r => r.is_published !== false)
                  .map(r => ({
                    href: r.external_url || `${lp}/${r.slug}`,
                    label: r.title,
                  }))
                  .filter(l => l.href !== `${lp}/${slug}`);
                if (publishedLinks.length) {
                  body += '<div class="about-nav">' +
                    publishedLinks.map(l => `<a href="${l.href}" class="about-nav-row"><span>${l.label}</span><span class="about-nav-arrow">→</span></a>`).join('') +
                    '</div>';
                }
              }
            }
            return new Response(await renderContentPage(page.title, body, userName, linkPrefix, slug, sbKey, page.nav_group, navItems), {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          }
        }
      }
    } catch (e) {
      console.error('Content page error:', e.message);
    }
  }

  // Serve static assets via ASSETS.fetch (context.next() falls through to SPA routing)
  if (url.pathname === '/og-image' ||
      url.pathname === '/robots.txt' ||
      url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|txt)$/)) {
    return context.env.ASSETS.fetch(context.request);
  }

  // Proxy health dashboard from worker
  if (url.pathname === '/health') {
    const workerUrl = `https://reset-inventory-sync.doug-6f9.workers.dev/health${url.search}`;
    const response = await fetch(workerUrl, {
      method: context.request.method,
      headers: context.request.headers,
    });
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }

  // /v5/e/[slug] — serve v5 SPA so app.js can filter to a single event
  // (Cloudflare Pages has a quirk where /v5/event(s)/* 308 redirects to /v5/)
  // Also: apex (/) and /e/<slug> when reset.club proxy forwards apex requests
  // to drop-reset-club after the cutover. Same SPA shell, same SSR injection.
  //
  // For event single-pages we rewrite to /v5/index.html (the literal file) so
  // CF Pages serves it directly. For the apex paths (/ and /e/<slug> when no
  // /v5/index.html is in the URL) the same rewrite is needed — but CF Pages
  // canonicalizes /v5/index.html to /v5/ via a 308 when requested directly,
  // so we target /v5/ for those paths instead.
  let assetRequest = context.request;
  if (url.pathname.startsWith('/v5/e/')) {
    const rewritten = new URL(context.request.url);
    rewritten.pathname = '/v5/index.html';
    assetRequest = new Request(rewritten.toString(), context.request);
  } else if (url.pathname === '/' || url.pathname.startsWith('/e/')) {
    const rewritten = new URL(context.request.url);
    rewritten.pathname = '/v5/';
    assetRequest = new Request(rewritten.toString(), context.request);
  }

  // Get the response via ASSETS.fetch (context.next() returns stale cached HTML)
  const response = await context.env.ASSETS.fetch(assetRequest);

  // Only modify HTML responses
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  // Get filter parameters
  const params = url.searchParams;
  const timing = params.get('timing') || 'all';
  const nights = params.get('nights') || '3';
  const stayType = params.get('stayType') || 'all';
  const property = params.get('property') || 'all';
  const vibe = params.get('vibe') || 'all';
  const occasion = params.get('occasion') || 'all';
  const bg = params.get('bg') || 'FF5500';
  const bg2 = params.get('bg2') || '1a1a1a';

  // Build filter summary for title/description
  const summaryParts = [];

  if (nights !== 'all') summaryParts.push(`${nights} Night`);
  if (stayType !== 'all') {
    summaryParts.push(stayType + 's');
  } else {
    summaryParts.push('Stays');
  }

  const timingLabels = {
    'last-minute': 'Last Minute',
    'this-week': 'This Week',
    'next-week': 'Next Week',
    'this-month': 'This Month'
  };
  if (timing !== 'all' && timingLabels[timing]) {
    summaryParts.unshift(timingLabels[timing]);
  }

  if (property !== 'all') {
    const propertyNames = {
      'BARN': 'Barn Studio',
      'COOK': 'Cook House',
      'HILL': 'Hill Studio',
      'ZINK': 'Zink Cabin'
    };
    summaryParts.push(`at ${propertyNames[property] || property}`);
  }

  if (occasion !== 'all') {
    summaryParts.push(`for ${occasion}`);
  }

  const filterSummary = summaryParts.join(' ') || 'All Available Drops';
  let title, description;
  const feature = params.get('feature');
  // Apex (/) and /e/<slug> serve the same v5 SPA shell, so SEO/OG/structured-data
  // treatment should be identical to /v5/*. (Reset.club proxy will forward apex
  // requests here post-cutover.)
  const isSpaPath =
    url.pathname === '/' ||
    url.pathname.startsWith('/e/') ||
    url.pathname.startsWith('/v5');
  if (isSpaPath && feature === 'full-moon') {
    title = 'Full Moon Drops | The Reset Club';
    description = 'Stays that land on or near the full moon. Dark skies, bright light, no screens.';
  } else if (isSpaPath && feature === 'star-flood') {
    title = 'Star Flood | The Reset Club';
    description = 'New moon weekends with zero light pollution. The Milky Way visible from every property.';
  } else if (isSpaPath && property !== 'all') {
    const propNames = { BARN: 'Barn Studio', COOK: 'Cook House', HILL4: 'Hill Studio', ZINK: 'Zink Cabin' };
    // Named combos
    const sorted = property.split(',').sort().join(',');
    const comboNames = {
      'HILL4,ZINK': 'Mountain Views',
      'COOK,HILL4,BARN': 'Fire Pit',
      'COOK,ZINK': 'Hot Tub',
    };
    const comboName = comboNames[sorted];
    if (comboName) {
      title = `${comboName} Drops | The Reset Club`;
      description = `${comboName} properties — available stays in the Catskills.`;
    } else {
      const props = property.split(',').map(c => propNames[c] || c);
      title = `${props.join(' + ')} Drops | The Reset Club`;
      description = `Available stays at ${props.join(' and ')} in the Catskills.`;
    }
  } else if (isSpaPath) {
    title = 'Stay Drops | The Reset Club';
    description = '3-night stays in the Catskills. Pick what matters to you.';
  } else {
    title = `Reset Club Drops - ${filterSummary}`;
    description = `Book ${filterSummary.toLowerCase()} in the Catskills. Limited availability drops at Reset Club properties.`;
  }

  // Build OG image URL with same parameters
  const ogImageParams = new URLSearchParams();
  if (timing !== 'all') ogImageParams.set('timing', timing);
  if (nights !== 'all') ogImageParams.set('nights', nights);
  if (stayType !== 'all') ogImageParams.set('stayType', stayType);
  if (property !== 'all') ogImageParams.set('property', property);
  if (vibe !== 'all') ogImageParams.set('vibe', vibe);
  if (occasion !== 'all') ogImageParams.set('occasion', occasion);
  ogImageParams.set('bg', bg);
  ogImageParams.set('bg2', bg2);

  // OG image — static PNGs for v5 seasons/events, SVG for legacy
  let ogImageUrl;
  const pageUrl = url.href;
  if (isSpaPath) {
    const feature = params.get('feature');
    if (feature === 'full-moon' || feature === 'star-flood') {
      ogImageUrl = `https://drop.reset.club/v5/og/${feature}.png`;
    } else if (property !== 'all') {
      // Check for named combo image first
      const sorted = property.split(',').sort().join(',');
      const comboSlugs = { 'HILL4,ZINK': 'mountain-views' };
      const comboSlug = comboSlugs[sorted];
      if (comboSlug) {
        ogImageUrl = `https://drop.reset.club/v5/og/${comboSlug}.png`;
      } else {
        const firstProp = property.split(',')[0].toLowerCase();
        ogImageUrl = `https://drop.reset.club/v5/og/${firstProp}.png`;
      }
    } else {
      ogImageUrl = `https://drop.reset.club/v5/og/default.png`;
    }
  } else {
    ogImageUrl = `https://drop.reset.club/og-image.png`;
  }

  // Canonical URL — use reset.club as the canonical domain
  const canonicalUrl = `https://reset.club${url.pathname}${url.search}`;

  // JSON-LD structured data
  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Reset Club',
    url: 'https://reset.club',
    logo: 'https://drop.reset.club/v5/og/default.png',
    sameAs: [
      'https://instagram.com/thereset.club',
      'https://instagram.com/reset.catskills'
    ]
  };

  let structuredData = [orgSchema];

  // Add LodgingBusiness on homepage/drops pages
  if (isSpaPath) {
    structuredData.push({
      '@context': 'https://schema.org',
      '@type': 'LodgingBusiness',
      name: 'Reset Club',
      description: 'Four design-led properties in the Catskills. Two hours from the city.',
      url: 'https://reset.club',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Kerhonkson',
        addressRegion: 'NY',
        postalCode: '12446',
        addressCountry: 'US'
      },
      priceRange: '$$$$',
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '5',
        reviewCount: '620',
        bestRating: '5'
      }
    });
  }

  const jsonLd = structuredData.map(s =>
    `<script type="application/ld+json">${JSON.stringify(s)}</script>`
  ).join('\n    ');

  // All meta tags to inject
  const ogTags = `
    <!-- SEO Meta -->
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">

    <!-- Structured Data -->
    ${jsonLd}
  `;

  // Get HTML and inject OG tags
  let html = await response.text();

  // Remove any existing meta tags to avoid duplicates
  html = html.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="description"[^>]*>/gi, '');
  html = html.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  html = html.replace(/<script\s+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '');

  // Inject new OG tags before </head>
  html = html.replace('</head>', ogTags + '\n</head>');

  // SSR data hydration — prefetch every Supabase + inventory-sync call that
  // app.js makes at boot, inline as JSON, populate window.* before app.js
  // runs. Eliminates ~5 round-trips on first paint while keeping every
  // interaction (tag flip, hero rotation, filter URL state, live price
  // refresh) identical. Fires on every path that serves the v5 SPA shell:
  // /v5, /v5/, /v5/e/*, and the apex paths / and /e/* (post-cutover).
  if (
    url.pathname === '/v5/' ||
    url.pathname === '/v5' ||
    url.pathname.startsWith('/v5/e/') ||
    url.pathname === '/' ||
    url.pathname.startsWith('/e/')
  ) {
    try {
      const ssrBlock = await buildSSRHydrationBlock(context.env);
      if (ssrBlock) {
        html = html.replace('</head>', ssrBlock + '\n</head>');
      }
    } catch (e) {
      console.error('SSR hydration build failed:', e?.message || e);
      // Falls through to the existing SPA boot — graceful degradation.
    }
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(html, { headers });
}

// Fetch every data source app.js needs at boot and return a <script> block
// that pre-populates the corresponding window.* globals. Each fetch is best-
// effort: a single failure leaves that data null, app.js falls back to its
// own fetch path.
async function buildSSRHydrationBlock(env) {
  const sbUrl = env.SUPABASE_URL || 'https://uakybfvpamxablrzzetn.supabase.co';
  const sbKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY;
  if (!sbKey) return null;

  const INVENTORY_URL = 'https://reset-inventory-sync.doug-6f9.workers.dev/api/drops';
  const sbHeaders = { apikey: sbKey, accept: 'application/json' };

  const fetchJson = (url, opts) =>
    fetch(url, opts).then(r => (r.ok ? r.json() : null)).catch(() => null);

  const [siteConfigRows, seasonWindowsRows, dropEventsRows, propertiesRows, dropsPayload] = await Promise.all([
    fetchJson(`${sbUrl}/rest/v1/site_config?key=in.(drops_hero_lines,visible_seasons)&select=key,value`, { headers: sbHeaders }),
    fetchJson(`${sbUrl}/rest/v1/season_windows?select=slug,name,start_month,start_day,end_month,end_day,color,description&order=start_month,start_day`, { headers: sbHeaders }),
    fetchJson(`${sbUrl}/rest/v1/drop_events?is_active=eq.true&select=*&order=sort_order`, { headers: sbHeaders }),
    fetchJson(`${sbUrl}/rest/v1/properties?property_code=in.(COOK,ZINK,HILL4,BARN)&select=property_code,label,drops_tagline,drops_description,drops_color_bg,drops_color_text,accepting_bookings_since,drops_tags`, { headers: sbHeaders }),
    fetchJson(INVENTORY_URL),
  ]);

  let heroLines = null;
  let visibleSeasons = null;
  if (Array.isArray(siteConfigRows)) {
    for (const row of siteConfigRows) {
      if (row.key === 'drops_hero_lines' && row.value) heroLines = row.value;
      if (row.key === 'visible_seasons') visibleSeasons = parseInt(row.value) || null;
    }
  }

  const payload = {
    heroLines,
    visibleSeasons,
    seasonWindows: Array.isArray(seasonWindowsRows) ? seasonWindowsRows : null,
    dropEvents: Array.isArray(dropEventsRows) ? dropEventsRows : null,
    properties: Array.isArray(propertiesRows) ? propertiesRows : null,
    drops: dropsPayload && typeof dropsPayload === 'object' ? dropsPayload : null,
  };

  // </script> inside JSON would break the inline script — escape it.
  const json = JSON.stringify(payload).replace(/<\/script/gi, '<\\/script');

  return `<script id="__nData" type="application/json">${json}</script>
<script>
(function(){
  try {
    var el = document.getElementById('__nData');
    if (!el) return;
    var d = JSON.parse(el.textContent);
    if (d.heroLines) window.__heroLines = d.heroLines;
    if (d.visibleSeasons) window.__visibleSeasons = d.visibleSeasons;
    if (d.seasonWindows) window.__seasonWindows = d.seasonWindows;
    if (d.dropEvents) window.__dropEvents = d.dropEvents;
    if (d.properties) window.__propertiesData = d.properties;
    if (d.drops) window.__dropsData = d.drops;
    // Signal config-ready so app.js's __configReady-gated paths can run
    // synchronously instead of awaiting network. The network promise in
    // app.js remains as a refresh path for stale data, but first paint
    // does not block on it.
    window.__ssrHydrated = true;
  } catch (e) {}
})();
</script>`;
}

function handleSitemap() {
  const base = 'https://reset.club';
  const now = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/?property=COOK', priority: '0.8', changefreq: 'daily' },
    { loc: '/?property=ZINK', priority: '0.8', changefreq: 'daily' },
    { loc: '/?property=HILL4', priority: '0.8', changefreq: 'daily' },
    { loc: '/?property=BARN', priority: '0.8', changefreq: 'daily' },
    { loc: '/?feature=full-moon', priority: '0.7', changefreq: 'weekly' },
    { loc: '/?feature=star-flood', priority: '0.7', changefreq: 'weekly' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${base}${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Get current season slug based on date
function getCurrentSeasonSlug() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const windows = [
    { slug: 'deep-winter', sm: 1, sd: 1, em: 1, ed: 14 },
    { slug: 'long-nights', sm: 1, sd: 15, em: 1, ed: 28 },
    { slug: 'frost', sm: 2, sd: 1, em: 2, ed: 14 },
    { slug: 'thaw', sm: 2, sd: 15, em: 2, ed: 28 },
    { slug: 'false-spring', sm: 3, sd: 1, em: 3, ed: 14 },
    { slug: 'early-spring', sm: 3, sd: 15, em: 3, ed: 28 },
    { slug: 'first-green', sm: 4, sd: 1, em: 4, ed: 14 },
    { slug: 'bloom', sm: 4, sd: 15, em: 4, ed: 28 },
    { slug: 'late-spring', sm: 5, sd: 1, em: 5, ed: 14 },
    { slug: 'warm-days', sm: 5, sd: 15, em: 5, ed: 28 },
    { slug: 'early-summer', sm: 6, sd: 1, em: 6, ed: 14 },
    { slug: 'solstice', sm: 6, sd: 15, em: 6, ed: 28 },
    { slug: 'high-summer', sm: 7, sd: 1, em: 7, ed: 14 },
    { slug: 'dog-days', sm: 7, sd: 15, em: 7, ed: 28 },
    { slug: 'late-summer', sm: 8, sd: 1, em: 8, ed: 14 },
    { slug: 'golden-hour', sm: 8, sd: 15, em: 8, ed: 28 },
    { slug: 'early-fall', sm: 9, sd: 1, em: 9, ed: 14 },
    { slug: 'harvest', sm: 9, sd: 15, em: 9, ed: 28 },
    { slug: 'peak-foliage', sm: 10, sd: 1, em: 10, ed: 14 },
    { slug: 'late-autumn', sm: 10, sd: 15, em: 10, ed: 28 },
    { slug: 'first-frost', sm: 11, sd: 1, em: 11, ed: 14 },
    { slug: 'bare-branches', sm: 11, sd: 15, em: 11, ed: 28 },
    { slug: 'early-winter', sm: 12, sd: 1, em: 12, ed: 14 },
    { slug: 'holidays', sm: 12, sd: 15, em: 12, ed: 28 },
  ];
  for (const w of windows) {
    if (m === w.sm && d >= w.sd && d <= w.ed) return w.slug;
  }
  return 'early-spring';
}

// Check Basic Auth for dashboard
function checkBasicAuth(request, env) {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return { authorized: false };
  }

  try {
    const base64 = authHeader.slice(6);
    const decoded = atob(base64);
    const [username, password] = decoded.split(':');

    // Password from environment variable (set in Cloudflare Pages settings)
    const expectedPassword = env.DASH_PASSWORD || 'reset2026';

    // Username can be anything, we only check password
    if (password === expectedPassword) {
      return { authorized: true, username };
    }
  } catch (e) {
    // Invalid base64 or other error
  }

  return { authorized: false };
}

// Dynamic OG image — season-themed SVG
function handleV5OgImage(url) {
  const OG_WINDOWS = {
    'deep-winter': { name: 'Deep Winter', dates: 'Jan 1–14', theme: 'haze' },
    'long-nights': { name: 'Long Nights', dates: 'Jan 15–28', theme: 'wave' },
    'frost': { name: 'Frost', dates: 'Feb 1–14', theme: 'wave' },
    'thaw': { name: 'Thaw', dates: 'Feb 15–28', theme: 'haze' },
    'false-spring': { name: 'False Spring', dates: 'Mar 1–14', theme: 'dirt' },
    'early-spring': { name: 'Early Spring', dates: 'Mar 15–28', theme: 'moss' },
    'first-green': { name: 'First Green', dates: 'Apr 1–14', theme: 'mist' },
    'bloom': { name: 'Bloom', dates: 'Apr 15–28', theme: 'tree' },
    'late-spring': { name: 'Late Spring', dates: 'May 1–14', theme: 'mint' },
    'warm-days': { name: 'Warm Days', dates: 'May 15–28', theme: 'moon' },
    'early-summer': { name: 'Early Summer', dates: 'Jun 1–14', theme: 'sand' },
    'solstice': { name: 'Solstice', dates: 'Jun 15–28', theme: 'sand' },
    'high-summer': { name: 'High Summer', dates: 'Jul 1–14', theme: 'pine' },
    'dog-days': { name: 'Dog Days', dates: 'Jul 15–28', theme: 'melo' },
    'late-summer': { name: 'Late Summer', dates: 'Aug 1–14', theme: 'pine' },
    'golden-hour': { name: 'Golden Hour', dates: 'Aug 15–28', theme: 'melo' },
    'early-fall': { name: 'Early Fall', dates: 'Sep 1–14', theme: 'toma' },
    'harvest': { name: 'Harvest', dates: 'Sep 15–28', theme: 'melo' },
    'peak-foliage': { name: 'Peak Foliage', dates: 'Oct 1–14', theme: 'melo' },
    'late-autumn': { name: 'Late Autumn', dates: 'Oct 15–28', theme: 'dirt' },
    'first-frost': { name: 'First Frost', dates: 'Nov 1–14', theme: 'sand' },
    'bare-branches': { name: 'Bare Branches', dates: 'Nov 15–28', theme: 'soak' },
    'early-winter': { name: 'Early Winter', dates: 'Dec 1–14', theme: 'haze' },
    'holidays': { name: 'Holidays', dates: 'Dec 15–28', theme: 'wave' },
    'new-years': { name: "New Year's", dates: 'Dec 29–31', theme: 'ink' },
  };
  const OG_THEMES = {
    ink:  { bg: '#000000', text: '#fcf6e9' },
    sand: { bg: '#fcf6e9', text: '#000000' },
    toma: { bg: '#ff551e', text: '#fcf6e9' },
    melo: { bg: '#ffc974', text: '#000000' },
    pine: { bg: '#fcddab', text: '#000000' },
    dirt: { bg: '#9c8336', text: '#fcf6e9' },
    tree: { bg: '#019740', text: '#fcf6e9' },
    moss: { bg: '#9c9b34', text: '#fcf6e9' },
    moon: { bg: '#e9f782', text: '#000000' },
    mint: { bg: '#bbf5d0', text: '#000000' },
    mist: { bg: '#d3f7e0', text: '#000000' },
    wave: { bg: '#3f65f6', text: '#fcf6e9' },
    haze: { bg: '#e6edfd', text: '#000000' },
    soak: { bg: '#d2e6f1', text: '#000000' },
  };

  const seasonSlug = url.searchParams.get('season') || '';
  const property = url.searchParams.get('property') || '';
  const season = OG_WINDOWS[seasonSlug];
  const theme = season ? OG_THEMES[season.theme] || OG_THEMES.sand : OG_THEMES.sand;

  const title = season ? season.name : 'Stay Drops';
  const subtitle = season ? season.dates : '3-night stays in the Catskills';
  const propertyLine = property ? property.split(',').map(c => {
    const names = { COOK: 'Cook House', ZINK: 'Zink Cabin', HILL4: 'Hill Studio', BARN: 'Barn Studio' };
    return names[c] || c;
  }).join(' · ') : '';

  const titleLen = title.length;
  const fontSize = Math.min(200, Math.floor(1100 / (titleLen * 0.55)));

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${theme.bg}"/>
  <text x="48" y="${fontSize + 40}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${theme.text}" letter-spacing="-3">${escapeHtml(title)}</text>
  <text x="48" y="${fontSize + 100}" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="bold" fill="${theme.text}" opacity="0.7">${escapeHtml(subtitle)}</text>
  ${propertyLine ? `<text x="48" y="${fontSize + 150}" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="500" fill="${theme.text}" opacity="0.5">${escapeHtml(propertyLine)}</text>` : ''}
  <text x="48" y="590" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" fill="${theme.text}" opacity="0.4">RESET · DROPS</text>
  <text x="1152" y="590" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" fill="${theme.text}" opacity="0.4" text-anchor="end">drop.reset.club</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// Fetch the canonical footer HTML from brand.reset.club. Cached at the CF edge
// (5 min fresh, 1 day SWR per the worker's Cache-Control). On failure, fall
// back to the inline default so pages never break.
async function fetchCanonicalFooterHTML() {
  try {
    const res = await fetch('https://brand.reset.club/footer', {
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (res.ok) return await res.text();
  } catch (e) {
    // swallow — fallback below
  }
  return null;
}

async function renderPageShell(title, bodyHTML, extraCSS, userName, linkPrefix, extraBodyHTML) {
  const pfx = linkPrefix !== undefined ? linkPrefix : '/v5/n';
  const navRight = userName ? userName.toUpperCase() : 'JOIN';
  const canonicalFooter = await fetchCanonicalFooterHTML();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Reset Club</title>
  <meta name="description" content="${title} — Reset Club">
  <link rel="icon" href="https://brand.reset.club/icons/icon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="https://brand.reset.club/icons/apple-touch-icon.png">
  <link rel="manifest" href="https://brand.reset.club/icons/manifest.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://brand.reset.club/main/styles.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #fcf6e9; color: #000; min-height: 100dvh; display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; }
    .nav { padding: 16px 16px; display: flex; justify-content: space-between; align-items: center; }
    @media (min-width: 641px) { .nav { padding: 16px 24px; } }
    @media (min-width: 1024px) { .nav { padding: 16px 48px; } }
    .nav-logo { font-size: 18px; font-weight: 700; text-decoration: none; color: inherit; cursor: pointer; }
    .content { flex: 1; max-width: 720px; padding: 48px 16px 96px; width: 100%; }
    @media (min-width: 641px) { .content { padding: 48px 24px 96px; } }
    @media (min-width: 1024px) { .content { padding: 48px 48px 96px; max-width: 768px; } }
    .content h1 { font-size: clamp(48px, 12vw, 160px); font-weight: 700; letter-spacing: -0.03em; line-height: 0.9; margin-bottom: 32px; margin-left: -0.04em; }
    .content a { color: inherit; }
    .content strong { font-weight: 700; }
    .footer { padding: 0 16px 48px; width: 100%; }
    @media (min-width: 641px) { .footer { padding: 0 24px 48px; } }
    @media (min-width: 1024px) { .footer { padding: 0 48px 48px; } }
    .footer-brand { font-size: 18px; font-weight: 700; display: block; margin-bottom: 12px; }
    .footer-line { width: 100%; height: 3px; background: #000; margin-bottom: 12px; }
    .footer-bottom { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
    .footer-links { display: flex; gap: 8px; align-items: center; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
    .footer-links a { color: inherit; text-decoration: none; }
    .footer-links a:hover { opacity: 0.6; }
    .footer-links .footer-sep { opacity: 0.3; }
    .footer-copy { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
    /* Join wrapper — panel positioning only. Form styles in join.js */
    .join-wrapper { position: relative; z-index: 10; }
    .join-wrapper.open .nav { background: #fcf6e9; }
    .join-panel { display: none; padding: 16px 16px 24px; }
    @media (min-width: 641px) { .join-panel { padding: 16px 24px 24px; } }
    @media (min-width: 1024px) { .join-panel { padding: 16px 48px 24px; } }
    .join-wrapper.open .join-panel { display: block; }
    ${extraCSS}
  </style>
</head>
<body>
  <div id="join-wrapper" class="join-wrapper">
    <div id="join-panel" class="join-panel"></div>
    <nav class="nav">
      <a href="/v5/" class="nav-logo">RESET</a>
      <a href="#" id="nav-join" class="nav-logo">${navRight}</a>
    </nav>
  </div>
  <div class="content">
    ${bodyHTML}
  </div>
  <footer class="footer">${canonicalFooter || `<div class="footer-top"><a class="footer-brand" href="https://reset.club/">RESET CLUB</a></div>
    <div class="footer-line"></div>
    <div class="footer-bottom">
      <div class="footer-links">
        <a href="${pfx}/about">About</a><span class="footer-sep">·</span>
        <a href="${pfx}/faqs">FAQ</a><span class="footer-sep">·</span>
        <a href="${pfx}/news">News</a><span class="footer-sep">·</span>
        <a href="${pfx}/privacy">Privacy</a><span class="footer-sep">·</span>
        <a href="${pfx}/disclaimer">Disclaimer</a><span class="footer-sep">·</span>
        <a href="${pfx}/terms">Terms</a>
      </div>
      <div class="footer-copy">© ${new Date().getFullYear()} Reset Club Holdings LLC</div>
    </div>`}</footer>
  ${extraBodyHTML || ''}
  <script src="/v5/join.js?v=197"></script>
  <script>
  (function() {
    var API = (function() {
      var p = location.pathname;
      if (p === '/n' || p.indexOf('/n/') === 0) return '/n/api/auth';
      if (p === '/v5' || p.indexOf('/v5/') === 0) return '/v5/api/auth';
      return '/api/auth';
    })();
    var wrapper = document.getElementById('join-wrapper');
    var panel = document.getElementById('join-panel');
    var navJoin = document.getElementById('nav-join');
    var isOpen = false;

    // Check session on load
    (async function() {
      try {
        var res = await fetch(API + '/me', { credentials: 'include' });
        var data = await res.json();
        if (data.authenticated && data.guest) {
          var name = data.guest.firstName || (data.guest.name && data.guest.name.split(' ')[0]) || null;
          if (name) navJoin.textContent = name.toUpperCase();
        }
      } catch(e) {}
    })();

    navJoin.onclick = function(e) {
      e.preventDefault();
      if (navJoin.textContent !== 'JOIN' && navJoin.textContent !== 'CLOSE') return;
      isOpen = !isOpen;
      if (isOpen) {
        navJoin.textContent = 'CLOSE';
        ResetJoin.init(panel, {
          bg: '#000',
          text: '#fcf6e9',
          onClose: function() { wrapper.classList.remove('open'); isOpen = false; if (!window.__loggedInName) navJoin.textContent = 'JOIN'; },
          onLogin: function(name) { if (name) { window.__loggedInName = name; navJoin.textContent = name.toUpperCase(); } }
        });
        wrapper.classList.add('open');
      } else {
        navJoin.textContent = 'JOIN';
        wrapper.classList.remove('open');
      }
    };
  })();
  </script>
  <script>
  // Track link clicks (link-row, inline links, about-nav)
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (!link) return;
    var isRow = link.classList.contains('link-row') || link.classList.contains('about-nav-row');
    var isInline = link.closest('.article-body, .content, #page-body') && !isRow;
    if (!isRow && !isInline) return;
    if (window.gtag) {
      gtag('event', 'content_link_click', {
        link_url: link.href,
        link_text: link.textContent.trim().substring(0, 100),
        link_type: isRow ? 'arrow_row' : 'inline',
        page_path: location.pathname,
      });
    }
  });
  </script>
</body>
</html>`;
}

async function renderFAQPage(faqs, userName, linkPrefix) {
  const grouped = {};
  for (const faq of faqs) {
    const cat = faq.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(faq);
  }
  const CATEGORY_LABELS = {
    booking: 'Booking', stays: 'Stays', properties: 'Properties',
    seasons: 'Seasons', guide: 'Guide', towns: 'Towns', venue: 'Venue', general: 'General',
  };
  let faqHTML = '<h1>FAQs</h1>';
  faqHTML += '<div class="faq-search-wrap"><input type="text" id="faq-search" class="faq-search" placeholder="SEARCH" autocomplete="off"><span class="faq-search-clear" id="faq-clear">×</span></div>';
  faqHTML += '<div id="faq-status" class="faq-status"></div>';
  faqHTML += '<div id="faq-list">';
  for (const cat of Object.keys(grouped)) {
    const label = CATEGORY_LABELS[cat] || cat;
    faqHTML += `<div class="faq-category" data-cat="${cat}"><h2>${label}</h2>`;
    for (const faq of grouped[cat]) {
      const answer = faq.answer.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      faqHTML += `<details class="faq-item"><summary>${faq.question}</summary><div class="faq-answer">${answer}</div></details>`;
    }
    faqHTML += `</div>`;
  }
  faqHTML += '</div>';
  faqHTML += `<script>
  (function() {
    var input = document.getElementById('faq-search');
    var clear = document.getElementById('faq-clear');
    var status = document.getElementById('faq-status');
    var cats = document.querySelectorAll('.faq-category');
    var items = document.querySelectorAll('.faq-item');
    function filter() {
      var q = input.value.trim().toLowerCase();
      clear.style.display = q ? 'block' : 'none';
      if (!q) {
        items.forEach(function(el) { el.style.display = ''; });
        cats.forEach(function(el) { el.style.display = ''; });
        status.textContent = '';
        return;
      }
      var count = 0;
      items.forEach(function(el) {
        var text = el.textContent.toLowerCase();
        var match = text.indexOf(q) !== -1;
        el.style.display = match ? '' : 'none';
        if (match) { count++; el.open = true; }
      });
      cats.forEach(function(el) {
        var visible = el.querySelectorAll('.faq-item:not([style*="display: none"])');
        el.style.display = visible.length ? '' : 'none';
      });
      status.textContent = count + ' RESULT' + (count !== 1 ? 'S' : '');
    }
    input.oninput = filter;
    clear.onclick = function() { input.value = ''; filter(); input.focus(); };
  })();
  </script>`;
  const faqCSS = `
    .faq-search-wrap { position: relative; margin-bottom: 16px; }
    .faq-search { font-family: Inter, sans-serif; font-size: 18px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; width: 100%; padding: 12px 0; background: none; border: none; border-bottom: 3px solid #000; color: #000; outline: none; border-radius: 0; -webkit-appearance: none; }
    .faq-search::placeholder { color: #000; opacity: 0.35; }
    .faq-search-clear { position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-size: 24px; font-weight: 400; cursor: pointer; display: none; color: #000; background: none; border: none; padding: 0 4px; }
    .faq-status { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px; min-height: 20px; }
    .faq-category h2 { font-size: 18px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.5; margin: 32px 0 0; padding-bottom: 8px; border-bottom: 3px solid currentColor; }
    .faq-category:first-child h2 { margin-top: 0; }
    .faq-item { border-bottom: 3px solid #000; }
    .faq-item summary { font-size: 18px; font-weight: 700; line-height: 1.5; padding: 16px 0; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-item summary::after { content: '+'; font-size: 24px; font-weight: 400; flex-shrink: 0; margin-left: 16px; }
    .faq-item[open] summary::after { content: '\\2212'; }
    .faq-answer { font-size: 18px; font-weight: 500; line-height: 1.5; padding: 0 0 16px; }`;
  return await renderPageShell('FAQs', faqHTML, faqCSS, userName, linkPrefix);
}

function img(src, preset) {
  if (!src) return '';
  const R2_BASE = 'https://pub-e11155ba60cf4f258fb0e4e599e2ed1f.r2.dev/';
  let path;
  if (src.startsWith(R2_BASE)) path = src.slice(R2_BASE.length);
  else if (/^https?:\/\//i.test(src)) path = encodeURIComponent(src);
  else path = src.replace(/^\/+/, '');
  return `https://image.reset.club/${preset}/${path}`;
}

function rewriteInlineImages(html, preset) {
  if (!html) return html;
  const R2_BASE = 'https://pub-e11155ba60cf4f258fb0e4e599e2ed1f.r2.dev/';
  return html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
    const srcMatch = attrs.match(/\bsrc=(["'])([^"']+)\1/i);
    if (!srcMatch) return match;
    let src = srcMatch[2];
    // Idempotent: peel an existing image.reset.club URL back to the underlying
    // source so we can rebuild the responsive srcset. Body content saved
    // through the in-place editor already carries proxied URLs from a prior
    // render — without this, the rewriter would skip them and the old preset
    // would stick forever.
    const proxied = src.match(/^https:\/\/image\.reset\.club\/[^/]+\/(.+)$/);
    if (proxied) {
      const tail = proxied[1];
      let decoded = tail;
      try { decoded = decodeURIComponent(tail); } catch (_) {}
      src = /^https?:\/\//i.test(decoded) ? decoded : (R2_BASE + tail);
    }
    // Responsive srcset: mobile ~600w, tablet ~1000w, desktop ~1400w.
    // The desktop .image-block breakout (negative margins on ≥1200px) pushes
    // images wider than the text column, so we need the bigger asset for
    // retina + large screens. The preset arg is kept for API compatibility.
    const srcset = `${img(src, 'w=600,q=85')} 600w, ${img(src, 'w=1000,q=85')} 1000w, ${img(src, 'w=1400,q=85')} 1400w`;
    const sizes = '(min-width: 1200px) 1024px, 100vw';
    // Strip existing srcset/sizes FIRST, then replace src and inject the
    // new attrs in one shot. Doing it the other way around stripped the
    // freshly-added attrs.
    let newAttrs = attrs
      .replace(/\bsrcset=(["'])[^"']*\1/gi, '')
      .replace(/\bsizes=(["'])[^"']*\1/gi, '')
      .replace(/\bsrc=(["'])[^"']+\1/i, `src="${img(src, 'w=1000,q=85')}" srcset="${srcset}" sizes="${sizes}"`);
    if (!/\bloading=/i.test(newAttrs)) newAttrs += ' loading="lazy"';
    if (!/\bdecoding=/i.test(newAttrs)) newAttrs += ' decoding="async"';
    return `<img${newAttrs}>`;
  });
}

// Wrap <img> + adjacent <div class="image-caption"> in a .image-block so the
// wrapper can shrink to image width (display: table) and the caption tracks it.
// Legacy saved content has the img and caption as loose siblings — without
// the wrapper the caption fills the parent column even when the image is
// narrower. Idempotent: skips pairs already inside a .image-block wrapper.
function wrapImageCaptions(html) {
  if (!html) return html;
  return html.replace(
    /(<div\s+class="image-block">\s*)?(<img\b[^>]*>)(\s*<div\s+class="image-caption">[\s\S]*?<\/div>)/gi,
    (match, openWrap, imgTag, capTag) => {
      if (openWrap) return match;
      return `<div class="image-block">${imgTag}${capTag}</div>`;
    }
  );
}

async function renderNewsPage(posts, userName, linkPrefix) {
  const pfx = linkPrefix !== undefined ? linkPrefix : '/v5/n';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let newsHTML = '<h1>News</h1>';
  for (const post of posts) {
    const d = new Date(post.published_at);
    const dateStr = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    const cats = (post.categories || []).join(' · ');
    const imgTag = post.image_url
      ? `<div class="news-img"><img src="${img(post.image_url, 'thumb')}" alt="" loading="lazy" decoding="async"></div>`
      : '';
    newsHTML += `<a href="${pfx}/news/${post.slug}" class="news-row">
      ${imgTag}
      <div class="news-text">
        <span class="news-title">${post.title}</span>
        ${cats ? `<span class="news-meta">${cats}</span>` : ''}
        ${post.excerpt ? `<span class="news-excerpt">${post.excerpt}</span>` : ''}
      </div>
    </a>`;
  }
  const newsCSS = `
    .news-row { display: flex; gap: 16px; padding: 20px 0; border-bottom: 3px solid #000; text-decoration: none; color: inherit; align-items: flex-start; }
    .news-row:first-of-type { border-top: 3px solid #000; }
    @media (hover: hover) { .news-row:hover { opacity: 0.7; } }
    .news-img { width: 100px; height: 100px; flex-shrink: 0; overflow: hidden; background: rgba(0,0,0,0.05); }
    .news-img img { width: 100%; height: 100%; object-fit: cover; }
    @media (max-width: 480px) { .news-img { width: 72px; height: 72px; } }
    .news-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .news-title { font-size: 18px; font-weight: 700; line-height: 1.3; }
    .news-meta { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; opacity: 0.4; }
    .news-excerpt { font-size: 15px; font-weight: 500; line-height: 1.4; opacity: 0.7; }
    .news-add { position: fixed; bottom: 16px; right: 16px; width: 44px; height: 44px; background: #000; color: #fcf6e9; border: none; cursor: pointer; z-index: 999; font-size: 24px; display: none; align-items: center; justify-content: center; font-weight: 700; }
    .news-add.visible { display: flex; }
    @media (hover: hover) { .news-add:hover { background: #019740; } }`;
  const addUI = `
  <button class="news-add" id="news-add" title="New post">+</button>
  <script>
  (function() {
    var API = (function() {
      var p = location.pathname;
      if (p === '/n' || p.indexOf('/n/') === 0) return '/n/api/auth';
      if (p === '/v5' || p.indexOf('/v5/') === 0) return '/v5/api/auth';
      return '/api/auth';
    })();
    var saveBase = (function() {
      var p = location.pathname;
      if (p === '/n' || p.indexOf('/n/') === 0) return '/n';
      if (p === '/v5' || p.indexOf('/v5/') === 0) return '/v5';
      return '';
    })();
    var addBtn = document.getElementById('news-add');
    fetch(API + '/me', { credentials: 'include' }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.authenticated) addBtn.classList.add('visible');
    }).catch(function() {});
    Object.defineProperty(window, '__loggedInName', {
      set: function(v) { if (v) addBtn.classList.add('visible'); this._ln = v; },
      get: function() { return this._ln; },
      configurable: true,
    });
    addBtn.addEventListener('click', async function() {
      addBtn.textContent = '...';
      addBtn.disabled = true;
      try {
        var slug = 'new-post-' + Date.now().toString(36);
        var res = await fetch(saveBase + '/api/save-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ slug: slug, title: 'New Post', body: '', status: 'draft', categories: [], published_at: new Date().toISOString() }),
        });
        if (res.ok) {
          var data = await res.json();
          window.location.href = saveBase + '/news/' + slug;
        } else {
          addBtn.textContent = '+'; addBtn.disabled = false;
        }
      } catch(e) { addBtn.textContent = '+'; addBtn.disabled = false; }
    });
  })();
  </script>`;
  return await renderPageShell('News', newsHTML, newsCSS, userName, linkPrefix, addUI);
}

async function renderNewsArticlePage(post, userName, linkPrefix, supabaseKey) {
  const pfx = linkPrefix !== undefined ? linkPrefix : '/v5/n';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(post.published_at);
  const dateStr = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  const cats = (post.categories || []).join(' · ');
  let imgTag = '';
  if (post.image_url) {
    const caption = (post.image_media && post.image_media.caption) || '';
    const credit = (post.image_media && post.image_media.credit) || '';
    const creditUrl = (post.image_media && post.image_media.credit_url) || '';
    const altText = (post.image_media && post.image_media.alt_text) || caption || '';
    const captionEl = caption ? `<span class="hero-caption">${caption}</span>` : '<span></span>';
    const creditEl = credit
      ? (creditUrl
          ? `<a class="hero-credit" href="${creditUrl}" target="_blank" rel="noopener nofollow">${credit}</a>`
          : `<span class="hero-credit">${credit}</span>`)
      : '';
    const figcaption = (caption || credit)
      ? `<figcaption class="article-hero-caption">${captionEl}${creditEl}</figcaption>`
      : '';
    imgTag = `<figure class="article-hero">
      <img src="${img(post.image_url, 'w=800,q=85')}" srcset="${img(post.image_url, 'w=600,q=85')} 600w, ${img(post.image_url, 'w=1200,q=85')} 1200w, ${img(post.image_url, 'w=1800,q=85')} 1800w" sizes="(max-width: 800px) 100vw, 800px" alt="${altText}" loading="lazy" decoding="async">
      ${figcaption}
    </figure>`;
  }
  // Convert body — if it contains HTML tags, use as-is; otherwise convert \n\n to <p> tags
  let bodyHTML = '';
  if (post.body) {
    if (/<[a-z][\s\S]*>/i.test(post.body)) {
      bodyHTML = post.body;
    } else {
      let raw = post.body.replace(/\\n/g, '\n');
      bodyHTML = raw.split(/\n\n+/).filter(p => p.trim()).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    }
  } else if (post.excerpt) {
    bodyHTML = `<p>${post.excerpt}</p>`;
  }
  bodyHTML = rewriteInlineImages(bodyHTML, 'card');
  bodyHTML = wrapImageCaptions(bodyHTML);
  // Property drops link
  const PROP_LABELS = { COOK: 'Cook House', ZINK: 'Zink Cabin', HILL4: 'Hill Studio', BARN: 'Barn Studio' };
  let dropsLink = '';
  if (post.property_code && PROP_LABELS[post.property_code]) {
    const propLabel = PROP_LABELS[post.property_code];
    const propParam = post.property_code === 'HILL4' ? 'HILL4' : post.property_code;
    dropsLink = `<div class="link-row-wrap"><a href="${pfx}/?property=${propParam}" class="link-row">${propLabel} Drops</a></div>`;
  }
  const articleHTML = `<h1 id="article-title">${post.title}</h1>
    ${imgTag}
    <div class="article-body" id="article-body">${bodyHTML}</div>
    ${dropsLink}
    <div class="article-meta">${cats ? cats : ''}${post.author ? ' · By ' + post.author : ''}${dateStr ? ' · Posted ' + dateStr : ''}</div>
    <a href="${pfx}/news" class="article-back">← All News</a>`;
  const articleCSS = `
    .article-meta { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; opacity: 0.4; margin-top: 32px; }
    /* C1 — Image Caption (canon: brand.reset.club make/patterns.md) */
    .article-hero { display: table; max-width: 100%; margin: 0 0 32px; padding: 0; }
    .article-hero img { display: block; max-width: 100%; max-height: 70vh; width: auto; height: auto; border: 2px solid #000; }
    .article-hero-caption { display: flex; justify-content: space-between; gap: 16px; margin-top: 8px; font-size: 9px; font-weight: 700; line-height: 1.5; letter-spacing: 0.05em; text-transform: uppercase; }
    .article-hero-caption .hero-caption { font-weight: 700; }
    .article-hero-caption .hero-credit { opacity: 0.6; text-decoration: none; color: inherit; }
    .article-hero-caption a.hero-credit:hover { opacity: 1; }
    .article-body p { font-size: 18px; font-weight: 500; line-height: 1.5; margin-bottom: 16px; }
    .article-body h2, .article-body h3 { font-size: 18px; font-weight: 700; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 3px solid currentColor; }
    .article-back { display: inline-block; margin-top: 32px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: inherit; text-decoration: none; opacity: 0.4; }
    .article-back:hover { opacity: 1; }
    .article-body img { max-width: 100%; height: auto; margin: 16px 0; display: block; border: 2px solid #000; box-sizing: border-box; }
    .article-body img + .image-caption { margin-top: -8px; }
    .article-body .image-caption { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 24px; font-size: 9px; font-weight: 700; line-height: 1.5; letter-spacing: 0.05em; text-transform: uppercase; }
    .article-body .image-caption .caption { font-weight: 700; }
    .article-body .image-caption .credit { opacity: 0.6; text-align: right; }
    .article-body .image-block { display: table; max-width: 100%; margin: 16px 0; }
    .article-body .image-block img { margin: 0; }
    .article-body .image-block .image-caption { margin-top: 8px; margin-bottom: 0; }
    @media (min-width: 1200px) {
      .article-body .image-block { display: block; width: max-content; max-width: calc(100vw - 96px); margin-left: -48px; margin-right: 0; }
      .article-body .image-block .image-caption { margin-left: 48px; width: calc(100% - 48px); padding-left: 0; padding-right: 0; box-sizing: border-box; }
    }
    .link-row-wrap { margin: 0; }
    .link-row-wrap:first-of-type { margin-top: 16px; }
    .link-row { display: flex; width: 100%; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 3px solid #000; text-decoration: none; color: inherit; font-size: 18px; font-weight: 700; box-sizing: border-box; }
    .link-row::after { content: '→'; flex-shrink: 0; margin-left: 16px; }
    .link-row-wrap:first-of-type .link-row { border-top: 3px solid #000; }
    @media (hover: hover) { .link-row:hover { opacity: 0.6; } }`;
  const postJSON = JSON.stringify({ id: post.id, slug: post.slug }).replace(/</g, '\\u003c');
  const editUI = `
  <script src="/v5/editor.js?v=18"></script>
  <script>
  (function() {
    var postData = ${postJSON};
    var saveBase = location.hostname === 'reset.club' ? '/n' : '/v5';
    ResetEditor.init({
      bodyId: 'article-body',
      titleId: 'article-title',
      slug: postData.slug,
      supabaseKey: '${supabaseKey || ''}',
      showPropertyPicker: true,
      propertyCode: '${post.property_code || ''}',
      save: async function(data) {
        var payload = { id: postData.id, body: data.body };
        if (data.title) payload.title = data.title;
        if (data.property_code !== undefined) payload.property_code = data.property_code;
        var res = await fetch(saveBase + '/api/save-news', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      }
    });
  })();
  </script>`;
  return await renderPageShell(post.title, articleHTML, articleCSS, userName, linkPrefix, editUI);
}

async function renderContactPage(userName, userEmail, linkPrefix, navItems) {
  const lp = linkPrefix !== undefined ? linkPrefix : '/v5';
  const links = (navItems || [])
    .map(r => ({ href: r.external_url || `${lp}/${r.slug}`, label: r.title }))
    .filter(l => l.href !== '/contact' && l.href !== `${lp}/contact`);
  const navHtml = links.length
    ? '<div class="about-nav">' +
      links.map(l => `<a href="${l.href}" class="about-nav-row"><span>${l.label}</span><span class="about-nav-arrow">→</span></a>`).join('') +
      '</div>'
    : '';
  const css = `
    .content h2, .content h3 { font-size: 18px; font-weight: 700; line-height: 1.5; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 3px solid currentColor; }
    .content p { font-size: 18px; font-weight: 500; line-height: 1.5; margin-bottom: 16px; }
    .about-nav { margin-top: 48px; }
    .about-nav-row { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 3px solid #000; text-decoration: none; color: inherit; font-size: 18px; font-weight: 700; }
    .about-nav-row:first-child { border-top: 3px solid #000; }
    @media (hover: hover) { .about-nav-row:hover { opacity: 0.6; } }
    .contact-form { margin-top: 32px; display: flex; flex-direction: column; gap: 16px; }
    .contact-form label { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 6px; display: block; }
    .contact-form input, .contact-form textarea { font-family: 'Inter', system-ui, sans-serif; font-size: 16px; padding: 12px 14px; border: 1px solid #000; background: transparent; color: inherit; border-radius: 0; width: 100%; box-sizing: border-box; -webkit-appearance: none; appearance: none; }
    .contact-form textarea { resize: vertical; min-height: 160px; line-height: 1.5; }
    .contact-form input:focus, .contact-form textarea:focus { outline: 2px solid #019740; outline-offset: -2px; }
    .contact-form .hp { position: absolute; left: -10000px; top: -10000px; width: 1px; height: 1px; overflow: hidden; }
    .contact-form button { padding: 14px 28px; font-size: 13px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid #000; background: #000; color: #fcf6e9; cursor: pointer; align-self: flex-start; }
    @media (hover: hover) { .contact-form button:hover { background: #019740; border-color: #019740; } }
    .contact-form button:disabled { opacity: 0.4; cursor: default; }
    .contact-msg { margin-top: 12px; font-size: 14px; font-weight: 700; }
    .contact-msg.ok { color: #019740; }
    .contact-msg.err { color: #ff551e; }
  `;
  const safeEmail = (userEmail || '').replace(/"/g, '&quot;');
  const body = `
    <h1>Contact</h1>
    <p>We read every message. Tell us what's on your mind.</p>
    <form class="contact-form" id="contact-form" novalidate>
      <div>
        <label for="cf-name">Name</label>
        <input id="cf-name" name="name" type="text" required autocomplete="name">
      </div>
      <div>
        <label for="cf-email">Email</label>
        <input id="cf-email" name="email" type="email" required autocomplete="email" value="${safeEmail}">
      </div>
      <div>
        <label for="cf-message">Message</label>
        <textarea id="cf-message" name="message" required></textarea>
      </div>
      <div class="hp" aria-hidden="true">
        <label for="cf-website">Website</label>
        <input id="cf-website" name="website" type="text" tabindex="-1" autocomplete="off">
      </div>
      <button type="submit" id="cf-submit">Send</button>
      <div class="contact-msg" id="cf-msg" role="status" aria-live="polite"></div>
    </form>
    <script>
    (function() {
      var form = document.getElementById('contact-form');
      var msg = document.getElementById('cf-msg');
      var btn = document.getElementById('cf-submit');
      var renderedAt = Date.now();
      var base = location.hostname === 'reset.club' ? '/n' : '/v5';
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        msg.className = 'contact-msg';
        msg.textContent = '';
        btn.disabled = true;
        btn.textContent = 'Sending...';
        var payload = {
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          message: form.message.value.trim(),
          website: form.website.value,
          _t: renderedAt,
          source_url: location.href,
        };
        try {
          var res = await fetch(base + '/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          var data = await res.json().catch(function() { return { ok: res.ok }; });
          if (res.ok && data.ok) {
            msg.className = 'contact-msg ok';
            msg.textContent = data.deliveredTo
              ? 'Thanks — your message was sent to ' + data.deliveredTo + '.'
              : 'Thanks — we got your message.';
            form.reset();
            btn.textContent = 'Send';
            btn.disabled = false;
          } else {
            msg.className = 'contact-msg err';
            msg.textContent = (data && data.error) || 'Something went wrong. Please try again.';
            btn.textContent = 'Send';
            btn.disabled = false;
          }
        } catch (err) {
          msg.className = 'contact-msg err';
          msg.textContent = 'Network error. Please try again.';
          btn.textContent = 'Send';
          btn.disabled = false;
        }
      });
    })();
    </script>
    ${navHtml}
  `;
  return await renderPageShell('Contact', body, css, userName, linkPrefix, '');
}

async function renderContentPage(title, body, userName, linkPrefix, editSlug, supabaseKey, navGroup, navItems) {
  const slug = editSlug || '';
  body = rewriteInlineImages(body, 'card');
  body = wrapImageCaptions(body);
  const contentCSS = `
    .content h2, .content h3 { font-size: 18px; font-weight: 700; line-height: 1.5; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 3px solid currentColor; }
    .content p { font-size: 18px; font-weight: 500; line-height: 1.5; margin-bottom: 16px; }
    .about-nav { margin-top: 48px; }
    .about-nav-row { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 3px solid #000; text-decoration: none; color: inherit; font-size: 18px; font-weight: 700; }
    .about-nav-row:first-child { border-top: 3px solid #000; }
    @media (hover: hover) { .about-nav-row:hover { opacity: 0.6; } }
    .content ul, .content ol { font-size: 18px; font-weight: 500; line-height: 1.5; margin-bottom: 16px; padding-left: 24px; }
    .content li { margin-bottom: 8px; }
    .content img { max-width: 100%; height: auto; margin: 16px 0; display: block; border: 2px solid #000; box-sizing: border-box; }
    .content img + .image-caption { margin-top: -8px; }
    .content .image-caption { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 24px; font-size: 9px; font-weight: 700; line-height: 1.5; letter-spacing: 0.05em; text-transform: uppercase; }
    .content .image-caption .caption { font-weight: 700; }
    .content .image-caption .credit { opacity: 0.6; text-align: right; }
    .content .image-block { display: table; max-width: 100%; margin: 16px 0; }
    .content .image-block img { margin: 0; }
    .content .image-block .image-caption { margin-top: 8px; margin-bottom: 0; }
    @media (min-width: 1200px) {
      /* Image breaks out left to the viewport edge and extends right into the
         empty column beside the text. width: max-content shrink-wraps to the
         image's intrinsic width (capped by max-width) — replaces display:table
         to avoid a fixpoint that was clamping images to parent column width. */
      .content .image-block { display: block; width: max-content; max-width: calc(100vw - 96px); margin-left: -48px; margin-right: 0; }
      /* Caption stays anchored to the text column regardless of image width. */
      .content .image-block .image-caption { margin-left: 48px; width: calc(100% - 48px); padding-left: 0; padding-right: 0; box-sizing: border-box; }
    }
    .link-row-wrap { margin: 0; }
    .link-row-wrap:first-of-type { margin-top: 16px; }
    .link-row { display: flex; width: 100%; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 3px solid #000; text-decoration: none; color: inherit; font-size: 18px; font-weight: 700; box-sizing: border-box; }
    .link-row::after { content: '→'; flex-shrink: 0; margin-left: 16px; }
    .link-row-wrap:first-of-type .link-row { border-top: 3px solid #000; }
    @media (hover: hover) { .link-row:hover { opacity: 0.6; } }`;
  const editUI = slug ? `
  <script src="/v5/editor.js?v=18"></script>
  <script>
  (function() {
    var slug = ${JSON.stringify(slug)};
    var navGroup = ${JSON.stringify(navGroup || null)};
    var navItems = ${JSON.stringify(navItems || null)};
    var saveBase = location.hostname === 'reset.club' ? '/n' : '/v5';
    ResetEditor.init({
      bodyId: 'page-body',
      slug: slug,
      supabaseKey: '${supabaseKey || ''}',
      navGroup: navGroup,
      navItems: navItems,
      save: async function(data) {
        var res = await fetch(saveBase + '/api/save-page', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ slug: slug, body: data.body }),
        });
        if (!res.ok) throw new Error(await res.text());
      },
      saveNav: async function(items) {
        var res = await fetch(saveBase + '/api/save-nav-group', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ group: navGroup, items: items }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
    });
  })();
  </script>` : '';
  const pageBody = `<h1>${title}</h1><div id="page-body">${body}</div>`;
  return await renderPageShell(title, pageBody, contentCSS, userName, linkPrefix, editUI);
}
