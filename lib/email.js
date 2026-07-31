// Sends transactional email via Resend's REST API. If RESEND_API_KEY isn't configured yet,
// this logs and skips rather than throwing — email is an enhancement on top of the underlying
// action (e.g. a case signup), not a reason to fail it.
async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Terra <onboarding@resend.dev>';

  if (!apiKey) {
    console.error('email: RESEND_API_KEY not configured, skipping send to', to);
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('email: send failed', res.status, detail);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('email: request failed', err);
    return { ok: false };
  }
}

module.exports = { sendEmail };
