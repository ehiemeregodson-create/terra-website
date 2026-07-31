const { supabaseRequest } = require('./supabase');

// Atomic sliding-window counter backed by the `check_rate_limit` Postgres function (see the
// SQL migration) rather than read-then-write from Node — serverless instances are ephemeral
// and concurrent, so any in-memory or read/increment/write approach here would race.
async function checkRateLimit(key, { limit, windowSeconds }) {
  try {
    const res = await supabaseRequest('rpc/check_rate_limit', {
      method: 'POST',
      body: { p_key: key, p_limit: limit, p_window_seconds: windowSeconds },
    });
    if (!res.ok) return true; // fail open — a rate-limit outage shouldn't lock out real users
    const allowed = await res.json();
    return allowed !== false;
  } catch (err) {
    return true; // fail open
  }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = { checkRateLimit, clientIp };
