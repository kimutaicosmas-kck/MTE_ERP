import type { Request, Response } from "express";
import { prisma } from "./prisma.js";
import { audit } from "./audit.js";
import { emit } from "./webhooks.js";
import { canBypassApproval } from "./auth.js";

export async function queueApproval(
  req: Request,
  res: Response,
  data: {
    type: string;
    entity: string;
    entityId: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason: string;
  }
) {
  if (canBypassApproval(req.user!.role)) return false;
  const approval = await prisma.approval.create({
    data: {
      type: data.type,
      entity: data.entity,
      entityId: data.entityId,
      oldValue: JSON.stringify(data.oldValue ?? {}),
      newValue: JSON.stringify(data.newValue ?? {}),
      reason: data.reason,
      requesterId: req.user!.id,
    },
  });
  await audit(req, { entity: "Approval", entityId: approval.id, action: "REQUEST", newValue: { type: approval.type, entity: approval.entity }, reason: data.reason });
  await emit("approval.requested", { id: approval.id, type: approval.type, entity: approval.entity, reason: data.reason }).catch(() => undefined);
  res.status(202).json({
    pending: true,
    approval,
    message: "Sent to Super Admin for approval. Nothing has changed yet.",
  });
  return true;
}
