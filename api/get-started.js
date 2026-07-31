const { supabaseRequest } = require('../lib/supabase');
const { getUserFromRequest } = require('../lib/auth');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Require a logged-in account — the frontend already redirects unauthenticated visitors to
  // account.html, but that's a UX nicety, not security. This is the real gate: anyone could
  // otherwise POST here directly, bypassing the redirect entirely.
  const { user, newCookie } = await getUserFromRequest(req);
  if (newCookie) res.setHeader('Set-Cookie', newCookie);
  if (!user) {
    res.status(401).json({ error: 'Please log in to continue' });
    return;
  }

  const body = req.body || {};
  const name = cleanString(body.name, 200);
  const email = cleanString(body.email, 200);
  const country = cleanString(body.country, 200);
  const destinationCountry = cleanString(body.destinationCountry, 200);
  const category = cleanString(body.category, 200);
  const stage = cleanString(body.stage, 200);
  const sponsorStatus = cleanString(body.sponsorStatus, 200);
  const currentStatus = cleanString(body.currentStatus, 200);
  const legalRepresentation = cleanString(body.legalRepresentation, 200);
  const urgency = cleanString(body.urgency, 200);
  const notes = cleanString(body.notes, 2000);
  const selectedPlan = cleanString(body.selectedPlan, 50);

  if (
    !name ||
    !EMAIL_PATTERN.test(email) ||
    !country ||
    !destinationCountry ||
    !category ||
    !stage ||
    !sponsorStatus ||
    !currentStatus ||
    !legalRepresentation ||
    !urgency
  ) {
    res.status(400).json({ error: 'All fields except notes are required' });
    return;
  }

  try {
    const upstream = await supabaseRequest('get_started', {
      method: 'POST',
      body: {
        user_id: user.id,
        name,
        email,
        country_from: country,
        country_to: destinationCountry,
        category,
        stage,
        sponsor_status: sponsorStatus,
        current_status: currentStatus,
        legal_representation: legalRepresentation,
        urgency,
        notes: notes || null,
        selected_plan: selectedPlan || null,
      },
      extraHeaders: { prefer: 'return=minimal' },
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('get-started: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to record signup' });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('get-started: request failed', err);
    res.status(500).json({ error: 'Failed to reach database' });
  }
};
