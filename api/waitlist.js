const { supabaseRequest } = require('../lib/supabase');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email } = req.body || {};
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';

  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    res.status(400).json({ error: 'A valid email is required' });
    return;
  }

  try {
    const upstream = await supabaseRequest('waitlist', {
      method: 'POST',
      body: { email: trimmedEmail },
      extraHeaders: { prefer: 'return=minimal' },
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'Failed to record signup', detail });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to reach waitlist storage' });
  }
};
