function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, serviceKey };
}

// Talks directly to Supabase's auto-generated REST API (PostgREST) via fetch,
// using the service_role key. That key bypasses row-level security entirely,
// which is why it must only ever be used here, server-side.
async function supabaseRequest(path, { method = 'GET', body, extraHeaders } = {}) {
  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) {
    throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return res;
}

module.exports = { supabaseRequest };
