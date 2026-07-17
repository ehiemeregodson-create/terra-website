const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const name = cleanString(body.name, 200);
  const email = cleanString(body.email, 200);
  const country = cleanString(body.country, 200);
  const category = cleanString(body.category, 200);
  const stage = cleanString(body.stage, 200);
  const notes = cleanString(body.notes, 2000);

  if (!name || !EMAIL_PATTERN.test(email) || !country || !category || !stage) {
    res.status(400).json({ error: 'Name, a valid email, country, category, and stage are required' });
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
      body: JSON.stringify({
        formType: 'get-started',
        name,
        email,
        country,
        category,
        stage,
        notes,
      }),
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
