import { Router } from "express";
import { createHash, randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { checkPassword, hashPassword, signTicket, signToken, verifyToken } from "../lib/auth.js";
import { createSession, destroySession, destroyUserSessions } from "../lib/redis.js";
import { auth } from "../middleware/auth.js";
import { limit, limitLoginEmail } from "../middleware/rateLimit.js";
import { zEmail, zPassword } from "../lib/sanitize.js";
import { publicUser } from "../lib/access.js";
import { audit } from "../lib/audit.js";
import { generateMfaSecret, otpauthUrl, verifyTotp } from "../lib/totp.js";
import { notifyUsers } from "../lib/push.js";

export const authRouter = Router();

const ME_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  department: true,
  modules: true,
  phone: true,
  monthlyTarget: true,
  jobTitle: true,
  avatarUrl: true,
  mfaEnabled: true,
} as const;

function hashReset(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

async function issueSession(user: { id: string; email: string; name: string; role: string }) {
  const tokenUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  const sid = await createSession(tokenUser);
  return { token: signToken({ ...tokenUser, sid }), user: publicUser(await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: ME_SELECT })) };
}

authRouter.post("/login", limit("login"), async (req, res) => {
  const body = z.object({
    email: zEmail(),
    password: zPassword(1, 128),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Valid email and password required" });
  if (!(await limitLoginEmail(body.data.email, res, req))) {
    return res.status(429).json({ error: "Too many sign-in attempts for this account. Try again later." });
  }
  const user = await prisma.user.findUnique({ where: { email: body.data.email } });
  if (!user || !user.active || !(await checkPassword(body.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (user.mfaEnabled && user.mfaSecret) {
    return res.json({ mfaRequired: true, ticket: signTicket({ typ: "mfa", id: user.id }, "5m") });
  }
  res.json(await issueSession(user));
});

authRouter.post("/mfa", limit("login"), async (req, res) => {
  const body = z.object({
    ticket: z.string().trim().min(10).max(2000),
    code: z.string().trim().regex(/^\d{6,8}$/, "Enter a 6-digit code"),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Enter the 6-digit code from your authenticator app" });
  try {
    const ticket = verifyToken(body.data.ticket) as { typ?: string; id?: string };
    if (ticket.typ !== "mfa" || !ticket.id) return res.status(401).json({ error: "Sign-in expired. Start again." });
    const user = await prisma.user.findUnique({ where: { id: ticket.id } });
    if (!user || !user.active || !user.mfaSecret) return res.status(401).json({ error: "Sign-in expired. Start again." });
    if (!verifyTotp(user.mfaSecret, body.data.code)) return res.status(401).json({ error: "That code is not valid. Try the next one." });
    res.json(await issueSession(user));
  } catch {
    return res.status(401).json({ error: "Sign-in expired. Start again." });
  }
});

authRouter.post("/forgot", limit("login"), async (req, res) => {
  const parsed = z.object({ email: zEmail() }).safeParse(req.body);
  const email = parsed.success ? parsed.data.email : "";
  if (email && !(await limitLoginEmail(email, res))) {
    return res.status(429).json({ error: "Too many reset requests. Try again later." });
  }
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (user && user.active) {
    const code = String(randomInt(100000, 999999));
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: hashReset(code), resetExpires: new Date(Date.now() + 30 * 60 * 1000) },
    });
    const admins = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, active: true }, select: { id: true } });
    try {
      await notifyUsers(admins.map((a) => a.id), {
        title: "Password reset requested",
        body: `${user.name} (${user.email}) needs a reset code. Open HR → Employees to issue one.`,
        url: "/hr",
      });
    } catch {
      /* notice is optional */
    }
  }
  res.json({ ok: true, message: "If this account exists, a Super Admin can issue a reset code from HR → Employees." });
});

authRouter.post("/reset", limit("login"), async (req, res) => {
  const body = z.object({
    email: zEmail(),
    code: z.string().trim().regex(/^\d{6,8}$/),
    newPassword: zPassword(8, 128),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Email, 6-digit code, and a new password of at least 8 characters are required" });
  const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
  if (!user || !user.resetToken || !user.resetExpires || user.resetExpires < new Date()) {
    return res.status(400).json({ error: "That reset code is invalid or has expired. Ask Super Admin for a new one." });
  }
  if (user.resetToken !== hashReset(body.data.code.trim())) {
    return res.status(400).json({ error: "That reset code is invalid or has expired. Ask Super Admin for a new one." });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.data.newPassword), resetToken: null, resetExpires: null },
  });
  await destroyUserSessions(user.id);
  await audit(req, { entity: "User", entityId: user.id, action: "RESET_PASSWORD" });
  res.json({ ok: true });
});

authRouter.post("/mfa/setup", auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "Not found" });
  const secret = generateMfaSecret();
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret, mfaEnabled: false } });
  res.json({ secret, otpauth: otpauthUrl(user.email, secret) });
});

authRouter.post("/mfa/enable", auth, async (req, res) => {
  const code = String(req.body.code || "");
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.mfaSecret) return res.status(400).json({ error: "Start MFA setup first" });
  if (!verifyTotp(user.mfaSecret, code)) return res.status(400).json({ error: "That code is not valid. Try the next one." });
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
  await audit(req, { entity: "User", entityId: user.id, action: "ENABLE_MFA" });
  res.json({ ok: true, mfaEnabled: true });
});

authRouter.post("/mfa/disable", auth, async (req, res) => {
  const body = z.object({ password: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Enter your password to turn MFA off" });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await checkPassword(body.data.password, user.passwordHash))) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
  await audit(req, { entity: "User", entityId: user.id, action: "DISABLE_MFA" });
  res.json({ ok: true, mfaEnabled: false });
});

authRouter.post("/logout", auth, async (req, res) => {
  await destroySession(req.user?.sid, req.user?.id);
  res.json({ ok: true });
});

authRouter.get("/me", auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: ME_SELECT,
  });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json(publicUser(user));
});

authRouter.patch("/me", auth, async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().max(32).optional().nullable(),
    department: z.enum(["Sales", "Warehouse", "Finance", "Administration", "Procurement", "Operations"]).optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Name, phone or department is invalid" });
  const existing = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...(body.data.name != null ? { name: body.data.name } : {}),
      ...(body.data.phone !== undefined ? { phone: body.data.phone || null } : {}),
      ...(body.data.department != null ? { department: body.data.department } : {}),
    },
    select: ME_SELECT,
  });
  await audit(req, { entity: "User", entityId: user.id, action: "UPDATE_PROFILE", oldValue: { name: existing.name, phone: existing.phone, department: existing.department }, newValue: { name: user.name, phone: user.phone, department: user.department } });
  res.json(publicUser(user));
});

authRouter.post("/password", auth, async (req, res) => {
  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(80),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "New password must be at least 8 characters" });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "Not found" });
  if (!(await checkPassword(body.data.currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.data.newPassword) },
  });
  await destroyUserSessions(user.id);
  await audit(req, { entity: "User", entityId: user.id, action: "CHANGE_PASSWORD" });
  res.json({ ok: true, signedOut: true });
});

authRouter.post("/avatar", auth, async (req, res) => {
  const data = String(req.body.data || "");
  const name = String(req.body.name || "avatar.jpg");
  if (!data.startsWith("data:image/")) return res.status(400).json({ error: "Image file required" });
  const raw = data.split(",")[1];
  if (!raw) return res.status(400).json({ error: "Image file required" });
  const buf = Buffer.from(raw, "base64");
  if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ error: "Photo must be under 3 MB" });
  const ext = name.toLowerCase().endsWith(".png") || data.startsWith("data:image/png") ? "png" : "jpg";
  const dir = join(process.cwd(), "uploads", "avatars");
  await mkdir(dir, { recursive: true });
  const file = `${req.user!.id}-${Date.now()}.${ext}`;
  await writeFile(join(dir, file), buf);
  const avatarUrl = `/uploads/avatars/${file}`;
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { avatarUrl },
    select: ME_SELECT,
  });
  await audit(req, { entity: "User", entityId: user.id, action: "UPDATE_AVATAR" });
  res.json(publicUser(user));
});
