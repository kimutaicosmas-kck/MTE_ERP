import { prisma } from "./prisma.js";
import { recordActivity } from "./activity.js";
import { refreshInvoiceStatus } from "./invoice.js";
import { postPayment } from "./ledger.js";
import { orderMoneyTotals } from "./vat-totals.js";

function moneyLabel(n: number) {
  return `KES ${Math.round(n).toLocaleString("en-KE")}`;
}

export async function applyInvoicePayment(input: {
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string | null;
  userId: string;
  paidAt?: Date;
  req?: Parameters<typeof recordActivity>[0];
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    include: { order: { include: { lines: true, payments: true } } },
  });
  if (!invoice) throw Object.assign(new Error("Invoice not found"), { status: 404 });
  const balance = orderMoneyTotals(invoice.order).balance;
  if (balance <= 0.01) throw Object.assign(new Error(`Invoice ${invoice.number} is already paid`), { status: 400 });
  const amount = Math.round(input.amount * 100) / 100;
  if (!amount || amount <= 0) throw Object.assign(new Error("Amount required"), { status: 400 });
  if (amount > balance + 0.02) {
    throw Object.assign(new Error(`Amount exceeds balance on ${invoice.number}`), { status: 400 });
  }
  const method = String(input.method || "CASH");
  const reference = input.reference ? String(input.reference).trim() : null;
  if (method === "MPESA" && !reference) {
    throw Object.assign(new Error("M-Pesa reference required"), { status: 400 });
  }
  const paidAt = input.paidAt && !Number.isNaN(+input.paidAt) ? input.paidAt : new Date();

  const pay = await prisma.payment.create({
    data: {
      orderId: invoice.orderId,
      method,
      amount,
      reference,
      userId: input.userId,
      createdAt: paidAt,
    },
  });
  await postPayment({
    orderId: invoice.orderId,
    number: invoice.number,
    method,
    amount,
    userId: input.userId,
    date: paidAt,
    paymentId: pay.id,
  });
  const updated = await refreshInvoiceStatus(invoice.orderId);

  if (input.req) {
    await recordActivity(input.req, {
      entity: "Payment",
      entityId: pay.id,
      action: "CREATE",
      newValue: { invoice: invoice.number, amount, method },
      notice: {
        title: "Payment received",
        body: `${moneyLabel(amount)} on invoice ${invoice.number} (${method}).`,
        url: "/finance?section=ar",
      },
      notifyModules: ["finance", "sales"],
    });
  }

  return { payment: pay, invoice: updated };
}