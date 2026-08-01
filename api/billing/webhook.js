// Stripe webhook — records purchases/subscriptions into Supabase. Needs the *raw* request
// body to verify Stripe's signature (see lib/stripe.js:constructWebhookEvent), so Vercel's
// automatic JSON body parsing is disabled below and the body is read manually as a stream.
const { supabaseRequest } = require('../../lib/supabase');
const { constructWebhookEvent } = require('../../lib/stripe');
const { captureError } = require('../../lib/monitor');

module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function upsertSubscription(row) {
  return supabaseRequest('subscriptions?on_conflict=user_id,plan', {
    method: 'POST',
    body: row,
    extraHeaders: { prefer: 'resolution=merge-duplicates,return=minimal' },
  });
}

async function updateSubscriptionByStripeId(stripeSubscriptionId, patch) {
  return supabaseRequest(`subscriptions?stripe_subscription_id=eq.${encodeURIComponent(stripeSubscriptionId)}`, {
    method: 'PATCH',
    body: patch,
    extraHeaders: { prefer: 'return=minimal' },
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('billing-webhook: STRIPE_WEBHOOK_SECRET not configured');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    res.status(400).json({ error: 'Failed to read request body' });
    return;
  }

  const event = constructWebhookEvent(rawBody, req.headers['stripe-signature'], webhookSecret);
  if (!event) {
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const plan = session.metadata?.plan;

      if (userId && (plan === 'pro' || plan === 'premium')) {
        const result = await upsertSubscription({
          user_id: userId,
          plan,
          status: 'active',
          stripe_customer_id: session.customer || null,
          stripe_subscription_id: session.subscription || null,
          stripe_checkout_session_id: session.id,
          current_period_end: null,
        });
        if (!result.ok) {
          console.error('billing-webhook: upsert failed', result.status, await result.text());
        }
      }
    } else if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      await updateSubscriptionByStripeId(subscription.id, {
        status: subscription.status,
        current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      });
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      await updateSubscriptionByStripeId(subscription.id, { status: 'canceled' });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('billing-webhook: processing failed', err);
    await captureError(err, { route: 'billing-webhook', eventType: event?.type });
    // Still 200 — Stripe retries on non-2xx, and retrying a processing bug won't fix it;
    // the error is already reported to Sentry for investigation.
    res.status(200).json({ received: true });
  }
};
