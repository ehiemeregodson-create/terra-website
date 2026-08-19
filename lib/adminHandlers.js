const { supabaseRequest } = require('./supabase');
const { getUserFromRequest } = require('./auth');
const { isAdminEmail } = require('./admin');
const { captureError } = require('./monitor');

// Reverse-coded items per construct, exactly matching the PDF questionnaire's appendix
// ("B. Likert construct map"): C1.4, C2.4, C3.4, C5.4 are reverse-worded; C4.4 is excluded
// entirely (it's the standalone fraud/exploitation flag, not part of the trust-construct mean);
// C6 has no reverse item.
const CONSTRUCTS = {
  c1: { items: ['c1_1', 'c1_2', 'c1_3', 'c1_4'], reverse: ['c1_4'] },
  c2: { items: ['c2_1', 'c2_2', 'c2_3', 'c2_4'], reverse: ['c2_4'] },
  c3: { items: ['c3_1', 'c3_2', 'c3_3', 'c3_4'], reverse: ['c3_4'] },
  c4: { items: ['c4_1', 'c4_2', 'c4_3'], reverse: [] },
  c5: { items: ['c5_1', 'c5_2', 'c5_3', 'c5_4'], reverse: ['c5_4'] },
  c6: { items: ['c6_1', 'c6_2', 'c6_3', 'c6_4'], reverse: [] },
};

const D_FIELDS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
const CATEGORICAL_FIELDS = ['a3', 'a4', 'a7', 'a8', 'a9', 'a10', 'a12', 'd10', 'a6'];
const OPEN_FIELDS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'd9'];

function mean(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function constructMeanForRow(row, def) {
  const values = def.items
    .map((field) => row[field])
    .map((raw, i) => {
      if (raw == null) return null;
      return def.reverse.includes(def.items[i]) ? 6 - raw : raw;
    })
    .filter((v) => v != null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function countBy(rows, field) {
  const counts = {};
  rows.forEach((r) => {
    const v = r[field];
    if (v == null || v === '') return;
    counts[v] = (counts[v] || 0) + 1;
  });
  return counts;
}

// GET /api/admin/survey-stats — aggregated analytics for the electronic questionnaire, mirroring
// the "Suggested analysis approach" in the PDF questionnaire's own appendix (descriptive stats
// per construct, the fraud flag kept separate, D-item ranking for product prioritization).
async function handleSurveyStats(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { user, newCookie } = await getUserFromRequest(req);
  if (newCookie) res.setHeader('Set-Cookie', newCookie);
  if (!user) {
    res.status(401).json({ error: 'Please log in to continue' });
    return;
  }
  if (!isAdminEmail(user.email)) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  try {
    const [responsesRes, contactsRes] = await Promise.all([
      supabaseRequest('survey_responses?select=*&order=created_at.desc'),
      supabaseRequest('survey_contacts?select=id'),
    ]);

    if (!responsesRes.ok || !contactsRes.ok) {
      res.status(502).json({ error: 'Failed to load survey data' });
      return;
    }

    const rows = await responsesRes.json();
    const contacts = await contactsRes.json();

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const last7 = rows.filter((r) => now - new Date(r.created_at).getTime() <= 7 * DAY).length;
    const last30 = rows.filter((r) => now - new Date(r.created_at).getTime() <= 30 * DAY).length;

    // Daily counts for the last 30 days, oldest first, zero-filled so the chart doesn't skip days.
    const byDay = {};
    rows.forEach((r) => {
      const day = new Date(r.created_at).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });
    const responsesOverTime = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * DAY).toISOString().slice(0, 10);
      responsesOverTime.push({ date: d, count: byDay[d] || 0 });
    }

    const constructMeans = {};
    Object.entries(CONSTRUCTS).forEach(([code, def]) => {
      const perRespondent = rows.map((r) => constructMeanForRow(r, def)).filter((v) => v != null);
      constructMeans[code] = mean(perRespondent);
    });

    const c44Answered = rows.filter((r) => r.c4_4 != null);
    const c44Flagged = c44Answered.filter((r) => r.c4_4 >= 4);
    const fraudFlag = {
      answeredCount: c44Answered.length,
      flaggedCount: c44Flagged.length,
      flaggedPct: c44Answered.length ? Math.round((c44Flagged.length / c44Answered.length) * 100) : null,
    };

    const solutionMeans = {};
    D_FIELDS.forEach((f) => {
      solutionMeans[f] = mean(rows.map((r) => r[f]));
    });

    const categorical = {};
    CATEGORICAL_FIELDS.forEach((f) => {
      categorical[f] = countBy(rows, f);
    });

    const recentOpenResponses = rows
      .filter((r) => OPEN_FIELDS.some((f) => r[f]))
      .slice(0, 20)
      .map((r) => {
        const entry = { id: r.id, created_at: r.created_at };
        OPEN_FIELDS.forEach((f) => {
          if (r[f]) entry[f] = r[f];
        });
        return entry;
      });

    res.status(200).json({
      success: true,
      totals: {
        totalResponses: rows.length,
        last7Days: last7,
        last30Days: last30,
        contactsLeft: contacts.length,
      },
      responsesOverTime,
      constructMeans,
      fraudFlag,
      solutionMeans,
      categorical,
      recentOpenResponses,
    });
  } catch (err) {
    console.error('admin/survey-stats: request failed', err);
    await captureError(err, { route: 'admin/survey-stats' });
    res.status(500).json({ error: 'Failed to reach database' });
  }
}

module.exports = { handleSurveyStats };
