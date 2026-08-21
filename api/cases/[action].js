// Single serverless function handling every /api/cases/* endpoint — same consolidation
// pattern as api/auth/[action].js, to stay under Vercel Hobby's 12-function-per-deployment
// cap. Actual logic lives in lib/casesHandlers.js; this file just dispatches on [action].
const { handleList, handleCreate, handleUpdate, handleDelete } = require('../../lib/casesHandlers');

const ROUTES = {
  list: handleList,
  create: handleCreate,
  update: handleUpdate,
  delete: handleDelete,
};

module.exports = async (req, res) => {
  const handler = ROUTES[req.query.action];
  if (!handler) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await handler(req, res);
};
