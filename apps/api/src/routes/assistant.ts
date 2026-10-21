import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assistantChat, assistantSuggestions } from "../lib/assistant.js";

export const assistantRouter = Router();

assistantRouter.get("/suggestions", async (req, res) => {
  res.json({ suggestions: await assistantSuggestions(req.user) });
});

assistantRouter.get("/history", async (req, res) => {
  const rows = await prisma.assistantTurn.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  res.json(rows);
});

assistantRouter.delete("/history", async (req, res) => {
  await prisma.assistantTurn.deleteMany({ where: { userId: req.user!.id } });
  res.json({ ok: true });
});

assistantRouter.post("/chat", async (req, res) => {
  const body = z.object({ message: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Message required." });
  const user = req.user!;
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, role: true, modules: true } });
  if (!row) return res.status(401).json({ error: "Sign in required" });
  const out = await assistantChat(row, body.data.message);
  res.json(out);
});
