// Talks to Stripe's REST API directly via fetch — no `stripe` npm package, consistent with
// this project's zero-dependency pattern (same approach as lib/supabase.js and lib/auth.js).
const crypto = require('crypto');

function secretKey() {
  return process.env.STRIPE_SECRET_KEY;
}

// Stripe's API takes application/x-www-form-urlencoded, including for nested objects and
// arrays (bracket notation: metadata[user_id]=..., line_items[0][price]=...). This flattens
// a plain object/array into that form.
function toFormBody(params, prefix) {
  const pairs = [];
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const arrayField = `${field}[${index}]`;
        if (typeof item === 'object' && item !== null) {
          pairs.push(...toFormBody(item, arrayField));
        } else {
          pairs.push(`${encodeURIComponent(arrayField)}=${encodeURIComponent(item)}`);
        }
      });
    } else if (typeof value === 'object') {
      pairs.push(...toFormBody(value, field));
    } else {
      pairs.push(`${encodeURIComponent(field)}=${encodeURIComponent(value)}`);
    }
  });
  return pairs;
}

async function stripeRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${secretKey()}:`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body ? toFormBody(body).join('&') : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// mode: 'subscription' (Terra Pro, recurring) or 'payment' (Terra Premium, one-time).
// client_reference_id and metadata carry the user_id through to the webhook, since Stripe's
// subscription lifecycle events don't otherwise tell us which Terra account they belong to.
async function createCheckoutSession({ mode, priceId, customerEmail, userId, plan, successUrl, cancelUrl }) {
  return stripeRequest('checkout/sessions', {
    method: 'POST',
    body: {
      mode,
      customer_email: customerEmail,
      client_reference_id: userId,
      metadata: { user_id: userId, plan },
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{ price: priceId, quantity: 1 }],
    },
  });
}

// Verifies Stripe's webhook signature manually (HMAC-SHA256 over "timestamp.rawBody"), the
// same pattern used for Sentry's envelope auth in lib/monitor.js — no SDK needed for this.
// Rejects signatures older than 5 minutes to guard against replay.
function constructWebhookEvent(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader) return null;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((pair) => {
      const idx = pair.indexOf('=');
      return [pair.slice(0, idx), pair.slice(idx + 1)];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return null;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (ageSeconds > 300) return null;

  try {
    return JSON.parse(rawBody);
  } catch (err) {
    return null;
  }
}

async function cancelSubscription(subscriptionId) {
  return stripeRequest(`subscriptions/${subscriptionId}`, { method: 'DELETE' });
}

module.exports = { stripeRequest, createCheckoutSession, constructWebhookEvent, cancelSubscription };
