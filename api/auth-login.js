const { passwordLogin, buildSessionCookieHeader } = require('../lib/auth');
const { EMAIL_PATTERN } = require('../lib/validation');
const { checkRateLimit, clientIp } = require('../lib/rateLimit');
const { captureError } = require('../lib/monitor');

module.exports = async (req, res) => {
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
  // Two limits: one per IP+email (stops brute-forcing a single account) and one broader
  // per-IP limit (stops spraying many emails from one source, e.g. a leaked password list).
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
};
