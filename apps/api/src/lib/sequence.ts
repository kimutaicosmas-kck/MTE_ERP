import { prisma } from "./prisma.js";
import { ensureDefaultWarehouse } from "./warehouse.js";

export async function nextSequence(key: string, minNext = 1) {
  const existing = await prisma.sequence.findUnique({ where: { id: key } });
  const next = Math.max(existing?.next ?? 1, minNext);
  if (!existing) {
    await prisma.sequence.create({ data: { id: key, next: next + 1 } });
  } else {
    await prisma.sequence.update({ where: { id: key }, data: { next: next + 1 } });
  }
  return next;
}

function maxSuffix(numbers: string[], pattern: RegExp) {
  let max = 0;
  for (const value of numbers) {
    const m = value.match(pattern);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
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
  const rows = await prisma.order.findMany({ select: { number: true } });
  const n = await nextSequence(`order-${year}`, maxSuffix(rows.map((r) => r.number), /(?:SO-\d{4}-|ORD-)(\d+)$/) + 1);
  return `SO-${year}-${String(n).padStart(5, "0")}`;
}

export async function nextInvoiceNumber(prefix = "") {
  const year = new Date().getFullYear();
  const rows = await prisma.invoice.findMany({ select: { number: true } });
  const n = await nextSequence(`invoice-${year}`, maxSuffix(rows.map((r) => r.number), /(\d+)$/) + 1);
  const p = prefix?.trim() ? (prefix.endsWith("-") ? prefix : `${prefix}-`) : "INV-";
  return `${p}${year}-${String(n).padStart(5, "0")}`;
}

export async function withUniqueNumber<T>(make: () => Promise<T>) {
  let last: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      return await make();
    } catch (err) {
      last = err;
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw last instanceof Error ? last : new Error("Could not allocate a document number");
}

export async function nextBillNumber() {
  const year = new Date().getFullYear();
  const rows = await prisma.vendorBill.findMany({ select: { number: true } });
  const n = await nextSequence(`bill-${year}`, maxSuffix(rows.map((r) => r.number), /(\d+)$/) + 1);
  return `BILL-${year}-${String(n).padStart(5, "0")}`;
}

export async function nextGrnNumber() {
  const rows = await prisma.goodsReceipt.findMany({ select: { number: true } });
  const n = await nextSequence("grn", maxSuffix(rows.map((r) => r.number), /GRN-(\d+)$/) + 1);
  return `GRN-${String(n).padStart(5, "0")}`;
}

export async function nextPoNumber() {
  const rows = await prisma.purchaseOrder.findMany({ select: { number: true } });
  const n = await nextSequence("po", maxSuffix(rows.map((r) => r.number), /PO-(\d+)$/) + 1);
  return `PO-${String(n).padStart(5, "0")}`;
}

export async function nextCustomerNumber() {
  const rows = await prisma.customer.findMany({ select: { customerNumber: true } });
  const n = await nextSequence("customer", maxSuffix(rows.map((r) => r.customerNumber || ""), /CUST-(\d+)$/) + 1);
  return `CUST-${String(n).padStart(5, "0")}`;
}

/** Assign CUST-xxxxx to any legacy customers missing a number. */
export async function ensureCustomerNumbers() {
  const missing = await prisma.customer.findMany({ where: { customerNumber: null }, select: { id: true }, take: 200 });
  for (const row of missing) {
    const customerNumber = await nextCustomerNumber();
    await prisma.customer.update({ where: { id: row.id }, data: { customerNumber } });
  }
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
  await ensureDefaultWarehouse();
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
