const { generateRecoveryLink } = require('../lib/auth');
const { sendEmail } = require('../lib/email');
const { EMAIL_PATTERN } = require('../lib/validation');
const { checkRateLimit, clientIp } = require('../lib/rateLimit');
const { captureError } = require('../lib/monitor');

function siteOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const email = typeof (req.body || {}).email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: 'A valid email is required' });
    return;
  }

  const allowed = await checkRateLimit(`auth-forgot:${clientIp(req)}:${email}`, {
    limit: 5,
    windowSeconds: 3600,
  });
  if (!allowed) {
    // Always the same response either way (see below) — this just stops repeated attempts
    // from generating more emails/links than necessary.
    res.status(200).json({ success: true });
    return;
  }

  try {
    const redirectTo = `${siteOrigin(req)}/reset-password.html`;
    const generated = await generateRecoveryLink({ email, redirectTo });

    // Deliberately respond success regardless of whether the account exists — a different
    // response for "no such account" would let anyone enumerate registered emails.
    if (generated.ok && generated.data.action_link) {
      await sendEmail({
        to: email,
        subject: 'Reset your Terra password',
        html: `
          <p>Someone requested a password reset for this Terra account.</p>
          <p><a href="${generated.data.action_link}">Click here to set a new password</a>. This link expires shortly, and if you didn't request it, you can safely ignore this email.</p>
        `,
      });
    } else if (generated.status !== 422 && !/not found/i.test(generated.data?.msg || '')) {
      console.error('auth-forgot-password: generate_link failed', generated.status, generated.data);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('auth-forgot-password: request failed', err);
    await captureError(err, { route: 'auth-forgot-password' });
    // Still respond success — don't leak whether something went wrong for a specific email.
    res.status(200).json({ success: true });
  }
};
