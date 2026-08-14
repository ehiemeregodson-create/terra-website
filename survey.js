function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

const LIKERT_ANCHORS = ['Strongly Disagree', 'Disagree', 'Neither Agree nor Disagree', 'Agree', 'Strongly Agree'];
const RATING_ANCHORS = ['1 — Not useful', '2', '3 — Neutral', '4', '5 — Very useful'];

const CONSTRUCTS = [
  {
    code: 'c1', title: 'C1. Information Clarity & Access',
    note: 'How clear and reachable information about your case and the process feels.',
    items: [
      ['1', "I understand the requirements for my immigration case.", false],
      ['2', "I know what stage my case is currently in.", false],
      ['3', "I can easily find reliable information about immigration rules that affect me.", false],
      ['4', "I often feel confused about what steps to take next.", true],
    ],
  },
  {
    code: 'c2', title: 'C2. Emotional Burden & Uncertainty',
    note: 'The psychological weight of not knowing what will happen or when.',
    items: [
      ['1', "I feel anxious about the outcome of my case.", false],
      ['2', "Not knowing my case timeline causes me significant stress.", false],
      ['3', "I worry about making a mistake that could hurt my case.", false],
      ['4', "I feel emotionally supported as I go through this process.", true],
    ],
  },
  {
    code: 'c3', title: 'C3. Financial Burden',
    note: 'The cost impact of pursuing this case.',
    items: [
      ['1', "The cost of my immigration process has been a significant financial strain.", false],
      ['2', "I have made financial sacrifices (e.g., reduced savings, taken loans) because of this process.", false],
      ['3', "Unexpected fees or costs have caught me off guard during this process.", false],
      ['4', "I could afford legal representation if I needed it.", true],
    ],
  },
  {
    code: 'c4', title: 'C4. Access to Trustworthy Support',
    note: 'Whether reliable legal and professional help feels reachable.',
    items: [
      ['1', "I have access to legal help when I need it.", false],
      ['2', "I trust the legal or professional advice I have received.", false],
      ['3', "I know where to turn if I have a legal question about my case.", false],
      ['4', "Someone has taken advantage of me while claiming to help with my immigration case.", false],
    ],
  },
  {
    code: 'c5', title: 'C5. Community & Social Support',
    note: 'How connected you feel to others facing similar circumstances.',
    items: [
      ['1', "I have people in my life who understand what I'm going through.", false],
      ['2', "I feel connected to others going through a similar process.", false],
      ['3', "I have relied on online communities or forums for support with this process.", false],
      ['4', "I feel isolated in navigating this process.", true],
    ],
  },
  {
    code: 'c6', title: 'C6. Technology, AI & Digital Trust',
    note: 'Openness to digital and AI-assisted tools as part of the solution.',
    items: [
      ['1', "I am comfortable using websites or apps to manage important, high-stakes tasks.", false],
      ['2', "I would trust a digital platform to help track and manage my immigration case.", false],
      ['3', "I would trust an AI assistant to answer general questions about immigration policy.", false],
      ['4', "I would still want access to a human expert even if a good AI assistant were available.", false],
    ],
  },
];

const D_ITEMS = [
  ['d1', 'Real-time alerts when a policy change affects your specific case'],
  ['d2', 'A predicted timeline for how long your case may take'],
  ['d3', 'A single place to track every update and document in your case'],
  ['d4', 'Direct introduction to a vetted, licensed immigration attorney'],
  ['d5', 'A community forum to ask questions and hear from others in similar situations'],
  ['d6', 'Step-by-step document checklists tailored to your specific case type'],
  ['d7', 'Support and information available in your preferred language'],
  ['d8', 'Clear, upfront information about expected costs and fees'],
];

function scaleFieldset(name, code, text, anchors, isReverse) {
  const options = anchors.map((label, i) => {
    const v = i + 1;
    return `<label class="likert-option"><input type="radio" name="${name}" value="${v}"><span>${escapeHtml(label)}</span></label>`;
  }).join('');
  const reverseNote = isReverse ? ' <em>(R)</em>' : '';
  return `
    <fieldset class="likert-item">
      <legend><strong>${code.toUpperCase()}.</strong> ${escapeHtml(text)}${reverseNote}</legend>
      <div class="likert-scale">${options}</div>
    </fieldset>
  `;
}

function renderSectionC() {
  const container = document.getElementById('sectionC');
  if (!container) return;
  container.innerHTML = CONSTRUCTS.map((construct) => {
    const items = construct.items.map(([suffix, text, isReverse]) => {
      const name = `${construct.code}_${suffix}`;
      const code = `${construct.code.toUpperCase()}.${suffix}`;
      return scaleFieldset(name, code, text, LIKERT_ANCHORS, isReverse);
    }).join('');
    return `
      <p class="survey-construct-label">${escapeHtml(construct.title)}</p>
      <p class="survey-construct-note">${escapeHtml(construct.note)}</p>
      ${items}
    `;
  }).join('');
}

function renderSectionD() {
  const container = document.getElementById('sectionD');
  if (!container) return;
  container.innerHTML = D_ITEMS.map(([name, text]) => {
    return scaleFieldset(name, name, text, RATING_ANCHORS, false);
  }).join('');
}

renderSectionC();
renderSectionD();

// A4 "Prefer to self-describe" and A7 "Other" reveal a free-text field alongside the select.
function wireOtherReveal(selectId, otherId, triggerValue) {
  const select = document.getElementById(selectId);
  const other = document.getElementById(otherId);
  if (!select || !other) return;
  select.addEventListener('change', () => {
    const show = select.value === triggerValue;
    other.hidden = !show;
    if (!show) other.value = '';
  });
}
wireOtherReveal('a4', 'a4Other', 'Prefer to self-describe');
wireOtherReveal('a7', 'a7Other', 'Other');

const surveyForm = document.getElementById('surveyForm');
const surveyNote = document.getElementById('surveyNote');
const surveyThankYou = document.getElementById('surveyThankYou');

surveyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('surveySubmit');
  const formData = new FormData(surveyForm);
  const payload = Object.fromEntries(formData.entries());

  submitBtn.disabled = true;
  surveyNote.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/survey', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      surveyNote.textContent = data.error || "Something went wrong — please try again in a moment.";
      submitBtn.disabled = false;
      return;
    }

    surveyForm.hidden = true;
    surveyThankYou.hidden = false;
    surveyThankYou.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    surveyNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
    submitBtn.disabled = false;
  }
});
