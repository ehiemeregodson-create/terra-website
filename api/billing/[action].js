// Single serverless function for authenticated billing actions (currently just
// create-checkout; room to add e.g. a billing-portal action later without a new function).
// Kept separate from api/billing/webhook.js because that one needs raw-body access for
// signature verification and can't share this file's default JSON body parsing.
const { handleCreateCheckout } = require('../../lib/billingHandlers');

const ROUTES = {
  'create-checkout': handleCreateCheckout,
};

module.exports = async (req, res) => {
  const handler = ROUTES[req.query.action];
  if (!handler) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await handler(req, res);
};
