const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{9,}$/;

function parseHashParams() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash);
}

const resetForm = document.getElementById('resetForm');
const resetInvalid = document.getElementById('resetInvalid');
const resetNote = document.getElementById('resetNote');

const hashParams = parseHashParams();
const accessToken = hashParams.get('access_token');
const refreshToken = hashParams.get('refresh_token');
const linkType = hashParams.get('type');

if (!accessToken || linkType !== 'recovery') {
  resetForm.hidden = true;
  resetInvalid.hidden = false;
} else {
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passwordInput = document.getElementById('resetPassword');
    const btn = resetForm.querySelector('button');

    if (!PASSWORD_PATTERN.test(passwordInput.value)) {
      resetNote.textContent =
        'Password must be more than 8 characters and include an uppercase letter, a lowercase letter, and a number.';
      passwordInput.focus();
      return;
    }

    btn.disabled = true;
    resetNote.textContent = 'Updating your password…';

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken, refreshToken, password: passwordInput.value }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        resetNote.textContent = data.error || 'Something went wrong — please try again.';
        btn.disabled = false;
        return;
      }

      trackEvent('password_reset_complete');
      resetNote.textContent = "Password updated! Redirecting…";
      window.location.href = 'index.html';
    } catch (err) {
      resetNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
      btn.disabled = false;
    }
  });
}
