const { adminCreateUser, passwordLogin, buildSessionCookieHeader } = require('../lib/auth');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Must be more than 8 characters and include at least one uppercase letter, one lowercase
// letter, and one symbol. Enforced here (not just client-side) so it can't be bypassed.
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{9,}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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
    res.status(400).json({
      error:
        'Password must be more than 8 characters and include an uppercase letter, a lowercase letter, and a symbol.',
    });
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
    res.status(500).json({ error: 'Failed to create account' });
  }
};
