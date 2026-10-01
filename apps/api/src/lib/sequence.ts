import { prisma } from "./prisma.js";

export async function nextSequence(key: string) {
  const existing = await prisma.sequence.findUnique({ where: { id: key } });
  if (!existing) {
    await prisma.sequence.create({ data: { id: key, next: 2 } });
    return 1;
  }
  await prisma.sequence.update({ where: { id: key }, data: { next: existing.next + 1 } });
  return existing.next;
}

export function formatSaleNumber(raw: string, createdAt?: Date | string) {
  if (!raw) return raw;
  if (raw.startsWith("SO-")) return raw;
  const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  const m = raw.match(/^ORD-(\d+)$/);
  if (m) return `SO-${year}-${m[1].padStart(5, "0")}`;
  return raw;
}

export async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const key = `order-${year}`;
  const existing = await prisma.sequence.findUnique({ where: { id: key } });
  if (!existing) {
    const rows = await prisma.order.findMany({ select: { number: true } });
    let max = 0;
    for (const row of rows) {
      const m = row.number.match(/(?:SO-\d{4}-|ORD-)(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const next = max + 1;
    await prisma.sequence.create({ data: { id: key, next: next + 1 } });
    return `SO-${year}-${String(next).padStart(5, "0")}`;
  }
  await prisma.sequence.update({ where: { id: key }, data: { next: existing.next + 1 } });
  return `SO-${year}-${String(existing.next).padStart(5, "0")}`;
}

export async function nextInvoiceNumber(prefix = "") {
  const year = new Date().getFullYear();
  const n = await nextSequence(`invoice-${year}`);
  const p = prefix?.trim() ? (prefix.endsWith("-") ? prefix : `${prefix}-`) : "INV-";
  return `${p}${year}-${String(n).padStart(5, "0")}`;
}

export async function nextBillNumber() {
  const year = new Date().getFullYear();
  const n = await nextSequence(`bill-${year}`);
  return `BILL-${year}-${String(n).padStart(5, "0")}`;
}

export async function nextReturnNumber() {
  const n = await nextSequence("return");
  return `RTN-${String(n).padStart(5, "0")}`;
}

export async function nextPayrollNumber(year: number, month: number) {
  return `PR-${year}-${String(month).padStart(2, "0")}`;
}

export async function ensureCompany() {
  const [setting, branch] = await Promise.all([
    prisma.setting.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        companyName: "MTE ERP",
        legalName: "MTE Earth Moving Parts",
        address: "Nairobi, Kenya",
        currency: "KES",
        vatRate: 0.16,
        invoicePrefix: "INV-",
      },
    }),
    prisma.branch.upsert({
      where: { code: "HQ" },
      update: {},
      create: { code: "HQ", name: "Nairobi HQ", address: "Nairobi, Kenya" },
    }),
  ]);
  if (!setting.defaultBranchId) {
    await prisma.setting.update({ where: { id: "default" }, data: { defaultBranchId: branch.id } });
  }
  const extra = [
    ["6100", "Salaries", "EXPENSE"],
    ["2200", "PAYE payable", "LIABILITY"],
    ["2210", "Statutory payable", "LIABILITY"],
  ] as const;
  for (const [code, name, type] of extra) {
    await prisma.account.upsert({ where: { code }, update: {}, create: { code, name, type } });
  }
  return { setting, branch };
}
