// Single serverless function handling every /api/admin/* endpoint — same consolidation pattern
// as api/cases/[action].js and api/dashboard/[action].js, to stay under Vercel Hobby's
// 12-function-per-deployment cap.
const { handleSurveyStats } = require('../../lib/adminHandlers');

const ROUTES = {
  'survey-stats': handleSurveyStats,
};

module.exports = async (req, res) => {
  const handler = ROUTES[req.query.action];
  if (!handler) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await handler(req, res);
};
