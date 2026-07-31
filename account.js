const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{9,}$/;

function getRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  const plan = params.get('plan');
  if (!redirect) return 'index.html';
  return plan ? `${redirect}?plan=${encodeURIComponent(plan)}` : redirect;
}

/* ---------- Tab switching ---------- */

const tabSignup = document.getElementById('tabSignup');
const tabLogin = document.getElementById('tabLogin');
const signupPanel = document.getElementById('signupPanel');
const loginPanel = document.getElementById('loginPanel');

function showTab(tab) {
  const showSignup = tab === 'signup';
  signupPanel.hidden = !showSignup;
  loginPanel.hidden = showSignup;
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
      'Password must be more than 8 characters and include an uppercase letter, a lowercase letter, and a symbol.';
    passwordInput.focus();
    return;
  }

  btn.disabled = true;
  signupNote.textContent = 'Creating your account…';

  try {
    const res = await fetch('/api/auth-signup', {
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
    const res = await fetch('/api/auth-login', {
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
