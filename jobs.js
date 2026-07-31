function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------- Discussion board ---------- */

async function submitPost({ postType, parentId, name, text }) {
  try {
    const res = await fetch('/api/discussion-post', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postType, parentId: parentId || '', name, text }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 403) {
      return { blocked: true, reason: data.reason || 'This comment violates our community guidelines and was not posted.' };
    }
    if (!res.ok || !data.success) {
      return { success: false };
    }
    return { success: true, callout: data.callout || null };
  } catch (err) {
    return { success: false };
  }
}

function renderDiscussion(posts) {
  const listEl = document.getElementById('discussionList');
  const questions = posts.filter((p) => p['Type'] === 'question');
  const answers = posts.filter((p) => p['Type'] === 'answer');

  if (questions.length === 0) {
    listEl.innerHTML = '<p class="discussion-empty">No questions yet — be the first to ask.</p>';
    return;
  }

  listEl.innerHTML = '';

  questions.slice().reverse().forEach((q) => {
    const qAnswers = answers.filter((a) => a['Parent ID'] === q['ID']);

    const card = document.createElement('div');
    card.className = 'discussion-card';
    card.innerHTML = `
      <div class="discussion-q">
        <div class="discussion-meta">
          <strong>${escapeHtml(q['Name'] || 'Anonymous')}</strong>
          <span>${formatDate(q['Submitted At'])}</span>
        </div>
        <p>${escapeHtml(q['Text'])}</p>
        ${q['Callout'] ? `<div class="discussion-callout">⚠️ ${escapeHtml(q['Callout'])}</div>` : ''}
      </div>
      <div class="discussion-answers"></div>
      <form class="answer-form">
        <input type="text" class="answer-name" placeholder="Your name (optional)" maxlength="80">
        <textarea class="answer-text" placeholder="Write an answer…" rows="2" maxlength="1000" required></textarea>
        <button type="submit" class="btn btn-outline btn-block">Post answer</button>
        <p class="cta-note answer-note"></p>
      </form>
    `;

    const answersEl = card.querySelector('.discussion-answers');
    qAnswers.forEach((a) => {
      const aDiv = document.createElement('div');
      aDiv.className = 'discussion-answer';
      aDiv.innerHTML = `
        <div class="discussion-meta">
          <strong>${escapeHtml(a['Name'] || 'Anonymous')}</strong>
          <span>${formatDate(a['Submitted At'])}</span>
        </div>
        <p>${escapeHtml(a['Text'])}</p>
        ${a['Callout'] ? `<div class="discussion-callout">⚠️ ${escapeHtml(a['Callout'])}</div>` : ''}
      `;
      answersEl.appendChild(aDiv);
    });

    const answerForm = card.querySelector('.answer-form');
    answerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = answerForm.querySelector('.answer-name');
      const textInput = answerForm.querySelector('.answer-text');
      const note = answerForm.querySelector('.answer-note');
      const btn = answerForm.querySelector('button');
      const text = textInput.value.trim();
      if (!text) return;

      btn.disabled = true;
      note.textContent = 'Checking your answer…';

      const result = await submitPost({ postType: 'answer', parentId: q['ID'], name: nameInput.value.trim(), text });

      if (result.blocked) {
        note.textContent = result.reason;
        btn.disabled = false;
        return;
      }
      if (!result.success) {
        note.textContent = 'Something went wrong — please try again.';
        btn.disabled = false;
        return;
      }

      trackEvent('discussion_post', { postType: 'answer', flagged: Boolean(result.callout) });
      btn.disabled = false;
      answerForm.reset();
      loadDiscussion();
    });

    listEl.appendChild(card);
  });
}

async function loadDiscussion() {
  const listEl = document.getElementById('discussionList');
  try {
    const res = await fetch('/api/discussion-list');
    const data = await res.json();
    renderDiscussion(data.posts || []);
  } catch (err) {
    listEl.innerHTML = "<p class=\"discussion-empty\">Couldn't load the discussion right now.</p>";
  }
}

const questionForm = document.getElementById('questionForm');
const questionNote = document.getElementById('questionNote');

questionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('questionName');
  const textInput = document.getElementById('questionText');
  const btn = questionForm.querySelector('button');
  const text = textInput.value.trim();
  if (!text) return;

  btn.disabled = true;
  questionNote.textContent = 'Checking your question…';

  const result = await submitPost({ postType: 'question', parentId: '', name: nameInput.value.trim(), text });

  if (result.blocked) {
    questionNote.textContent = result.reason;
    btn.disabled = false;
    return;
  }
  if (!result.success) {
    questionNote.textContent = 'Something went wrong — please try again.';
    btn.disabled = false;
    return;
  }

  questionNote.textContent = result.callout ? 'Posted — note: ' + result.callout : 'Posted!';
  trackEvent('discussion_post', { postType: 'question', flagged: Boolean(result.callout) });
  questionForm.reset();
  btn.disabled = false;
  loadDiscussion();
});

loadDiscussion();

/* ---------- Recommendations ---------- */

const CATEGORY_RECOMMENDATIONS = {
  'Employment / work visa': [
    'Look for employers with a track record of sponsoring work visas in your destination country — see the Employers section below for a starting list.',
    'Research your destination country\'s specific work visa program (e.g. H-1B in the US, Skilled Worker in the UK, Express Entry in Canada) so you know what employers need to file.',
  ],
  'Family reunification': [
    'Many countries allow a work permit once your family-sponsorship application reaches a certain stage — check your destination country\'s rules.',
    'Once you have work authorization, general job boards are usually open to you without needing employer sponsorship.',
  ],
  'Study (student visa)': [
    'Look for employers open to hiring international students under your destination country\'s post-study work programs (e.g. OPT in the US, Graduate Route in the UK, PGWP in Canada).',
    'Your university\'s international student office often keeps an updated list of visa-friendly employers.',
  ],
  'Asylum / refugee protection': [
    'Many countries allow work authorization once your protection claim has been pending for a set period — check your destination country\'s specific rules.',
    'Refugee resettlement organizations often run job placement programs specifically for asylum seekers and refugees.',
  ],
  'Permanent residency / settlement': [
    'Once you have permanent residency (or an equivalent status), you can generally work for any employer without sponsorship.',
    'Focus your search on roles that match your skills — sponsorship is no longer a constraint.',
  ],
  'Investment / business': [
    'Look for destination-country business support programs and chambers of commerce that assist immigrant entrepreneurs.',
    'Many countries have dedicated investor/entrepreneur visa pathways with their own capital and documentation requirements — confirm yours early.',
  ],
  'Citizenship / naturalization': [
    'Your existing work authorization typically doesn\'t change during naturalization — a good time to pursue roles requiring citizenship, like government or security-cleared positions.',
  ],
  Other: [
    'Check the Employers section below for companies with strong track records of sponsoring a range of visa types.',
  ],
};

const STAGE_TIPS = {
  "Haven't filed yet": [
    'Start gathering your documents now (passport, prior visas, employment/education records) — missing paperwork causes most delays.',
    'Check current processing times for your form or application type with your destination country\'s immigration authority before you file.',
  ],
  'Filed — awaiting decision': [
    'Check your case status periodically, and set a reminder around the average processing time for your category.',
    'Keep your mailing address and contact details up to date with the immigration authority — missed correspondence is a common cause of delays.',
  ],
  'Asked for more evidence/documents': [
    'Read the request carefully and note the response deadline — missing it can result in a denial.',
    'Consider Terra Premium to connect with an attorney for higher-stakes requests.',
  ],
  'Interview scheduled': [
    'Bring original documents (not just copies) to your interview, plus a full set of copies.',
    'Review your application for consistency — officers often ask about details from your original forms.',
  ],
  Approved: [
    'Congratulations! Double check any next steps tied to your approval (e.g. physical card/visa arrival, further filings).',
  ],
  'Denied / appealing': [
    'Note your appeal deadline immediately — these are often short and strict.',
    'Terra Premium can connect you with an attorney experienced in appeals and motions to reopen.',
  ],
  'Not sure': [
    'Update your stage on the Get Started form when you can — it sharpens these recommendations.',
  ],
};

function renderRecommendations() {
  const container = document.getElementById('recommendationsContent');
  let profile = null;
  try {
    profile = JSON.parse(localStorage.getItem('terraProfile') || 'null');
  } catch (err) {
    profile = null;
  }

  if (!profile || !profile.category) {
    container.innerHTML = `
      <div class="recommend-empty">
        <p>We don't have your case details yet. Fill out the Get Started form and come back — we'll tailor job recommendations and reminders to your category and stage.</p>
        <a href="get-started.html" class="btn btn-primary">Get started</a>
      </div>
    `;
    return;
  }

  const jobTips = CATEGORY_RECOMMENDATIONS[profile.category] || CATEGORY_RECOMMENDATIONS.Other;
  const stageTips = STAGE_TIPS[profile.stage] || [];

  container.innerHTML = `
    <p class="recommend-profile">Showing recommendations for <strong>${escapeHtml(profile.category)}</strong> &middot; <strong>${escapeHtml(profile.stage || 'stage not set')}</strong>${profile.destinationCountry ? ` &middot; applying to <strong>${escapeHtml(profile.destinationCountry)}</strong>` : ''}</p>
    <div class="recommend-columns">
      <div class="recommend-col">
        <h3>Job search recommendations</h3>
        <ul>${jobTips.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
      </div>
      <div class="recommend-col">
        <h3>Alerts &amp; reminders</h3>
        <ul>${stageTips.length ? stageTips.map((t) => `<li>${escapeHtml(t)}</li>`).join('') : '<li>No specific reminders for this stage yet.</li>'}</ul>
      </div>
    </div>
  `;
}

renderRecommendations();

/* ---------- Company directory ---------- */

const COMPANY_POOL = [
  { name: 'Amazon', country: 'US', visaInfo: 'Frequent H-1B, L-1, and O-1 sponsor across tech and operations roles.' },
  { name: 'Google', country: 'US', visaInfo: 'Sponsors H-1B and O-1 visas; strong track record of PERM labor certification filings.' },
  { name: 'Microsoft', country: 'US', visaInfo: 'Long-standing H-1B and L-1 sponsor, especially for engineering and research roles.' },
  { name: 'Meta', country: 'US', visaInfo: 'Sponsors H-1B and O-1 visas for engineering, research, and product roles.' },
  { name: 'Apple', country: 'US', visaInfo: 'Sponsors H-1B visas, primarily for engineering and design positions.' },
  { name: 'IBM', country: 'US', visaInfo: 'One of the largest historical H-1B filers, across consulting and engineering roles.' },
  { name: 'Deloitte', country: 'US', visaInfo: 'High-volume H-1B sponsor for consulting, tech, and audit roles.' },
  { name: 'Accenture', country: 'US', visaInfo: 'Major H-1B and L-1 sponsor across consulting and technology roles.' },
  { name: 'Cognizant', country: 'US', visaInfo: 'Consistently one of the top H-1B filers, largely in IT services.' },
  { name: 'Infosys', country: 'US', visaInfo: 'Major H-1B sponsor for IT consulting and services roles.' },
  { name: 'TCS', country: 'US', visaInfo: 'One of the largest H-1B filers historically, across IT services.' },
  { name: 'Wipro', country: 'US', visaInfo: 'Regular H-1B sponsor for IT consulting roles.' },
  { name: 'JPMorgan Chase', country: 'US', visaInfo: 'Sponsors H-1B visas for technology and quantitative finance roles.' },
  { name: 'Goldman Sachs', country: 'US', visaInfo: 'Sponsors H-1B and O-1 visas, mainly in technology and finance.' },
  { name: 'Capgemini', country: 'US', visaInfo: 'Frequent H-1B sponsor for consulting and technology roles.' },
  { name: 'HCLTech', country: 'US', visaInfo: 'Regular H-1B filer for IT services and consulting.' },
  { name: 'Intel', country: 'US', visaInfo: 'Sponsors H-1B and L-1 visas for engineering and research roles.' },
  { name: 'Walmart Global Tech', country: 'US', visaInfo: 'Growing H-1B sponsor for its technology division.' },
  { name: 'HSBC', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas across finance and technology roles.' },
  { name: 'Deloitte UK', country: 'UK', visaInfo: 'Registered Skilled Worker visa sponsor for consulting and audit roles.' },
  { name: 'EY UK', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas across consulting, tax, and audit.' },
  { name: 'KPMG UK', country: 'UK', visaInfo: 'Registered sponsor for Skilled Worker visas in consulting and finance.' },
  { name: 'NHS', country: 'UK', visaInfo: 'One of the largest Health and Care Worker visa sponsors in the country.' },
  { name: 'Tesco', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas for management and technology roles.' },
  { name: 'BT Group', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas for engineering and technology roles.' },
  { name: 'Barclays', country: 'UK', visaInfo: 'Registered Skilled Worker sponsor for finance and technology roles.' },
  { name: 'AstraZeneca', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas for research and scientific roles.' },
  { name: 'Amazon UK', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas across operations and technology.' },
  { name: 'Shopify', country: 'CA', visaInfo: 'Supports LMIA and Global Talent Stream applications for tech roles.' },
  { name: 'RBC', country: 'CA', visaInfo: 'Sponsors work permits for specialized finance and technology roles.' },
  { name: 'TD Bank', country: 'CA', visaInfo: 'Supports LMIA applications for technology and finance positions.' },
  { name: 'CGI Group', country: 'CA', visaInfo: 'Frequent LMIA filer for IT consulting roles.' },
  { name: 'Scotiabank', country: 'CA', visaInfo: 'Sponsors work permits for finance and technology roles.' },
  { name: 'Telus', country: 'CA', visaInfo: 'Supports LMIA and Global Talent Stream for tech talent.' },
  { name: 'BlackBerry', country: 'CA', visaInfo: 'Sponsors work permits for engineering and security roles.' },
  { name: 'CIBC', country: 'CA', visaInfo: 'Supports LMIA applications for finance and technology roles.' },
  { name: 'SAP', country: 'DE', visaInfo: 'Sponsors EU Blue Card and skilled worker visas for engineering roles.' },
  { name: 'Siemens', country: 'DE', visaInfo: 'Sponsors EU Blue Card visas across engineering and R&D roles.' },
  { name: 'Atlassian', country: 'AU', visaInfo: 'Sponsors Skilled Employer visas for engineering and product roles.' },
  { name: 'Emirates Group', country: 'AE', visaInfo: 'Sponsors UAE work visas across aviation and corporate roles.' },
];

const COUNTRY_FLAGS = { US: '🇺🇸', UK: '🇬🇧', CA: '🇨🇦', DE: '🇩🇪', AU: '🇦🇺', AE: '🇦🇪' };
const COUNTRY_NAMES = { US: 'United States', UK: 'United Kingdom', CA: 'Canada', DE: 'Germany', AU: 'Australia', AE: 'UAE' };

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function renderCompanies() {
  const grid = document.getElementById('companyGrid');
  const picked = shuffle(COMPANY_POOL).slice(0, 20);

  grid.innerHTML = picked
    .map(
      (c) => `
    <div class="company-card">
      <div class="company-card-top">
        <strong>${escapeHtml(c.name)}</strong>
        <span class="company-flag" title="${COUNTRY_NAMES[c.country]}">${COUNTRY_FLAGS[c.country]}</span>
      </div>
      <p>${escapeHtml(c.visaInfo)}</p>
    </div>
  `
    )
    .join('');
}

renderCompanies();
