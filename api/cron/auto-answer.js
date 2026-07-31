const { supabaseRequest } = require('../../lib/supabase');

const JAY_ANSWER_PROMPT = `You are Jay, Terra's AI assistant. A visitor posted a question on Terra's community discussion board more than 24 hours ago and no one else has answered it yet. Write a helpful, direct answer.

Rules:
- You are not a lawyer and Terra is not a law firm. Never give case-specific legal advice.
- Keep it concise — a few short paragraphs or a short list, not an essay.
- If the question depends heavily on jurisdiction or individual facts, say so plainly and suggest Terra Premium for a licensed attorney connection when it's genuinely high-stakes.
- Answer directly. Do not repeat the question back, and skip filler like "Great question!".`;

async function generateAnswer(questionText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: JAY_ANSWER_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: questionText }] }],
          generationConfig: { maxOutputTokens: 500 },
        }),
      }
    );
    if (!upstream.ok) {
      console.error('cron/auto-answer: Gemini error', upstream.status, await upstream.text());
      return null;
    }
    const data = await upstream.json();
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || null;
  } catch (err) {
    console.error('cron/auto-answer: Gemini request failed', err);
    return null;
  }
}

module.exports = async (req, res) => {
  // Vercel Cron sends this header automatically when CRON_SECRET is set — rejects any
  // other caller from triggering AI-generated posts on demand.
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const [qRes, aRes] = await Promise.all([
      supabaseRequest('discussion_posts?post_type=eq.question&select=id,text,created_at'),
      supabaseRequest('discussion_posts?post_type=eq.answer&select=parent_id'),
    ]);

    if (!qRes.ok || !aRes.ok) {
      console.error('cron/auto-answer: failed to load posts', qRes.status, aRes.status);
      res.status(502).json({ error: 'Failed to load discussion posts' });
      return;
    }

    const questions = await qRes.json();
    const answers = await aRes.json();
    const answeredIds = new Set(answers.map((a) => a.parent_id));

    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const stale = questions.filter(
      (q) => !answeredIds.has(q.id) && now - new Date(q.created_at).getTime() >= DAY_MS
    );

    let answeredCount = 0;
    for (const q of stale) {
      const answerText = await generateAnswer(q.text);
      if (!answerText) continue;

      const insertRes = await supabaseRequest('discussion_posts', {
        method: 'POST',
        body: {
          post_type: 'answer',
          parent_id: q.id,
          name: 'Jay',
          text: answerText,
          callout: null,
          is_ai: true,
        },
        extraHeaders: { prefer: 'return=minimal' },
      });

      if (insertRes.ok) {
        answeredCount++;
      } else {
        console.error('cron/auto-answer: failed to insert answer', insertRes.status, await insertRes.text());
      }
    }

    res.status(200).json({ checked: questions.length, stale: stale.length, answered: answeredCount });
  } catch (err) {
    console.error('cron/auto-answer: failed', err);
    res.status(500).json({ error: 'Cron job failed' });
  }
};
