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

if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = signupForm.querySelector('input[type="email"]');
    const submitBtn = signupForm.querySelector('button');
    const email = emailInput.value;

    submitBtn.disabled = true;
    formNote.textContent = 'Joining…';

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        formNote.textContent = "Something went wrong — please try again in a moment.";
        return;
      }

      formNote.textContent = `You're on the waitlist! We'll email ${email} as soon as a spot opens up.`;
      signupForm.reset();
    } catch (err) {
      formNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
    } finally {
      submitBtn.disabled = false;
    }
  });
}

const intakeForm = document.getElementById('intakeForm');
const intakeNote = document.getElementById('intakeNote');

if (intakeForm) {
  intakeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = intakeForm.querySelector('button');
    const formData = new FormData(intakeForm);
    const payload = Object.fromEntries(formData.entries());

    submitBtn.disabled = true;
    intakeNote.textContent = 'Submitting…';

    try {
      const res = await fetch('/api/get-started', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        intakeNote.textContent = "Something went wrong — please try again in a moment.";
        return;
      }

      intakeNote.textContent = "You're in! We'll start sending policy alerts relevant to your case to " + payload.email + ".";

      try {
        localStorage.setItem('terraProfile', JSON.stringify(payload));
      } catch (storageErr) {
        // localStorage unavailable (private browsing, etc.) — personalization on the Jobs page just falls back to generic content.
      }

      intakeForm.reset();
    } catch (err) {
      intakeNote.textContent = "Sorry, I couldn't reach the server. Please check your connection and try again.";
    } finally {
      submitBtn.disabled = false;
    }
  });
}

const chatToggle = document.getElementById('chatToggle');
const chatPanel = document.getElementById('chatPanel');
const chatHeader = document.getElementById('chatHeader');
const chatMinimize = document.getElementById('chatMinimize');
const chatClose = document.getElementById('chatClose');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

if (chatToggle) {
  const minimizeIcon = chatMinimize.innerHTML;
  const maximizeIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"/></svg>`;

  let chatHistory = [];

  // The floating round button only shows when the panel is fully closed —
  // once open or minimized, the panel itself (or its minimized strip) is the visible affordance.
  const setChatOpen = (open) => {
    chatPanel.hidden = !open;
    chatToggle.hidden = open;
    chatToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      setMinimized(false);
      chatInput.focus();
    }
  };

  const setMinimized = (minimized) => {
    chatPanel.classList.toggle('minimized', minimized);
    chatMinimize.innerHTML = minimized ? maximizeIcon : minimizeIcon;
    chatMinimize.setAttribute('aria-label', minimized ? 'Maximize chat' : 'Minimize chat');
    chatMinimize.setAttribute('title', minimized ? 'Maximize' : 'Minimize');
    if (!minimized) chatInput.focus();
  };

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

  const appendMessage = (role, text) => {
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${role === 'user' ? 'user' : 'bot'}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  };

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
}
