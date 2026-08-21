function getSupabaseConfig() {
  const rawUrl = process.env.SUPABASE_URL;
  // Strip any trailing slash — combined with the "/rest/v1/..." path below, a trailing
  // slash on the env var produces a double slash that PostgREST rejects as an invalid path.
  const url = rawUrl ? rawUrl.replace(/\/+$/, '') : rawUrl;
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

// Uploads a file straight to Supabase Storage (not PostgREST) — used for user-uploaded profile
// pictures. `upsert: true` so re-uploading to the same path (e.g. a user replacing their photo)
// overwrites rather than erroring.
async function uploadToStorage(bucket, path, buffer, contentType) {
  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) {
    throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'x-upsert': 'true',
    },
    body: buffer,
  });

  return res;
}

function publicStorageUrl(bucket, path) {
  const { url } = getSupabaseConfig();
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

module.exports = { supabaseRequest, uploadToStorage, publicStorageUrl };
