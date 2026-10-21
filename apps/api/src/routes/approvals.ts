import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { recordActivity } from "../lib/activity.js";
import { roles, moduleAccess } from "../middleware/auth.js";
import { applyApproval } from "../lib/apply-approval.js";
import { emit } from "../lib/webhooks.js";

export const approvalsRouter = Router();
approvalsRouter.use(moduleAccess("approvals"));

approvalsRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const scoped = ["SALES", "WAREHOUSE"].includes(req.user!.role);
  res.json(
    await prisma.approval.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(scoped ? { requesterId: req.user!.id } : {}),
      },
      include: {
        requester: { select: { name: true, role: true } },
        reviewer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  );
});

approvalsRouter.post("/:id/decide", roles("SUPER_ADMIN"), async (req, res) => {
  const approval = await prisma.approval.findUnique({ where: { id: req.params.id } });
  if (!approval || approval.status !== "PENDING") {
    return res.status(400).json({ error: "Approval not pending" });
  }
  const accept = req.body.decision === "APPROVED";
  if (accept) await applyApproval(approval, req.user!.id);

  const updated = await prisma.approval.update({
    where: { id: approval.id },
    data: {
      status: accept ? "APPROVED" : "REJECTED",
      reviewerId: req.user!.id,
      reviewedAt: new Date(),
    },
  });
  const decisionLabel = accept ? "approved" : "rejected";
  const typeLabel = approval.type.replace(/_/g, " ");
  const mod =
    approval.type === "POST_JOURNAL" || approval.type === "DELETE_EXPENSE" || approval.type === "VOID_PAYMENT"
      ? "finance"
      : approval.type === "ADJUST_STOCK" || approval.type === "DELETE_PART"
        ? "inventory"
        : approval.type === "CANCEL_ORDER" || approval.type === "SALES_RETURN" || approval.type === "CREDIT_OVERRIDE"
          ? "sales"
          : null;
  await recordActivity(req, {
    entity: "Approval",
    entityId: approval.id,
    action: accept ? "APPROVE" : "REJECT",
    oldValue: approval,
    newValue: updated,
    reason: approval.reason,
    notice: {
      title: accept ? `Approved: ${typeLabel}` : `Rejected: ${typeLabel}`,
      body: accept
        ? `${typeLabel} was approved${mod ? " and applied to the books." : "."}`
        : `${typeLabel} was rejected.`,
      url: "/approvals",
    },
    notifyUserIds: approval.requesterId ? [approval.requesterId] : undefined,
    notifyModules: accept && mod ? [mod] : undefined,
  });
  await emit("approval.decided", { id: updated.id, type: approval.type, decision: updated.status });
  res.json(updated);
});

