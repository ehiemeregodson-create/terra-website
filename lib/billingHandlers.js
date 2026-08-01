// Handler bodies for /api/billing/[action] — kept as a plain exported function (not a file
// under /api) so Vercel's Hobby-plan 12-function cap doesn't force every billing endpoint into
// its own serverless function. See api/billing/[action].js.
const { getUserFromRequest } = require('./auth');
const { createCheckoutSession } = require('./stripe');
const { checkRateLimit, clientIp } = require('./rateLimit');
const { captureError } = require('./monitor');

const PLAN_CONFIG = {
  pro: { mode: 'subscription', priceEnvVar: 'STRIPE_PRICE_PRO' },
  premium: { mode: 'payment', priceEnvVar: 'STRIPE_PRICE_PREMIUM' },
};

function siteOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}

async function handleCreateCheckout(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { user, newCookie } = await getUserFromRequest(req);
  if (newCookie) res.setHeader('Set-Cookie', newCookie);
  if (!user) {
    res.status(401).json({ error: 'Please log in to continue' });
    return;
  }

  const allowed = await checkRateLimit(`billing-checkout:${clientIp(req)}`, { limit: 20, windowSeconds: 3600 });
  if (!allowed) {
    res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    return;
  }

  const plan = (req.body || {}).plan;
  const config = PLAN_CONFIG[plan];
  if (!config) {
    res.status(400).json({ error: 'plan must be "pro" or "premium"' });
    return;
  }

  const priceId = process.env[config.priceEnvVar];
  if (!priceId) {
    res.status(500).json({ error: `Server is missing ${config.priceEnvVar}` });
    return;
  }

  try {
    const origin = siteOrigin(req);
    const session = await createCheckoutSession({
      mode: config.mode,
      priceId,
      customerEmail: user.email,
      userId: user.id,
      plan,
      successUrl: `${origin}/get-started.html?checkout=success&plan=${plan}`,
      cancelUrl: `${origin}/get-started.html?checkout=cancelled&plan=${plan}`,
    });

    if (!session.ok || !session.data.url) {
      console.error('billing-checkout: session creation failed', session.status, session.data);
      res.status(502).json({ error: 'Failed to start checkout' });
      return;
    }

    res.status(200).json({ url: session.data.url });
  } catch (err) {
    console.error('billing-checkout: request failed', err);
    await captureError(err, { route: 'billing-create-checkout' });
    res.status(500).json({ error: 'Failed to start checkout' });
  }
}

module.exports = { handleCreateCheckout };
