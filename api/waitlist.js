const { supabaseRequest } = require('../lib/supabase');
const { checkRateLimit, clientIp } = require('../lib/rateLimit');
const { captureError } = require('../lib/monitor');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const allowed = await checkRateLimit(`waitlist:${clientIp(req)}`, { limit: 10, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many submissions. Please try again later.' });
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
      console.error('waitlist: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to record signup' });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('waitlist: request failed', err);
    await captureError(err, { route: 'waitlist' });
    res.status(500).json({ error: 'Failed to reach waitlist storage' });
  }
};
