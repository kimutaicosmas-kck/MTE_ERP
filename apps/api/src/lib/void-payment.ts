import { prisma } from "./prisma.js";
import { cashAccountForMethod, postJournal, reverseJournal } from "./ledger.js";
import { refreshInvoiceStatus } from "./invoice.js";

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

/** Reverse the cash receipt and drop the payment so the invoice balance is restored. */
export async function voidCustomerPayment(paymentId: string, userId?: string) {
  const pay = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!pay) return null;
  if (pay.method === "CREDIT_NOTE") {
    throw httpError("Void the sales return instead of this credit note", 400);
  }

  const order = await prisma.order.findUnique({
    where: { id: pay.orderId },
    include: { invoice: true },
  });
  const label = order?.invoice?.number || order?.number || pay.id;
  const exact = await prisma.journal.findFirst({
    where: { source: "PAYMENT", sourceId: pay.id, reversed: false },
  });

  if (exact) {
    await reverseJournal(exact.id, userId);
  } else {
    const cashCode = cashAccountForMethod(pay.method);
    const candidates = await prisma.journal.findMany({
      where: { source: "PAYMENT", sourceId: pay.orderId, reversed: false },
      include: { lines: { include: { account: true } } },
      orderBy: { createdAt: "asc" },
    });
    const match = candidates.find((j) =>
      j.lines.some(
        (l) => l.account.code === cashCode && Math.abs(l.debit - pay.amount) < 0.02 && l.credit < 0.02
      )
    );
    if (match) {
      await reverseJournal(match.id, userId);
    } else {
      await postJournal({
        memo: `Void payment ${label}`,
        source: "REVERSAL",
        sourceId: pay.id,
        userId,
        lines: [
          { code: "1100", debit: pay.amount },
          { code: cashCode, credit: pay.amount },
        ],
      });
    }
  }

  await prisma.bankStatementLine.updateMany({
    where: { paymentId: pay.id },
    data: { matched: false, paymentId: null },
  });
  await prisma.payment.delete({ where: { id: pay.id } });
  await refreshInvoiceStatus(pay.orderId);
  return pay;
}
