const { supabaseRequest } = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const upstream = await supabaseRequest('discussion_posts?select=*&order=created_at.asc');

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'Failed to load discussion', detail });
      return;
    }

    const rows = await upstream.json();
    // Mapped to the same shape the frontend already expects (originally Google Sheets
    // header names), so jobs.js needs no changes for this storage swap.
    const posts = rows.map((row) => ({
      ID: row.id,
      Type: row.post_type,
      'Parent ID': row.parent_id || '',
      Name: row.name,
      Text: row.text,
      Callout: row.callout || '',
      'Submitted At': row.created_at,
    }));

    res.status(200).json({ posts });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to reach discussion storage' });
  }
};
