function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* ---------- Translation (i18n) ---------- */
// Self-contained copy of script.js's i18n engine — deliberately not loading script.js itself,
// since it assumes header/nav/chat elements (e.g. #navToggle) that this standalone page doesn't
// have and would throw on. Reads from the same window.TERRA_TRANSLATIONS dictionary (translations.js)
// and the same 'terraLang' localStorage key, so a language choice made elsewhere on the site carries
// over here too.

const I18N_LANG_KEY = 'terraLang';

function applyTranslations(lang) {
  document.documentElement.lang = lang;
  const dict = lang !== 'en' && window.TERRA_TRANSLATIONS ? window.TERRA_TRANSLATIONS[lang] : null;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    if (el.dataset.i18nOriginal === undefined) el.dataset.i18nOriginal = el.textContent;
    const key = el.getAttribute('data-i18n');
    el.textContent = (dict && dict[key]) || el.dataset.i18nOriginal;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    if (el.dataset.i18nPlaceholderOriginal === undefined) {
      el.dataset.i18nPlaceholderOriginal = el.getAttribute('placeholder') || '';
    }
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', (dict && dict[key]) || el.dataset.i18nPlaceholderOriginal);
  });

  // Safe to use innerHTML here specifically because every string in translations.js is
  // hand-authored, never derived from user input — same reasoning as script.js.
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    if (el.dataset.i18nHtmlOriginal === undefined) el.dataset.i18nHtmlOriginal = el.innerHTML;
    const key = el.getAttribute('data-i18n-html');
    el.innerHTML = (dict && dict[key]) || el.dataset.i18nHtmlOriginal;
  });
}

function t(key, fallback) {
  let lang = 'en';
  try {
    lang = localStorage.getItem(I18N_LANG_KEY) || 'en';
  } catch (err) {}
  const dict = lang !== 'en' && window.TERRA_TRANSLATIONS ? window.TERRA_TRANSLATIONS[lang] : null;
  return (dict && dict[key]) || fallback;
}

function currentLang() {
  try {
    return localStorage.getItem(I18N_LANG_KEY) || 'en';
  } catch (err) {
    return 'en';
  }
}

function initI18n() {
  const switcher = document.getElementById('langSwitcher');
  const saved = currentLang();
  applyTranslations(saved);
  if (switcher) {
    switcher.value = saved;
    switcher.addEventListener('change', () => {
      const lang = switcher.value;
      try { localStorage.setItem(I18N_LANG_KEY, lang); } catch (err) {}
      applyTranslations(lang);
    });
  }
}

/* ---------- Section C (Likert) & D (ratings) — data-driven, translated ---------- */

const LIKERT_ANCHOR_KEYS = [
  ['survey.likert.stronglyDisagree', 'Strongly Disagree'],
  ['survey.likert.disagree', 'Disagree'],
  ['survey.likert.neutral', 'Neither Agree nor Disagree'],
  ['survey.likert.agree', 'Agree'],
  ['survey.likert.stronglyAgree', 'Strongly Agree'],
];
const RATING_ANCHOR_KEYS = [
  ['survey.rating.1', '1 — Not useful'],
  ['survey.rating.2', '2'],
  ['survey.rating.3', '3 — Neutral'],
  ['survey.rating.4', '4'],
  ['survey.rating.5', '5 — Very useful'],
];

const CONSTRUCTS = [
  {
    code: 'c1', titleKey: 'survey.c1.title', title: 'C1. Information Clarity & Access',
    noteKey: 'survey.c1.note', note: 'How clear and reachable information about your case and the process feels.',
    items: [
      ['1', 'survey.c1_1', "I understand the requirements for my immigration case.", false],
      ['2', 'survey.c1_2', "I know what stage my case is currently in.", false],
      ['3', 'survey.c1_3', "I can easily find reliable information about immigration rules that affect me.", false],
      ['4', 'survey.c1_4', "I often feel confused about what steps to take next.", true],
    ],
  },
  {
    code: 'c2', titleKey: 'survey.c2.title', title: 'C2. Emotional Burden & Uncertainty',
    noteKey: 'survey.c2.note', note: 'The psychological weight of not knowing what will happen or when.',
    items: [
      ['1', 'survey.c2_1', "I feel anxious about the outcome of my case.", false],
      ['2', 'survey.c2_2', "Not knowing my case timeline causes me significant stress.", false],
      ['3', 'survey.c2_3', "I worry about making a mistake that could hurt my case.", false],
      ['4', 'survey.c2_4', "I feel emotionally supported as I go through this process.", true],
    ],
  },
  {
    code: 'c3', titleKey: 'survey.c3.title', title: 'C3. Financial Burden',
    noteKey: 'survey.c3.note', note: 'The cost impact of pursuing this case.',
    items: [
      ['1', 'survey.c3_1', "The cost of my immigration process has been a significant financial strain.", false],
      ['2', 'survey.c3_2', "I have made financial sacrifices (e.g., reduced savings, taken loans) because of this process.", false],
      ['3', 'survey.c3_3', "Unexpected fees or costs have caught me off guard during this process.", false],
      ['4', 'survey.c3_4', "I could afford legal representation if I needed it.", true],
    ],
  },
  {
    code: 'c4', titleKey: 'survey.c4.title', title: 'C4. Access to Trustworthy Support',
    noteKey: 'survey.c4.note', note: 'Whether reliable legal and professional help feels reachable.',
    items: [
      ['1', 'survey.c4_1', "I have access to legal help when I need it.", false],
      ['2', 'survey.c4_2', "I trust the legal or professional advice I have received.", false],
      ['3', 'survey.c4_3', "I know where to turn if I have a legal question about my case.", false],
      ['4', 'survey.c4_4', "Someone has taken advantage of me while claiming to help with my immigration case.", false],
    ],
  },
  {
    code: 'c5', titleKey: 'survey.c5.title', title: 'C5. Community & Social Support',
    noteKey: 'survey.c5.note', note: 'How connected you feel to others facing similar circumstances.',
    items: [
      ['1', 'survey.c5_1', "I have people in my life who understand what I'm going through.", false],
      ['2', 'survey.c5_2', "I feel connected to others going through a similar process.", false],
      ['3', 'survey.c5_3', "I have relied on online communities or forums for support with this process.", false],
      ['4', 'survey.c5_4', "I feel isolated in navigating this process.", true],
    ],
  },
  {
    code: 'c6', titleKey: 'survey.c6.title', title: 'C6. Technology, AI & Digital Trust',
    noteKey: 'survey.c6.note', note: 'Openness to digital and AI-assisted tools as part of the solution.',
    items: [
      ['1', 'survey.c6_1', "I am comfortable using websites or apps to manage important, high-stakes tasks.", false],
      ['2', 'survey.c6_2', "I would trust a digital platform to help track and manage my immigration case.", false],
      ['3', 'survey.c6_3', "I would trust an AI assistant to answer general questions about immigration policy.", false],
      ['4', 'survey.c6_4', "I would still want access to a human expert even if a good AI assistant were available.", false],
    ],
  },
];

const D_ITEMS = [
  ['d1', 'survey.d1', 'Real-time alerts when a policy change affects your specific case'],
  ['d2', 'survey.d2', 'A predicted timeline for how long your case may take'],
  ['d3', 'survey.d3', 'A single place to track every update and document in your case'],
  ['d4', 'survey.d4', 'Direct introduction to a vetted, licensed immigration attorney'],
  ['d5', 'survey.d5', 'A community forum to ask questions and hear from others in similar situations'],
  ['d6', 'survey.d6', 'Step-by-step document checklists tailored to your specific case type'],
  ['d7', 'survey.d7', 'Support and information available in your preferred language'],
  ['d8', 'survey.d8', 'Clear, upfront information about expected costs and fees'],
];

function scaleFieldset(name, code, textKey, textFallback, anchorKeys, isReverse) {
  const options = anchorKeys.map(([key, fallback], i) => {
    const v = i + 1;
    return `<label class="likert-option"><input type="radio" name="${name}" value="${v}"><span data-i18n="${key}">${escapeHtml(fallback)}</span></label>`;
  }).join('');
  const reverseNote = isReverse ? ' <em>(R)</em>' : '';
  return `
    <fieldset class="likert-item">
      <legend><strong>${code.toUpperCase()}.</strong> <span data-i18n="${textKey}">${escapeHtml(textFallback)}</span>${reverseNote}</legend>
      <div class="likert-scale">${options}</div>
    </fieldset>
  `;
}

function renderSectionC() {
  const container = document.getElementById('sectionC');
  if (!container) return;
  container.innerHTML = CONSTRUCTS.map((construct) => {
    const items = construct.items.map(([suffix, textKey, text, isReverse]) => {
      const name = `${construct.code}_${suffix}`;
      const code = `${construct.code.toUpperCase()}.${suffix}`;
      return scaleFieldset(name, code, textKey, text, LIKERT_ANCHOR_KEYS, isReverse);
    }).join('');
    return `
      <p class="survey-construct-label" data-i18n="${construct.titleKey}">${escapeHtml(construct.title)}</p>
      <p class="survey-construct-note" data-i18n="${construct.noteKey}">${escapeHtml(construct.note)}</p>
      ${items}
    `;
  }).join('');
}

function renderSectionD() {
  const container = document.getElementById('sectionD');
  if (!container) return;
  container.innerHTML = D_ITEMS.map(([name, textKey, text]) => {
    return scaleFieldset(name, name, textKey, text, RATING_ANCHOR_KEYS, false);
  }).join('');
}

renderSectionC();
renderSectionD();
initI18n(); // after C/D render, so the newly-created data-i18n nodes get picked up immediately

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
  surveyNote.textContent = t('survey.submittingNote', 'Submitting…');

  try {
    const res = await fetch('/api/survey', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      surveyNote.textContent = data.error || t('survey.errorGeneric', 'Something went wrong — please try again in a moment.');
      submitBtn.disabled = false;
      return;
    }

    surveyForm.hidden = true;
    surveyThankYou.hidden = false;
    surveyThankYou.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    surveyNote.textContent = t('survey.errorConnection', "Sorry, I couldn't reach the server. Please check your connection and try again.");
    submitBtn.disabled = false;
  }
});
