const { adminCreateUser, passwordLogin, buildSessionCookieHeader } = require('../lib/auth');
const { EMAIL_PATTERN, PASSWORD_PATTERN, PASSWORD_ERROR } = require('../lib/validation');
const { checkRateLimit, clientIp } = require('../lib/rateLimit');
const { captureError } = require('../lib/monitor');

module.exports = async (req, res) => {
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
};
