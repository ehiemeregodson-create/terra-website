// Single serverless function handling /api/discussion/list, /post, /upvote — consolidated
// from three separate files to stay under Vercel Hobby's 12-function-per-deployment cap.
// Actual logic lives in lib/discussionHandlers.js; this file just dispatches on the [action]
// path segment.
const { handleList, handlePost, handleUpvote } = require('../../lib/discussionHandlers');

const ROUTES = {
  list: handleList,
  post: handlePost,
  upvote: handleUpvote,
};

module.exports = async (req, res) => {
  const handler = ROUTES[req.query.action];
  if (!handler) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await handler(req, res);
};
