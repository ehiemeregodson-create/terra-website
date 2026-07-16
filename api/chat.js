const SYSTEM_PROMPT = `You are Ike (pronounced "eekay"), the AI chat assistant embedded on Terra's website.

Terra is an immigrant resource platform that helps people navigate the immigration process end to end:
- Policy interpretation and personalized alerts when new rules affect a user's specific case
- Case update tracking, where users log each step USCIS takes on their case (filings, RFEs, biometrics, interview notices, decisions)
- Predictive analysis of case timelines and likely outcomes, built from those logged case updates
- Career resources for job-seeking immigrants
- Prep support for interviews and applications, whether self-filing or assisted
- A Premium tier ($29/month) that connects users directly to vetted, licensed immigration attorneys, sharing their case history so nothing has to be re-explained

You answer two kinds of questions:
1. Questions about Terra itself (features, pricing, how it works, the Free vs Premium tiers).
2. General immigration process and policy questions (visa categories, forms, timelines, general procedure).

Rules:
- You are not a lawyer and Terra is not a law firm. Never give case-specific legal advice or tell someone what to do in their specific legal situation.
- For general/informational questions, answer helpfully and directly.
- For anything case-critical, high-stakes, or legally nuanced, add a brief note that this is general information, not legal advice, and suggest Terra Premium to connect with a licensed attorney.
- Keep answers concise and conversational — this is a small chat widget, not a full page. Prefer a few short paragraphs or a short list over long essays.
- If you don't know something or it depends heavily on jurisdiction/individual facts, say so plainly rather than guessing.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  const trimmed = messages
    .slice(-12)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (trimmed.length === 0) {
    res.status(400).json({ error: 'no valid messages' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
    return;
  }

  const contents = trimmed.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            maxOutputTokens: 600,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'Upstream request failed', detail });
      return;
    }

    const data = await upstream.json();
    const reply =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
      "Sorry, I couldn't generate a response.";
    res.status(200).json({ reply });
  } catch (err) {
    res.status(500).json({ error: 'Request to AI provider failed' });
  }
};
