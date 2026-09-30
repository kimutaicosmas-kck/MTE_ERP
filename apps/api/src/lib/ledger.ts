import { prisma } from "./prisma.js";

async function accountId(code: string) {
  const a = await prisma.account.findUnique({ where: { code } });
  if (!a) throw new Error(`Missing account ${code}`);
  return a.id;
}

export async function postJournal(input: {
  memo: string;
  source: string;
  sourceId?: string;
  userId?: string;
  lines: { code: string; debit?: number; credit?: number }[];
}) {
  const debit = input.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = input.lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(debit - credit) > 0.05) {
    throw new Error(`Unbalanced journal: ${debit} vs ${credit}`);
  }
  const now = new Date();
  const closed = await prisma.period.findUnique({
    where: { year_month: { year: now.getFullYear(), month: now.getMonth() + 1 } },
  });
  if (closed?.locked) {
    throw new Error(`Period ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")} is locked`);
  }
  const lines = await Promise.all(
    input.lines
      .filter((l) => (l.debit || 0) + (l.credit || 0) > 0)
      .map(async (l) => ({
        accountId: await accountId(l.code),
        debit: round(l.debit || 0),
        credit: round(l.credit || 0),
      }))
  );
  return prisma.journal.create({
    data: {
      memo: input.memo,
      source: input.source,
      sourceId: input.sourceId,
      userId: input.userId,
      lines: { create: lines },
    },
    include: { lines: true },
  });
}

export async function reverseJournal(journalId: string, userId?: string) {
  const j = await prisma.journal.findUnique({
    where: { id: journalId },
    include: { lines: { include: { account: true } } },
  });
  if (!j || j.reversed) return null;
  const rev = await postJournal({
    memo: `Reversal of ${j.memo}`,
    source: "REVERSAL",
    sourceId: journalId,
    userId,
    lines: j.lines.map((l) => ({
      code: l.account.code,
      debit: l.credit,
      credit: l.debit,
    })),
  });
  await prisma.journal.update({ where: { id: journalId }, data: { reversed: true } });
  return rev;
}

export async function postSale(order: {
  id: string;
  number: string;
  vatRate: number;
  lines: { qty: number; salePrice: number; cost: number }[];
}, userId?: string) {
  const net = order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
  const vat = round(net * order.vatRate);
  const cogs = order.lines.reduce((s, l) => s + l.qty * l.cost, 0);
  return postJournal({
    memo: `Sale ${order.number}`,
    source: "SALE",
    sourceId: order.id,
    userId,
    lines: [
      { code: "1100", debit: net + vat },
      { code: "4000", credit: net },
      { code: "2100", credit: vat },
      { code: "5000", debit: cogs },
      { code: "1200", credit: cogs },
    ],
  });
}

export async function postPayment(input: {
  orderId: string;
  number: string;
  method: string;
  amount: number;
  userId?: string;
}) {
  const cashCode =
    input.method === "MPESA" ? "1010" : input.method === "BANK" ? "1020" : "1000";
  return postJournal({
    memo: `Payment ${input.number} ${input.method}`,
    source: "PAYMENT",
    sourceId: input.orderId,
    userId: input.userId,
    lines: [
      { code: cashCode, debit: input.amount },
      { code: "1100", credit: input.amount },
    ],
  });
}

export async function postExpense(input: {
  id: string;
  category: string;
  amount: number;
  vat: number;
  userId?: string;
}) {
  return postJournal({
    memo: `Expense ${input.category}`,
    source: "EXPENSE",
    sourceId: input.id,
    userId: input.userId,
    lines: [
      { code: "6000", debit: input.amount },
      { code: "2110", debit: input.vat },
      { code: "1000", credit: input.amount + input.vat },
    ],
  });
}

export async function postStockReceipt(input: {
  partId: string;
  sku: string;
  qty: number;
  cost: number;
  userId?: string;
}) {
  const value = input.qty * input.cost;
  return postJournal({
    memo: `Stock in ${input.sku}`,
    source: "STOCK_IN",
    sourceId: input.partId,
    userId: input.userId,
    lines: [
      { code: "1200", debit: value },
      { code: "2000", credit: value },
    ],
  });
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
