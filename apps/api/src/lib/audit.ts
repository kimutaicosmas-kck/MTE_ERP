import type { Request } from "express";
import { prisma } from "./prisma.js";

export async function audit(
  req: Request,
  input: {
    entity: string;
    entityId: string;
    action: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }
) {
  const user = req.user;
  await prisma.auditLog.create({
    data: {
      userId: user?.id,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      oldValue: input.oldValue == null ? null : JSON.stringify(input.oldValue),
      newValue: input.newValue == null ? null : JSON.stringify(input.newValue),
      ip: req.ip,
      reason: input.reason,
    },
  });
}
