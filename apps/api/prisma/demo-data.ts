import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MARKER = "HYD-DEMO-PUMP";

function pad(n: number, w = 5) {
  return String(n).padStart(w, "0");
}
function day(year: number, month: number, date: number, hour = 10) {
  return new Date(year, month, date, hour, 15, 0);
}
function pick<T>(items: T[], i: number) {
  return items[i % items.length];
}

async function main() {
  const already = await prisma.part.findUnique({ where: { sku: MARKER } });
  if (already) {
    await finishHrDemo();
    console.log("Catalog already loaded. Filled remaining HR/demo extras.");
    return;
  }

  const users = await prisma.user.findMany();
  const superAdmin = users.find((u) => u.role === "SUPER_ADMIN") || users[0];
  const admin = users.find((u) => u.role === "ADMIN") || superAdmin;
  const sales = users.filter((u) => u.role === "SALES");
  const john = sales[0] || superAdmin;
  const amina = sales[1] || john;
  const warehouse = users.find((u) => u.role === "WAREHOUSE") || admin;
  const finance = users.find((u) => u.role === "FINANCE") || admin;
  if (!superAdmin) throw new Error("No users. Seed the app first.");

  await prisma.user.update({
    where: { id: john.id },
    data: { salary: 85000, jobTitle: "Sales executive", hireDate: day(2023, 2, 12), nationalId: "29881234" },
  });
  await prisma.user.update({
    where: { id: amina.id },
    data: { salary: 78000, jobTitle: "Field sales", hireDate: day(2024, 0, 8), nationalId: "31220991" },
  });
  await prisma.user.update({
    where: { id: warehouse.id },
    data: { salary: 62000, jobTitle: "Store keeper", hireDate: day(2022, 6, 1), nationalId: "27661002", department: "Warehouse" },
  });
  await prisma.user.update({
    where: { id: finance.id },
    data: { salary: 92000, jobTitle: "Accountant", hireDate: day(2021, 4, 20), nationalId: "25441990", department: "Finance" },
  });
  await prisma.user.update({
    where: { id: admin.id },
    data: { salary: 140000, jobTitle: "Operations manager", hireDate: day(2020, 1, 3), nationalId: "23110045" },
  });
  await prisma.user.update({
    where: { id: superAdmin.id },
    data: { salary: 220000, jobTitle: "Managing director", hireDate: day(2018, 0, 15), nationalId: "19880011" },
  });

  const extraPeople = [
    { name: "Peter Koech", email: "hr@mte.local", role: "ADMIN", department: "Administration", salary: 95000, jobTitle: "HR officer", monthlyTarget: 0 },
    { name: "Mercy Chebet", email: "sales3@mte.local", role: "SALES", department: "Sales", salary: 72000, jobTitle: "Counter sales", monthlyTarget: 220000, commissionRate: 0.03, phone: "+254711223344" },
    { name: "Brian Kiprono", email: "stores2@mte.local", role: "WAREHOUSE", department: "Warehouse", salary: 54000, jobTitle: "Picker" },
  ];
  const hash = (await prisma.user.findFirst({ where: { email: "sales@mte.local" } }))!.passwordHash;
  const createdStaff = [];
  for (const p of extraPeople) {
    createdStaff.push(await prisma.user.create({
      data: { ...p, passwordHash: hash, hireDate: day(2025, 3, 2), active: true },
    }));
  }
  const mercy = createdStaff[1];
  const staff = [...users, ...createdStaff];

  const customers = await Promise.all([
    ["Kerio Gold Mining Ltd", "+254722334455", "P051998877C", 800000, "Net 30"],
    ["Eldoret Crushers Ltd", "+254733221100", "P052110033D", 450000, "Net 14"],
    ["Turkana Road Works", "+254701445566", "P053220044E", 600000, "Net 30"],
    ["Kisumu Dredging Co", "+254710998877", "P054330055F", 350000, "Net 14"],
    ["Mombasa Port Plant Hire", "+254722667788", "P055440066G", 900000, "Net 30"],
    ["Nakuru Quarries", "+254733778899", "P056550077H", 280000, "Net 14"],
    ["Kitale Agro Earthworks", "+254700112233", "P057660088J", 150000, "COD"],
    ["Baringo Dam Contractors", "+254711334455", "P058770099K", 520000, "Net 30"],
    ["Thika Superhighways JV", "+254722445566", "P059880100L", 1200000, "Net 30"],
    ["Maasai Mara Lodge Works", "+254733556677", "P051990211M", 180000, "COD"],
    ["West Pokot County Works", "+254701223344", "P052001322N", 400000, "Net 14"],
    ["Athi River Cement Plant", "+254710556677", "P053112433P", 750000, "Net 30"],
    ["Kakamega Goldfields", "+254722889900", "P054223544Q", 310000, "Net 14"],
    ["Cash walk-in Industrial", "+254700998877", null, 0, "COD"],
    ["Sotik Tea Estate Workshop", "+254733001122", "P055334655R", 220000, "Net 14"],
  ].map(([name, phone, kraPin, creditLimit, paymentTerms]) =>
    prisma.customer.create({
      data: { name: String(name), phone: String(phone), kraPin: kraPin as string | null, creditLimit: Number(creditLimit), paymentTerms: String(paymentTerms) },
    })
  ));
  const allCustomers = [...(await prisma.customer.findMany()), ...customers];

  const vendors = await Promise.all([
    prisma.vendor.create({ data: { name: "Komatsu East Africa", phone: "+254720111222", leadDays: 14, oem: true } }),
    prisma.vendor.create({ data: { name: "Hitachi Construction KE", phone: "+254720333444", leadDays: 18, oem: true } }),
    prisma.vendor.create({ data: { name: "JCB Genuine Nairobi", phone: "+254720555666", leadDays: 9, oem: true } }),
    prisma.vendor.create({ data: { name: "China Hydraulics Import", phone: "+254720777888", leadDays: 28, oem: false } }),
    prisma.vendor.create({ data: { name: "Mombasa Filters Hub", phone: "+254720999000", leadDays: 5, oem: false } }),
    prisma.vendor.create({ data: { name: "Undercarriage World", phone: "+254721112233", leadDays: 12, oem: false } }),
  ]);
  const allVendors = [...(await prisma.vendor.findMany()), ...vendors];

  const extraParts = [
    { sku: MARKER, oem: "326-4635", name: "Main hydraulic pump", cat: "Hydraulics", bin: "A-01-01", cost: 145000, price: 198000, qty: 3, re: 1, crit: true, brand: "CAT", model: "320D" },
    { sku: "HYD-SEAL-KIT", oem: "4T6789", name: "Pump seal kit", cat: "Hydraulics", bin: "A-01-08", cost: 4200, price: 7800, qty: 22, re: 6, crit: false, brand: "CAT", model: "320D" },
    { sku: "ENG-C7-PIST", oem: "238-2720", name: "C7 piston assembly", cat: "Engine", bin: "B-04-02", cost: 18500, price: 27400, qty: 7, re: 2, crit: true, brand: "CAT", model: "C7" },
    { sku: "ENG-C9-GASK", oem: "142-5867", name: "C9 head gasket", cat: "Engine", bin: "B-04-09", cost: 6400, price: 11200, qty: 4, re: 3, crit: true, brand: "CAT", model: "C9" },
    { sku: "FLT-1R0750", oem: "1R0750", name: "Oil filter", cat: "Filters", bin: "C-01-06", cost: 890, price: 1650, qty: 48, re: 12, crit: false, brand: "CAT", model: "330D" },
    { sku: "FLT-AIR-P6", oem: "P608667", name: "Air filter primary", cat: "Filters", bin: "C-02-01", cost: 2100, price: 3600, qty: 16, re: 6, crit: false, brand: "Komatsu", model: "PC200-8" },
    { sku: "TRK-LINK-49", oem: "49W-32-21110", name: "Track link 49L", cat: "Undercarriage", bin: "D-02-03", cost: 62000, price: 89000, qty: 2, re: 1, crit: true, brand: "Komatsu", model: "PC200-8" },
    { sku: "TRK-ROLLER", oem: "20Y-30-11131", name: "Track roller", cat: "Undercarriage", bin: "D-03-01", cost: 9800, price: 15400, qty: 11, re: 4, crit: false, brand: "Komatsu", model: "PC300" },
    { sku: "BKT-TIP-JCB", oem: "332/C4390", name: "Bucket tip heavy", cat: "Attachments", bin: "E-03-08", cost: 1850, price: 3200, qty: 36, re: 10, crit: false, brand: "JCB", model: "3CX" },
    { sku: "BKT-PIN-80", oem: "PIN-80MM", name: "Bucket pin 80mm", cat: "Attachments", bin: "E-04-02", cost: 3400, price: 5900, qty: 9, re: 3, crit: false, brand: "CAT", model: "320D" },
    { sku: "SLW-MOTOR", oem: "20Y-27-17500", name: "Swing motor", cat: "Slew", bin: "F-02-01", cost: 86000, price: 124000, qty: 1, re: 1, crit: true, brand: "Komatsu", model: "PC200-8" },
    { sku: "CAB-GLASS", oem: "20Y-54-71110", name: "Cab front glass", cat: "Cabin", bin: "G-01-04", cost: 12800, price: 19600, qty: 3, re: 1, crit: false, brand: "Komatsu", model: "PC200-8" },
    { sku: "ELE-ALT-24", oem: "207-1597", name: "Alternator 24V", cat: "Electrical", bin: "H-01-02", cost: 14500, price: 22800, qty: 5, re: 2, crit: false, brand: "CAT", model: "330D" },
    { sku: "ELE-START", oem: "207-1425", name: "Starter motor", cat: "Electrical", bin: "H-01-06", cost: 16800, price: 24900, qty: 4, re: 2, crit: true, brand: "CAT", model: "C7" },
    { sku: "COOL-RAD", oem: "239-4479", name: "Radiator core", cat: "Cooling", bin: "B-08-01", cost: 42000, price: 63500, qty: 2, re: 1, crit: true, brand: "CAT", model: "320D" },
    { sku: "HOSE-16-3M", oem: "GENERIC-H16", name: "Hydraulic hose 16mm x 3m", cat: "Hydraulics", bin: "A-20-12", cost: 1400, price: 2600, qty: 40, re: 10, crit: false, brand: "CAT", model: "All" },
    { sku: "BRG-FINAL", oem: "333-1093", name: "Final drive bearing", cat: "Drivetrain", bin: "F-04-02", cost: 21000, price: 33500, qty: 0, re: 2, crit: true, brand: "CAT", model: "320D" },
    { sku: "SEAT-OP", oem: "SEAT-SUSP", name: "Operator suspension seat", cat: "Cabin", bin: "G-02-01", cost: 18500, price: 28900, qty: 2, re: 1, crit: false, brand: "JCB", model: "3CX" },
  ];
  const newParts = [];
  for (const p of extraParts) {
    newParts.push(await prisma.part.create({
      data: {
        sku: p.sku,
        oemNumber: p.oem,
        name: p.name,
        category: p.cat,
        binLocation: p.bin,
        cost: p.cost,
        salePrice: p.price,
        qtyOnHand: p.qty,
        reorderLevel: p.re,
        critical: p.crit,
        createdAt: day(2025, 8, 12),
        compat: { create: [{ machineBrand: p.brand, machineModel: p.model }] },
        movements: { create: { type: "RECEIPT", qty: p.qty || 1, reason: "Demo opening stock", userId: warehouse.id, createdAt: day(2025, 8, 12) } },
      },
    }));
  }
  const parts = [...(await prisma.part.findMany()), ...newParts];

  const existingOrders = await prisma.order.findMany({ select: { number: true } });
  let seq = 0;
  for (const o of existingOrders) {
    const m = o.number.match(/(\d+)$/);
    if (m) seq = Math.max(seq, Number(m[1]));
  }

  const STATUSES = ["DRAFT", "CONFIRMED", "PICKING", "PICKED", "DISPATCHED", "DELIVERED", "PAID", "CANCELLED"] as const;
  const CHANNELS = ["FIELD", "SHOP", "PHONE"];
  const DISPATCH = ["COURIER", "SHOP_COLLECT", "OWN_TRUCK"];
  const PAY = ["MPESA", "BANK", "CASH"];
  const sellers = [john, amina, mercy];

  const { postSale, postPayment, postExpense } = await import("../src/lib/ledger.js");
  const { issueInvoiceForOrder, refreshInvoiceStatus } = await import("../src/lib/invoice.js");

  let made = 0;
  for (let month = 0; month <= 9; month++) {
    const perMonth = month === 9 ? 10 : 9;
    for (let i = 0; i < perMonth; i++) {
      seq += 1;
      made += 1;
      const date = day(2026, month, 1 + ((i * 3) % 26), 8 + (i % 8));
      if (date.getTime() > Date.now()) date.setTime(Date.now() - (i + 1) * 3600000);
      const status = pick(STATUSES, month * 3 + i + (month === 9 ? 2 : 0));
      const customer = pick(allCustomers, made);
      const seller = pick(sellers, made);
      const p1 = pick(parts, made);
      const p2 = pick(parts, made + 4);
      const qty1 = 1 + (i % 3);
      const qty2 = 1 + (made % 2);
      const vendor = pick(allVendors, made);
      const number = `SO-2026-${pad(seq)}`;
      const lines = [
        { partId: p1.id, vendorId: vendor.id, qty: qty1, salePrice: p1.salePrice, cost: p1.cost },
        ...(i % 3 === 0 ? [] : [{ partId: p2.id, vendorId: vendor.id, qty: qty2, salePrice: p2.salePrice, cost: p2.cost }]),
      ];
      const gross = lines.reduce((s, l) => s + l.qty * l.salePrice * 1.16, 0);
      const order = await prisma.order.create({
        data: {
          number,
          channel: pick(CHANNELS, made),
          status,
          customerId: customer.id,
          salespersonId: seller.id,
          dispatchMethod: pick(DISPATCH, made),
          tracking: status === "DISPATCHED" || status === "DELIVERED" ? `G4S-26${pad(seq, 4)}` : null,
          lpo: i % 4 === 0 ? `LPO-${pad(200 + seq, 4)}` : null,
          notes: status === "DRAFT" ? "Quotation awaiting confirm" : null,
          createdAt: date,
          updatedAt: date,
          lines: { create: lines },
        },
        include: { lines: true },
      });

      if (status !== "DRAFT" && status !== "CANCELLED") {
        await prisma.stockMovement.create({
          data: { partId: p1.id, type: "ISSUE", qty: -qty1, reference: number, reason: "Sale", userId: seller.id, createdAt: date },
        });
        await prisma.part.update({ where: { id: p1.id }, data: { qtyOnHand: { decrement: qty1 } } });
        await issueInvoiceForOrder(order.id);
        await postSale({ id: order.id, number, vatRate: 0.16, lines: order.lines }, seller.id);
        const payShare = status === "PAID" ? 1 : status === "DELIVERED" && i % 2 === 0 ? 1 : i % 3 === 0 ? 0.45 : 0;
        if (payShare > 0) {
          const amount = Math.round(gross * payShare);
          const method = pick(PAY, made);
          await prisma.payment.create({
            data: { orderId: order.id, method, amount, reference: method === "MPESA" ? `RKT${pad(seq, 6)}` : `BNK-${pad(seq, 4)}`, userId: finance.id, createdAt: new Date(date.getTime() + 86400000) },
          });
          await postPayment({ orderId: order.id, number, method, amount, userId: finance.id });
        }
        await refreshInvoiceStatus(order.id);
      }

      if (made % 11 === 0) {
        await prisma.auditLog.create({
          data: {
            userId: seller.id,
            entity: "Order",
            entityId: order.id,
            action: "CREATE",
            newValue: JSON.stringify({ number, status }),
            ip: "10.0.0.12",
            createdAt: date,
          },
        });
      }
    }
  }

  const expCats = [
    ["Courier", 4800],
    ["Fuel", 22000],
    ["Rent", 85000],
    ["Utilities", 12400],
    ["Insurance", 18000],
    ["Travel", 9600],
    ["Stationery", 2100],
    ["Marketing", 15000],
    ["Repairs", 7400],
    ["Airtime", 3500],
  ] as const;
  for (let month = 0; month <= 9; month++) {
    for (let i = 0; i < expCats.length; i += 2) {
      const [category, amount] = pick(expCats, month + i);
      const date = day(2026, month, 4 + i, 14);
      if (date > new Date()) continue;
      const exp = await prisma.expense.create({
        data: {
          category,
          amount,
          vat: Math.round(amount * 0.16),
          date,
          notes: `${category} ${date.toLocaleString("en-GB", { month: "short", year: "numeric" })}`,
          userId: finance.id,
        },
      });
      await postExpense(exp, finance.id);
    }
  }

  let poN = await prisma.purchaseOrder.count();
  const poStatuses = ["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "ORDERED", "RECEIVED"] as const;
  for (let i = 0; i < poStatuses.length; i++) {
    poN += 1;
    const vendor = pick(allVendors, i + 2);
    const p = pick(parts, i + 3);
    const q = pick(parts, i + 8);
    const createdAt = day(2026, 6 + (i % 3), 3 + i * 4);
    const po = await prisma.purchaseOrder.create({
      data: {
        number: `PO-${pad(poN)}`,
        vendorId: vendor.id,
        status: poStatuses[i],
        reference: `IMP-26-${pad(40 + i, 3)}`,
        notes: i === 0 ? "Awaiting confirm" : "Import container",
        expectedAt: day(2026, 8, 10 + i),
        createdById: admin.id,
        createdAt,
        lines: {
          create: [
            { partId: p.id, qtyOrdered: 12 + i, qtyReceived: poStatuses[i] === "RECEIVED" ? 12 + i : poStatuses[i] === "PARTIAL" ? 6 : 0, unitCost: p.cost },
            { partId: q.id, qtyOrdered: 8, qtyReceived: poStatuses[i] === "RECEIVED" ? 8 : 0, unitCost: q.cost },
          ],
        },
      },
    });
    if (poStatuses[i] === "RECEIVED" || poStatuses[i] === "PARTIAL") {
      const recN = await prisma.goodsReceipt.count();
      const rec = await prisma.goodsReceipt.create({
        data: {
          number: `GRN-${pad(recN + 1)}`,
          purchaseId: po.id,
          receivedById: warehouse.id,
          notes: "Container received at Industrial Area",
          createdAt: day(2026, 8, 2 + i),
          lines: { create: [{ partId: p.id, qty: poStatuses[i] === "PARTIAL" ? 6 : 12 + i }] },
        },
      });
      const net = (poStatuses[i] === "PARTIAL" ? 6 : 12 + i) * p.cost;
      const vat = Math.round(net * 0.16);
      const billN = await prisma.vendorBill.count();
      const bill = await prisma.vendorBill.create({
        data: {
          number: `BILL-2026-${pad(billN + 1)}`,
          vendorId: vendor.id,
          purchaseId: po.id,
          receiptId: rec.id,
          status: i % 2 === 0 ? "PARTIAL" : "OPEN",
          net,
          vat,
          gross: net + vat,
          paid: i % 2 === 0 ? Math.round((net + vat) * 0.4) : 0,
        },
      });
      if (bill.paid > 0) {
        await prisma.vendorPayment.create({
          data: { billId: bill.id, method: "BANK", amount: bill.paid, reference: `TT-26-${pad(i + 1, 3)}`, userId: finance.id },
        });
      }
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const onLeaveStart = new Date(today);
  onLeaveStart.setDate(today.getDate() - 1);
  const onLeaveEnd = new Date(today);
  onLeaveEnd.setDate(today.getDate() + 4);
  await prisma.leaveRequest.createMany({
    data: [
      { userId: amina.id, type: "ANNUAL", startDate: onLeaveStart, endDate: onLeaveEnd, days: 5, reason: "Family visit Eldoret", status: "APPROVED", reviewerId: admin.id },
      { userId: warehouse.id, type: "SICK", startDate: day(2026, 8, 8), endDate: day(2026, 8, 10), days: 3, reason: "Malaria", status: "APPROVED", reviewerId: admin.id },
      { userId: john.id, type: "ANNUAL", startDate: day(2026, 11, 15), endDate: day(2026, 11, 22), days: 6, reason: "December break", status: "PENDING" },
      { userId: mercy.id, type: "COMPASSIONATE", startDate: day(2026, 7, 2), endDate: day(2026, 7, 4), days: 3, reason: "Bereavement", status: "APPROVED", reviewerId: admin.id },
      { userId: finance.id, type: "ANNUAL", startDate: day(2026, 5, 10), endDate: day(2026, 5, 14), days: 5, reason: "Rest", status: "REJECTED", reviewerId: admin.id },
    ],
  });

  await prisma.salaryAdvance.createMany({
    data: [
      { userId: john.id, amount: 15000, reason: "School fees", year: 2026, month: 9, status: "APPROVED", reviewerId: admin.id },
      { userId: warehouse.id, amount: 8000, reason: "Medical", year: 2026, month: 9, status: "PENDING" },
      { userId: mercy.id, amount: 5000, reason: "Transport", year: 2026, month: 8, status: "DEDUCTED", reviewerId: finance.id },
    ],
  });

  for (let d = 10; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    for (const u of staff) {
      if (weekend && u.id !== warehouse.id) continue;
      const late = u.id === john.id && d % 4 === 0;
      const absent = u.id === amina.id && d === 1;
      await prisma.attendance.upsert({
        where: { userId_date: { userId: u.id, date } },
        update: {},
        create: {
          userId: u.id,
          date,
          status: absent ? "ABSENT" : late ? "LATE" : "PRESENT",
          checkIn: absent ? null : new Date(date.getTime() + (late ? 9.5 : 7.85) * 3600000),
          checkOut: absent ? null : new Date(date.getTime() + 17.2 * 3600000),
        },
      });
    }
  }

  const run = await ensurePayroll(staff, mercy.id);

  await prisma.approval.createMany({
    data: [
      { type: "EDIT_PRICE", entity: "Order", entityId: "demo-price", oldValue: "{\"salePrice\":198000}", newValue: "{\"salePrice\":185000}", reason: "Repeat buyer discount — Kerio Gold", requesterId: john.id, status: "PENDING" },
      { type: "CREDIT_LIMIT", entity: "Customer", entityId: "demo-limit", oldValue: "{\"creditLimit\":450000}", newValue: "{\"creditLimit\":700000}", reason: "Eldoret Crushers expanding fleet", requesterId: amina.id, status: "APPROVED", reviewerId: admin.id, reviewedAt: day(2026, 8, 18) },
      { type: "ADJUST_STOCK", entity: "Part", entityId: "demo-adj", oldValue: "{\"qtyOnHand\":2}", newValue: "{\"qty\":-1}", reason: "Warranty return damaged seal", requesterId: warehouse.id, status: "REJECTED", reviewerId: admin.id, reviewedAt: day(2026, 8, 21) },
    ],
  });

  const bank = await prisma.bankAccount.findFirst();
  if (bank) {
    await prisma.bankStatementLine.createMany({
      data: [
        { bankAccountId: bank.id, date: day(2026, 9, 1), description: "M-Pesa settlement", amount: 186400, matched: true },
        { bankAccountId: bank.id, date: day(2026, 9, 1), description: "KPLC utilities", amount: -12400, matched: false },
        { bankAccountId: bank.id, date: day(2026, 8, 28), description: "CAT Genuine Parts EA", amount: -240000, matched: true },
        { bankAccountId: bank.id, date: day(2026, 8, 15), description: "Thika Superhighways JV", amount: 412000, matched: false },
      ],
    });
  }

  await prisma.mpesaTxn.createMany({
    data: [
      { kind: "STK", status: "SUCCESS", phone: "254723909380", amount: 27400, accountRef: "INV-2026-00008", receipt: "TJK7Q2X1", resultDesc: "The service request is processed successfully.", userId: finance.id },
      { kind: "STK", status: "PENDING", phone: "254722111222", amount: 89000, accountRef: "INV-2026-00021", userId: john.id },
      { kind: "C2B", status: "SUCCESS", phone: "254733445566", amount: 156000, accountRef: "INV-2026-00014", receipt: "TLM9A4B2", userId: finance.id },
    ],
  });

  await prisma.notice.createMany({
    data: staff.map((u) => ({
      userId: u.id,
      title: "September payroll posted",
      body: "September run PR-2026-09 is posted. Advances will appear on the October slip.",
      url: "/hr",
    })),
  });
  await prisma.notice.createMany({
    data: [
      { userId: john.id, title: "Low stock: Final drive bearing", body: "BRG-FINAL is at 0. Raise a purchase if the 320D job is still on.", url: "/inventory" },
      { userId: finance.id, title: "Unpaid invoices this week", body: "Several Net 30 accounts are open. Review Finance → Invoices.", url: "/finance" },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      { userId: finance.id, entity: "Payroll", entityId: run.id, action: "POST", newValue: JSON.stringify({ number: run.number }), ip: "10.0.0.8" },
      { userId: warehouse.id, entity: "PurchaseOrder", entityId: "po-demo", action: "RECEIVE", reason: "GRN posted", ip: "10.0.0.9" },
      { userId: admin.id, entity: "User", entityId: mercy.id, action: "CREATE", newValue: JSON.stringify({ email: mercy.email }), ip: "10.0.0.2" },
    ],
  });

  const orders = await prisma.order.count();
  const invoices = await prisma.invoice.count();
  const extras = await prisma.expense.count();
  console.log(`Demo data loaded. Orders=${orders} invoices=${invoices} expenses=${extras} extraParts=${newParts.length} extraCustomers=${customers.length}`);
}

async function ensurePayroll(staff: { id: string; salary: number }[], mercyId: string) {
  let run = await prisma.payrollRun.findUnique({ where: { number: "PR-2026-09" } });
  if (!run) {
    run = await prisma.payrollRun.create({
      data: {
        number: "PR-2026-09",
        year: 2026,
        month: 9,
        status: "POSTED",
        notes: "September payroll",
        lines: {
          create: staff.map((u) => {
            const basic = u.salary || 60000;
            const paye = Math.round(basic * 0.2);
            const deductions = u.id === mercyId ? 5000 : 0;
            return { userId: u.id, basic, allowances: 5000, deductions, paye, net: basic + 5000 - paye - deductions };
          }),
        },
      },
    });
  }
  if (!(await prisma.payrollRun.findUnique({ where: { number: "PR-2026-10" } }))) {
    await prisma.payrollRun.create({
      data: {
        number: "PR-2026-10",
        year: 2026,
        month: 10,
        status: "DRAFT",
        notes: "October draft",
        lines: {
          create: staff.slice(0, 4).map((u) => {
            const basic = u.salary || 60000;
            const paye = Math.round(basic * 0.2);
            return { userId: u.id, basic, allowances: 5000, deductions: 0, paye, net: basic + 5000 - paye };
          }),
        },
      },
    });
  }
  return run;
}

async function finishHrDemo() {
  const users = await prisma.user.findMany();
  const admin = users.find((u) => u.role === "ADMIN") || users[0];
  const finance = users.find((u) => u.role === "FINANCE") || admin;
  const john = users.find((u) => u.email === "sales@mte.local") || users[0];
  const warehouse = users.find((u) => u.role === "WAREHOUSE") || admin;
  const mercy = users.find((u) => u.email === "sales3@mte.local") || john;
  await ensurePayroll(users, mercy.id);
  if ((await prisma.leaveRequest.count()) < 4) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const onLeaveStart = new Date(today);
    onLeaveStart.setDate(today.getDate() - 1);
    const onLeaveEnd = new Date(today);
    onLeaveEnd.setDate(today.getDate() + 4);
    await prisma.leaveRequest.createMany({
      data: [
        { userId: users.find((u) => u.email === "sales2@mte.local")?.id || john.id, type: "ANNUAL", startDate: onLeaveStart, endDate: onLeaveEnd, days: 5, reason: "Family visit Eldoret", status: "APPROVED", reviewerId: admin.id },
        { userId: warehouse.id, type: "SICK", startDate: day(2026, 8, 8), endDate: day(2026, 8, 10), days: 3, reason: "Malaria", status: "APPROVED", reviewerId: admin.id },
        { userId: john.id, type: "ANNUAL", startDate: day(2026, 11, 15), endDate: day(2026, 11, 22), days: 6, reason: "December break", status: "PENDING" },
      ],
    });
  }
  if ((await prisma.salaryAdvance.count()) === 0) {
    await prisma.salaryAdvance.createMany({
      data: [
        { userId: john.id, amount: 15000, reason: "School fees", year: 2026, month: 9, status: "APPROVED", reviewerId: admin.id },
        { userId: warehouse.id, amount: 8000, reason: "Medical", year: 2026, month: 9, status: "PENDING" },
      ],
    });
  }
  if ((await prisma.approval.count()) < 4) {
    await prisma.approval.createMany({
      data: [
        { type: "EDIT_PRICE", entity: "Order", entityId: "demo-price", oldValue: "{\"salePrice\":198000}", newValue: "{\"salePrice\":185000}", reason: "Repeat buyer discount — Kerio Gold", requesterId: john.id, status: "PENDING" },
        { type: "CREDIT_LIMIT", entity: "Customer", entityId: "demo-limit", oldValue: "{\"creditLimit\":450000}", newValue: "{\"creditLimit\":700000}", reason: "Eldoret Crushers expanding fleet", requesterId: john.id, status: "APPROVED", reviewerId: admin.id },
      ],
    });
  }
  await prisma.notice.createMany({
    data: [
      { userId: john.id, title: "Demo books are loaded", body: "Browse Sales, Finance, Inventory and HR — the registers now have a full month of activity.", url: "/" },
      { userId: finance.id, title: "Unpaid invoices this week", body: "Several Net 30 accounts are open. Review Finance → Invoices.", url: "/finance" },
    ],
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
