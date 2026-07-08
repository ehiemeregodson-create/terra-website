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
const chatClose = document.getElementById('chatClose');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

let chatHistory = [];

function setChatOpen(open) {
  chatPanel.hidden = !open;
  chatToggle.setAttribute('aria-expanded', String(open));
  if (open) chatInput.focus();
}

chatToggle.addEventListener('click', () => setChatOpen(chatPanel.hidden));
chatClose.addEventListener('click', () => setChatOpen(false));

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
