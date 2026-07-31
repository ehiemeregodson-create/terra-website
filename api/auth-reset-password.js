const { updateUserPassword, buildSessionCookieHeader } = require('../lib/auth');
const { PASSWORD_PATTERN, PASSWORD_ERROR } = require('../lib/validation');
const { checkRateLimit, clientIp } = require('../lib/rateLimit');
const { captureError } = require('../lib/monitor');

module.exports = async (req, res) => {
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

    // The recovery link's tokens are a real session — log the user straight in once their
    // password is changed, rather than sending them back to a login form.
    if (refreshToken) {
      res.setHeader('Set-Cookie', buildSessionCookieHeader({ access_token: accessToken, refresh_token: refreshToken }));
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('auth-reset-password: request failed', err);
    await captureError(err, { route: 'auth-reset-password' });
    res.status(500).json({ error: 'Failed to reset password' });
  }
};
