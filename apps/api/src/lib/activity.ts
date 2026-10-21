import type { Request } from "express";
import { audit } from "./audit.js";
import { notifyModule, notifyRoles, notifyUsers } from "./push.js";

type NoticePayload = { title: string; body: string; url?: string };

/** Business event: audit trail + optional in-app / push notification. */
export async function recordActivity(
  req: Request,
  input: {
    entity: string;
    entityId: string;
    action: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string;
    notice?: NoticePayload;
    /** Notify specific users (e.g. approval requester). */
    notifyUserIds?: string[];
    /** Notify all users with these roles. */
    notifyRoles?: string[];
    /** Notify users with module access (finance, inventory, …). */
    notifyModules?: string[];
  }
) {
  await audit(req, {
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
  });
  if (!input.notice) return;
  const payload = input.notice;
  if (input.notifyUserIds?.length) await notifyUsers(input.notifyUserIds, payload);
  if (input.notifyRoles?.length) await notifyRoles(input.notifyRoles, payload);
  if (input.notifyModules?.length) {
    for (const mod of input.notifyModules) await notifyModule(mod, payload);
  }
}
