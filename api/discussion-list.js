module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sheetUrl = process.env.WAITLIST_SHEET_URL;
  if (!sheetUrl) {
    res.status(500).json({ error: 'Server is missing WAITLIST_SHEET_URL' });
    return;
  }

  try {
    const upstream = await fetch(`${sheetUrl}?action=listDiscussion`);
    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'Failed to load discussion', detail });
      return;
    }
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach discussion storage' });
  }
};
