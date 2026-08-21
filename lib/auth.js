const SESSION_COOKIE = 'terra_session';

function authBase() {
  const url = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/\/+$/, '') : '';
  return `${url}/auth/v1`;
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// Creates a pre-confirmed user via Supabase's admin API. Using service_role here (server-side
// only) lets us skip Supabase's built-in email-confirmation flow entirely, which matters because
// the free tier's email sending is rate-limited to only a few per hour — nowhere near enough for
// real signups.
async function adminCreateUser({ email, password, fullName }) {
  const res = await fetch(`${authBase()}/admin/users`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: serviceKey(),
      authorization: `Bearer ${serviceKey()}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || '' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function passwordLogin({ email, password }) {
  const res = await fetch(`${authBase()}/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: serviceKey(),
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function refreshSession(refreshToken) {
  const res = await fetch(`${authBase()}/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: serviceKey(),
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function getUserFromToken(accessToken) {
  const res = await fetch(`${authBase()}/user`, {
    headers: {
      apikey: serviceKey(),
      authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Generates a password-recovery link via the admin API instead of triggering Supabase's own
// recovery email — same reasoning as adminCreateUser: the free tier's email sending is too
// rate-limited to rely on, so we generate the link here and deliver it ourselves via Resend.
async function generateRecoveryLink({ email, redirectTo }) {
  const res = await fetch(`${authBase()}/admin/generate_link`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: serviceKey(),
      authorization: `Bearer ${serviceKey()}`,
    },
    body: JSON.stringify({ type: 'recovery', email, options: { redirect_to: redirectTo } }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Updates the password of whichever user the given access token belongs to. Used to complete
// the recovery flow: the token comes from the recovery link Supabase issues, not from a normal
// login, but GoTrue treats it as a valid (if narrowly-scoped) session for this call.
async function updateUserPassword({ accessToken, password }) {
  const res = await fetch(`${authBase()}/user`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      apikey: serviceKey(),
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Merges fields into a user's user_metadata (e.g. avatar_url) via the admin API. GoTrue replaces
// user_metadata wholesale on this call, so the caller must pass the *full* object it wants to
// end up with, not just the changed keys — see handleUpdateAvatar, which reads the user's
// current metadata first and spreads it before adding avatar_url.
async function updateUserMetadata(userId, metadata) {
  const res = await fetch(`${authBase()}/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      apikey: serviceKey(),
      authorization: `Bearer ${serviceKey()}`,
    },
    body: JSON.stringify({ user_metadata: metadata }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function deleteUser(userId) {
  const res = await fetch(`${authBase()}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: serviceKey(),
      authorization: `Bearer ${serviceKey()}`,
    },
  });
  return { ok: res.ok, status: res.status };
}

function buildSessionCookieHeader(session) {
  const value = encodeURIComponent(
    JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })
  );
  const maxAge = 60 * 60 * 24 * 30; // 30 days — the refresh token carries the session this whole window
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

// Resolves the logged-in user (if any) from the request's session cookie. Transparently
// refreshes an expired access token using the stored refresh token; if that succeeds, the
// caller must apply `newCookie` to the response so the client's session stays current.
async function getUserFromRequest(req) {
  const cookies = parseCookies(req);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return { user: null, newCookie: null };

  let session;
  try {
    session = JSON.parse(raw);
  } catch (err) {
    return { user: null, newCookie: null };
  }
  if (!session.access_token) return { user: null, newCookie: null };

  const direct = await getUserFromToken(session.access_token);
  if (direct.ok) {
    return { user: direct.data, newCookie: null };
  }

  if (session.refresh_token) {
    const refreshed = await refreshSession(session.refresh_token);
    if (refreshed.ok && refreshed.data.access_token) {
      const afterRefresh = await getUserFromToken(refreshed.data.access_token);
      if (afterRefresh.ok) {
        return { user: afterRefresh.data, newCookie: buildSessionCookieHeader(refreshed.data) };
      }
    }
  }

  return { user: null, newCookie: clearSessionCookieHeader() };
}

module.exports = {
  adminCreateUser,
  passwordLogin,
  refreshSession,
  getUserFromToken,
  generateRecoveryLink,
  updateUserPassword,
  updateUserMetadata,
  deleteUser,
  buildSessionCookieHeader,
  clearSessionCookieHeader,
  getUserFromRequest,
};
