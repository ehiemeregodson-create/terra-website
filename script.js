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

  authStatePromise.then((authData) => {
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
        checkoutNote.textContent =
          `You're all set! Payment received — welcome to ${PLAN_LABELS[requestedPlan] || 'Terra'}. ` +
          "We'll start sending policy alerts relevant to your case shortly.";
      }
      trackEvent('checkout_success', { plan: requestedPlan || 'unknown' });
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

    submitBtn.disabled = true;
    intakeNote.textContent = 'Submitting…';

    try {
      const res = await fetch('/api/get-started', {
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

      trackEvent('get_started_signup', { category: payload.category, stage: payload.stage, plan: payload.selectedPlan || 'none' });

      // Free plan (or no plan selected): case is saved, nothing left to pay for.
      if (payload.selectedPlan !== 'pro' && payload.selectedPlan !== 'premium') {
        const planLabel = PLAN_LABELS[payload.selectedPlan];
        intakeNote.textContent = (planLabel ? `You're signed up for ${planLabel}! ` : "You're in! ") +
          "We'll start sending policy alerts relevant to your case to " + payload.email + ".";
        intakeForm.reset();
        const planBanner = document.getElementById('intakePlanBanner');
        if (planBanner) planBanner.hidden = true;
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
