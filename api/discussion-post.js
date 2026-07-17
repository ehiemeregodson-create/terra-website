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

  const apiKey = process.env.GEMINI_API_KEY;
  const sheetUrl = process.env.WAITLIST_SHEET_URL;
  if (!apiKey || !sheetUrl) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY or WAITLIST_SHEET_URL' });
    return;
  }

  let moderation = { harmful: false, harmfulReason: '', questionable: false, calloutNote: '' };
  let debugInfo = null;

  try {
    const modResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: MODERATION_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            maxOutputTokens: 300,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    const modData = await modResponse.json().catch(() => null);
    const blockReason = modData?.promptFeedback?.blockReason;
    const finishReason = modData?.candidates?.[0]?.finishReason;

    if (req.query && req.query.debug === 'terra123') {
      debugInfo = { status: modResponse.status, blockReason: blockReason || null, finishReason: finishReason || null, modData };
    }

    if (!modResponse.ok || blockReason || finishReason === 'SAFETY' || finishReason === 'RECITATION') {
      // Gemini's own safety filter refusing to even classify the text is itself a strong
      // signal the content is harmful — treat that as a block rather than failing open.
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
        // Moderation response wasn't valid JSON despite a normal finish reason — fail open (allow, unflagged).
      }
    }
  } catch (modErr) {
    // Moderation call failed outright (network error, etc.) — fail open rather than block legitimate posts.
  }

  if (moderation.harmful) {
    res.status(403).json({
      blocked: true,
      reason: 'This comment violates our community guidelines and was not posted.' +
        (moderation.harmfulReason ? ` (${moderation.harmfulReason})` : ''),
      debug: debugInfo,
    });
    return;
  }

  try {
    const upstream = await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        formType: 'discussion',
        postType,
        parentId,
        name: name || 'Anonymous',
        text,
        callout: moderation.questionable ? moderation.calloutNote : '',
      }),
      redirect: 'follow',
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'Failed to record post', detail });
      return;
    }

    const data = await upstream.json().catch(() => ({}));
    if (data.error) {
      res.status(502).json({ error: data.error });
      return;
    }

    res.status(200).json({
      success: true,
      callout: moderation.questionable ? moderation.calloutNote : null,
      debug: debugInfo,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach discussion storage' });
  }
};
