const { supabaseRequest } = require('../lib/supabase');
const { checkRateLimit, clientIp } = require('../lib/rateLimit');
const { captureError } = require('../lib/monitor');

// Free-text fields — trimmed and length-capped, never required.
const TEXT_FIELDS = {
  a4_other: 200, a5: 200, a6: 200, a7_other: 200, a11: 200,
  b1: 4000, b2: 4000, b3: 4000, b4: 4000, b5: 4000, b6: 4000,
  d9: 4000,
};

// Categorical fields — stored as the full option text the respondent selected, capped generously.
const CATEGORY_FIELDS = ['a3', 'a4', 'a7', 'a8', 'a9', 'a10', 'a12', 'd10'];

// Every 1-5 scale item (24 Likert + 8 usefulness ratings) — never required, integers 1-5 only.
const SCALE_FIELDS = [
  'c1_1', 'c1_2', 'c1_3', 'c1_4',
  'c2_1', 'c2_2', 'c2_3', 'c2_4',
  'c3_1', 'c3_2', 'c3_3', 'c3_4',
  'c4_1', 'c4_2', 'c4_3', 'c4_4',
  'c5_1', 'c5_2', 'c5_3', 'c5_4',
  'c6_1', 'c6_2', 'c6_3', 'c6_4',
  'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8',
];

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanScale(value) {
  const n = typeof value === 'string' ? parseInt(value, 10) : value;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Public, unauthenticated endpoint by design (the survey is meant to reach people who
  // aren't Terra users yet) — rate-limited by IP to blunt bot/spam submissions.
  const allowed = await checkRateLimit(`survey:${clientIp(req)}`, { limit: 5, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many submissions. Please try again later.' });
    return;
  }

  const body = req.body || {};

  // Whitelist every field explicitly — nothing outside the documented columns can reach the
  // insert, regardless of what a request body contains. Every field is optional: the form's
  // own consent text says respondents may skip any question.
  const row = {};
  for (const [field, maxLength] of Object.entries(TEXT_FIELDS)) {
    const value = cleanString(body[field], maxLength);
    if (value) row[field] = value;
  }
  for (const field of CATEGORY_FIELDS) {
    const value = cleanString(body[field], 200);
    if (value) row[field] = value;
  }
  for (const field of SCALE_FIELDS) {
    const value = cleanScale(body[field]);
    if (value !== null) row[field] = value;
  }

  const contact = cleanString(body.e1, 200);

  try {
    const upstream = await supabaseRequest('survey_responses', {
      method: 'POST',
      body: row,
      extraHeaders: { prefer: 'return=minimal' },
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('survey: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to record response' });
      return;
    }

    // Deliberately a second, independent insert with no shared id — matches the form's own
    // promise that contact info is stored separately from responses, not just labeled as such.
    if (contact) {
      const contactUpstream = await supabaseRequest('survey_contacts', {
        method: 'POST',
        body: { contact },
        extraHeaders: { prefer: 'return=minimal' },
      });
      if (!contactUpstream.ok) {
        const detail = await contactUpstream.text();
        console.error('survey: contact upstream error', contactUpstream.status, detail);
        // The response itself already saved — don't fail the whole submission over this.
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('survey: request failed', err);
    await captureError(err, { route: 'survey' });
    res.status(500).json({ error: 'Failed to reach database' });
  }
};
