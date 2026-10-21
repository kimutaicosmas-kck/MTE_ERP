import { prisma } from "./prisma.js";
import { computeVatTotals, sumSaleLines } from "./vat-totals.js";

export type DashboardAlert = {
  id: string;
  level: "info" | "warn" | "danger";
  label: string;
  to: string;
};

export async function fetchDashboardAlerts(): Promise<DashboardAlert[]> {
  const [invoices, parts, orders, inbound, mpesaPending, mpesaUnalloc] = await Promise.all([
    prisma.invoice.findMany({
      include: { order: { include: { lines: true, payments: true } } },
    }),
    prisma.part.findMany({ select: { qtyOnHand: true, reorderLevel: true, critical: true } }),
    prisma.order.findMany({ select: { status: true } }),
    prisma.purchaseOrder.count({ where: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } }),
    prisma.mpesaTxn.count({ where: { kind: "STK", status: "PENDING" } }),
    prisma.mpesaTxn.count({ where: { status: "SUCCESS", paymentId: null } }),
  ]);

  const lowParts = parts.filter((p) => p.qtyOnHand <= p.reorderLevel);
  const criticalLow = lowParts.filter((p) => p.critical);
  const dispatch = orders.filter((o) => ["PICKED", "PACKING", "PICKING", "CONFIRMED", "DISPATCHED", "IN_TRANSIT"].includes(o.status)).length;

  const overdueInvoices = invoices.filter((inv) => {
    const { gross } = computeVatTotals(sumSaleLines(inv.order.lines), inv.vatRate);
    const paid = inv.order.payments.reduce((s, p) => s + p.amount, 0);
    const balance = gross - paid;
    if (balance <= 0.01) return false;
    const due = inv.dueAt || new Date(inv.issuedAt.getTime() + 30 * 86400000);
    return due.getTime() < Date.now();
  });
  const overdueAmount = overdueInvoices.reduce((s, inv) => {
    const { gross } = computeVatTotals(sumSaleLines(inv.order.lines), inv.vatRate);
    const paid = inv.order.payments.reduce((n, p) => n + p.amount, 0);
    return s + Math.max(0, gross - paid);
  }, 0);

  return [
    ...(overdueInvoices.length
      ? [{
          id: "overdue",
          level: "warn" as const,
          label: `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"} · ${Math.round(overdueAmount).toLocaleString()} KES`,
          to: "/finance?tab=collections",
        }]
      : []),
    ...(criticalLow.length
      ? [{
          id: "crit",
          level: "danger" as const,
          label: `${criticalLow.length} critical part${criticalLow.length === 1 ? "" : "s"} low on stock`,
          to: "/reports?tab=reorder",
        }]
      : []),
    ...(lowParts.length && !criticalLow.length
      ? [{
          id: "low",
          level: "warn" as const,
          label: `${lowParts.length} products below reorder level`,
          to: "/reports?tab=reorder",
        }]
      : []),
    ...(dispatch
      ? [{
          id: "dispatch",
          level: "info" as const,
          label: `${dispatch} order${dispatch === 1 ? "" : "s"} ready to pick or ship`,
          to: "/dispatch",
        }]
      : []),
    ...(mpesaUnalloc
      ? [{
          id: "mpesa-u",
          level: "warn" as const,
          label: `${mpesaUnalloc} M-Pesa payment${mpesaUnalloc === 1 ? "" : "s"} not allocated`,
          to: "/finance?tab=mpesa&view=reconcile",
        }]
      : []),
    ...(mpesaPending
      ? [{
          id: "mpesa-p",
          level: "info" as const,
          label: `${mpesaPending} STK prompt${mpesaPending === 1 ? "" : "s"} awaiting customer PIN`,
          to: "/finance?tab=mpesa&view=reconcile",
        }]
      : []),
    ...(inbound
      ? [{
          id: "po",
          level: "info" as const,
          label: `${inbound} purchase order${inbound === 1 ? "" : "s"} awaiting receipt`,
          to: "/procurement",
        }]
      : []),
  ].slice(0, 6);
}
