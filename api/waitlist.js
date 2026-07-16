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

  const sheetUrl = process.env.WAITLIST_SHEET_URL;
  if (!sheetUrl) {
    res.status(500).json({ error: 'Server is missing WAITLIST_SHEET_URL' });
    return;
  }

  try {
    const upstream = await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: trimmedEmail }),
      redirect: 'follow',
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'Failed to record signup', detail });
      return;
    }

    const data = await upstream.json().catch(() => ({}));
    if (data.error) {
      res.status(502).json({ error: data.error });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach waitlist storage' });
  }
};
