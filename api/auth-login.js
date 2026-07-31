const { passwordLogin, buildSessionCookieHeader } = require('../lib/auth');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    res.status(500).json({ error: 'Failed to log in' });
  }
};
