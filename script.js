window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

function trackEvent(name, data) {
  if (typeof window.va === 'function') {
    window.va('event', data ? { name, data } : { name });
  }
}

/* ---------- Translation (i18n) ---------- */
// Pure client-side string swap against window.TERRA_TRANSLATIONS (translations.js) — no
// external translation service or script, keeping the strict CSP (script-src 'self') intact.
// English text lives directly in the HTML and is cached the first time a page applies a
// non-English language, so switching back to English restores it exactly.

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

  // HTML variant — only for elements whose English text has nested markup (a <strong> or an
  // inline <a> link) that a plain textContent swap would destroy. Safe to use innerHTML here
  // specifically because every string in translations.js is authored by hand, never derived
  // from user input, so there's no injection surface.
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    if (el.dataset.i18nHtmlOriginal === undefined) el.dataset.i18nHtmlOriginal = el.innerHTML;
    const key = el.getAttribute('data-i18n-html');
    el.innerHTML = (dict && dict[key]) || el.dataset.i18nHtmlOriginal;
  });
}

// Looks up a translation for strings set dynamically from JS (not present in the HTML for
// applyTranslations() to walk) — e.g. edit-mode form copy, status messages.
function t(key, fallback) {
  let lang = 'en';
  try {
    lang = localStorage.getItem(I18N_LANG_KEY) || 'en';
  } catch (err) {}
  const dict = lang !== 'en' && window.TERRA_TRANSLATIONS ? window.TERRA_TRANSLATIONS[lang] : null;
  return (dict && dict[key]) || fallback;
}

function initI18n() {
  const switcher = document.getElementById('langSwitcher');
  let saved = 'en';
  try {
    saved = localStorage.getItem(I18N_LANG_KEY) || 'en';
  } catch (err) {}

  applyTranslations(saved);

  if (switcher) {
    switcher.value = saved;
    switcher.addEventListener('change', () => {
      const lang = switcher.value;
      try { localStorage.setItem(I18N_LANG_KEY, lang); } catch (err) {}
      applyTranslations(lang);
      trackEvent('language_changed', { lang });
    });
  }
}
initI18n();

/* ---------- Show/hide password toggles ---------- */
// Eye / eye-off icons, matching the stroke style already used for the chat widget's icons
// (stroke="currentColor", stroke-width 2, round caps/joins) rather than introducing a new one.
const EYE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a20.6 20.6 0 015.06-6.06M9.9 4.24A10.4 10.4 0 0112 4c7 0 11 8 11 8a20.6 20.6 0 01-3.22 4.44M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

document.querySelectorAll('.password-toggle').forEach((btn) => {
  const input = document.getElementById(btn.dataset.passwordToggle);
  if (!input) return;

  btn.innerHTML = EYE_ICON;
  btn.setAttribute('aria-label', t('account.showPassword', 'Show password'));

  btn.addEventListener('click', () => {
    const willShow = input.type === 'password';
    input.type = willShow ? 'text' : 'password';
    btn.innerHTML = willShow ? EYE_OFF_ICON : EYE_ICON;
    btn.setAttribute('aria-pressed', String(willShow));
    btn.setAttribute(
      'aria-label',
      willShow ? t('account.hidePassword', 'Hide password') : t('account.showPassword', 'Show password')
    );
  });
});

/* ---------- Destinations flag ticker ---------- */
// A fixed 2-copy + translateX(-50%) marquee only loops seamlessly when the screen is
// narrower than one copy of the flag list — on any normal desktop width it ran out of
// flags and visibly jumped. This measures the actual rendered width of one copy, clones it
// as many times as needed to always overflow the visible strip (recalculated on resize), and
// animates by that exact pixel width so the loop is seamless at any screen size.
function initDestinationsScroll() {
  const strip = document.querySelector('.destinations-strip');
  const track = document.getElementById('destinationsTrack');
  const original = track ? track.querySelector('.destinations-flags') : null;
  if (!strip || !track || !original) return;

  const PIXELS_PER_SECOND = 40;

  function rebuild() {
    track.querySelectorAll('.destinations-flags').forEach((el, i) => {
      if (i > 0) el.remove();
    });

    const setWidth = original.getBoundingClientRect().width;
    if (!setWidth) return;

    const viewportWidth = strip.getBoundingClientRect().width;
    const copiesNeeded = Math.max(2, Math.ceil(viewportWidth / setWidth) + 2);

    for (let i = 1; i < copiesNeeded; i++) {
      const clone = original.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }

    track.style.setProperty('--destinations-scroll-distance', `-${setWidth}px`);
    track.style.animationDuration = `${setWidth / PIXELS_PER_SECOND}s`;
  }

  rebuild();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 250);
  });
}
initDestinationsScroll();

const header = document.getElementById('header');
const navToggle = document.getElementById('navToggle');

navToggle.addEventListener('click', () => {
  const isOpen = header.classList.toggle('menu-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.nav-links a, .header-actions a').forEach((link) => {
  link.addEventListener('click', () => {
    header.classList.remove('menu-open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

/* ---------- Auth state (every page) ---------- */

async function checkAuthState() {
  const loginLink = document.querySelector('.header-actions a[href="account.html"]');
  if (!loginLink) return null;

  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated) {
      loginLink.textContent = 'Log out';
      loginLink.removeAttribute('aria-current');
      loginLink.setAttribute('href', '#');
      loginLink.addEventListener('click', async (e) => {
        e.preventDefault();
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        window.location.href = 'index.html';
      });

      // Already signed up — the "Get started" CTA no longer applies (case creation now
      // happens from the dashboard's "+ New case" action instead).
      const getStartedLink = document.querySelector('.header-actions a[href="get-started.html"]');
      if (getStartedLink) getStartedLink.style.display = 'none';
    }
    return data;
  } catch (err) {
    return null;
  }
}

const authStatePromise = checkAuthState();

/* ---------- 45-second signup overlay ---------- */

(function initSignupOverlay() {
  const overlay = document.getElementById('signupOverlay');
  if (!overlay) return;

  const SHOWN_KEY = 'terraSignupOverlayShown';
  // Persistent (not per-tab) — once someone tells us they already have an account, they
  // shouldn't see this "create an account" nag again on a future visit, even before they've
  // actually finished logging back in.
  const HAS_ACCOUNT_KEY = 'terraHasAccount';

  const closeBtn = document.getElementById('signupOverlayClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      overlay.hidden = true;
    });
  }

  const loginLink = document.getElementById('signupOverlayLoginLink');
  if (loginLink) {
    loginLink.addEventListener('click', () => {
      try {
        localStorage.setItem(HAS_ACCOUNT_KEY, '1');
      } catch (err) {
        // localStorage unavailable — worst case, the overlay may show again next visit.
      }
    });
  }

  authStatePromise.then((data) => {
    if (data && data.authenticated) return; // don't nag people who already have an account
    if (sessionStorage.getItem(SHOWN_KEY)) return;
    try {
      if (localStorage.getItem(HAS_ACCOUNT_KEY)) return;
    } catch (err) {}

    setTimeout(() => {
      if (sessionStorage.getItem(SHOWN_KEY)) return;
      try {
        if (localStorage.getItem(HAS_ACCOUNT_KEY)) return;
      } catch (err) {}
      overlay.hidden = false;
      try {
        sessionStorage.setItem(SHOWN_KEY, '1');
      } catch (err) {
        // sessionStorage unavailable — overlay just won't remember it already showed this tab.
      }
      trackEvent('signup_overlay_shown');
    }, 45000);
  });
})();

const PLAN_LABELS = {
  free: 'the Free plan',
  pro: 'Terra Pro ($49/month)',
  premium: 'Terra Premium ($299 one-time)',
};

// The tier is carried across to get-started.html via a ?plan= query param on the link's
// href (see index.html) — this listener just fires the analytics event before navigation.
document.querySelectorAll('[data-tier]').forEach((link) => {
  link.addEventListener('click', () => {
    trackEvent('pricing_cta_click', { tier: link.dataset.tier });
  });
});

const signupForm = document.getElementById('signupForm');
const formNote = document.getElementById('formNote');

if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = signupForm.querySelector('input[type="email"]');
    const submitBtn = signupForm.querySelector('button');
    const email = emailInput.value;

    submitBtn.disabled = true;
    formNote.textContent = 'Joining…';

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        formNote.textContent = "Something went wrong — please try again in a moment.";
        return;
      }

      formNote.textContent = `You're on the waitlist! We'll email ${email} as soon as a spot opens up.`;
      trackEvent('waitlist_signup');
      signupForm.reset();
    } catch (err) {
      formNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
    } finally {
      submitBtn.disabled = false;
    }
  });
}

const intakeForm = document.getElementById('intakeForm');
const intakeNote = document.getElementById('intakeNote');

if (intakeForm) {
  const intakeSection = intakeForm.closest('section');
  // Hidden until we've confirmed there's a logged-in account — avoids a flash of the form
  // right before redirecting an unauthenticated visitor to account.html.
  if (intakeSection) intakeSection.style.visibility = 'hidden';

  const urlParams = new URLSearchParams(window.location.search);
  const requestedPlan = urlParams.get('plan');
  const checkoutStatus = urlParams.get('checkout'); // 'success' | 'cancelled', set by Stripe's redirect
  const editCaseId = urlParams.get('caseId'); // present when this page is editing an existing case

  const caseIdField = document.getElementById('intakeCaseId');
  const intakeTitle = document.getElementById('intakeTitle');
  const intakeEyebrow = document.getElementById('intakeEyebrow');
  const intakeSub = document.getElementById('intakeSub');
  const intakeSubmit = document.getElementById('intakeSubmit');

  function goHomeAfter(delayMs) {
    setTimeout(() => {
      window.location.href = 'index.html';
    }, delayMs);
  }

  authStatePromise.then(async (authData) => {
    if (!authData || !authData.authenticated) {
      const target =
        'account.html?redirect=get-started.html' +
        (requestedPlan ? '&plan=' + encodeURIComponent(requestedPlan) : '');
      window.location.replace(target);
      return;
    }

    if (intakeSection) intakeSection.style.visibility = 'visible';

    // The case was already saved before redirecting to Stripe, so a successful payment
    // needs no further action here beyond confirming it — resubmitting the form would just
    // create a duplicate case record. Uses a note outside the form (not intakeNote, which is
    // a child of intakeForm and would be hidden along with it).
    if (checkoutStatus === 'success') {
      intakeForm.hidden = true;
      const checkoutNote = document.getElementById('checkoutNote');
      if (checkoutNote) {
        checkoutNote.hidden = false;
        const paidPrefix = t('intake.checkoutSuccessPrefix', "You're all set! Payment received — welcome to {plan}. ")
          .replace('{plan}', PLAN_LABELS[requestedPlan] || 'Terra');
        checkoutNote.textContent = paidPrefix + t('intake.dashboardRedirectSuffix', 'Taking you to your dashboard…');
      }
      trackEvent('checkout_success', { plan: requestedPlan || 'unknown' });
      goHomeAfter(1500);
      return;
    }

    if (editCaseId) {
      // Edit mode: prefill every field from the existing case and switch the form to update it
      // instead of creating a new one. There's no separate "get one case" endpoint — the list
      // is small per user, so we just fetch it and find the match client-side.
      if (caseIdField) caseIdField.value = editCaseId;
      if (intakeEyebrow) intakeEyebrow.textContent = t('intake.editEyebrow', 'Edit case');
      if (intakeTitle) intakeTitle.textContent = t('intake.editTitle', 'Update your case details');
      if (intakeSub) intakeSub.textContent = t('intake.editSub', "Change anything that's out of date — Terra will keep tracking your case from here.");
      if (intakeSubmit) intakeSubmit.textContent = t('intake.saveChanges', 'Save changes');

      try {
        const res = await fetch('/api/cases/list');
        const data = await res.json().catch(() => ({}));
        const match = data && data.cases ? data.cases.find((c) => String(c.id) === String(editCaseId)) : null;
        if (!match) {
          intakeNote.textContent = "Couldn't find that case — it may have been deleted.";
          return;
        }
        const setVal = (id, value) => {
          const el = document.getElementById(id);
          if (el && value != null) el.value = value;
        };
        setVal('intakeFilingFor', match.filing_for);
        setVal('intakeCaseName', match.case_name);
        setVal('intakeName', match.name);
        setVal('intakeEmail', match.email);
        setVal('intakeCountry', match.country_from);
        setVal('intakeDestination', match.country_to);
        setVal('intakeCategory', match.category);
        setVal('intakeStage', match.stage);
        setVal('intakeSponsor', match.sponsor_status);
        setVal('intakeCurrentStatus', match.current_status);
        setVal('intakeLegalRep', match.legal_representation);
        setVal('intakeUrgency', match.urgency);
        setVal('intakeNotes', match.notes);
      } catch (err) {
        intakeNote.textContent = "Sorry, I couldn't load that case. Please check your connection and try again.";
      }
      return;
    }

    const nameField = document.getElementById('intakeName');
    const emailField = document.getElementById('intakeEmail');
    if (authData.user) {
      if (nameField && !nameField.value && authData.user.fullName) nameField.value = authData.user.fullName;
      if (emailField && !emailField.value && authData.user.email) emailField.value = authData.user.email;
    }

    // get-started.html can be reached with ?plan=free|pro|premium (set on each pricing
    // card's href on the homepage) — show which plan the visitor picked, if any.
    if (requestedPlan && PLAN_LABELS[requestedPlan]) {
      const selectedPlanInput = document.getElementById('intakeSelectedPlan');
      const planBanner = document.getElementById('intakePlanBanner');
      const planNameEl = document.getElementById('intakePlanName');
      if (selectedPlanInput && planBanner && planNameEl) {
        selectedPlanInput.value = requestedPlan;
        planNameEl.textContent = PLAN_LABELS[requestedPlan];
        planBanner.hidden = false;
      }
    }

    if (checkoutStatus === 'cancelled') {
      intakeNote.textContent = 'Checkout was cancelled — your case details are already saved, so you can just try again below.';
    }
  });

  intakeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = intakeForm.querySelector('button');
    const formData = new FormData(intakeForm);
    const payload = Object.fromEntries(formData.entries());
    const isEditMode = Boolean(payload.caseId);
    // The API's update action reads the case id as `id`; the form field is named `caseId`
    // (clearer in the DOM/HTML), so map it over rather than renaming the input.
    if (isEditMode) payload.id = payload.caseId;

    submitBtn.disabled = true;
    intakeNote.textContent = isEditMode ? t('intake.savingNote', 'Saving…') : t('intake.submittingNote', 'Submitting…');

    try {
      const res = await fetch(isEditMode ? '/api/cases/update' : '/api/cases/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        window.location.href = 'account.html?redirect=get-started.html';
        return;
      }
      if (!res.ok || !data.success) {
        intakeNote.textContent = "Something went wrong — please try again in a moment.";
        return;
      }

      if (isEditMode) {
        trackEvent('case_updated', { category: payload.category, stage: payload.stage });
        intakeNote.textContent = t('intake.savedRedirect', 'Saved! Taking you to your dashboard…');
        goHomeAfter(900);
        return;
      }

      trackEvent('get_started_signup', { category: payload.category, stage: payload.stage, plan: payload.selectedPlan || 'none' });

      // Free plan (or no plan selected): case is saved, nothing left to pay for.
      if (payload.selectedPlan !== 'pro' && payload.selectedPlan !== 'premium') {
        const planLabel = PLAN_LABELS[payload.selectedPlan];
        const signedUpFor = planLabel
          ? t('intake.signedUpForPrefix', "You're signed up for {plan}! ").replace('{plan}', planLabel)
          : t('intake.caseSavedPrefix', 'Case saved! ');
        intakeNote.textContent = signedUpFor + t('intake.dashboardRedirectSuffix', 'Taking you to your dashboard…');
        goHomeAfter(1200);
        return;
      }

      // Paid plan: the case is saved, now send them to Stripe to actually pay for it.
      intakeNote.textContent = 'Redirecting you to checkout…';
      try {
        const checkoutRes = await fetch('/api/billing/create-checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ plan: payload.selectedPlan }),
        });
        const checkoutData = await checkoutRes.json().catch(() => ({}));
        if (checkoutRes.ok && checkoutData.url) {
          window.location.href = checkoutData.url;
          return;
        }
        intakeNote.textContent = checkoutData.error || "Your case was saved, but checkout couldn't start — please try again.";
      } catch (checkoutErr) {
        intakeNote.textContent = "Your case was saved, but I couldn't reach checkout — please try again.";
      }
    } catch (err) {
      intakeNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Homepage dashboard (signed-in visitors only) ---------- */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

const dashboardSection = document.getElementById('dashboardSection');

if (dashboardSection) {
  const heroSection = document.getElementById('heroSection');
  const dashboardWelcome = document.getElementById('dashboardWelcome');
  const dashboardEmpty = document.getElementById('dashboardEmpty');
  const dashboardContent = document.getElementById('dashboardContent');
  const dashboardGrid = document.getElementById('dashboardGrid');

  const FILING_FOR_LABELS = {
    self: () => t('intake.filingFor.self', 'Myself'),
    spouse: () => t('intake.filingFor.spouse', 'My spouse'),
    child: () => t('intake.filingFor.child', 'My child'),
    parent: () => t('intake.filingFor.parent', 'My parent'),
    other: () => t('intake.filingFor.other', 'Someone else'),
  };

  function stageClass(stage) {
    if (/approved/i.test(stage)) return 'status-active';
    if (/denied|evidence/i.test(stage)) return 'status-attention';
    return '';
  }

  // Brand palette, reused across every chart so they read as one system rather than
  // Chart.js defaults.
  const CHART_COLORS = ['#1b4332', '#d4a24e', '#2d6a4f', '#b8853a', '#4c5a53', '#8a9a91', '#e4ddcf'];

  function countBy(items, keyFn) {
    const counts = {};
    items.forEach((item) => {
      const key = keyFn(item) || t('dashboard.unknown', 'Unknown');
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function renderDonut(canvasId, counts) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(counts),
        datasets: [{ data: Object.values(counts), backgroundColor: CHART_COLORS, borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      },
    });
  }

  function renderBar(canvasId, counts) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(counts),
        datasets: [{ data: Object.values(counts), backgroundColor: '#1b4332', borderRadius: 4, maxBarThickness: 36 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
          x: { ticks: { font: { size: 10 } } },
        },
      },
    });
  }

  function renderKpis(cases, policyAlerts) {
    const el = document.getElementById('kpiRow');
    if (!el) return;
    el.innerHTML = `
      <div class="kpi-tile"><div class="kpi-value">${cases.length}</div><div class="kpi-label" data-i18n="dashboard.kpi.totalCases">Total cases</div></div>
      <div class="kpi-tile"><div class="kpi-value">${policyAlerts.length}</div><div class="kpi-label" data-i18n="dashboard.kpi.activeAlerts">Active alerts</div></div>
    `;
  }

  function renderAlertsFeed(alerts) {
    const el = document.getElementById('alertsFeed');
    if (!el) return;
    if (!alerts.length) {
      el.innerHTML = `<p class="widget-empty" data-i18n="dashboard.alerts.empty">No alerts yet — we'll notify you here when a policy change affects your case.</p>`;
      return;
    }
    el.innerHTML = alerts.map((a) => `
      <div class="feed-item">
        <div class="feed-item-title">${a.severity === 'action_needed' ? '<span class="severity-flag">● </span>' : ''}${escapeHtml(a.title)}</div>
        <div class="feed-item-meta">${new Date(a.published_at).toLocaleDateString()}</div>
        <div class="feed-item-body">${escapeHtml(a.body)}</div>
      </div>
    `).join('');
  }

  function renderTimelineFeed(events) {
    const el = document.getElementById('timelineFeed');
    if (!el) return;
    if (!events.length) {
      el.innerHTML = `<p class="widget-empty" data-i18n="dashboard.timeline.empty">No case activity yet.</p>`;
      return;
    }
    el.innerHTML = events.map((e) => `
      <div class="feed-item">
        <div class="feed-item-title">${escapeHtml(e.title)}</div>
        <div class="feed-item-meta">${new Date(e.occurred_at).toLocaleDateString()}</div>
      </div>
    `).join('');
  }

  function renderChecklist(items) {
    const listEl = document.getElementById('checklistList');
    if (!listEl) return;

    if (!items.length) {
      listEl.innerHTML = `<p class="widget-empty" data-i18n="dashboard.checklist.empty">No checklist items yet.</p>`;
      return;
    }

    listEl.innerHTML = items.map((item) => `
      <label class="checklist-item ${item.completed ? 'is-done' : ''}">
        <input type="checkbox" data-checklist-id="${escapeHtml(item.id)}" ${item.completed ? 'checked' : ''}>
        <span>${escapeHtml(item.label)}</span>
      </label>
    `).join('');

    listEl.querySelectorAll('input[data-checklist-id]').forEach((input) => {
      input.addEventListener('change', async () => {
        input.closest('.checklist-item').classList.toggle('is-done', input.checked);
        try {
          await fetch('/api/dashboard/toggle-checklist', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ itemId: input.dataset.checklistId, completed: input.checked }),
          });
        } catch (err) {
          // Fail quietly — the checkbox state already reflects the user's intent visually.
        }
      });
    });

    const completed = items.filter((i) => i.completed).length;
    renderDonut('chartChecklist', {
      [t('dashboard.checklist.done', 'Done')]: completed,
      [t('dashboard.checklist.remaining', 'Remaining')]: items.length - completed,
    });
  }

  function renderEstimate(cases, estimates) {
    const el = document.getElementById('estimateBody');
    if (!el) return;
    const matches = cases
      .map((c) => estimates.find((e) => e.category === c.category && e.stage === c.stage))
      .filter(Boolean);

    if (!matches.length) {
      el.innerHTML = `<p class="widget-empty" data-i18n="dashboard.estimate.empty">We're still gathering data for accurate estimates in your case category — check back soon.</p>`;
      return;
    }
    el.innerHTML = matches.map((m) => `
      <div class="feed-item">
        <div class="feed-item-title">${escapeHtml(m.category)}</div>
        <div class="feed-item-body">${m.min_months}–${m.max_months} ${t('dashboard.estimate.months', 'months')}${m.note ? ' — ' + escapeHtml(m.note) : ''}</div>
      </div>
    `).join('');
  }

  const ATTORNEY_STATUS_LABELS = {
    not_requested: 'Not requested',
    requested: 'Requested',
    scheduled: 'Scheduled',
    completed: 'Completed',
  };

  function renderAttorney(cases, connections) {
    const el = document.getElementById('attorneyBody');
    if (!el) return;

    el.innerHTML = cases.map((c) => {
      const conn = connections.find((x) => x.case_id === c.id);
      const status = conn ? conn.status : 'not_requested';
      const label = c.case_name || c.category || t('dashboard.case', 'Case');
      const pillClass = status === 'completed' ? 'status-active' : (status === 'requested' || status === 'scheduled') ? 'status-attention' : '';
      const statusText = t(`dashboard.attorney.status.${status}`, ATTORNEY_STATUS_LABELS[status] || status);
      const canRequest = status === 'not_requested';
      return `
        <div class="attorney-status">
          <strong>${escapeHtml(label)}</strong>
          <span class="attorney-status-pill ${pillClass}">${escapeHtml(statusText)}</span>
          ${canRequest ? `<button type="button" class="btn btn-outline btn-sm" data-request-attorney="${escapeHtml(c.id)}" data-i18n="dashboard.attorney.request">Request a discovery call</button>` : ''}
        </div>
      `;
    }).join('');

    el.querySelectorAll('[data-request-attorney]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const res = await fetch('/api/dashboard/request-attorney-call', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ caseId: btn.dataset.requestAttorney }),
          });
          if (res.ok) {
            btn.outerHTML = `<span class="attorney-status-pill status-attention">${escapeHtml(t('dashboard.attorney.status.requested', 'Requested'))}</span>`;
          } else {
            btn.disabled = false;
          }
        } catch (err) {
          btn.disabled = false;
        }
      });
    });
  }

  function applyTierLocks(plan) {
    const rank = { free: 0, pro: 1, premium: 2 };
    document.querySelectorAll('.widget-card[data-tier]').forEach((card) => {
      const locked = (rank[plan] || 0) < (rank[card.dataset.tier] || 0);
      card.classList.toggle('is-locked', locked);
      const lockEl = card.querySelector('.widget-lock');
      if (lockEl) lockEl.hidden = !locked;
    });
  }

  authStatePromise.then(async (authData) => {
    if (!authData || !authData.authenticated) return; // logged-out visitors see the normal marketing homepage

    if (heroSection) heroSection.hidden = true;
    dashboardSection.hidden = false;

    if (dashboardWelcome) {
      const firstName = authData.user && authData.user.fullName ? authData.user.fullName.split(' ')[0] : '';
      const welcomeText = t('dashboard.welcome', 'Welcome back');
      dashboardWelcome.textContent = firstName ? `${welcomeText}, ${firstName}` : welcomeText;
    }

    try {
      const res = await fetch('/api/dashboard/summary');
      const data = await res.json().catch(() => ({}));
      const cases = (data && data.cases) || [];

      if (!cases.length) {
        dashboardEmpty.hidden = false;
        return;
      }

      const { plan = 'free', caseEvents = [], checklistItems = [], timelineEstimates = [], attorneyConnections = [], policyAlerts = [] } = data;

      const cards = cases.map((c) => {
        const stage = c.stage || 'Not sure';
        const filingLabelFn = FILING_FOR_LABELS[c.filing_for];
        const filingLabel = filingLabelFn ? filingLabelFn() : 'Case';
        const name = c.case_name || filingLabel;
        return `
          <a class="case-card dashboard-card" href="get-started.html?caseId=${encodeURIComponent(c.id)}">
            <div class="case-card-top">
              <span class="case-badge">${escapeHtml(name)}</span>
              <span class="status-pill ${stageClass(stage)}">${escapeHtml(stage)}</span>
            </div>
            <div class="case-row"><span>${escapeHtml(filingLabel)}</span><span>${escapeHtml(c.category || '')}</span></div>
            <div class="case-row"><span>${escapeHtml(c.country_from || '')} → ${escapeHtml(c.country_to || '')}</span><span></span></div>
            <div class="case-card-edit"><span data-i18n="dashboard.edit">Edit</span></div>
          </a>
        `;
      }).join('');

      dashboardGrid.innerHTML = cards +
        `<a class="case-card add-new" href="get-started.html" data-i18n="dashboard.newCase">+ New case</a>`;

      renderKpis(cases, policyAlerts);
      renderDonut('chartByStage', countBy(cases, (c) => c.stage));
      renderBar('chartByCategory', countBy(cases, (c) => c.category));
      renderAlertsFeed(policyAlerts);
      renderTimelineFeed(caseEvents);
      renderChecklist(checklistItems);
      renderEstimate(cases, timelineEstimates);
      renderAttorney(cases, attorneyConnections);
      applyTierLocks(plan);

      dashboardContent.hidden = false;

      // Newly-injected markup needs the current language applied — applyTranslations() only
      // walks the DOM once on load, before these nodes existed.
      const savedLang = localStorage.getItem(I18N_LANG_KEY);
      if (savedLang && savedLang !== 'en') applyTranslations(savedLang);
    } catch (err) {
      // Fail quietly — worst case the dashboard just doesn't populate this load.
    }
  });
}

const chatToggle = document.getElementById('chatToggle');
const chatPanel = document.getElementById('chatPanel');
const chatHeader = document.getElementById('chatHeader');
const chatMinimize = document.getElementById('chatMinimize');
const chatClose = document.getElementById('chatClose');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

if (chatToggle) {
  const minimizeIcon = chatMinimize.innerHTML;
  const maximizeIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"/></svg>`;

  let chatHistory = [];

  // The floating round button only shows when the panel is fully closed —
  // once open or minimized, the panel itself (or its minimized strip) is the visible affordance.
  const setChatOpen = (open) => {
    chatPanel.hidden = !open;
    chatToggle.hidden = open;
    chatToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      setMinimized(false);
      chatInput.focus();
    }
  };

  const setMinimized = (minimized) => {
    chatPanel.classList.toggle('minimized', minimized);
    chatMinimize.innerHTML = minimized ? maximizeIcon : minimizeIcon;
    chatMinimize.setAttribute('aria-label', minimized ? 'Maximize chat' : 'Minimize chat');
    chatMinimize.setAttribute('title', minimized ? 'Maximize' : 'Minimize');
    if (!minimized) chatInput.focus();
  };

  chatToggle.addEventListener('click', () => setChatOpen(true));
  chatClose.addEventListener('click', (e) => {
    e.stopPropagation();
    setChatOpen(false);
  });

  chatMinimize.addEventListener('click', (e) => {
    e.stopPropagation();
    setMinimized(!chatPanel.classList.contains('minimized'));
  });

  chatHeader.addEventListener('click', () => {
    if (chatPanel.classList.contains('minimized')) setMinimized(false);
  });

  const appendMessage = (role, text) => {
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${role === 'user' ? 'user' : 'bot'}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  };

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text });
    chatInput.value = '';
    chatInput.disabled = true;

    const loadingEl = appendMessage('bot', 'Thinking…');
    loadingEl.classList.add('chat-msg-loading');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory }),
      });
      const data = await res.json();
      loadingEl.remove();

      if (!res.ok || !data.reply) {
        appendMessage('bot', "Sorry, something went wrong on my end. Please try again in a moment.");
        return;
      }

      appendMessage('bot', data.reply);
      chatHistory.push({ role: 'assistant', content: data.reply });
    } catch (err) {
      loadingEl.remove();
      appendMessage('bot', "Sorry, I couldn't reach the server. Please check your connection and try again.");
    } finally {
      chatInput.disabled = false;
      chatInput.focus();
    }
  });
}
