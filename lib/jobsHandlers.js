const { supabaseRequest } = require('./supabase');
const { captureError } = require('./monitor');
const { checkRateLimit, clientIp } = require('./rateLimit');

// Fixed set — matches the <select> options on jobs.html and the industry buckets used when the
// job_sponsor_records table was seeded from DOL disclosure data.
const JOBS_INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Finance',
  'Engineering',
  'Education / Research',
  'Consulting / IT Services',
  'Hospitality',
  'Manufacturing',
];

const SPONSORSHIP_TYPES = ['H-1B', 'Green Card (PERM)', 'Either'];

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

// Rough, clearly-approximate wage bands used only to softly rank results toward a candidate's
// stated experience level — never used to filter results out, since it's a heuristic, not a
// field that exists in the underlying DOL data.
function wageTier(wage) {
  if (!wage) return null;
  if (wage < 70000) return 'entry';
  if (wage < 130000) return 'mid';
  return 'senior';
}

function midWage(r) {
  const from = Number(r.wage_from);
  const to = Number(r.wage_to);
  return to ? (from + to) / 2 : from;
}

// Builds the human-readable reasons a specific record matched THIS candidate's specific
// answers — shown in the UI so "specific to you" is visible, not just a claim. Every reason
// pushed here corresponds to an actual answer the candidate gave, nothing generic.
function matchReasons(r, criteria) {
  const reasons = [];
  if (criteria.sponsorshipType !== 'Either' && r.visa_type === criteria.sponsorshipType) {
    reasons.push(criteria.sponsorshipType === 'H-1B' ? 'H-1B sponsorship' : 'Green card (PERM) sponsorship');
  }
  if (criteria.state && r.state === criteria.state) {
    reasons.push(`In ${r.state}`);
  }
  if (criteria.matchedKeywords.length) {
    reasons.push(`Matches "${criteria.matchedKeywords.join(', ')}"`);
  }
  const mid = midWage(r);
  if (criteria.salaryExpectation && mid) {
    const diff = Math.abs(mid - criteria.salaryExpectation) / criteria.salaryExpectation;
    if (diff < 0.15) reasons.push('Close to your salary target');
  } else if (criteria.experienceLevel && wageTier(mid) === criteria.experienceLevel) {
    reasons.push(`Typical ${criteria.experienceLevel}-level wage`);
  }
  return reasons;
}

// POST /api/jobs/match — takes a candidate's questionnaire answers and returns real employer
// sponsorship records (job_sponsor_records, seeded from DOL's public LCA/PERM disclosure data)
// filtered and ranked by fit. No login required — public tool, same as the rest of jobs.html.
//
// Filtering is tiered rather than pure scoring, specifically so results are actually shaped by
// what the candidate asked for instead of just re-sorting the same fixed industry list: a
// sponsorship type and job-type keywords narrow the pool for real when they'd leave at least
// one result, and only fall back to the fuller industry list (clearly labeled as broadened)
// when a strict match would otherwise return nothing.
async function handleMatch(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const allowed = await checkRateLimit(`jobs-match:${clientIp(req)}`, { limit: 30, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }

  const body = req.body || {};
  const industry = cleanString(body.industry, 100);
  if (!JOBS_INDUSTRIES.includes(industry)) {
    res.status(400).json({ error: 'A valid industry is required' });
    return;
  }
  const jobType = cleanString(body.jobType, 200).toLowerCase();
  const sponsorshipType = SPONSORSHIP_TYPES.includes(body.sponsorshipType) ? body.sponsorshipType : 'Either';
  const state = cleanString(body.state, 50).toUpperCase();
  const experienceLevel = ['entry', 'mid', 'senior'].includes(body.experienceLevel) ? body.experienceLevel : '';
  const salaryExpectation = Number(body.salaryExpectation) > 0 ? Number(body.salaryExpectation) : null;
  const keywords = jobType.split(/\s+/).filter((k) => k.length > 2);

  try {
    const upstream = await supabaseRequest(
      `job_sponsor_records?industry=eq.${encodeURIComponent(industry)}&select=*`
    );
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('jobs/match: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to load sponsor records' });
      return;
    }
    const rows = await upstream.json();

    // Tier 1: strict sponsorship-type filter (only when the candidate actually specified one).
    const sponsorshipFiltered =
      sponsorshipType === 'Either' ? rows : rows.filter((r) => r.visa_type === sponsorshipType);
    const sponsorshipPool = sponsorshipFiltered.length ? sponsorshipFiltered : rows;
    const broadenedSponsorship = sponsorshipFiltered.length === 0 && sponsorshipType !== 'Either';

    // Tier 2: strict job-title keyword filter on top of that (only when it would leave >= 1 row).
    const keywordMatch = (r) => {
      const haystack = r.job_title.toLowerCase();
      return keywords.filter((k) => haystack.includes(k));
    };
    const keywordFiltered = keywords.length
      ? sponsorshipPool.filter((r) => keywordMatch(r).length > 0)
      : sponsorshipPool;
    const pool = keywordFiltered.length ? keywordFiltered : sponsorshipPool;
    const broadenedKeywords = keywords.length > 0 && keywordFiltered.length === 0;

    const criteriaBase = { sponsorshipType, state, salaryExpectation, experienceLevel };
    const scored = pool.map((r) => {
      const matchedKeywords = keywordMatch(r);
      let score = matchedKeywords.length * 3;
      if (sponsorshipType !== 'Either' && r.visa_type === sponsorshipType) score += 4;
      if (state && r.state === state) score += 3;
      const mid = midWage(r);
      if (salaryExpectation && mid) {
        const diff = Math.abs(mid - salaryExpectation) / salaryExpectation;
        score += diff < 0.15 ? 2 : diff < 0.35 ? 1 : 0;
      } else if (experienceLevel && wageTier(mid) === experienceLevel) {
        score += 1;
      }
      return { ...r, _score: score, _reasons: matchReasons(r, { ...criteriaBase, matchedKeywords }) };
    });

    scored.sort((a, b) => b._score - a._score || new Date(b.decision_date) - new Date(a.decision_date));
    const results = scored.slice(0, 8).map(({ _score, _reasons, ...r }) => ({ ...r, matchReasons: _reasons }));

    res.status(200).json({
      success: true,
      results,
      industries: JOBS_INDUSTRIES,
      broadened: broadenedSponsorship || broadenedKeywords,
    });
  } catch (err) {
    console.error('jobs/match: request failed', err);
    await captureError(err, { route: 'jobs/match' });
    res.status(500).json({ error: 'Failed to reach database' });
  }
}

module.exports = { handleMatch, JOBS_INDUSTRIES };
