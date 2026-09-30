import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Mte@2026", 10);

  const [superAdmin, admin, sales, sales2, warehouse, finance] = await Promise.all([
    prisma.user.create({
      data: { name: "Cosmas Kimutai", email: "superadmin@mte.local", passwordHash, role: "SUPER_ADMIN", monthlyTarget: 800000, commissionRate: 0.02 },
    }),
    prisma.user.create({
      data: { name: "Grace Wanjiku", email: "admin@mte.local", passwordHash, role: "ADMIN", monthlyTarget: 500000, commissionRate: 0.02 },
    }),
    prisma.user.create({
      data: { name: "John Mwangi", email: "sales@mte.local", passwordHash, role: "SALES", phone: "+254723909380", monthlyTarget: 350000, commissionRate: 0.04 },
    }),
    prisma.user.create({
      data: { name: "Amina Yusuf", email: "sales2@mte.local", passwordHash, role: "SALES", monthlyTarget: 280000, commissionRate: 0.035 },
    }),
    prisma.user.create({
      data: { name: "Daniel Otieno", email: "warehouse@mte.local", passwordHash, role: "WAREHOUSE" },
    }),
    prisma.user.create({
      data: { name: "Faith Njeri", email: "finance@mte.local", passwordHash, role: "FINANCE" },
    }),
  ]);

  const accounts = [
    ["1000", "Cash on hand", "ASSET"],
    ["1010", "M-Pesa", "ASSET"],
    ["1020", "Bank - KCB", "ASSET"],
    ["1100", "Accounts receivable", "ASSET"],
    ["1200", "Inventory", "ASSET"],
    ["2000", "Accounts payable", "LIABILITY"],
    ["2100", "VAT output", "LIABILITY"],
    ["2110", "VAT input", "ASSET"],
    ["3000", "Capital", "EQUITY"],
    ["4000", "Sales revenue", "INCOME"],
    ["5000", "Cost of goods sold", "COGS"],
    ["6000", "Operating expenses", "EXPENSE"],
  ] as const;
  for (const [code, name, type] of accounts) {
    await prisma.account.create({ data: { code, name, type } });
  }

  await prisma.journal.create({
    data: {
      memo: "Opening balances",
      source: "OPENING",
      userId: finance.id,
      lines: {
        create: [
          { account: { connect: { code: "1000" } }, debit: 180000, credit: 0 },
          { account: { connect: { code: "1010" } }, debit: 92000, credit: 0 },
          { account: { connect: { code: "1020" } }, debit: 640000, credit: 0 },
          { account: { connect: { code: "1200" } }, debit: 2100000, credit: 0 },
          { account: { connect: { code: "3000" } }, debit: 0, credit: 3012000 },
        ],
      },
    },
  });

  const [cust1, cust2, cust3] = await Promise.all([
    prisma.customer.create({ data: { name: "Rift Valley Hauliers", phone: "+254722111222", kraPin: "P051234567A", creditLimit: 250000, paymentTerms: "Net 14" } }),
    prisma.customer.create({ data: { name: "Nairobi Quarries Ltd", phone: "+254733445566", kraPin: "P052223334B", creditLimit: 500000, paymentTerms: "Net 30" } }),
    prisma.customer.create({ data: { name: "Walk-in / Shop", phone: "+254700000000", paymentTerms: "COD", creditLimit: 0 } }),
  ]);

  const [v1, v2] = await Promise.all([
    prisma.vendor.create({ data: { name: "CAT Genuine Parts EA", phone: "+254711000111", leadDays: 10, oem: true } }),
    prisma.vendor.create({ data: { name: "Aftermarket Hydraulics KE", phone: "+254722000333", leadDays: 4, oem: false } }),
  ]);

  const partSeed = [
    { sku: "HYD-9T7774", oemNumber: "9T7774", name: "Hydraulic pump barrel", category: "Hydraulics", binLocation: "A-12-03", cost: 18500, salePrice: 27400, qtyOnHand: 6, reorderLevel: 2, critical: true, compat: [{ machineBrand: "CAT", machineModel: "320D" }] },
    { sku: "HYD-9J8660", oemNumber: "9J8660", name: "Hydraulic pump barrel", category: "Hydraulics", binLocation: "A-12-04", cost: 17200, salePrice: 25900, qtyOnHand: 3, reorderLevel: 2, critical: true, compat: [{ machineBrand: "CAT", machineModel: "330D" }] },
    { sku: "HYD-9T7765", oemNumber: "9T7765", name: "Hydraulic pump piston", category: "Hydraulics", binLocation: "A-14-01", cost: 4200, salePrice: 6900, qtyOnHand: 18, reorderLevel: 6, critical: false, compat: [{ machineBrand: "CAT", machineModel: "320D" }, { machineBrand: "Komatsu", machineModel: "PC200" }] },
    { sku: "VLV-9T7775", oemNumber: "9T7775", name: "Valve plate", category: "Hydraulics", binLocation: "A-14-08", cost: 6100, salePrice: 9800, qtyOnHand: 1, reorderLevel: 3, critical: true, compat: [{ machineBrand: "CAT", machineModel: "320D" }] },
    { sku: "GSK-4M2969", oemNumber: "4M2969", name: "Oil pan gasket", category: "Engine", binLocation: "B-02-11", cost: 850, salePrice: 1600, qtyOnHand: 40, reorderLevel: 10, critical: false, compat: [{ machineBrand: "CAT", machineModel: "C7" }] },
    { sku: "FLT-1R1808", oemNumber: "1R1808", name: "Fuel filter", category: "Filters", binLocation: "C-01-02", cost: 1100, salePrice: 1950, qtyOnHand: 2, reorderLevel: 8, critical: true, compat: [{ machineBrand: "CAT", machineModel: "330D" }] },
    { sku: "TRK-KOM-201", oemNumber: "20Y-30-31210", name: "Track shoe assembly", category: "Undercarriage", binLocation: "D-08-01", cost: 24000, salePrice: 36500, qtyOnHand: 8, reorderLevel: 2, critical: false, compat: [{ machineBrand: "Komatsu", machineModel: "PC200-8" }] },
    { sku: "BKT-JCB-88", oemNumber: "332/C4388", name: "Bucket tooth", category: "Attachments", binLocation: "E-03-06", cost: 2100, salePrice: 3600, qtyOnHand: 0, reorderLevel: 12, critical: true, compat: [{ machineBrand: "JCB", machineModel: "3CX" }] },
    { sku: "BRG-HIT-55", oemNumber: "4460602", name: "Swing bearing", category: "Slew", binLocation: "F-01-01", cost: 78000, salePrice: 112000, qtyOnHand: 1, reorderLevel: 1, critical: true, compat: [{ machineBrand: "Hitachi", machineModel: "ZX210" }] },
    { sku: "HOSE-12-2M", oemNumber: "GENERIC-H12", name: "Hydraulic hose 12mm x 2m", category: "Hydraulics", binLocation: "A-20-09", cost: 900, salePrice: 1750, qtyOnHand: 25, reorderLevel: 8, critical: false, compat: [{ machineBrand: "CAT", machineModel: "All" }, { machineBrand: "JCB", machineModel: "All" }] },
  ];

  const parts = [];
  for (const p of partSeed) {
    parts.push(
      await prisma.part.create({
        data: {
          sku: p.sku,
          oemNumber: p.oemNumber,
          name: p.name,
          category: p.category,
          binLocation: p.binLocation,
          cost: p.cost,
          salePrice: p.salePrice,
          qtyOnHand: p.qtyOnHand,
          reorderLevel: p.reorderLevel,
          critical: p.critical,
          compat: { create: p.compat },
          movements: {
            create: { type: "RECEIPT", qty: p.qtyOnHand, reason: "Opening stock", userId: warehouse.id },
          },
        },
      })
    );
  }

  const o1 = await prisma.order.create({
    data: {
      number: "ORD-00001",
      channel: "FIELD",
      status: "CONFIRMED",
      customerId: cust1.id,
      salespersonId: sales.id,
      dispatchMethod: "COURIER",
      tracking: "G4S-88421",
      notes: "Need on site tomorrow morning",
      lines: {
        create: [
          { partId: parts[0].id, vendorId: v1.id, qty: 1, salePrice: parts[0].salePrice, cost: parts[0].cost },
          { partId: parts[2].id, vendorId: v2.id, qty: 4, salePrice: parts[2].salePrice, cost: parts[2].cost },
        ],
      },
      payments: { create: { method: "MPESA", amount: 20000, reference: "RKT7H9X2Q1", userId: sales.id } },
    },
    include: { lines: true },
  });

  const o2 = await prisma.order.create({
    data: {
      number: "ORD-00002",
      channel: "SHOP",
      status: "PAID",
      customerId: cust3.id,
      salespersonId: sales2.id,
      dispatchMethod: "SHOP_COLLECT",
      lines: {
        create: [{ partId: parts[4].id, qty: 6, salePrice: parts[4].salePrice, cost: parts[4].cost }],
      },
      payments: { create: { method: "CASH", amount: 11136, userId: sales2.id } },
    },
    include: { lines: true },
  });

  await prisma.order.create({
    data: {
      number: "ORD-00003",
      channel: "PHONE",
      status: "PICKING",
      customerId: cust2.id,
      salespersonId: sales.id,
      dispatchMethod: "COURIER",
      lines: {
        create: [{ partId: parts[6].id, vendorId: v1.id, qty: 2, salePrice: parts[6].salePrice, cost: parts[6].cost }],
      },
    },
  });

  const { postSale, postPayment } = await import("../src/lib/ledger.js");
  await postSale({ id: o1.id, number: o1.number, vatRate: 0.16, lines: o1.lines }, sales.id);
  await postPayment({ orderId: o1.id, number: o1.number, method: "MPESA", amount: 20000, userId: sales.id });
  await postSale({ id: o2.id, number: o2.number, vatRate: 0.16, lines: o2.lines }, sales2.id);
  await postPayment({ orderId: o2.id, number: o2.number, method: "CASH", amount: 11136, userId: sales2.id });

  await prisma.expense.create({
    data: { category: "Courier", amount: 4500, vat: 720, date: new Date(), notes: "G4S weekly", userId: finance.id },
  });
  const { postExpense } = await import("../src/lib/ledger.js");
  const exp = await prisma.expense.findFirst({ where: { category: "Courier" } });
  if (exp) await postExpense(exp, finance.id);

  await prisma.approval.create({
    data: {
      type: "EDIT_PRICE",
      entity: "Order",
      entityId: o1.id,
      oldValue: JSON.stringify({ salePrice: 27400 }),
      newValue: JSON.stringify({ salePrice: 24000 }),
      reason: "Bulk discount for Rift Valley Hauliers",
      requesterId: sales.id,
    },
  });
  await prisma.approval.create({
    data: {
      type: "ADJUST_STOCK",
      entity: "Part",
      entityId: parts[3].id,
      oldValue: JSON.stringify({ qtyOnHand: 1 }),
      newValue: JSON.stringify({ qty: -1, type: "ADJUSTMENT", reason: "Damaged in bin A-14-08" }),
      reason: "Damaged in bin A-14-08",
      requesterId: warehouse.id,
    },
  });

  await prisma.auditLog.createMany({
    data: [
      { userId: sales.id, entity: "Order", entityId: o1.id, action: "CREATE", newValue: JSON.stringify({ number: "ORD-00001" }), ip: "127.0.0.1" },
      { userId: sales.id, entity: "Order", entityId: o1.id, action: "STATUS", oldValue: JSON.stringify({ status: "DRAFT" }), newValue: JSON.stringify({ status: "CONFIRMED" }), ip: "127.0.0.1" },
      { userId: warehouse.id, entity: "Part", entityId: parts[3].id, action: "REQUEST", reason: "Damaged in bin A-14-08", ip: "127.0.0.1" },
    ],
  });

  await prisma.bankAccount.createMany({
    data: [
      { code: "KCB", name: "KCB current" },
      { code: "MPESA", name: "M-Pesa till" },
    ],
  });

  console.log("Seeded MTE ERP. Super Admin: Cosmas Kimutai. Demo password for all users: Mte@2026");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
