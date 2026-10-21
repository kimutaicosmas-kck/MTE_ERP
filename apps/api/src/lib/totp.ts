import { createHmac, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateMfaSecret() {
  let out = "";
  const bytes = randomBytes(20);
  for (const b of bytes) out += ALPHABET[b % 32];
  return out;
}

function decodeBase32(secret: string) {
  const clean = secret.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) continue;
    bits += i.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, step = Math.floor(Date.now() / 30000)) {
  const key = decodeBase32(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step & 0xffffffff, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string) {
  const expected = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(expected)) return false;
  const now = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((w) => totpCode(secret, now + w) === expected);
}

export function otpauthUrl(email: string, secret: string, issuer = "MTE ERP") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=30&digits=6`;
}
