const { supabaseRequest } = require('../lib/supabase');

const MODERATION_PROMPT = `You are a content moderation classifier for Terra's immigration community discussion board. You will be given a single post (a question or an answer written by a visitor).

Classify it and respond with STRICT JSON only, matching this shape exactly:
{"harmful": boolean, "harmfulReason": string, "questionable": boolean, "calloutNote": string}

Rules:
- "harmful" is true for: hate speech, harassment, threats, scams, illegal content, spam/ads unrelated to immigration, or explicit content. Set harmfulReason to a short (under 15 words) explanation when true, otherwise empty string.
- "questionable" is true when the post states a specific factual claim about immigration law, policy, timelines, or procedure that is likely false, outdated, or significantly misleading. Ordinary opinions, personal experiences, or general questions are NOT questionable. Set calloutNote to a short (under 25 words), neutral correction or caveat when true, otherwise empty string.
- A post can be harmful and questionable at the same time, or neither.
- Respond with ONLY the JSON object, no other text.`;

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

// Fast local pre-filter for the most blatant, unambiguous cases — catches them for free
// and instantly, without spending API quota on something a keyword match already settles.
// This is a backstop, not the primary check: it only matches severe, hard-to-misfire phrases
// and leaves everything else (including all nuanced/borderline content) to the AI classifier below.
const LOCAL_HARMFUL_PATTERNS = [
  /\bkill\s*(yourself|urself|ur\s*self|u\s*rself)\b/i,
  /\bkys\b/i,
  /\bgo\s+die\b/i,
  /\byou\s+should\s+die\b/i,
];

function localHarmfulCheck(text) {
  return LOCAL_HARMFUL_PATTERNS.some((re) => re.test(text));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const postType = body.postType === 'answer' ? 'answer' : 'question';
  const parentId = cleanString(body.parentId, 200);
  const name = cleanString(body.name, 80);
  const text = cleanString(body.text, 1000);

  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }
  if (postType === 'answer' && !parentId) {
    res.status(400).json({ error: 'parentId is required for answers' });
    return;
  }
  if (postType === 'answer' && !/^[0-9a-f-]{36}$/i.test(parentId)) {
    res.status(400).json({ error: 'parentId must be a valid post id' });
    return;
  }

  if (localHarmfulCheck(text)) {
    res.status(403).json({
      blocked: true,
      reason: 'This comment violates our community guidelines and was not posted.',
    });
    return;
  }

  // Prefers a separate API key/project from Jay's chat widget so the two features don't
  // compete for the same quota, but falls back to the shared chat key if a dedicated
  // moderation key hasn't been configured — gemini-flash-lite-latest's free quota is high
  // enough that sharing one key is realistically fine for a site this size.
  const apiKey = process.env.GEMINI_MODERATION_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing GEMINI_MODERATION_API_KEY or GEMINI_API_KEY' });
    return;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function callModeration() {
    const modResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: MODERATION_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            maxOutputTokens: 300,
            responseMimeType: 'application/json',
          },
        }),
      }
    );
    const modData = await modResponse.json().catch(() => null);
    return { ok: modResponse.ok, status: modResponse.status, modData };
  }

  let moderation = { harmful: false, harmfulReason: '', questionable: false, calloutNote: '' };
  let resolved = false;

  for (let attempt = 0; attempt < 2 && !resolved; attempt++) {
    try {
      if (attempt > 0) await sleep(600);
      const { ok, status, modData } = await callModeration();

      if (!ok) {
        // Infrastructure-level failure (rate limit, overload, etc.) says nothing about the
        // content itself. Retry once; if it still fails, fail OPEN rather than block a real
        // user's legitimate post over Google's free-tier capacity.
        if (attempt === 0 && status >= 500) continue;
        resolved = true;
        break;
      }

      const blockReason = modData?.promptFeedback?.blockReason;
      const finishReason = modData?.candidates?.[0]?.finishReason;

      if (blockReason || finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        // Gemini's own safety filter refusing to classify the text IS a signal about the
        // content — this is the one case worth failing closed on.
        moderation = {
          harmful: true,
          harmfulReason: 'flagged by automated safety filter',
          questionable: false,
          calloutNote: '',
        };
      } else {
        const raw = modData?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
        try {
          const parsed = JSON.parse(raw);
          moderation = {
            harmful: Boolean(parsed.harmful),
            harmfulReason: cleanString(parsed.harmfulReason, 200),
            questionable: Boolean(parsed.questionable),
            calloutNote: cleanString(parsed.calloutNote, 300),
          };
        } catch (parseErr) {
          // Valid response, but not parseable JSON — fail open rather than block on a formatting fluke.
        }
      }
      resolved = true;
    } catch (modErr) {
      // Network-level failure calling Gemini at all. Retry once, then fail open — same
      // reasoning as an HTTP-level infra failure above.
      if (attempt === 1) resolved = true;
    }
  }

  if (moderation.harmful) {
    res.status(403).json({
      blocked: true,
      reason: 'This comment violates our community guidelines and was not posted.' +
        (moderation.harmfulReason ? ` (${moderation.harmfulReason})` : ''),
    });
    return;
  }

  try {
    const upstream = await supabaseRequest('discussion_posts', {
      method: 'POST',
      body: {
        post_type: postType,
        parent_id: parentId || null,
        name: name || 'Anonymous',
        text,
        callout: moderation.questionable ? moderation.calloutNote : null,
      },
      extraHeaders: { prefer: 'return=minimal' },
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('discussion-post: upstream error', upstream.status, detail);
      res.status(502).json({ error: 'Failed to record post' });
      return;
    }

    res.status(200).json({
      success: true,
      callout: moderation.questionable ? moderation.calloutNote : null,
    });
  } catch (err) {
    console.error('discussion-post: request failed', err);
    res.status(500).json({ error: 'Failed to reach discussion storage' });
  }
};
