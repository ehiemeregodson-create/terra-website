const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{9,}$/;

function getRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  const plan = params.get('plan');
  if (!redirect) return 'index.html';
  return plan ? `${redirect}?plan=${encodeURIComponent(plan)}` : redirect;
}

/* ---------- Panels ---------- */

const tabSignup = document.getElementById('tabSignup');
const tabLogin = document.getElementById('tabLogin');
const accountTabs = document.querySelector('.account-tabs');
const signupPanel = document.getElementById('signupPanel');
const loginPanel = document.getElementById('loginPanel');
const forgotPanel = document.getElementById('forgotPanel');
const accountAuthenticated = document.getElementById('accountAuthenticated');
const accountCard = document.querySelector('.account-card');

// Hidden until we know whether this visitor is already logged in — avoids a flash of the
// signup form for someone who's actually authenticated (same pattern as get-started.html's
// auth check).
accountCard.style.visibility = 'hidden';

function showTab(tab) {
  const showSignup = tab === 'signup';
  accountTabs.hidden = false;
  signupPanel.hidden = !showSignup;
  loginPanel.hidden = showSignup;
  forgotPanel.hidden = true;
  accountAuthenticated.hidden = true;
  tabSignup.classList.toggle('active', showSignup);
  tabLogin.classList.toggle('active', !showSignup);
  tabSignup.setAttribute('aria-selected', String(showSignup));
  tabLogin.setAttribute('aria-selected', String(!showSignup));
}

tabSignup.addEventListener('click', () => showTab('signup'));
tabLogin.addEventListener('click', () => showTab('login'));

// Deep-link support: account.html?mode=login
if (new URLSearchParams(window.location.search).get('mode') === 'login') {
  showTab('login');
}

/* ---------- Authenticated view ---------- */

function showAuthenticated(user) {
  accountTabs.hidden = true;
  signupPanel.hidden = true;
  loginPanel.hidden = true;
  forgotPanel.hidden = true;
  accountAuthenticated.hidden = false;
  document.getElementById('authenticatedEmail').textContent = user.email
    ? `Logged in as ${user.email}`
    : 'You have an active session.';
}

fetch('/api/auth/me')
  .then((res) => res.json())
  .then((data) => {
    if (data && data.authenticated && data.user) {
      // Someone landed on account.html while already logged in via a stale bookmark/back
      // button — if they arrived with a redirect target (e.g. from the Get Started gate),
      // send them straight there instead of showing the login form again.
      const params = new URLSearchParams(window.location.search);
      if (params.get('redirect')) {
        window.location.replace(getRedirectTarget());
        return;
      }
      showAuthenticated(data.user);
    }
    accountCard.style.visibility = 'visible';
  })
  .catch(() => {
    accountCard.style.visibility = 'visible';
  });

document.getElementById('goToGetStarted').addEventListener('click', () => {
  window.location.href = 'get-started.html';
});

document.getElementById('accountLogoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.href = 'index.html';
});

document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
  const confirmed = window.confirm(
    'Delete your Terra account? This permanently removes your account and case data and cannot be undone.'
  );
  if (!confirmed) return;

  const btn = document.getElementById('deleteAccountBtn');
  const note = document.getElementById('accountNote');
  btn.disabled = true;
  note.textContent = 'Deleting your account…';

  try {
    const res = await fetch('/api/auth/delete-account', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      note.textContent = data.error || 'Something went wrong — please try again.';
      btn.disabled = false;
      return;
    }
    trackEvent('account_deleted');
    window.location.href = 'index.html';
  } catch (err) {
    note.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
    btn.disabled = false;
  }
});

/* ---------- Sign up ---------- */

const signupNote = document.getElementById('signupNote');

signupPanel.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('signupName');
  const emailInput = document.getElementById('signupEmail');
  const passwordInput = document.getElementById('signupPassword');
  const btn = signupPanel.querySelector('button');

  if (!PASSWORD_PATTERN.test(passwordInput.value)) {
    signupNote.textContent =
      'Password must be more than 8 characters and include an uppercase letter, a lowercase letter, and a number.';
    passwordInput.focus();
    return;
  }

  btn.disabled = true;
  signupNote.textContent = 'Creating your account…';

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullName: nameInput.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      signupNote.textContent = data.error || 'Something went wrong — please try again.';
      btn.disabled = false;
      return;
    }

    trackEvent('account_signup');
    signupNote.textContent = "You're in! Redirecting…";
    window.location.href = getRedirectTarget();
  } catch (err) {
    signupNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
    btn.disabled = false;
  }
});

/* ---------- Log in ---------- */

const loginNote = document.getElementById('loginNote');

loginPanel.addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const btn = loginPanel.querySelector('button');

  btn.disabled = true;
  loginNote.textContent = 'Logging in…';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      loginNote.textContent = data.error || 'Something went wrong — please try again.';
      btn.disabled = false;
      return;
    }

    trackEvent('account_login');
    loginNote.textContent = 'Logged in! Redirecting…';
    window.location.href = getRedirectTarget();
  } catch (err) {
    loginNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
    btn.disabled = false;
  }
});

/* ---------- Forgot password ---------- */

document.getElementById('forgotPasswordLink').addEventListener('click', () => {
  loginPanel.hidden = true;
  forgotPanel.hidden = false;
});

document.getElementById('backToLoginLink').addEventListener('click', () => {
  forgotPanel.hidden = true;
  showTab('login');
});

const forgotNote = document.getElementById('forgotNote');

forgotPanel.addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailInput = document.getElementById('forgotEmail');
  const btn = forgotPanel.querySelector('button');

  btn.disabled = true;
  forgotNote.textContent = 'Sending…';

  try {
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim() }),
    });
    // Always show the same message, whether or not the email is registered — avoids
    // revealing which emails have accounts.
    trackEvent('password_reset_requested');
    forgotNote.textContent = "If that email has a Terra account, we've sent a reset link.";
  } catch (err) {
    forgotNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
  } finally {
    btn.disabled = false;
  }
});
