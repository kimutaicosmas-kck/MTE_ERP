import { Router } from "express";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { checkPassword, hashPassword, signToken } from "../lib/auth.js";
import { createSession, destroySession, destroyUserSessions } from "../lib/redis.js";
import { auth } from "../middleware/auth.js";
import { limit } from "../middleware/rateLimit.js";
import { publicUser } from "../lib/access.js";
import { audit } from "../lib/audit.js";

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
} as const;

authRouter.post("/login", limit("login"), async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Email and password required" });
  const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
  if (!user || !user.active || !(await checkPassword(body.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const tokenUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  const sid = await createSession(tokenUser);
  res.json({ token: signToken({ ...tokenUser, sid }), user: publicUser(user) });
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
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Name or phone is invalid" });
  const existing = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...(body.data.name != null ? { name: body.data.name } : {}),
      ...(body.data.phone !== undefined ? { phone: body.data.phone || null } : {}),
    },
    select: ME_SELECT,
  });
  await audit(req, { entity: "User", entityId: user.id, action: "UPDATE_PROFILE", oldValue: { name: existing.name, phone: existing.phone }, newValue: { name: user.name, phone: user.phone } });
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
