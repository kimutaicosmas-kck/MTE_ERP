import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const n = await prisma.user.count();

const { ensureCompany } = await import("../src/lib/sequence.js");
await ensureCompany();

const DEPT: Record<string, string> = {
  SUPER_ADMIN: "Administration",
  ADMIN: "Administration",
  SALES: "Sales",
  WAREHOUSE: "Warehouse",
  FINANCE: "Finance",
};
for (const [role, department] of Object.entries(DEPT)) {
  await prisma.user.updateMany({ where: { role, department: "Operations" }, data: { department } });
}
if ((await prisma.notice.count()) === 0) {
  const users = await prisma.user.findMany({ select: { id: true } });
  if (users.length) {
    await prisma.notice.createMany({
      data: users.map((u) => ({
        userId: u.id,
        title: "Module access is live",
        body: "You only see and use modules granted to you. Super Admin can change this on Staff.",
        url: "/",
      })),
    });
  }
}

if (n > 0) {
  const pos = await prisma.purchaseOrder.count();
  if (pos === 0) {
    const vendor = await prisma.vendor.findFirst();
    const admin = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
    const filter = await prisma.part.findFirst({ where: { sku: "FLT-1R1808" } });
    const tooth = await prisma.part.findFirst({ where: { sku: "BKT-JCB-88" } });
    if (vendor && admin && filter && tooth) {
      await prisma.purchaseOrder.create({
        data: {
          number: "PO-00001",
          vendorId: vendor.id,
          status: "ORDERED",
          reference: "SHA-26-041",
          notes: "Import container — receive against this PO.",
          expectedAt: new Date(Date.now() + 12 * 86400000),
          createdById: admin.id,
          lines: {
            create: [
              { partId: filter.id, qtyOrdered: 40, unitCost: filter.cost },
              { partId: tooth.id, qtyOrdered: 24, unitCost: tooth.cost },
            ],
          },
        },
      });
      console.log("Seeded opening purchase orders");
    }
  }
  await prisma.$disconnect();
  console.log(`Database already has ${n} users`);
  process.exit(0);
}

await prisma.$disconnect();
await import("./seed.ts");
