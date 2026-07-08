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
