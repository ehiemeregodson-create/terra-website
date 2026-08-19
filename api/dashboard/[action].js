// Single serverless function handling every /api/dashboard/* endpoint — same consolidation
// pattern as api/cases/[action].js, to stay under Vercel Hobby's 12-function-per-deployment cap.
const { handleSummary, handleToggleChecklist, handleRequestAttorneyCall } = require('../../lib/dashboardHandlers');

const ROUTES = {
  summary: handleSummary,
  'toggle-checklist': handleToggleChecklist,
  'request-attorney-call': handleRequestAttorneyCall,
};

module.exports = async (req, res) => {
  const handler = ROUTES[req.query.action];
  if (!handler) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await handler(req, res);
};
