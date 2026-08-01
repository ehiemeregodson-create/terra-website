// Single serverless function handling every /api/auth/* endpoint — consolidated from seven
// separate files to stay under Vercel Hobby's 12-function-per-deployment cap. Actual logic
// lives in lib/authHandlers.js; this file just dispatches on the [action] path segment.
const {
  handleSignup,
  handleLogin,
  handleLogout,
  handleMe,
  handleForgotPassword,
  handleResetPassword,
  handleDeleteAccount,
  handleTestError,
} = require('../../lib/authHandlers');

const ROUTES = {
  signup: handleSignup,
  login: handleLogin,
  logout: handleLogout,
  me: handleMe,
  'forgot-password': handleForgotPassword,
  'reset-password': handleResetPassword,
  'delete-account': handleDeleteAccount,
  'test-error': handleTestError, // TEMPORARY — remove alongside handleTestError once Sentry is verified
};

module.exports = async (req, res) => {
  const handler = ROUTES[req.query.action];
  if (!handler) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await handler(req, res);
};
