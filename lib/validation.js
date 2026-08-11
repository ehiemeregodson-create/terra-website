const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Must be more than 8 characters and include at least one uppercase letter, one lowercase
// letter, and one number — rules out passwords that are only letters or only numbers.
// Symbols are allowed but no longer required. Shared by signup and password-reset so the
// rule can't drift between the two entry points that create/change a password.
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{9,}$/;

const PASSWORD_ERROR =
  'Password must be more than 8 characters and include an uppercase letter, a lowercase letter, and a number.';

module.exports = { EMAIL_PATTERN, PASSWORD_PATTERN, PASSWORD_ERROR };
