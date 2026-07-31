const { getUserFromRequest } = require('../lib/auth');

module.exports = async (req, res) => {
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
};
