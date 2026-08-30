// Handler bodies for /api/auth/[action] — kept as plain exported functions (not individual
// files under /api) so Vercel's Hobby-plan 12-function cap doesn't force every auth endpoint
// into its own serverless function. See api/auth/[action].js.
const {
  adminCreateUser,
  passwordLogin,
  generateRecoveryLink,
  updateUserPassword,
  updateUserMetadata,
  deleteUser,
  buildSessionCookieHeader,
  clearSessionCookieHeader,
  getUserFromRequest,
} = require('./auth');
const { sendEmail } = require('./email');
const { EMAIL_PATTERN, PASSWORD_PATTERN, PASSWORD_ERROR } = require('./validation');
const { checkRateLimit, clientIp } = require('./rateLimit');
const { captureError } = require('./monitor');
const { supabaseRequest, uploadToStorage, publicStorageUrl } = require('./supabase');
const { cancelSubscription } = require('./stripe');
const { checkLockout, recordFailure, resetLockout, formatWait } = require('./loginLockout');

// Prefers a hardcoded canonical origin over the request's Host/X-Forwarded-Proto headers —
// those are attacker-suppliable, and trusting them to build a password-reset link is a known
// vulnerability class (reset-link poisoning) if any non-canonical hostname ever routes to this
// deployment. Falls back to the header-derived value only if SITE_URL isn't set yet, so this
// doesn't break existing deployments before the env var is added.
function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}

async function handleSignup(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const allowed = await checkRateLimit(`auth-signup:${clientIp(req)}`, { limit: 8, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many signup attempts. Please try again later.' });
    return;
  }

  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 200) : '';

  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: 'A valid email is required' });
    return;
  }
  if (!PASSWORD_PATTERN.test(password)) {
    res.status(400).json({ error: PASSWORD_ERROR });
    return;
  }
  // Self-declared, like virtually every site with an age requirement — Terra doesn't verify
  // ID. But the checkbox being ticked is still checked here, not just in the browser, so the
  // requirement can't be bypassed by calling this endpoint directly.
  if (body.ageConfirmed !== true) {
    res.status(400).json({ error: 'You must confirm you are 15 years of age or older to create an account.' });
    return;
  }

  try {
    const created = await adminCreateUser({ email, password, fullName });
    if (!created.ok) {
      const message = created.data?.msg || created.data?.error_description || created.data?.message || '';
      if (created.status === 422 || /already registered|already exists/i.test(message)) {
        res.status(409).json({ error: 'An account with that email already exists.' });
        return;
      }
      console.error('auth-signup: create user failed', created.status, created.data);
      res.status(502).json({ error: 'Failed to create account' });
      return;
    }

    const login = await passwordLogin({ email, password });
    if (!login.ok) {
      console.error('auth-signup: post-signup login failed', login.status, login.data);
      res.status(502).json({ error: 'Account created, but automatic sign-in failed — please log in.' });
      return;
    }

    res.setHeader('Set-Cookie', buildSessionCookieHeader(login.data));
    res.status(200).json({ success: true, user: { id: created.data.id, email, fullName } });
  } catch (err) {
    console.error('auth-signup: request failed', err);
    await captureError(err, { route: 'auth-signup' });
    res.status(500).json({ error: 'Failed to create account' });
  }
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!EMAIL_PATTERN.test(email) || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  // Broad per-IP limit guards against spraying many different accounts from one source.
  // Per-account lockout (below) is the one that actually enforces "5 wrong passwords locks
  // this account" — it's keyed by email, not IP, since the account needs protecting
  // regardless of where the attacker is connecting from.
  const ip = clientIp(req);
  const perIpOk = await checkRateLimit(`auth-login:ip:${ip}`, { limit: 30, windowSeconds: 900 });
  if (!perIpOk) {
    res.status(429).json({ error: 'Too many login attempts. Please try again in a few minutes.' });
    return;
  }

  const lockStatus = await checkLockout(email);
  if (lockStatus.locked) {
    res.status(403).json({
      error: `Too many failed attempts. This account is locked for ${formatWait(lockStatus.lockedUntil)}.`,
    });
    return;
  }

  try {
    const login = await passwordLogin({ email, password });
    if (!login.ok) {
      const failure = await recordFailure(email);
      if (failure.locked) {
        res.status(403).json({
          error: `Too many failed attempts. This account is locked for ${formatWait(failure.lockedUntil)}.`,
        });
        return;
      }
      res.status(401).json({ error: 'Incorrect email or password' });
      return;
    }

    await resetLockout(email);

    res.setHeader('Set-Cookie', buildSessionCookieHeader(login.data));
    res.status(200).json({
      success: true,
      user: {
        id: login.data.user?.id,
        email,
        fullName: login.data.user?.user_metadata?.full_name || '',
      },
    });
  } catch (err) {
    console.error('auth-login: request failed', err);
    await captureError(err, { route: 'auth-login' });
    res.status(500).json({ error: 'Failed to log in' });
  }
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Set-Cookie', clearSessionCookieHeader());
  res.status(200).json({ success: true });
}

async function handleMe(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { user, newCookie } = await getUserFromRequest(req);
  if (newCookie) res.setHeader('Set-Cookie', newCookie);

  if (!user) {
    res.status(200).json({ authenticated: false });
    return;
  }

  res.status(200).json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name || '',
      avatarUrl: user.user_metadata?.avatar_url || '',
    },
  });
}

const AVATAR_PRESET_PATTERN = /^avatar-(?:[1-9]|10)$/;
const AVATAR_MIME_TO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// 2MB raw — base64-encodes to ~2.7MB, safely under Vercel's ~4.5MB request body limit once
// wrapped in the rest of the JSON payload.
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

// POST /api/auth/update-avatar — sets the signed-in user's profile picture, either to one of
// the 10 built-in presets (avatars/avatar-1.svg .. avatar-10.svg, served as plain static files —
// no upload involved) or to a photo the user uploaded (stored in Supabase Storage). Called from
// the "choose your profile picture" step right after signup, and from account.html afterward if
// someone wants to change it.
async function handleUpdateAvatar(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { user, newCookie } = await getUserFromRequest(req);
  if (newCookie) res.setHeader('Set-Cookie', newCookie);
  if (!user) {
    res.status(401).json({ error: 'Please log in to continue' });
    return;
  }

  const allowed = await checkRateLimit(`auth-avatar:${user.id}`, { limit: 20, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }

  const body = req.body || {};
  let avatarUrl;

  try {
    if (typeof body.presetId === 'string' && AVATAR_PRESET_PATTERN.test(body.presetId)) {
      avatarUrl = `/avatars/${body.presetId}.svg`;
    } else if (typeof body.imageBase64 === 'string' && body.imageBase64) {
      const contentType = body.contentType;
      const ext = AVATAR_MIME_TO_EXT[contentType];
      if (!ext) {
        res.status(400).json({ error: 'Please upload a JPEG, PNG, or WEBP image.' });
        return;
      }

      const buffer = Buffer.from(body.imageBase64, 'base64');
      if (!buffer.length) {
        res.status(400).json({ error: 'That image could not be read — please try another file.' });
        return;
      }
      if (buffer.length > AVATAR_MAX_BYTES) {
        res.status(400).json({ error: 'That image is too large — please use one under 2MB.' });
        return;
      }

      const path = `${user.id}/${Date.now()}.${ext}`;
      const upload = await uploadToStorage('avatars', path, buffer, contentType);
      if (!upload.ok) {
        const detail = await upload.text();
        console.error('auth-update-avatar: storage upload failed', upload.status, detail);
        res.status(502).json({ error: 'Failed to upload image' });
        return;
      }
      avatarUrl = publicStorageUrl('avatars', path);
    } else {
      res.status(400).json({ error: 'Choose a preset avatar or upload an image.' });
      return;
    }

    const updated = await updateUserMetadata(user.id, { ...user.user_metadata, avatar_url: avatarUrl });
    if (!updated.ok) {
      console.error('auth-update-avatar: metadata update failed', updated.status, updated.data);
      res.status(502).json({ error: 'Failed to save your profile picture' });
      return;
    }

    res.status(200).json({ success: true, avatarUrl });
  } catch (err) {
    console.error('auth-update-avatar: request failed', err);
    await captureError(err, { route: 'auth-update-avatar' });
    res.status(500).json({ error: 'Failed to reach the server' });
  }
}

async function handleForgotPassword(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const email = typeof (req.body || {}).email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: 'A valid email is required' });
    return;
  }

  const allowed = await checkRateLimit(`auth-forgot:${clientIp(req)}:${email}`, {
    limit: 5,
    windowSeconds: 3600,
  });
  if (!allowed) {
    res.status(200).json({ success: true });
    return;
  }

  try {
    const redirectTo = `${siteOrigin(req)}/reset-password.html`;
    const generated = await generateRecoveryLink({ email, redirectTo });

    if (generated.ok && generated.data.action_link) {
      await sendEmail({
        to: email,
        subject: 'Reset your Terra password',
        html: `
          <p>Someone requested a password reset for this Terra account.</p>
          <p><a href="${generated.data.action_link}">Click here to set a new password</a>. This link expires shortly, and if you didn't request it, you can safely ignore this email.</p>
        `,
      });
    } else if (generated.status !== 422 && !/not found/i.test(generated.data?.msg || '')) {
      console.error('auth-forgot-password: generate_link failed', generated.status, generated.data);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('auth-forgot-password: request failed', err);
    await captureError(err, { route: 'auth-forgot-password' });
    res.status(200).json({ success: true });
  }
}

async function handleResetPassword(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const allowed = await checkRateLimit(`auth-reset:${clientIp(req)}`, { limit: 10, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    return;
  }

  const body = req.body || {};
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';
  const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!accessToken) {
    res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    return;
  }
  if (!PASSWORD_PATTERN.test(password)) {
    res.status(400).json({ error: PASSWORD_ERROR });
    return;
  }

  try {
    const updated = await updateUserPassword({ accessToken, password });
    if (!updated.ok) {
      res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
      return;
    }

    if (refreshToken) {
      res.setHeader('Set-Cookie', buildSessionCookieHeader({ access_token: accessToken, refresh_token: refreshToken }));
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('auth-reset-password: request failed', err);
    await captureError(err, { route: 'auth-reset-password' });
    res.status(500).json({ error: 'Failed to reset password' });
  }
}

async function handleDeleteAccount(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { user } = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Please log in to continue' });
    return;
  }

  try {
    // Cancel any active Stripe subscription first — deleting the account only removes it
    // from our database. Without this, someone who deletes their account while on Terra Pro
    // would keep being billed monthly with no way to stop it themselves.
    const subsRes = await supabaseRequest(
      `subscriptions?user_id=eq.${user.id}&stripe_subscription_id=not.is.null&select=stripe_subscription_id`
    );
    if (subsRes.ok) {
      const rows = await subsRes.json();
      for (const row of rows) {
        const cancelled = await cancelSubscription(row.stripe_subscription_id);
        if (!cancelled.ok) {
          console.error('auth-delete-account: failed to cancel subscription', row.stripe_subscription_id, cancelled.status, cancelled.data);
        }
      }
    } else {
      console.error('auth-delete-account: failed to look up subscriptions', subsRes.status);
    }

    const result = await deleteUser(user.id);
    if (!result.ok) {
      console.error('auth-delete-account: delete failed', result.status);
      res.status(502).json({ error: 'Failed to delete account. Please try again.' });
      return;
    }

    res.setHeader('Set-Cookie', clearSessionCookieHeader());
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('auth-delete-account: request failed', err);
    await captureError(err, { route: 'auth-delete-account' });
    res.status(500).json({ error: 'Failed to delete account' });
  }
}

module.exports = {
  handleSignup,
  handleLogin,
  handleLogout,
  handleMe,
  handleUpdateAvatar,
  handleForgotPassword,
  handleResetPassword,
  handleDeleteAccount,
};
