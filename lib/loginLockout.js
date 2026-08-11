// Progressive per-account login lockout (5 failed attempts locks the account, escalating in
// duration on repeat offenses) — see sql/2026-08-10-security-hardening.sql for the actual
// tiering logic, which lives in Postgres so it stays atomic under concurrent requests.
const { supabaseRequest } = require('./supabase');

function formatWait(lockedUntilAt) {
  const ms = new Date(lockedUntilAt).getTime() - Date.now();
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

async function checkLockout(email) {
  try {
    const res = await supabaseRequest('rpc/check_login_lockout', {
      method: 'POST',
      body: { p_email: email },
    });
    if (!res.ok) return { locked: false };
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row || !row.is_locked) return { locked: false };
    return { locked: true, lockedUntil: row.locked_until_at };
  } catch (err) {
    return { locked: false }; // fail open — an outage here shouldn't lock everyone out
  }
}

async function recordFailure(email) {
  try {
    const res = await supabaseRequest('rpc/record_login_failure', {
      method: 'POST',
      body: { p_email: email },
    });
    if (!res.ok) return { locked: false };
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { locked: false };
    return { locked: Boolean(row.is_locked), lockedUntil: row.locked_until_at };
  } catch (err) {
    return { locked: false };
  }
}

async function resetLockout(email) {
  try {
    await supabaseRequest('rpc/reset_login_lockout', {
      method: 'POST',
      body: { p_email: email },
    });
  } catch (err) {
    // Non-critical — worst case, the counter clears on its own next successful login attempt.
  }
}

module.exports = { checkLockout, recordFailure, resetLockout, formatWait };
