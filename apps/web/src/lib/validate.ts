const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

export function cleanInput(value: string, max = 500) {
  return value.replace(/\0/g, "").replace(CONTROL, "").trim().slice(0, max);
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
}

export function loginPayload(input: { email: string; password: string }) {
  const email = cleanInput(input.email, 120).toLowerCase();
  const password = input.password.slice(0, 128);
  if (!isEmail(email)) return { error: "Enter a valid email address" };
  if (password.length < 1) return { error: "Password is required" };
  return { email, password };
}
