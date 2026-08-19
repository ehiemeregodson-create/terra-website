const { supabaseRequest } = require('./supabase');
const { getUserFromRequest } = require('./auth');
const { getUserPlan } = require('./subscription');
const { captureError } = require('./monitor');

async function requireUser(req, res) {
  const { user, newCookie } = await getUserFromRequest(req);
  if (newCookie) res.setHeader('Set-Cookie', newCookie);
  if (!user) {
    res.status(401).json({ error: 'Please log in to continue' });
    return null;
  }
  return user;
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

// GET /api/dashboard/summary — everything the homepage dashboard needs in one call. Returns the
// full data set regardless of plan; the frontend applies the blur/lock treatment for tiers the
// user hasn't unlocked. A user's own case data isn't sensitive to them specifically, so this
// keeps the endpoint simple — server-side stripping by plan is a straightforward follow-up if
// ever needed.
async function handleSummary(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const [plan, casesRes, eventsRes, checklistRes, estimatesRes, attorneyRes, alertsRes] = await Promise.all([
      getUserPlan(user.id),
      supabaseRequest(`cases?user_id=eq.${user.id}&order=created_at.desc&select=*`),
      supabaseRequest(`case_events?user_id=eq.${user.id}&order=occurred_at.desc&limit=30&select=*`),
      supabaseRequest(`prep_checklist_items?user_id=eq.${user.id}&order=sort_order.asc&select=*`),
      supabaseRequest(`case_timeline_estimates?select=*`),
      supabaseRequest(`attorney_connections?user_id=eq.${user.id}&select=*`),
      supabaseRequest(`policy_alerts?order=published_at.desc&limit=50&select=*`),
    ]);

    for (const [name, r] of [
      ['cases', casesRes], ['case_events', eventsRes], ['prep_checklist_items', checklistRes],
      ['case_timeline_estimates', estimatesRes], ['attorney_connections', attorneyRes], ['policy_alerts', alertsRes],
    ]) {
      if (!r.ok) {
        const detail = await r.text();
        console.error(`dashboard/summary: ${name} upstream error`, r.status, detail);
        res.status(502).json({ error: 'Failed to load dashboard data' });
        return;
      }
    }

    const cases = await casesRes.json();
    const caseEvents = await eventsRes.json();
    const checklistItems = await checklistRes.json();
    const timelineEstimates = await estimatesRes.json();
    const attorneyConnections = await attorneyRes.json();
    const allAlerts = await alertsRes.json();

    // Matched in JS rather than a PostgREST OR/AND filter — policy_alerts is a small,
    // team-curated table, so a full fetch + in-memory filter is simpler and just as fast.
    const userCategories = new Set(cases.map((c) => c.category).filter(Boolean));
    const userCountries = new Set(cases.map((c) => c.country_to).filter(Boolean));
    const policyAlerts = allAlerts.filter(
      (a) =>
        (!a.category || userCategories.has(a.category)) &&
        (!a.country_to || userCountries.has(a.country_to))
    );

    res.status(200).json({
      success: true,
      plan,
      cases,
      caseEvents,
      checklistItems,
      timelineEstimates,
      attorneyConnections,
      policyAlerts,
    });
  } catch (err) {
    console.error('dashboard/summary: request failed', err);
    await captureError(err, { route: 'dashboard/summary' });
    res.status(500).json({ error: 'Failed to reach database' });
  }
}

// POST /api/dashboard/toggle-checklist — flips one prep item, scoped to the owning user.
async function handleToggleChecklist(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const itemId = cleanString((req.body || {}).itemId, 100);
  const completed = Boolean((req.body || {}).completed);
  if (!itemId) {
    res.status(400).json({ error: 'Missing item id' });
    return;
  }

  try {
    const upstream = await supabaseRequest(
      `prep_checklist_items?id=eq.${encodeURIComponent(itemId)}&user_id=eq.${user.id}`,
      { method: 'PATCH', body: { completed }, extraHeaders: { prefer: 'return=minimal' } }
    );
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('dashboard/toggle-checklist: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to update checklist item' });
      return;
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('dashboard/toggle-checklist: request failed', err);
    await captureError(err, { route: 'dashboard/toggle-checklist' });
    res.status(500).json({ error: 'Failed to reach database' });
  }
}

// POST /api/dashboard/request-attorney-call — records a real user action (Premium tier). Does
// not book or match an actual attorney; that's a manual follow-up by the Terra team today.
async function handleRequestAttorneyCall(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const caseId = cleanString((req.body || {}).caseId, 100);
  if (!caseId) {
    res.status(400).json({ error: 'Missing case id' });
    return;
  }

  try {
    // Confirm the case actually belongs to this user before creating a connection row for it.
    const caseCheck = await supabaseRequest(`cases?id=eq.${encodeURIComponent(caseId)}&user_id=eq.${user.id}&select=id`);
    if (!caseCheck.ok || (await caseCheck.json()).length === 0) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    const upstream = await supabaseRequest('attorney_connections?on_conflict=case_id', {
      method: 'POST',
      body: {
        case_id: caseId,
        user_id: user.id,
        status: 'requested',
        requested_at: new Date().toISOString(),
      },
      extraHeaders: { prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('dashboard/request-attorney-call: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to request a call' });
      return;
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('dashboard/request-attorney-call: request failed', err);
    await captureError(err, { route: 'dashboard/request-attorney-call' });
    res.status(500).json({ error: 'Failed to reach database' });
  }
}

module.exports = { handleSummary, handleToggleChecklist, handleRequestAttorneyCall };
