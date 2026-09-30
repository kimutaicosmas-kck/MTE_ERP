import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { checkPassword, signToken } from "../lib/auth.js";
import { auth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Email and password required" });
  const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
  if (!user || !user.active || !(await checkPassword(body.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const tokenUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  res.json({ token: signToken(tokenUser), user: tokenUser });
});

authRouter.get("/me", auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, email: true, role: true, monthlyTarget: true, commissionRate: true },
  });
  res.json(user);
});
