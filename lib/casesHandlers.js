const { supabaseRequest } = require('./supabase');
const { getUserFromRequest } = require('./auth');
const { sendEmail } = require('./email');
const { checkRateLimit, clientIp } = require('./rateLimit');
const { captureError } = require('./monitor');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PLAN_LABELS = {
  free: 'Terra Free',
  pro: 'Terra Pro',
  premium: 'Terra Premium',
};

const FILING_FOR_LABELS = {
  self: 'My case',
  spouse: "My spouse's case",
  child: "My child's case",
  parent: "My parent's case",
  other: 'Case',
};

// Seeded onto a case's prep_checklist_items on creation — general, non-case-specific guidance
// (not legal advice), matched to the exact category option text from get-started.html.
const CHECKLIST_TEMPLATES = {
  'Employment / work visa': [
    'Gather your employment verification letter and job offer details',
    'Organize proof of your qualifications and work experience',
    "Review your employer's sponsorship documentation",
    'Practice answers to common work-visa interview questions',
  ],
  'Family reunification': [
    'Gather proof of your relationship (marriage certificate, birth certificates, photos)',
    'Prepare financial support / affidavit of support documents',
    'Confirm all documents are translated and certified if needed',
    'Review common family-based interview questions',
  ],
  'Study (student visa)': [
    "Confirm your school's enrollment/acceptance documentation is current",
    'Gather proof of financial support for tuition and living costs',
    'Prepare your academic transcripts and test scores',
    'Review your study plan and post-graduation intentions',
  ],
  'Asylum / refugee protection': [
    'Write a detailed, dated account of the events supporting your claim',
    'Gather any supporting evidence (documents, photos, witness statements)',
    'Identify any corroborating country-condition reports',
    'Prepare for a sensitive, detailed interview — consider legal support',
  ],
  'Permanent residency / settlement': [
    'Confirm all prior immigration history documents are in order',
    'Gather proof of ties and continuous presence, if applicable',
    'Review medical exam and background check requirements',
    'Double-check all forms for consistency with prior filings',
  ],
  'Investment / business': [
    'Organize your business plan and funding source documentation',
    'Gather proof of investment funds and their lawful source',
    'Prepare financial statements and job-creation projections',
    'Review the specific investment thresholds for your case type',
  ],
  'Citizenship / naturalization': [
    'Confirm you meet the residency and physical-presence requirements',
    'Review the civics and language test requirements',
    'Gather proof of continuous residence and good moral character',
    'Practice for the naturalization interview',
  ],
};
const DEFAULT_CHECKLIST = [
  'Gather all documents related to your case',
  'Confirm your current filing status and next deadline',
  'Organize your paperwork in one place for easy reference',
  'Note any outstanding questions to ask a legal professional',
];
function getChecklistTemplate(category) {
  return CHECKLIST_TEMPLATES[category] || DEFAULT_CHECKLIST;
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function defaultCaseName(filingFor, category) {
  const base = FILING_FOR_LABELS[filingFor] || FILING_FOR_LABELS.other;
  return category ? `${base} — ${category}` : base;
}

async function requireUser(req, res) {
  const { user, newCookie } = await getUserFromRequest(req);
  if (newCookie) res.setHeader('Set-Cookie', newCookie);
  if (!user) {
    res.status(401).json({ error: 'Please log in to continue' });
    return null;
  }
  return user;
}

// GET /api/cases/list — every case belonging to the signed-in user, newest first.
// Powers both the dashboard grid and the edit form's prefill (client filters by id).
async function handleList(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const upstream = await supabaseRequest(
      `cases?user_id=eq.${user.id}&order=created_at.desc&select=*`
    );
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('cases/list: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to load cases' });
      return;
    }
    const cases = await upstream.json();
    res.status(200).json({ success: true, cases });
  } catch (err) {
    console.error('cases/list: request failed', err);
    await captureError(err, { route: 'cases/list' });
    res.status(500).json({ error: 'Failed to reach database' });
  }
}

function readCaseFields(body) {
  return {
    name: cleanString(body.name, 200),
    email: cleanString(body.email, 200),
    country: cleanString(body.country, 200),
    destinationCountry: cleanString(body.destinationCountry, 200),
    category: cleanString(body.category, 200),
    stage: cleanString(body.stage, 200),
    sponsorStatus: cleanString(body.sponsorStatus, 200),
    currentStatus: cleanString(body.currentStatus, 200),
    legalRepresentation: cleanString(body.legalRepresentation, 200),
    urgency: cleanString(body.urgency, 200),
    notes: cleanString(body.notes, 2000),
    selectedPlan: cleanString(body.selectedPlan, 50),
    filingFor: cleanString(body.filingFor, 20) || 'self',
    filingForDetail: cleanString(body.filingForDetail, 200),
    caseName: cleanString(body.caseName, 200),
  };
}

function validateCaseFields(f) {
  return (
    f.name &&
    EMAIL_PATTERN.test(f.email) &&
    f.country &&
    f.destinationCountry &&
    f.category &&
    f.stage &&
    f.sponsorStatus &&
    f.currentStatus &&
    f.legalRepresentation &&
    f.urgency
  );
}

// POST /api/cases/create — start a new case (one row per applicant/family member; a single
// account can hold several).
async function handleCreate(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const allowed = await checkRateLimit(`cases-create:${clientIp(req)}`, { limit: 15, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many submissions. Please try again later.' });
    return;
  }

  const f = readCaseFields(req.body || {});
  if (!validateCaseFields(f)) {
    res.status(400).json({ error: 'All fields except notes are required' });
    return;
  }

  try {
    const upstream = await supabaseRequest('cases', {
      method: 'POST',
      body: {
        user_id: user.id,
        name: f.name,
        email: f.email,
        country_from: f.country,
        country_to: f.destinationCountry,
        category: f.category,
        stage: f.stage,
        sponsor_status: f.sponsorStatus,
        current_status: f.currentStatus,
        legal_representation: f.legalRepresentation,
        urgency: f.urgency,
        notes: f.notes || null,
        selected_plan: f.selectedPlan || null,
        filing_for: f.filingFor,
        filing_for_detail: f.filingForDetail || null,
        case_name: f.caseName || defaultCaseName(f.filingFor, f.category),
      },
      // return=representation (not minimal) — the dashboard's case_events/prep_checklist_items
      // rows need the new case's id, which only comes back if PostgREST echoes the inserted row.
      extraHeaders: { prefer: 'return=representation' },
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('cases/create: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to record case' });
      return;
    }

    const [newCase] = await upstream.json();

    // Best-effort — these back dashboard widgets but a hiccup here shouldn't fail case creation,
    // which the user is actively waiting on.
    if (newCase && newCase.id) {
      try {
        await supabaseRequest('case_events', {
          method: 'POST',
          body: {
            case_id: newCase.id,
            user_id: user.id,
            event_type: 'created',
            title: 'Case created',
          },
          extraHeaders: { prefer: 'return=minimal' },
        });

        const checklistRows = getChecklistTemplate(f.category).map((label, i) => ({
          case_id: newCase.id,
          user_id: user.id,
          label,
          sort_order: i,
        }));
        await supabaseRequest('prep_checklist_items', {
          method: 'POST',
          body: checklistRows,
          extraHeaders: { prefer: 'return=minimal' },
        });
      } catch (seedErr) {
        console.error('cases/create: dashboard seed failed (non-fatal)', seedErr);
      }
    }

    // Awaited (not fire-and-forget) — a serverless invocation can be frozen the moment the
    // response is sent, so an un-awaited background call here has no guarantee of completing.
    const planLabel = PLAN_LABELS[f.selectedPlan] || 'Terra';
    await sendEmail({
      to: f.email,
      subject: "You're signed up with Terra",
      html: `
        <p>Hi ${f.name || 'there'},</p>
        <p>Thanks for telling us about your case. You're signed up for <strong>${planLabel}</strong>, and we'll start sending you policy interpretation and alerts relevant to your ${f.category.toLowerCase()} case in ${f.destinationCountry}.</p>
        <p>— Terra</p>
      `,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('cases/create: request failed', err);
    await captureError(err, { route: 'cases/create' });
    res.status(500).json({ error: 'Failed to reach database' });
  }
}

// POST /api/cases/update — edit an existing case. Scoped to id + user_id so nobody can edit
// a case that isn't theirs. No confirmation email (editing shouldn't spam the inbox).
async function handleUpdate(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const allowed = await checkRateLimit(`cases-update:${clientIp(req)}`, { limit: 30, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }

  const id = cleanString((req.body || {}).id, 100);
  if (!id) {
    res.status(400).json({ error: 'Missing case id' });
    return;
  }

  const f = readCaseFields(req.body || {});
  if (!validateCaseFields(f)) {
    res.status(400).json({ error: 'All fields except notes are required' });
    return;
  }

  try {
    // Fetched before the PATCH so a stage change can be detected and logged to case_events —
    // this is what actually backs the Pro-tier "case timeline" dashboard widget.
    let previousStage = null;
    try {
      const existingRes = await supabaseRequest(
        `cases?id=eq.${encodeURIComponent(id)}&user_id=eq.${user.id}&select=stage`
      );
      if (existingRes.ok) {
        const [existing] = await existingRes.json();
        previousStage = existing ? existing.stage : null;
      }
    } catch (lookupErr) {
      console.error('cases/update: stage lookup failed (non-fatal)', lookupErr);
    }

    const upstream = await supabaseRequest(
      `cases?id=eq.${encodeURIComponent(id)}&user_id=eq.${user.id}`,
      {
        method: 'PATCH',
        body: {
          name: f.name,
          email: f.email,
          country_from: f.country,
          country_to: f.destinationCountry,
          category: f.category,
          stage: f.stage,
          sponsor_status: f.sponsorStatus,
          current_status: f.currentStatus,
          legal_representation: f.legalRepresentation,
          urgency: f.urgency,
          notes: f.notes || null,
          filing_for: f.filingFor,
          filing_for_detail: f.filingForDetail || null,
          case_name: f.caseName || defaultCaseName(f.filingFor, f.category),
          updated_at: new Date().toISOString(),
        },
        extraHeaders: { prefer: 'return=minimal' },
      }
    );

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('cases/update: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to update case' });
      return;
    }

    if (previousStage !== null && previousStage !== f.stage) {
      try {
        await supabaseRequest('case_events', {
          method: 'POST',
          body: {
            case_id: id,
            user_id: user.id,
            event_type: 'stage_change',
            title: `Stage changed to "${f.stage}"`,
            description: `Previously: ${previousStage}`,
          },
          extraHeaders: { prefer: 'return=minimal' },
        });
      } catch (eventErr) {
        console.error('cases/update: event log failed (non-fatal)', eventErr);
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('cases/update: request failed', err);
    await captureError(err, { route: 'cases/update' });
    res.status(500).json({ error: 'Failed to reach database' });
  }
}

// POST /api/cases/delete — permanently remove a case. Scoped to id + user_id so nobody can
// delete a case that isn't theirs. case_events, prep_checklist_items, and attorney_connections
// all reference cases with ON DELETE CASCADE, so their rows for this case go with it.
async function handleDelete(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const allowed = await checkRateLimit(`cases-delete:${clientIp(req)}`, { limit: 30, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }

  const id = cleanString((req.body || {}).id, 100);
  if (!id) {
    res.status(400).json({ error: 'Missing case id' });
    return;
  }

  try {
    const upstream = await supabaseRequest(
      `cases?id=eq.${encodeURIComponent(id)}&user_id=eq.${user.id}`,
      { method: 'DELETE', extraHeaders: { prefer: 'return=minimal' } }
    );

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('cases/delete: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to delete case' });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('cases/delete: request failed', err);
    await captureError(err, { route: 'cases/delete' });
    res.status(500).json({ error: 'Failed to reach database' });
  }
}

module.exports = { handleList, handleCreate, handleUpdate, handleDelete };
