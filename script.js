const header = document.getElementById('header');
const navToggle = document.getElementById('navToggle');

navToggle.addEventListener('click', () => {
  const isOpen = header.classList.toggle('menu-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.nav-links a, .header-actions a').forEach((link) => {
  link.addEventListener('click', () => {
    header.classList.remove('menu-open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

const signupForm = document.getElementById('signupForm');
const formNote = document.getElementById('formNote');

signupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = signupForm.querySelector('input[type="email"]').value;
  formNote.textContent = `We'll send your Terra roadmap invite to ${email}.`;
  signupForm.reset();
});

const chatToggle = document.getElementById('chatToggle');
const chatPanel = document.getElementById('chatPanel');
const chatHeader = document.getElementById('chatHeader');
const chatMinimize = document.getElementById('chatMinimize');
const chatClose = document.getElementById('chatClose');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

const minimizeIcon = chatMinimize.innerHTML;
const maximizeIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"/></svg>`;

let chatHistory = [];

// The floating round button only shows when the panel is fully closed —
// once open or minimized, the panel itself (or its minimized strip) is the visible affordance.
function setChatOpen(open) {
  chatPanel.hidden = !open;
  chatToggle.hidden = open;
  chatToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    setMinimized(false);
    chatInput.focus();
  }
}

function setMinimized(minimized) {
  chatPanel.classList.toggle('minimized', minimized);
  chatMinimize.innerHTML = minimized ? maximizeIcon : minimizeIcon;
  chatMinimize.setAttribute('aria-label', minimized ? 'Maximize chat' : 'Minimize chat');
  chatMinimize.setAttribute('title', minimized ? 'Maximize' : 'Minimize');
  if (!minimized) chatInput.focus();
}

chatToggle.addEventListener('click', () => setChatOpen(true));
chatClose.addEventListener('click', (e) => {
  e.stopPropagation();
  setChatOpen(false);
});

chatMinimize.addEventListener('click', (e) => {
  e.stopPropagation();
  setMinimized(!chatPanel.classList.contains('minimized'));
});

chatHeader.addEventListener('click', () => {
  if (chatPanel.classList.contains('minimized')) setMinimized(false);
});

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg-${role === 'user' ? 'user' : 'bot'}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  chatInput.value = '';
  chatInput.disabled = true;

  const loadingEl = appendMessage('bot', 'Thinking…');
  loadingEl.classList.add('chat-msg-loading');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });
    const data = await res.json();
    loadingEl.remove();

    if (!res.ok || !data.reply) {
      appendMessage('bot', "Sorry, something went wrong on my end. Please try again in a moment.");
      return;
    }

    appendMessage('bot', data.reply);
    chatHistory.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    loadingEl.remove();
    appendMessage('bot', "Sorry, I couldn't reach the server. Please check your connection and try again.");
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});
