// Minimal Sentry error reporter using their raw envelope API — no SDK dependency, consistent
// with the rest of this codebase talking to third-party services over plain fetch. If
// SENTRY_DSN isn't configured yet, this is a no-op beyond the console.error the caller already
// does.
function parseDsn(dsn) {
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, publicKey, host, projectId] = match;
  return { publicKey, host, projectId };
}

async function captureError(err, context = {}) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const parsed = parseDsn(dsn);
  if (!parsed) return;
  const { publicKey, host, projectId } = parsed;

  const eventId = require('crypto').randomUUID().replace(/-/g, '');
  const timestamp = new Date().toISOString();

  const event = {
    event_id: eventId,
    timestamp,
    platform: 'node',
    level: 'error',
    exception: {
      values: [
        {
          type: err && err.name ? err.name : 'Error',
          value: err && err.message ? err.message : String(err),
        },
      ],
    },
    extra: { ...context, stack: err && err.stack ? err.stack : undefined },
  };

  const envelope =
    `${JSON.stringify({ event_id: eventId, sent_at: timestamp })}\n` +
    `${JSON.stringify({ type: 'event' })}\n` +
    `${JSON.stringify(event)}`;

  try {
    await fetch(`https://${host}/api/${projectId}/envelope/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=terra-manual/1.0`,
      },
      body: envelope,
    });
  } catch (sendErr) {
    console.error('monitor: failed to report error to Sentry', sendErr);
  }
}

module.exports = { captureError };
