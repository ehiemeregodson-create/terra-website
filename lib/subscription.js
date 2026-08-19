const { supabaseRequest } = require('./supabase');

// Single source of truth for "what plan is this user actually on" — never read
// cases.selected_plan for this, which is just a stale snapshot from signup time and is never
// updated on upgrade/downgrade. This queries the real Stripe-synced subscriptions table instead.
//
// A canceled/past-due Pro row is never deleted (see api/billing/webhook.js), just has its status
// flipped — so "a pro row exists" is not sufficient, status must also be checked. Premium rows are
// written once by checkout.session.completed and never change status again, so existence is enough.
async function getUserPlan(userId) {
  try {
    const res = await supabaseRequest(`subscriptions?user_id=eq.${userId}&select=plan,status`);
    if (!res.ok) return 'free';
    const rows = await res.json();

    if (rows.some((r) => r.plan === 'premium')) return 'premium';
    if (rows.some((r) => r.plan === 'pro' && ['active', 'trialing'].includes(r.status))) return 'pro';
    return 'free';
  } catch (err) {
    return 'free'; // fail closed — an outage here should not silently grant paid features
  }
}

module.exports = { getUserPlan };
