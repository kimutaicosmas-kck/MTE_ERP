import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { postStockReceipt, reverseJournal } from "../lib/ledger.js";
import { emit } from "../lib/webhooks.js";

export const approvalsRouter = Router();

approvalsRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json(
    await prisma.approval.findMany({
      where: status ? { status } : undefined,
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
  await audit(req, {
    entity: "Approval",
    entityId: approval.id,
    action: accept ? "APPROVE" : "REJECT",
    oldValue: approval,
    newValue: updated,
    reason: approval.reason,
  });
  await emit("approval.decided", { id: updated.id, type: approval.type, decision: updated.status });
  res.json(updated);
});

async function applyApproval(approval: {
  type: string;
  entity: string;
  entityId: string;
  newValue: string;
}, userId: string) {
  const next = JSON.parse(approval.newValue);
  if (approval.type === "ADJUST_STOCK") {
    const part = await prisma.part.findUnique({ where: { id: approval.entityId } });
    if (!part) return;
    const qty = Number(next.qty);
    const type = String(next.type || "ADJUSTMENT");
    await prisma.part.update({
      where: { id: part.id },
      data: { qtyOnHand: part.qtyOnHand + qty },
    });
    await prisma.stockMovement.create({
      data: { partId: part.id, type, qty, reason: next.reason, userId },
    });
    if (type === "RECEIPT") {
      await postStockReceipt({ partId: part.id, sku: part.sku, qty, cost: part.cost, userId });
    }
  }
  if (approval.type === "DELETE_PART") {
    await prisma.part.delete({ where: { id: approval.entityId } }).catch(() => null);
  }
  if (approval.type === "CANCEL_ORDER") {
    const order = await prisma.order.findUnique({
      where: { id: approval.entityId },
      include: { lines: true },
    });
    if (!order) return;
    for (const line of order.lines) {
      await prisma.part.update({
        where: { id: line.partId },
        data: { qtyOnHand: { increment: line.qty } },
      });
    }
    const journals = await prisma.journal.findMany({
      where: { source: "SALE", sourceId: order.id, reversed: false },
    });
    for (const j of journals) await reverseJournal(j.id, userId);
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  }
  if (approval.type === "CREDIT_OVERRIDE") {
    await prisma.customer.update({
      where: { id: approval.entityId },
      data: { creditLimit: Number(next.creditLimit) },
    });
  }
  if (approval.type === "EDIT_PRICE") {
    await prisma.orderLine.update({
      where: { id: approval.entityId },
      data: { salePrice: Number(next.salePrice) },
    });
  }
}
