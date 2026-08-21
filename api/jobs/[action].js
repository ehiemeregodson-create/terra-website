// Single serverless function handling every /api/jobs/* endpoint — same consolidation pattern
// as api/cases/[action].js, to stay under Vercel Hobby's 12-function-per-deployment cap.
const { handleMatch } = require('../../lib/jobsHandlers');

const ROUTES = {
  match: handleMatch,
};

module.exports = async (req, res) => {
  const handler = ROUTES[req.query.action];
  if (!handler) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await handler(req, res);
};
