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

// SMIL <animate>/<animateMotion> in the hero illustration can't be paused via CSS animation
// rules the way a CSS keyframe animation can — pauseAnimations() is the SVG-native equivalent.
(function respectReducedMotionForHero() {
  const heroScene = document.querySelector('.hero-scene');
  if (!heroScene || typeof heroScene.pauseAnimations !== 'function') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    heroScene.pauseAnimations();
  }
})();

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

      // Logged-in visitors get a direct "Dashboard" link in every page's nav (this page might
      // be Community, Jobs, the marketing view of index.html, etc.) so they can always get back
      // in one click, no matter how they navigated away.
      document.querySelectorAll('.nav-links').forEach((navList) => {
        if (navList.querySelector('.nav-dashboard-link')) return;
        const dashLink = document.createElement('a');
        dashLink.href = 'index.html';
        dashLink.className = 'nav-dashboard-link';
        dashLink.setAttribute('data-i18n', 'nav.dashboard');
        dashLink.textContent = t('nav.dashboard', 'Dashboard');
        navList.prepend(dashLink);
      });
    }
    return data;
  } catch (err) {
    return null;
  }
}

const authStatePromise = checkAuthState();

// Members-only pages (Community, Jobs): #accessGate / #mainContent only exist on those pages,
// so this is a no-op everywhere else. #mainContent starts hidden in the HTML so a signed-out
// visitor never sees a flash of the real content before the gate takes over.
(function initAccessGate() {
  const gate = document.getElementById('accessGate');
  const content = document.getElementById('mainContent');
  if (!gate || !content) return;

  authStatePromise.then((data) => {
    if (data && data.authenticated) {
      content.hidden = false;
    } else {
      gate.hidden = false;
    }
  });
})();

/* ---------- Inactivity auto-logout (30 min, warned 5 min ahead) ---------- */
// Runs on every page once we know the visitor is logged in — a security measure, not a
// dashboard-only feature. Activity is tracked via localStorage (not just in-memory) so it's
// shared across tabs: typing in one tab keeps the session alive in all of them, and a warning
// shown in a background tab disappears the moment activity happens anywhere else.
(function initInactivityLogout() {
  const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
  const WARNING_LEAD_MS = 5 * 60 * 1000;
  const WARNING_AT_MS = INACTIVITY_LIMIT_MS - WARNING_LEAD_MS;
  const STORAGE_KEY = 'terraLastActivityAt';
  const CHECK_INTERVAL_MS = 5000;
  const WRITE_THROTTLE_MS = 2000;

  let warningEl = null;
  let countdownTimer = null;
  let lastWriteAt = 0;

  function getLastActivity() {
    let stored = null;
    try {
      stored = Number(localStorage.getItem(STORAGE_KEY));
    } catch (err) {
      // localStorage unavailable — fall back to "just now" so the feature fails open rather
      // than logging someone out immediately.
    }
    return Number.isFinite(stored) && stored > 0 ? stored : Date.now();
  }

  function hideWarning() {
    if (!warningEl) return;
    warningEl.remove();
    warningEl = null;
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function recordActivity() {
    hideWarning();
    const nowTs = Date.now();
    if (nowTs - lastWriteAt < WRITE_THROTTLE_MS) return;
    lastWriteAt = nowTs;
    try {
      localStorage.setItem(STORAGE_KEY, String(nowTs));
    } catch (err) {
      // Nothing to persist — this tab's own in-memory clock still governs its own timers.
    }
  }

  function updateCountdown() {
    const remainingMs = Math.max(0, INACTIVITY_LIMIT_MS - (Date.now() - getLastActivity()));
    const el = document.getElementById('sessionTimeoutCountdown');
    if (el) {
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
      el.textContent = t('session.timeRemaining', 'Logging out in {time}').replace('{time}', timeStr);
    }
    if (remainingMs <= 0) doLogout();
  }

  function showWarning() {
    if (warningEl) return;
    warningEl = document.createElement('div');
    warningEl.className = 'session-timeout-overlay';
    warningEl.innerHTML = `
      <div class="session-timeout-card" role="alertdialog" aria-live="assertive" aria-label="${t('session.timeoutTitle', "You're about to be logged out")}">
        <h2>${t('session.timeoutTitle', "You're about to be logged out")}</h2>
        <p>${t('session.timeoutBody', "For your security, Terra logs you out after 30 minutes of inactivity.")}</p>
        <p class="session-timeout-countdown" id="sessionTimeoutCountdown"></p>
        <button type="button" class="btn btn-primary btn-lg" id="sessionTimeoutStay">${t('session.stayLoggedIn', 'Stay logged in')}</button>
      </div>
    `;
    document.body.appendChild(warningEl);
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  async function doLogout() {
    hideWarning();
    clearInterval(tickTimer);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {}
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = 'account.html?mode=login&reason=inactivity';
  }

  function tick() {
    const elapsed = Date.now() - getLastActivity();
    if (elapsed >= INACTIVITY_LIMIT_MS) {
      doLogout();
    } else if (elapsed >= WARNING_AT_MS) {
      showWarning();
    }
  }

  let tickTimer = null;

  authStatePromise.then((data) => {
    if (!data || !data.authenticated) return;

    recordActivity();
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((evt) => {
      window.addEventListener(evt, recordActivity, { passive: true });
    });
    // Activity in another tab (or the warning being dismissed there) should clear this tab's
    // warning too — without this, a tab left in the background could still show a stale
    // "logging out in 0:03" dialog after the user has been actively using a different tab.
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) hideWarning();
    });
    tickTimer = setInterval(tick, CHECK_INTERVAL_MS);
  });
})();

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
  const deleteCaseBtn = document.getElementById('deleteCaseBtn');
  const logUpdateBtn = document.getElementById('logUpdateBtn');

  // Warn before leaving with unsaved changes — cleared once the form actually submits (or the
  // case is deleted) so a normal successful save/delete doesn't trigger the same prompt.
  let formDirty = false;
  let formSettled = false;
  intakeForm.addEventListener('input', () => { formDirty = true; });
  intakeForm.addEventListener('change', () => { formDirty = true; });
  window.addEventListener('beforeunload', (e) => {
    if (!formDirty || formSettled) return;
    e.preventDefault();
    e.returnValue = '';
  });

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
        if (deleteCaseBtn) deleteCaseBtn.hidden = false;
        if (logUpdateBtn) {
          logUpdateBtn.hidden = false;
          logUpdateBtn.onclick = () => {
            openCaseUpdateModal({
              caseId: editCaseId,
              caseName: match.case_name || match.category || 'Case',
              currentStage: match.stage,
              onSaved: () => window.location.reload(),
            });
          };
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

      formSettled = true;

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

  if (deleteCaseBtn) {
    deleteCaseBtn.addEventListener('click', async () => {
      const confirmMsg = t(
        'intake.deleteCaseConfirm',
        "Delete this case? This can't be undone, and all its history, alerts, and checklist will be lost."
      );
      if (!window.confirm(confirmMsg)) return;

      deleteCaseBtn.disabled = true;
      intakeSubmit.disabled = true;
      intakeNote.textContent = t('intake.deletingNote', 'Deleting…');

      try {
        const res = await fetch('/api/cases/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: editCaseId }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
          window.location.href = 'account.html?redirect=get-started.html';
          return;
        }
        if (!res.ok || !data.success) {
          intakeNote.textContent = "Something went wrong — please try again in a moment.";
          deleteCaseBtn.disabled = false;
          intakeSubmit.disabled = false;
          return;
        }

        formSettled = true;
        trackEvent('case_deleted', {});
        intakeNote.textContent = t('intake.deletedRedirect', "Case deleted. Taking you to your dashboard…");
        goHomeAfter(900);
      } catch (err) {
        intakeNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
        deleteCaseBtn.disabled = false;
        intakeSubmit.disabled = false;
      }
    });
  }
}

/* ---------- Homepage dashboard (signed-in visitors only) ---------- */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Same 7 stage options as get-started.html's intake form (kept in sync manually — there's no
// shared source of truth for this list today).
const CASE_STAGE_OPTIONS = [
  { key: 'intake.stage.notFiled', fallback: "Haven't filed yet" },
  { key: 'intake.stage.filed', fallback: 'Filed — awaiting decision' },
  { key: 'intake.stage.evidence', fallback: 'Asked for more evidence/documents' },
  { key: 'intake.stage.interview', fallback: 'Interview scheduled' },
  { key: 'intake.stage.approved', fallback: 'Approved' },
  { key: 'intake.stage.denied', fallback: 'Denied / appealing' },
  { key: 'intake.stage.notSure', fallback: 'Not sure' },
];

// Shared quick-update modal, used from both the dashboard's My Cases cards and the case-edit
// page — built dynamically (same pattern as the inactivity-logout overlay) so neither page needs
// its own copy of the markup. Lets a user log a stage change and/or a short free-text note
// without resubmitting the full intake form.
function openCaseUpdateModal({ caseId, caseName, currentStage, onSaved }) {
  const existing = document.querySelector('.case-update-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'case-update-overlay';
  const optionsHtml = CASE_STAGE_OPTIONS.map(({ key, fallback }) => {
    const label = t(key, fallback);
    const selected = label === currentStage ? ' selected' : '';
    return `<option data-i18n="${key}"${selected}>${escapeHtml(label)}</option>`;
  }).join('');

  overlay.innerHTML = `
    <div class="case-update-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('dashboard.update.title', 'Log an update'))}">
      <h2>${escapeHtml(t('dashboard.update.title', 'Log an update'))}</h2>
      <p class="case-update-case-name">${escapeHtml(caseName || '')}</p>
      <label class="case-update-field">
        <span>${escapeHtml(t('dashboard.update.stageLabel', 'Current stage'))}</span>
        <select id="caseUpdateStage">${optionsHtml}</select>
      </label>
      <label class="case-update-field">
        <span>${escapeHtml(t('dashboard.update.noteLabel', 'Add a note (optional)'))}</span>
        <textarea id="caseUpdateNote" rows="3" placeholder="${escapeHtml(t('dashboard.update.notePlaceholder', 'e.g. Received an RFE, mailed additional evidence…'))}"></textarea>
      </label>
      <p class="case-update-error" id="caseUpdateError" hidden></p>
      <div class="case-update-actions">
        <button type="button" class="btn btn-outline" id="caseUpdateCancel">${escapeHtml(t('dashboard.update.cancel', 'Cancel'))}</button>
        <button type="button" class="btn btn-primary" id="caseUpdateSave">${escapeHtml(t('dashboard.update.save', 'Save update'))}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  overlay.querySelector('#caseUpdateCancel').addEventListener('click', close);

  const errorEl = overlay.querySelector('#caseUpdateError');
  const saveBtn = overlay.querySelector('#caseUpdateSave');
  saveBtn.addEventListener('click', async () => {
    const stage = overlay.querySelector('#caseUpdateStage').value;
    const note = overlay.querySelector('#caseUpdateNote').value.trim();
    if (stage === currentStage && !note) {
      errorEl.textContent = t('dashboard.update.needsSomething', 'Change the stage or add a note before saving.');
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    saveBtn.disabled = true;
    try {
      const res = await fetch('/api/cases/log-update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: caseId, stage, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorEl.textContent = data.error || t('dashboard.update.error', 'Something went wrong — please try again.');
        errorEl.hidden = false;
        saveBtn.disabled = false;
        return;
      }
      close();
      if (onSaved) onSaved();
    } catch (err) {
      errorEl.textContent = t('dashboard.update.error', 'Something went wrong — please try again.');
      errorEl.hidden = false;
      saveBtn.disabled = false;
    }
  });
}

const dashboardSection = document.getElementById('dashboardSection');

if (dashboardSection) {
  const heroSection = document.getElementById('heroSection');
  const marketingSections = document.querySelectorAll(
    '.logos-strip, #features, #how-it-works, #premium, #pricing, #faq, #get-started'
  );
  const backToDashboardBtn = document.getElementById('backToDashboardBtn');
  const MARKETING_HASHES = ['#features', '#how-it-works', '#premium', '#pricing', '#faq', '#get-started'];

  // Lets a signed-in visitor step out to browse Terra's public pricing/features pages and
  // back in to their dashboard, without losing their session or re-fetching dashboard data.
  function showMarketingView(hash) {
    marketingSections.forEach((el) => { el.hidden = false; });
    dashboardSection.hidden = true;
    if (backToDashboardBtn) backToDashboardBtn.hidden = false;
    const target = hash && document.querySelector(hash);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0 });
    }
  }

  function showDashboardView() {
    marketingSections.forEach((el) => { el.hidden = true; });
    if (heroSection) heroSection.hidden = true;
    dashboardSection.hidden = false;
    if (backToDashboardBtn) backToDashboardBtn.hidden = true;
    window.scrollTo({ top: 0 });
  }

  if (backToDashboardBtn) {
    backToDashboardBtn.addEventListener('click', () => {
      if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
      showDashboardView();
    });
  }

  const dashboardWelcome = document.getElementById('dashboardWelcome');
  const dashboardLoading = document.getElementById('dashboardLoading');
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

  const STALE_CASE_DAYS = 30;

  function formatDuration(days) {
    if (days === 1) return t('dashboard.pulse.oneDay', '1 day');
    return t('dashboard.pulse.days', '{n} days').replace('{n}', days);
  }

  // Shared by the per-case pulse block and the top-level Prep widget so both speak the same
  // visual/copy language for "how much prep is done" and "what to do next".
  function buildProgressBarHtml(completed, total) {
    return `
      <div class="case-pulse-progress">
        <div class="case-progress-track"><div class="case-progress-fill" style="width:${Math.round((completed / total) * 100)}%"></div></div>
        <span class="case-progress-label">${escapeHtml(t('dashboard.pulse.prepDone', '{completed}/{total} prep items done').replace('{completed}', completed).replace('{total}', total))}</span>
      </div>`;
  }

  function buildNextStepHtml(nextItem, hasItems) {
    if (nextItem) {
      return `<div class="case-pulse-next">${escapeHtml(t('dashboard.pulse.nextStep', 'Next: {step}').replace('{step}', nextItem.label))}</div>`;
    }
    return hasItems ? `<div class="case-pulse-next case-pulse-done">${escapeHtml(t('dashboard.pulse.allDone', 'All prep items complete'))}</div>` : '';
  }

  // Last real activity on a case (most recent case_events row, falling back to creation) and
  // whether it's gone stale — shared by the card-top "Needs an update" badge and the pulse block
  // below it so both agree on the same signal.
  function getCaseActivity(c, caseEvents) {
    const caseEventsForCase = caseEvents.filter((e) => e.case_id === c.id);
    const lastActivityAt = (caseEventsForCase[0] && caseEventsForCase[0].occurred_at) || c.created_at;
    if (!lastActivityAt) return null;
    const daysSince = Math.max(0, Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / 86400000));
    return { daysSince, isStale: daysSince >= STALE_CASE_DAYS };
  }

  // Per-case "pulse" block (Pro+): time in the current stage, prep-checklist progress, and the
  // next incomplete prep item — all derived from case_events/prep_checklist_items the user's own
  // actions already generated, never fabricated. Free tier doesn't see this section at all rather
  // than a locked teaser inside every card, since the widget grid above already advertises Pro.
  function buildCasePulse(activity, c, checklistItems) {
    if (!activity) return '';
    const { daysSince, isStale } = activity;
    const stageLine = daysSince === 0
      ? t('dashboard.pulse.stageToday', 'Updated today')
      : isStale
        ? t('dashboard.pulse.stale', 'No update in {duration} — consider checking in').replace('{duration}', formatDuration(daysSince))
        : t('dashboard.pulse.stageDuration', 'In this stage for {duration}').replace('{duration}', formatDuration(daysSince));

    const caseChecklist = checklistItems.filter((i) => i.case_id === c.id);
    const completedCount = caseChecklist.filter((i) => i.completed).length;
    const totalCount = caseChecklist.length;
    const nextItem = caseChecklist.find((i) => !i.completed);

    const progressHtml = totalCount > 0 ? buildProgressBarHtml(completedCount, totalCount) : '';
    const nextStepHtml = buildNextStepHtml(nextItem, totalCount > 0);

    return `
      <div class="case-pulse">
        <div class="case-pulse-stage${isStale ? ' is-stale' : ''}">${escapeHtml(stageLine)}</div>
        ${progressHtml}
        ${nextStepHtml}
      </div>`;
  }

  // Brand palette, reused across every chart so they read as one system rather than
  // Chart.js defaults.
  const CHART_COLORS = ['#1c1b19', '#d4a24e', '#3a3835', '#9c6f2c', '#59564f', '#8f8b82', '#ddd9d1'];

  function countBy(items, keyFn) {
    const counts = {};
    items.forEach((item) => {
      const key = keyFn(item) || t('dashboard.unknown', 'Unknown');
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  // A screen reader can't read anything drawn to a <canvas> — Chart.js renders pixels, not
  // DOM text. role="img" + a computed aria-label gives assistive tech the same information a
  // sighted user gets from the chart, instead of the chart being silently invisible to them.
  function describeCounts(labelPrefix, counts) {
    const parts = Object.entries(counts).map(([k, v]) => `${k}: ${v}`);
    return parts.length ? `${labelPrefix} — ${parts.join(', ')}` : labelPrefix;
  }

  function renderDonut(canvasId, counts, ariaLabel) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    const existing = Chart.getChart(ctx);
    if (existing) existing.destroy();
    if (ariaLabel) {
      ctx.setAttribute('role', 'img');
      ctx.setAttribute('aria-label', ariaLabel);
    }
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

  function renderBar(canvasId, counts, ariaLabel) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    const existing = Chart.getChart(ctx);
    if (existing) existing.destroy();
    if (ariaLabel) {
      ctx.setAttribute('role', 'img');
      ctx.setAttribute('aria-label', ariaLabel);
    }
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(counts),
        datasets: [{ data: Object.values(counts), backgroundColor: '#1c1b19', borderRadius: 4, maxBarThickness: 36 }],
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

  function renderAlertsFeed(alerts, hasCoverage) {
    const el = document.getElementById('alertsFeed');
    if (!el) return;
    if (!alerts.length) {
      el.innerHTML = hasCoverage
        ? `<p class="widget-empty" data-i18n="dashboard.alerts.empty">No alerts yet — we'll notify you here when a policy change affects your case.</p>`
        : `<p class="widget-empty" data-i18n="dashboard.alerts.noCoverage">Terra currently tracks official USCIS and DHS updates for U.S.-bound cases. Coverage for other destination countries is coming soon.</p>`;
      return;
    }
    el.innerHTML = alerts.map((a) => `
      <div class="feed-item">
        <div class="feed-item-title">${a.severity === 'action_needed' ? '<span class="severity-flag">● </span>' : ''}${escapeHtml(a.title)}</div>
        <div class="feed-item-meta">${new Date(a.published_at).toLocaleDateString()}</div>
        <div class="feed-item-body">${escapeHtml(a.body)}</div>
        ${a.source_url ? `<a class="feed-item-source" href="${escapeHtml(a.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('dashboard.alerts.sourcePrefix', 'Source:'))} ${escapeHtml(a.source_label || 'Official source')} ↗</a>` : ''}
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
    const summaryEl = document.getElementById('checklistSummary');
    if (!listEl) return;

    if (!items.length) {
      listEl.innerHTML = `<p class="widget-empty" data-i18n="dashboard.checklist.empty">No checklist items yet.</p>`;
      if (summaryEl) summaryEl.innerHTML = '';
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
        // Optimistic: flip the row instantly, then reconcile the rest of the dashboard (the
        // completion donut, in particular) once the write is confirmed — instant feedback
        // without leaving other widgets stale.
        const wasChecked = !input.checked;
        input.closest('.checklist-item').classList.toggle('is-done', input.checked);
        try {
          const res = await fetch('/api/dashboard/toggle-checklist', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ itemId: input.dataset.checklistId, completed: input.checked }),
          });
          if (res.ok) {
            refreshDashboard();
          } else {
            input.checked = wasChecked;
            input.closest('.checklist-item').classList.toggle('is-done', wasChecked);
          }
        } catch (err) {
          input.checked = wasChecked;
          input.closest('.checklist-item').classList.toggle('is-done', wasChecked);
        }
      });
    });

    const completed = items.filter((i) => i.completed).length;
    const remaining = items.length - completed;
    const nextItem = items.find((i) => !i.completed);
    if (summaryEl) {
      summaryEl.innerHTML = buildProgressBarHtml(completed, items.length) + buildNextStepHtml(nextItem, items.length > 0);
    }
    renderDonut(
      'chartChecklist',
      {
        [t('dashboard.checklist.done', 'Done')]: completed,
        [t('dashboard.checklist.remaining', 'Remaining')]: remaining,
      },
      describeCounts(t('dashboard.widget.checklist', 'Interview & Application Prep'), {
        [t('dashboard.checklist.done', 'Done')]: completed,
        [t('dashboard.checklist.remaining', 'Remaining')]: remaining,
      })
    );
  }

  // No reliable public dataset of real USCIS per-category processing times exists that we could
  // hand-verify the way the job-sponsor/policy-alert data was (the official tool is an
  // interactive per-office lookup, not a downloadable dataset, and third-party aggregators
  // disagree with each other by 3-5x) — so instead of an external benchmark, this projects a
  // rough "next milestone" date purely from how fast THIS case has moved through its own
  // case_events so far. Clearly labeled as a personal pace estimate, never as an official timeline.
  function buildCaseTimelineData(c, caseEvents) {
    const events = caseEvents
      .filter((e) => e.case_id === c.id)
      .slice()
      .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    if (!events.length) return null;

    const shortLabel = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const longLabel = (date) => date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    const isTerminal = /approved|denied/i.test(c.stage || '');

    let projection = null;
    if (!isTerminal && events.length >= 2) {
      const first = new Date(events[0].occurred_at).getTime();
      const last = new Date(events[events.length - 1].occurred_at).getTime();
      const avgIntervalMs = (last - first) / (events.length - 1);
      if (avgIntervalMs > 0) {
        const date = new Date(last + avgIntervalMs);
        const days = Math.round(avgIntervalMs / 86400000);
        projection = { shortLabel: shortLabel(date), longLabel: longLabel(date), days };
      }
    }

    return {
      labels: events.map((e) => shortLabel(e.occurred_at)),
      longLabels: events.map((e) => longLabel(new Date(e.occurred_at))),
      titles: events.map((e) => e.title),
      lastLongLabel: longLabel(new Date(events[events.length - 1].occurred_at)),
      isTerminal,
      projection,
    };
  }

  function formatRelativeDays(days) {
    if (days < 1) return t('dashboard.estimate.relSoon', 'very soon');
    if (days < 14) return t('dashboard.estimate.relDays', 'in about {n} days').replace('{n}', days);
    const weeks = Math.round(days / 7);
    if (weeks < 8) return t('dashboard.estimate.relWeeks', 'in about {n} weeks').replace('{n}', weeks);
    const months = Math.round(days / 30);
    return t('dashboard.estimate.relMonths', 'in about {n} months').replace('{n}', months);
  }

  // The "completion slot" is always rendered in the same spot with the same visual weight,
  // whether we have a real projection, a terminal result, or nothing yet — so the widget never
  // looks broken or inconsistent, just honestly blank when there isn't enough to go on.
  function buildCompletionSlotHtml(data) {
    if (data && data.isTerminal) {
      return `
        <div class="completion-slot is-done">
          <span class="completion-slot-label" data-i18n="dashboard.estimate.completedLabel">Completed</span>
          <span class="completion-slot-value">${escapeHtml(data.lastLongLabel)}</span>
        </div>`;
    }
    if (data && data.projection) {
      return `
        <div class="completion-slot is-estimated">
          <span class="completion-slot-label" data-i18n="dashboard.estimate.completionLabel">Possible completion</span>
          <span class="completion-slot-value">${escapeHtml(data.projection.longLabel)}</span>
          <span class="completion-slot-relative">${escapeHtml(formatRelativeDays(data.projection.days))}</span>
        </div>`;
    }
    return `
      <div class="completion-slot is-empty">
        <span class="completion-slot-label" data-i18n="dashboard.estimate.completionLabel">Possible completion</span>
        <span class="completion-slot-value completion-slot-dash">—</span>
        <span class="completion-slot-relative" data-i18n="dashboard.estimate.needMoreHistoryShort">Not enough history yet</span>
      </div>`;
  }

  function renderCaseTimelineChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    const existing = Chart.getChart(ctx);
    if (existing) existing.destroy();

    const actualValues = data.labels.map((_, i) => i + 1);
    const labels = data.projection ? [...data.labels, data.projection.shortLabel] : data.labels;
    const longLabels = data.projection ? [...data.longLabels, data.projection.longLabel] : data.longLabels;
    const actualData = data.projection ? [...actualValues, null] : actualValues;
    const projectedData = data.projection
      ? labels.map((_, i) => (i === labels.length - 2 ? actualValues[actualValues.length - 1] : i === labels.length - 1 ? actualValues.length + 1 : null))
      : null;

    const datasets = [{
      label: t('dashboard.estimate.actual', 'Actual'),
      data: actualData,
      borderColor: '#1c1b19',
      backgroundColor: 'rgba(28, 27, 25, 0.1)',
      borderWidth: 3,
      pointBackgroundColor: '#1c1b19',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8,
      fill: true,
      tension: 0.15,
    }];
    if (projectedData) {
      datasets.push({
        label: t('dashboard.estimate.projected', 'Estimated'),
        data: projectedData,
        borderColor: '#d4a24e',
        backgroundColor: '#d4a24e',
        borderWidth: 3,
        borderDash: [7, 5],
        pointBackgroundColor: '#d4a24e',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: (context) => (context.dataIndex === labels.length - 1 ? 7 : 0),
        pointHoverRadius: 8,
        fill: false,
        tension: 0,
      });
    }

    new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: projectedData
            ? { display: true, position: 'top', align: 'end', labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }
            : { display: false },
          tooltip: {
            callbacks: {
              title: (items) => longLabels[items[0].dataIndex] || '',
              label: (context) => {
                if (context.datasetIndex === 1) return t('dashboard.estimate.projectedTooltip', 'Estimated — based on this case\'s own pace');
                return data.titles[context.dataIndex] || '';
              },
            },
          },
        },
        scales: {
          y: { display: false, beginAtZero: true, grace: '20%' },
          x: { ticks: { font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
  }

  function renderEstimate(cases, caseEvents) {
    const el = document.getElementById('estimateBody');
    if (!el) return;

    el.innerHTML = cases.map((c) => {
      const canvasId = `timelineChart-${c.id}`;
      const data = buildCaseTimelineData(c, caseEvents);
      const name = c.case_name || c.category || t('dashboard.case', 'Case');
      const chartHtml = data
        ? `<div class="chart-container chart-container-timeline"><canvas id="${canvasId}"></canvas></div>`
        : `<div class="chart-container chart-container-timeline chart-container-empty">${escapeHtml(t('dashboard.estimate.noHistory', 'No case activity logged yet.'))}</div>`;

      return `
        <div class="case-timeline-block">
          <div class="case-timeline-header">${escapeHtml(name)}</div>
          ${buildCompletionSlotHtml(data)}
          ${chartHtml}
          ${data && !data.isTerminal ? `<p class="case-timeline-note">${escapeHtml(t('dashboard.estimate.disclaimer', "Rough estimate based on how fast this case has moved so far — not an official USCIS timeline."))}</p>` : ''}
        </div>
      `;
    }).join('');

    cases.forEach((c) => {
      const data = buildCaseTimelineData(c, caseEvents);
      if (data) renderCaseTimelineChart(`timelineChart-${c.id}`, data);
    });
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
            // Full refresh rather than a manual DOM patch — keeps this widget, the KPI row,
            // and everything else in sync with the server in one code path instead of two.
            refreshDashboard();
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

  // Re-run after any in-place dashboard action (checklist toggle, attorney call request) so the
  // whole page — KPIs, charts, feeds — reflects the new server state, not just the one widget
  // that was clicked. Also the initial-load path, called once from authStatePromise below.
  async function refreshDashboard() {
    try {
      const res = await fetch('/api/dashboard/summary');
      const data = await res.json().catch(() => ({}));
      const cases = (data && data.cases) || [];

      if (dashboardLoading) dashboardLoading.hidden = true;

      if (!cases.length) {
        dashboardContent.hidden = true;
        dashboardEmpty.hidden = false;
        return;
      }
      dashboardEmpty.hidden = true;

      const { plan = 'free', caseEvents = [], checklistItems = [], attorneyConnections = [], policyAlerts = [], policyAlertsCoverage = true } = data;

      const isPro = plan === 'pro' || plan === 'premium';
      const cards = cases.map((c) => {
        const stage = c.stage || 'Not sure';
        const filingLabelFn = FILING_FOR_LABELS[c.filing_for];
        const filingLabel = filingLabelFn ? filingLabelFn() : 'Case';
        const name = c.case_name || filingLabel;
        const route = `${escapeHtml(c.country_from || '—')} → ${escapeHtml(c.country_to || '—')}`;
        const activity = isPro ? getCaseActivity(c, caseEvents) : null;
        const pulseHtml = activity ? buildCasePulse(activity, c, checklistItems) : '';
        const staleBadge = activity && activity.isStale
          ? `<span class="status-pill status-attention" data-i18n="dashboard.pulse.needsUpdate">${escapeHtml(t('dashboard.pulse.needsUpdate', 'Needs an update'))}</span>`
          : '';
        return `
          <a class="case-card dashboard-card" href="get-started.html?caseId=${encodeURIComponent(c.id)}">
            <div class="case-card-hoverzone">
              <div class="case-card-top">
                <span class="case-badge">${escapeHtml(name)}</span>
                <div class="case-card-top-right">
                  ${staleBadge}
                  <span class="status-pill ${stageClass(stage)}">${escapeHtml(stage)}</span>
                </div>
              </div>
              <div class="case-meta">
                <div class="case-meta-item">
                  <span class="case-meta-label" data-i18n="dashboard.meta.filingFor">Filing for</span>
                  <span class="case-meta-value">${escapeHtml(filingLabel)}</span>
                </div>
                <div class="case-meta-item">
                  <span class="case-meta-label" data-i18n="dashboard.meta.category">Category</span>
                  <span class="case-meta-value">${escapeHtml(c.category || '—')}</span>
                </div>
                <div class="case-meta-item">
                  <span class="case-meta-label" data-i18n="dashboard.meta.route">Route</span>
                  <span class="case-meta-value">${route}</span>
                </div>
              </div>
              ${pulseHtml}
              <div class="case-card-edit"><span data-i18n="dashboard.edit">Edit case</span></div>
            </div>
            <div class="case-card-footer">
              <button type="button" class="btn btn-outline btn-sm case-update-btn" data-case-id="${escapeHtml(c.id)}" data-case-stage="${escapeHtml(stage)}" data-case-name="${escapeHtml(name)}" data-i18n="dashboard.update.button">${escapeHtml(t('dashboard.update.button', 'Log an update'))}</button>
            </div>
          </a>
        `;
      }).join('');

      dashboardGrid.innerHTML = cards +
        `<a class="case-card add-new" href="get-started.html" data-i18n="dashboard.newCase">+ New case</a>`;

      dashboardGrid.querySelectorAll('.case-update-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openCaseUpdateModal({
            caseId: btn.dataset.caseId,
            caseName: btn.dataset.caseName,
            currentStage: btn.dataset.caseStage,
            onSaved: refreshDashboard,
          });
        });
      });

      const stageCounts = countBy(cases, (c) => c.stage);
      const categoryCounts = countBy(cases, (c) => c.category);
      renderKpis(cases, policyAlerts);
      renderDonut('chartByStage', stageCounts, describeCounts(t('dashboard.widget.byStage', 'Cases by Stage'), stageCounts));
      renderBar('chartByCategory', categoryCounts, describeCounts(t('dashboard.widget.byCategory', 'Cases by Category'), categoryCounts));
      renderAlertsFeed(policyAlerts, policyAlertsCoverage);
      renderTimelineFeed(caseEvents);
      renderChecklist(checklistItems);
      renderEstimate(cases, caseEvents);
      renderAttorney(cases, attorneyConnections);
      applyTierLocks(plan);

      dashboardContent.hidden = false;

      // Newly-injected markup needs the current language applied — applyTranslations() only
      // walks the DOM once on load, before these nodes existed.
      const savedLang = localStorage.getItem(I18N_LANG_KEY);
      if (savedLang && savedLang !== 'en') applyTranslations(savedLang);
    } catch (err) {
      if (dashboardLoading) dashboardLoading.hidden = true;
      // Fail quietly — worst case the dashboard just doesn't populate this load.
    }
  }

  authStatePromise.then(async (authData) => {
    if (!authData || !authData.authenticated) return; // logged-out visitors see the normal marketing homepage

    if (heroSection) heroSection.hidden = true;

    // A logged-in visitor can land here with a marketing hash already in the URL — either by
    // clicking Features/Pricing/etc. from another page, or an "Upgrade to Pro" link from a
    // locked dashboard widget. Respect it instead of always forcing the dashboard.
    if (MARKETING_HASHES.includes(window.location.hash)) {
      showMarketingView(window.location.hash);
    } else {
      marketingSections.forEach((el) => { el.hidden = true; });
      dashboardSection.hidden = false;
    }
    if (dashboardLoading) dashboardLoading.hidden = false;

    // Same-page nav clicks (already on index.html) don't reload — just change the hash — so
    // catch those here to switch views without a refetch.
    window.addEventListener('hashchange', () => {
      if (MARKETING_HASHES.includes(window.location.hash)) showMarketingView(window.location.hash);
    });

    if (dashboardWelcome) {
      const firstName = authData.user && authData.user.fullName ? authData.user.fullName.split(' ')[0] : '';
      const welcomeText = t('dashboard.welcome', 'Welcome back');
      dashboardWelcome.textContent = firstName ? `${welcomeText}, ${firstName}` : welcomeText;
    }
    const dashboardAvatar = document.getElementById('dashboardAvatar');
    if (dashboardAvatar && authData.user && authData.user.avatarUrl) {
      dashboardAvatar.src = authData.user.avatarUrl;
      dashboardAvatar.hidden = false;
    }

    await refreshDashboard();
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
