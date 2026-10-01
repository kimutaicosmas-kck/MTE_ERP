import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const noticesRouter = Router();

noticesRouter.get("/", async (req, res) => {
  const rows = await prisma.notice.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  res.json({
    unread: rows.filter((n) => !n.read).length,
    items: rows,
  });
});

noticesRouter.post("/read", async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  await prisma.notice.updateMany({
    where: { userId: req.user!.id, ...(ids.length ? { id: { in: ids } } : { read: false }) },
    data: { read: true },
  });
  res.json({ ok: true });
});
