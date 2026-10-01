import { prisma } from "./prisma.js";
import { postPayment } from "./ledger.js";
import { refreshInvoiceStatus } from "./invoice.js";
import { emit } from "./webhooks.js";

export async function findInvoiceByRef(ref?: string | null) {
  const raw = String(ref || "").trim();
  if (!raw) return null;
  const candidates = [raw, raw.startsWith("INV-") ? raw : `INV-${raw}`, raw.replace(/^INV-/, "")];
  const invoice = await prisma.invoice.findFirst({
    where: {
      OR: [
        { number: { in: candidates } },
        { order: { number: { in: candidates } } },
      ],
    },
    include: { order: { include: { lines: true, payments: true } }, customer: true },
  });
  if (invoice) return invoice;
  return prisma.invoice.findFirst({
    where: { OR: [{ number: { contains: raw } }, { order: { number: { contains: raw } } }] },
    include: { order: { include: { lines: true, payments: true } }, customer: true },
  });
}

export async function applyMpesaReceipt(input: {
  receipt: string;
  amount: number;
  phone?: string;
  accountRef?: string;
  invoiceId?: string | null;
  orderId?: string | null;
  txnId?: string | null;
  raw?: unknown;
}) {
  const receipt = String(input.receipt || "").trim();
  const amount = Number(input.amount || 0);
  if (!receipt || amount <= 0) return { ok: false, reason: "incomplete" as const };

  const existing = await prisma.payment.findFirst({ where: { reference: receipt } });
  if (existing) {
    if (input.txnId) {
      await prisma.mpesaTxn.update({
        where: { id: input.txnId },
        data: { status: "SUCCESS", paymentId: existing.id, receipt, rawCallback: input.raw ? JSON.stringify(input.raw) : undefined },
      });
    }
    return { ok: true, duplicate: true, payment: existing };
  }

  let invoice =
    (input.invoiceId
      ? await prisma.invoice.findUnique({
          where: { id: input.invoiceId },
          include: { order: { include: { lines: true, payments: true } }, customer: true },
        })
      : null) ||
    (input.orderId
      ? await prisma.invoice.findUnique({
          where: { orderId: input.orderId },
          include: { order: { include: { lines: true, payments: true } }, customer: true },
        })
      : null) ||
    (await findInvoiceByRef(input.accountRef));

  if (!invoice) {
    if (input.txnId) {
      await prisma.mpesaTxn.update({
        where: { id: input.txnId },
        data: {
          status: "UNMATCHED",
          receipt,
          amount,
          phone: input.phone,
          rawCallback: input.raw ? JSON.stringify(input.raw) : undefined,
        },
      });
    }
    return { ok: false, reason: "unmatched" as const };
  }

  const pay = await prisma.payment.create({
    data: {
      orderId: invoice.orderId,
      method: "MPESA",
      amount,
      reference: receipt,
    },
  });
  await postPayment({ orderId: invoice.orderId, number: invoice.number, method: "MPESA", amount });
  const updated = await refreshInvoiceStatus(invoice.orderId);
  if (input.txnId) {
    await prisma.mpesaTxn.update({
      where: { id: input.txnId },
      data: {
        status: "SUCCESS",
        receipt,
        amount,
        phone: input.phone,
        invoiceId: invoice.id,
        orderId: invoice.orderId,
        paymentId: pay.id,
        rawCallback: input.raw ? JSON.stringify(input.raw) : undefined,
      },
    });
  }
  await emit("payment.recorded", { orderId: invoice.orderId, number: invoice.number, payment: pay, automated: true, source: "daraja" });
  return { ok: true, payment: pay, invoice: updated };
}

export async function allocateUnmatched(txnId: string, invoiceId: string, userId?: string) {
  const txn = await prisma.mpesaTxn.findUnique({ where: { id: txnId } });
  if (!txn?.receipt || !txn.amount) throw new Error("This M-Pesa payment cannot be allocated yet");
  return applyMpesaReceipt({
    receipt: txn.receipt,
    amount: txn.amount,
    phone: txn.phone || undefined,
    invoiceId,
    txnId: txn.id,
    accountRef: txn.accountRef || undefined,
  });
}
