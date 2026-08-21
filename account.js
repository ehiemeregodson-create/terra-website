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
const avatarPanel = document.getElementById('avatarPanel');
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
  avatarPanel.hidden = true;
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
  avatarPanel.hidden = true;
  accountAuthenticated.hidden = false;
  document.getElementById('authenticatedEmail').textContent = user.email
    ? `Logged in as ${user.email}`
    : 'You have an active session.';

  const avatarImg = document.getElementById('accountAvatarImg');
  if (user.avatarUrl) {
    avatarImg.src = user.avatarUrl;
    avatarImg.hidden = false;
  } else {
    avatarImg.hidden = true;
  }
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
  window.location.href = 'index.html';
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
  const ageInput = document.getElementById('signupAgeConfirm');
  const btn = signupPanel.querySelector('button');

  if (!PASSWORD_PATTERN.test(passwordInput.value)) {
    signupNote.textContent =
      'Password must be more than 8 characters and include an uppercase letter, a lowercase letter, and a number.';
    passwordInput.focus();
    return;
  }

  if (!ageInput.checked) {
    signupNote.textContent = 'You must confirm you are 15 years of age or older to create an account.';
    ageInput.focus();
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
        ageConfirmed: ageInput.checked,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      signupNote.textContent = data.error || 'Something went wrong — please try again.';
      btn.disabled = false;
      return;
    }

    trackEvent('account_signup');
    showAvatarPanel('setup');
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

/* ---------- Profile picture (10 presets, or upload your own) ---------- */

const AVATAR_PRESET_COUNT = 10;
const avatarPresetGrid = document.getElementById('avatarPresetGrid');
const avatarUploadInput = document.getElementById('avatarUploadInput');
const avatarPreviewRow = document.getElementById('avatarPreviewRow');
const avatarPreviewImg = document.getElementById('avatarPreviewImg');
const avatarSaveBtn = document.getElementById('avatarSaveBtn');
const avatarSkipBtn = document.getElementById('avatarSkipBtn');
const avatarNote = document.getElementById('avatarNote');

let avatarMode = 'setup'; // 'setup' (just signed up, continuing to the redirect target) | 'edit' (changing it later from the logged-in view)
let selectedPresetId = null;
let selectedUpload = null; // { base64, contentType } once a file is chosen

avatarPresetGrid.innerHTML = Array.from({ length: AVATAR_PRESET_COUNT }, (_, i) => {
  const id = `avatar-${i + 1}`;
  return `
    <button type="button" class="avatar-preset-btn" data-preset-id="${id}" aria-label="${t('account.avatarOption', 'Profile picture option')} ${i + 1}">
      <img src="avatars/${id}.svg" alt="">
    </button>
  `;
}).join('');

avatarPresetGrid.querySelectorAll('.avatar-preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedPresetId = btn.dataset.presetId;
    selectedUpload = null;
    avatarUploadInput.value = '';
    avatarPresetGrid.querySelectorAll('.avatar-preset-btn').forEach((b) => b.classList.toggle('is-selected', b === btn));
    avatarPreviewRow.hidden = true;
    avatarNote.textContent = '';
  });
});

avatarUploadInput.addEventListener('change', () => {
  const file = avatarUploadInput.files[0];
  if (!file) return;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    avatarNote.textContent = t('account.avatarInvalidType', 'Please choose a JPEG, PNG, or WEBP image.');
    avatarUploadInput.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    avatarNote.textContent = t('account.avatarTooLarge', "That image is too large — please use one under 2MB.");
    avatarUploadInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1] || '';
    selectedUpload = { base64, contentType: file.type };
    selectedPresetId = null;
    avatarPresetGrid.querySelectorAll('.avatar-preset-btn').forEach((b) => b.classList.remove('is-selected'));
    avatarPreviewImg.src = reader.result;
    avatarPreviewRow.hidden = false;
    avatarNote.textContent = '';
  };
  reader.readAsDataURL(file);
});

function showAvatarPanel(mode) {
  avatarMode = mode;
  selectedPresetId = null;
  selectedUpload = null;
  avatarUploadInput.value = '';
  avatarPreviewRow.hidden = true;
  avatarNote.textContent = '';
  avatarPresetGrid.querySelectorAll('.avatar-preset-btn').forEach((b) => b.classList.remove('is-selected'));

  accountTabs.hidden = true;
  signupPanel.hidden = true;
  loginPanel.hidden = true;
  forgotPanel.hidden = true;
  accountAuthenticated.hidden = true;
  avatarPanel.hidden = false;
}

function afterAvatarStep() {
  if (avatarMode === 'setup') {
    window.location.href = getRedirectTarget();
    return;
  }
  // 'edit' — re-fetch so the authenticated view reflects the (possibly just-changed) avatar.
  fetch('/api/auth/me')
    .then((res) => res.json())
    .then((data) => {
      if (data && data.authenticated && data.user) showAuthenticated(data.user);
    });
}

avatarSkipBtn.addEventListener('click', () => afterAvatarStep());

avatarSaveBtn.addEventListener('click', async () => {
  if (!selectedPresetId && !selectedUpload) {
    avatarNote.textContent = t('account.avatarChooseOne', 'Choose a picture above, or tap "Skip for now".');
    return;
  }

  avatarSaveBtn.disabled = true;
  avatarNote.textContent = t('account.avatarSaving', 'Saving…');

  try {
    const payload = selectedPresetId
      ? { presetId: selectedPresetId }
      : { imageBase64: selectedUpload.base64, contentType: selectedUpload.contentType };

    const res = await fetch('/api/auth/update-avatar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      avatarNote.textContent = data.error || 'Something went wrong — please try again.';
      avatarSaveBtn.disabled = false;
      return;
    }

    trackEvent('avatar_updated', { mode: avatarMode, preset: Boolean(selectedPresetId) });
    afterAvatarStep();
  } catch (err) {
    avatarNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
    avatarSaveBtn.disabled = false;
  }
});

document.getElementById('changeAvatarBtn').addEventListener('click', () => showAvatarPanel('edit'));
