const { getUserFromRequest, deleteUser, clearSessionCookieHeader } = require('../lib/auth');
const { captureError } = require('../lib/monitor');

module.exports = async (req, res) => {
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
};
