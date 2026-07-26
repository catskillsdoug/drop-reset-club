const SB_URL = 'https://uakybfvpamxablrzzetn.supabase.co';

function headers(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function sbInsert(env, table, row, opts = {}) {
  const params = new URLSearchParams();
  let prefer = 'return=representation';
  if (opts.upsertOn) {
    params.set('on_conflict', opts.upsertOn);
    prefer += ',resolution=merge-duplicates';
  }
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, {
    method: 'POST',
    headers: { ...headers(env), Prefer: prefer },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`supabase insert ${table} ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows[0];
}

export async function sbSelect(env, table, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: headers(env) });
  if (!r.ok) throw new Error(`supabase select ${table} ${r.status}`);
  return r.json();
}

export async function sbPatch(env, table, query, patch) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: headers(env),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`supabase patch ${table} ${r.status}`);
}
