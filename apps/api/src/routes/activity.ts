import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const activityRouter = Router();

/** Unified activity timeline (audit log + filters). */
activityRouter.get("/", async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
  const entity = req.query.entity ? String(req.query.entity) : undefined;
  const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(entityId ? { entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, role: true } } },
  });
  res.json(
    rows.map((a) => ({
      id: a.id,
      at: a.createdAt,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      user: a.user?.name || "System",
      userId: a.userId,
      ip: a.ip,
      reason: a.reason,
      oldValue: a.oldValue,
      newValue: a.newValue,
    }))
  );
});
