// Minimal admin gate — an env-var allowlist rather than a database role/permissions system,
// since there's exactly one operator today. ADMIN_EMAILS is a comma-separated list, set in
// Vercel's project settings (never committed — same treatment as the other secrets in lib/).
function isAdminEmail(email) {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(String(email).toLowerCase());
}

module.exports = { isAdminEmail };
