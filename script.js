window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

function trackEvent(name, data) {
  if (typeof window.va === 'function') {
    window.va('event', data ? { name, data } : { name });
  }
}

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
  const closeBtn = document.getElementById('signupOverlayClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      overlay.hidden = true;
    });
  }

  authStatePromise.then((data) => {
    if (data && data.authenticated) return; // don't nag people who already have an account
    if (sessionStorage.getItem(SHOWN_KEY)) return;

    setTimeout(() => {
      if (sessionStorage.getItem(SHOWN_KEY)) return;
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

  const requestedPlan = new URLSearchParams(window.location.search).get('plan');

  authStatePromise.then((authData) => {
    if (!authData || !authData.authenticated) {
      const target =
        'account.html?redirect=get-started.html' +
        (requestedPlan ? '&plan=' + encodeURIComponent(requestedPlan) : '');
      window.location.replace(target);
      return;
    }

    if (intakeSection) intakeSection.style.visibility = 'visible';

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

      const planLabel = PLAN_LABELS[payload.selectedPlan];
      intakeNote.textContent = (planLabel ? `You're signed up for ${planLabel}! ` : "You're in! ") +
        "We'll start sending policy alerts relevant to your case to " + payload.email + ".";
      trackEvent('get_started_signup', { category: payload.category, stage: payload.stage, plan: payload.selectedPlan || 'none' });

      intakeForm.reset();
      const planBanner = document.getElementById('intakePlanBanner');
      if (planBanner) planBanner.hidden = true;
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
