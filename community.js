function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatRelativeTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

const AVATAR_COLORS = ['#1b4332', '#2d6a4f', '#b8853a', '#4c5a53', '#10281f'];

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarHtml(name, isAI) {
  const n = name || 'Anonymous';
  if (isAI) {
    return `<span class="discussion-avatar discussion-avatar-ai">🤖</span>`;
  }
  const letter = escapeHtml(n.charAt(0).toUpperCase());
  return `<span class="discussion-avatar" style="background:${avatarColor(n)}">${letter}</span>`;
}

function postMetaHtml(post) {
  const aiBadge = post['IsAI'] ? '<span class="ai-badge">AI Assistant</span>' : '';
  return `
    <div class="discussion-post-head">
      ${avatarHtml(post['Name'], post['IsAI'])}
      <div class="discussion-post-headtext">
        <strong>${escapeHtml(post['Name'] || 'Anonymous')}</strong>
        ${aiBadge}
        <span class="discussion-time">${formatRelativeTime(post['Submitted At'])}</span>
      </div>
    </div>
  `;
}

/* ---------- Upvoting ---------- */

function getUpvotedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem('terraUpvoted') || '[]'));
  } catch (err) {
    return new Set();
  }
}

function saveUpvotedIds(set) {
  try {
    localStorage.setItem('terraUpvoted', JSON.stringify(Array.from(set)));
  } catch (err) {
    // localStorage unavailable — upvotes still work, just won't remember state across visits.
  }
}

function voteButtonHtml(post) {
  const upvoted = getUpvotedIds().has(post['ID']);
  return `
    <button type="button" class="discussion-vote${upvoted ? ' upvoted' : ''}" data-post-id="${escapeHtml(post['ID'])}" aria-label="Upvote">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4l8 10H4z"/></svg>
      <span class="discussion-vote-count">${post['Upvotes'] || 0}</span>
    </button>
  `;
}

async function handleUpvoteClick(btn) {
  const postId = btn.dataset.postId;
  const upvoted = getUpvotedIds();
  if (upvoted.has(postId) || btn.disabled) return;

  btn.disabled = true;
  try {
    const res = await fetch('/api/discussion-upvote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: postId }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      upvoted.add(postId);
      saveUpvotedIds(upvoted);
      btn.classList.add('upvoted');
      const countEl = btn.querySelector('.discussion-vote-count');
      if (countEl) {
        countEl.textContent = data.upvotes != null ? data.upvotes : (parseInt(countEl.textContent, 10) || 0) + 1;
      }
    }
  } catch (err) {
    // Silent fail — button just re-enables below so they can retry.
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Posting ---------- */

async function submitPost({ postType, parentId, name, text }) {
  try {
    const res = await fetch('/api/discussion-post', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postType, parentId: parentId || '', name, text }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 403) {
      return { blocked: true, reason: data.reason || 'This comment violates our community guidelines and was not posted.' };
    }
    if (!res.ok || !data.success) {
      return { success: false };
    }
    return { success: true, callout: data.callout || null };
  } catch (err) {
    return { success: false };
  }
}

/* ---------- Rendering ---------- */

function renderDiscussion(posts) {
  const listEl = document.getElementById('discussionList');
  const questions = posts.filter((p) => p['Type'] === 'question');
  const answers = posts.filter((p) => p['Type'] === 'answer');

  if (questions.length === 0) {
    listEl.innerHTML = '<p class="discussion-empty">No questions yet — be the first to ask.</p>';
    return;
  }

  listEl.innerHTML = '';

  questions.slice().reverse().forEach((q) => {
    const qAnswers = answers
      .filter((a) => a['Parent ID'] === q['ID'])
      .sort((a, b) => new Date(a['Submitted At']) - new Date(b['Submitted At']));

    const card = document.createElement('article');
    card.className = 'discussion-card';
    card.innerHTML = `
      <div class="discussion-q">
        ${voteButtonHtml(q)}
        <div class="discussion-q-body">
          ${postMetaHtml(q)}
          <p class="discussion-text">${escapeHtml(q['Text'])}</p>
          ${q['Callout'] ? `<div class="discussion-callout">⚠️ ${escapeHtml(q['Callout'])}</div>` : ''}
          <div class="discussion-actions">
            <button type="button" class="discussion-action-btn discussion-reply-btn">💬 Reply</button>
            ${
              qAnswers.length
                ? `<button type="button" class="discussion-action-btn discussion-collapse-btn">— ${qAnswers.length} ${qAnswers.length === 1 ? 'answer' : 'answers'}</button>`
                : '<span class="discussion-action-btn discussion-no-answers">No answers yet</span>'
            }
          </div>
          <form class="answer-form" hidden>
            <input type="text" class="answer-name" placeholder="Your name (optional)" maxlength="80">
            <textarea class="answer-text" placeholder="Write an answer…" rows="2" maxlength="1000" required></textarea>
            <button type="submit" class="btn btn-outline btn-block">Post answer</button>
            <p class="cta-note answer-note"></p>
          </form>
          <div class="discussion-answers"></div>
        </div>
      </div>
    `;

    const answersEl = card.querySelector('.discussion-answers');
    qAnswers.forEach((a) => {
      const aDiv = document.createElement('div');
      aDiv.className = 'discussion-answer' + (a['IsAI'] ? ' discussion-answer-ai' : '');
      aDiv.innerHTML = `
        ${voteButtonHtml(a)}
        <div class="discussion-a-body">
          ${postMetaHtml(a)}
          <p class="discussion-text">${escapeHtml(a['Text'])}</p>
          ${a['Callout'] ? `<div class="discussion-callout">⚠️ ${escapeHtml(a['Callout'])}</div>` : ''}
        </div>
      `;
      answersEl.appendChild(aDiv);
    });

    const replyBtn = card.querySelector('.discussion-reply-btn');
    const answerForm = card.querySelector('.answer-form');
    replyBtn.addEventListener('click', () => {
      answerForm.hidden = !answerForm.hidden;
      if (!answerForm.hidden) answerForm.querySelector('.answer-text').focus();
    });

    const collapseBtn = card.querySelector('.discussion-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        const collapsed = answersEl.classList.toggle('collapsed');
        const label = `${qAnswers.length} ${qAnswers.length === 1 ? 'answer' : 'answers'}`;
        collapseBtn.textContent = (collapsed ? '+ ' : '— ') + label;
      });
    }

    card.querySelectorAll('.discussion-vote').forEach((btn) => {
      btn.addEventListener('click', () => handleUpvoteClick(btn));
    });

    answerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = answerForm.querySelector('.answer-name');
      const textInput = answerForm.querySelector('.answer-text');
      const note = answerForm.querySelector('.answer-note');
      const btn = answerForm.querySelector('button');
      const text = textInput.value.trim();
      if (!text) return;

      btn.disabled = true;
      note.textContent = 'Checking your answer…';

      const result = await submitPost({ postType: 'answer', parentId: q['ID'], name: nameInput.value.trim(), text });

      if (result.blocked) {
        note.textContent = result.reason;
        btn.disabled = false;
        return;
      }
      if (!result.success) {
        note.textContent = 'Something went wrong — please try again.';
        btn.disabled = false;
        return;
      }

      trackEvent('discussion_post', { postType: 'answer', flagged: Boolean(result.callout) });
      btn.disabled = false;
      answerForm.reset();
      loadDiscussion();
    });

    listEl.appendChild(card);
  });
}

async function loadDiscussion() {
  const listEl = document.getElementById('discussionList');
  try {
    const res = await fetch('/api/discussion-list');
    const data = await res.json();
    renderDiscussion(data.posts || []);
  } catch (err) {
    listEl.innerHTML = "<p class=\"discussion-empty\">Couldn't load the discussion right now.</p>";
  }
}

const questionForm = document.getElementById('questionForm');
const questionNote = document.getElementById('questionNote');

questionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('questionName');
  const textInput = document.getElementById('questionText');
  const btn = questionForm.querySelector('button');
  const text = textInput.value.trim();
  if (!text) return;

  btn.disabled = true;
  questionNote.textContent = 'Checking your question…';

  const result = await submitPost({ postType: 'question', parentId: '', name: nameInput.value.trim(), text });

  if (result.blocked) {
    questionNote.textContent = result.reason;
    btn.disabled = false;
    return;
  }
  if (!result.success) {
    questionNote.textContent = 'Something went wrong — please try again.';
    btn.disabled = false;
    return;
  }

  questionNote.textContent = result.callout ? 'Posted — note: ' + result.callout : 'Posted!';
  trackEvent('discussion_post', { postType: 'question', flagged: Boolean(result.callout) });
  questionForm.reset();
  btn.disabled = false;
  loadDiscussion();
});

loadDiscussion();
