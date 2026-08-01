// Handler bodies for /api/auth/[action] — kept as plain exported functions (not individual
// files under /api) so Vercel's Hobby-plan 12-function cap doesn't force every auth endpoint
// into its own serverless function. See api/auth/[action].js.
const {
  adminCreateUser,
  passwordLogin,
  generateRecoveryLink,
  updateUserPassword,
  deleteUser,
  buildSessionCookieHeader,
  clearSessionCookieHeader,
  getUserFromRequest,
} = require('./auth');
const { sendEmail } = require('./email');
const { EMAIL_PATTERN, PASSWORD_PATTERN, PASSWORD_ERROR } = require('./validation');
const { checkRateLimit, clientIp } = require('./rateLimit');
const { captureError } = require('./monitor');

// TEMPORARY — verifies Sentry is wired up correctly. Remove after confirming an event lands
// in the Sentry dashboard.
async function handleTestError(req, res) {
  try {
    throw new Error('Terra Sentry verification test — safe to ignore, no real error occurred');
  } catch (err) {
    await captureError(err, { route: 'test-error', note: 'intentional test trigger' });
    res.status(200).json({ tested: true });
  }
}

function siteOrigin(req) {
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

  const ip = clientIp(req);
  const [perAccountOk, perIpOk] = await Promise.all([
    checkRateLimit(`auth-login:acct:${ip}:${email}`, { limit: 8, windowSeconds: 900 }),
    checkRateLimit(`auth-login:ip:${ip}`, { limit: 30, windowSeconds: 900 }),
  ]);
  if (!perAccountOk || !perIpOk) {
    res.status(429).json({ error: 'Too many login attempts. Please try again in a few minutes.' });
    return;
  }

  try {
    const login = await passwordLogin({ email, password });
    if (!login.ok) {
      res.status(401).json({ error: 'Incorrect email or password' });
      return;
    }

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
    user: { id: user.id, email: user.email, fullName: user.user_metadata?.full_name || '' },
  });
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
  handleForgotPassword,
  handleResetPassword,
  handleDeleteAccount,
  handleTestError,
};
