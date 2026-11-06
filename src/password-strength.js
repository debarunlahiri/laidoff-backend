// Returns a human-readable problem with a new password, or "" when it is strong enough.
// Applied at registration only, so existing accounts can still sign in.
const weakParts = [
  "password",
  "passw0rd",
  "qwerty",
  "letmein",
  "welcome",
  "iloveyou",
  "admin",
  "abc123",
  "123456",
  "654321",
  "000000",
  "111111",
  "laidoff",
  "layoff",
];
export function passwordProblem(password, { email = "", name = "" } = {}) {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;
  if (classes < 3)
    return "Use at least three of: lowercase, uppercase, numbers, symbols.";
  const flat = password.toLowerCase();
  if (weakParts.some((part) => flat.includes(part)))
    return "That password is too easy to guess. Avoid common words and number runs.";
  if (/(.)\1{3,}/.test(password))
    return "Avoid repeating the same character four or more times.";
  const personal = [email.split("@")[0], ...String(name).split(/\s+/)].filter(
    (part) => part.length >= 4,
  );
  if (personal.some((part) => flat.includes(part.toLowerCase())))
    return "Your password shouldn’t contain your name or email.";
  return "";
}
