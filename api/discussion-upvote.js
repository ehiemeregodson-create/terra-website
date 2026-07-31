const { supabaseRequest } = require('../lib/supabase');
const { checkRateLimit, clientIp } = require('../lib/rateLimit');
const { captureError } = require('../lib/monitor');

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const allowed = await checkRateLimit(`discussion-upvote:${clientIp(req)}`, { limit: 60, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many upvotes. Please try again later.' });
    return;
  }

  const { id } = req.body || {};
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    res.status(400).json({ error: 'A valid post id is required' });
    return;
  }

  try {
    const upstream = await supabaseRequest('rpc/increment_upvotes', {
      method: 'POST',
      body: { post_id: id },
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('discussion-upvote: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to upvote' });
      return;
    }

    const data = await upstream.json().catch(() => null);
    const upvotes = typeof data === 'number' ? data : Array.isArray(data) ? data[0] : null;
    res.status(200).json({ success: true, upvotes });
  } catch (err) {
    console.error('discussion-upvote: request failed', err);
    await captureError(err, { route: 'discussion-upvote' });
    res.status(500).json({ error: 'Failed to reach discussion storage' });
  }
};
