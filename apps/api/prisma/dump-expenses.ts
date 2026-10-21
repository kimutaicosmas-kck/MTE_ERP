import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MARK = "Dump · ";

function day(year: number, month: number, date: number) {
  return new Date(year, month, date, 11, 0, 0);
}

const ROWS: { category: string; amount: number; month: number; date: number; notes: string }[] = [
  { category: "Rent", amount: 85000, month: 0, date: 3, notes: "Industrial Area warehouse Jan" },
  { category: "Rent", amount: 85000, month: 1, date: 3, notes: "Industrial Area warehouse Feb" },
  { category: "Rent", amount: 85000, month: 2, date: 3, notes: "Industrial Area warehouse Mar" },
  { category: "Rent", amount: 85000, month: 3, date: 3, notes: "Industrial Area warehouse Apr" },
  { category: "Rent", amount: 85000, month: 4, date: 3, notes: "Industrial Area warehouse May" },
  { category: "Rent", amount: 85000, month: 5, date: 3, notes: "Industrial Area warehouse Jun" },
  { category: "Rent", amount: 85000, month: 6, date: 3, notes: "Industrial Area warehouse Jul" },
  { category: "Rent", amount: 85000, month: 7, date: 3, notes: "Industrial Area warehouse Aug" },
  { category: "Rent", amount: 90000, month: 8, date: 3, notes: "Industrial Area warehouse Sep" },
  { category: "Rent", amount: 90000, month: 9, date: 1, notes: "Industrial Area warehouse Oct" },
  { category: "Fuel", amount: 18400, month: 0, date: 8, notes: "Delivery van — Rift Valley runs" },
  { category: "Fuel", amount: 22100, month: 1, date: 12, notes: "Pickup — Eldoret and Kitale" },
  { category: "Fuel", amount: 19600, month: 2, date: 9, notes: "Van + generator diesel" },
  { category: "Fuel", amount: 24800, month: 3, date: 15, notes: "Nakuru and Naivasha drops" },
  { category: "Fuel", amount: 17300, month: 4, date: 6, notes: "Town deliveries" },
  { category: "Fuel", amount: 26500, month: 5, date: 18, notes: "Mombasa port collection" },
  { category: "Fuel", amount: 20100, month: 6, date: 11, notes: "Kisumu trip" },
  { category: "Fuel", amount: 23900, month: 7, date: 22, notes: "Turkana site visit" },
  { category: "Fuel", amount: 21400, month: 8, date: 14, notes: "September fleet" },
  { category: "Fuel", amount: 9800, month: 9, date: 1, notes: "October week 1" },
  { category: "Courier", amount: 4200, month: 0, date: 16, notes: "G4S weekly" },
  { category: "Courier", amount: 5100, month: 1, date: 20, notes: "G4S + Fargo" },
  { category: "Courier", amount: 3800, month: 2, date: 14, notes: "G4S weekly" },
  { category: "Courier", amount: 6400, month: 3, date: 19, notes: "Urgent pump to quarry" },
  { category: "Courier", amount: 4500, month: 4, date: 17, notes: "G4S weekly" },
  { category: "Courier", amount: 7200, month: 5, date: 21, notes: "Mombasa container docs" },
  { category: "Courier", amount: 4900, month: 6, date: 16, notes: "G4S weekly" },
  { category: "Courier", amount: 5600, month: 7, date: 18, notes: "Wells Fargo upcountry" },
  { category: "Courier", amount: 6100, month: 8, date: 20, notes: "September dispatches" },
  { category: "Courier", amount: 2700, month: 9, date: 2, notes: "Today G4S run" },
  { category: "Utilities", amount: 11200, month: 0, date: 7, notes: "KPLC + water" },
  { category: "Utilities", amount: 12800, month: 1, date: 7, notes: "KPLC + water" },
  { category: "Utilities", amount: 14100, month: 2, date: 7, notes: "KPLC peak" },
  { category: "Utilities", amount: 11900, month: 3, date: 7, notes: "KPLC + water" },
  { category: "Utilities", amount: 13200, month: 4, date: 7, notes: "KPLC + water" },
  { category: "Utilities", amount: 15600, month: 5, date: 7, notes: "KPLC + borehole pump" },
  { category: "Utilities", amount: 12400, month: 6, date: 7, notes: "KPLC + water" },
  { category: "Utilities", amount: 13800, month: 7, date: 7, notes: "KPLC + water" },
  { category: "Utilities", amount: 14700, month: 8, date: 7, notes: "KPLC + water" },
  { category: "Insurance", amount: 18000, month: 0, date: 10, notes: "Van comprehensive Q1" },
  { category: "Insurance", amount: 42000, month: 3, date: 10, notes: "Stock all-risks Q2" },
  { category: "Insurance", amount: 18000, month: 6, date: 10, notes: "Van comprehensive Q3" },
  { category: "Insurance", amount: 26500, month: 8, date: 12, notes: "WIBA staff cover" },
  { category: "Travel", amount: 8600, month: 1, date: 24, notes: "John — field week" },
  { category: "Travel", amount: 12400, month: 3, date: 5, notes: "Cosmas — Mombasa suppliers" },
  { category: "Travel", amount: 5400, month: 5, date: 19, notes: "Amina — Kerio visit" },
  { category: "Travel", amount: 9800, month: 7, date: 8, notes: "Grace — KRA appointment" },
  { category: "Travel", amount: 7200, month: 8, date: 26, notes: "Sales team — Nakuru" },
  { category: "Travel", amount: 3100, month: 9, date: 1, notes: "Town matatu and parking" },
  { category: "Marketing", amount: 15000, month: 2, date: 4, notes: "Machine-owner flyers" },
  { category: "Marketing", amount: 22000, month: 5, date: 2, notes: "Quarry expo stand" },
  { category: "Marketing", amount: 8500, month: 8, date: 9, notes: "Digital ads" },
  { category: "Stationery", amount: 2100, month: 0, date: 22, notes: "Invoices and books" },
  { category: "Stationery", amount: 1800, month: 3, date: 22, notes: "Toner and paper" },
  { category: "Stationery", amount: 2600, month: 6, date: 22, notes: "Delivery note pads" },
  { category: "Stationery", amount: 1400, month: 9, date: 2, notes: "Counter books" },
  { category: "Repairs", amount: 7400, month: 1, date: 28, notes: "Van clutch" },
  { category: "Repairs", amount: 12800, month: 4, date: 13, notes: "Forklift hydraulics" },
  { category: "Repairs", amount: 4300, month: 7, date: 29, notes: "Shop roller door" },
  { category: "Airtime", amount: 3500, month: 0, date: 2, notes: "Sales lines" },
  { category: "Airtime", amount: 3500, month: 2, date: 2, notes: "Sales lines" },
  { category: "Airtime", amount: 4200, month: 4, date: 2, notes: "Sales + stores" },
  { category: "Airtime", amount: 3500, month: 6, date: 2, notes: "Sales lines" },
  { category: "Airtime", amount: 4800, month: 8, date: 2, notes: "Sales + Cosmas" },
  { category: "Security", amount: 16000, month: 0, date: 5, notes: "Night guard Jan" },
  { category: "Security", amount: 16000, month: 2, date: 5, notes: "Night guard Mar" },
  { category: "Security", amount: 16000, month: 4, date: 5, notes: "Night guard May" },
  { category: "Security", amount: 18000, month: 6, date: 5, notes: "Night guard Jul" },
  { category: "Security", amount: 18000, month: 8, date: 5, notes: "Night guard Sep" },
  { category: "Bank charges", amount: 890, month: 1, date: 28, notes: "KCB ledger fees" },
  { category: "Bank charges", amount: 1240, month: 4, date: 28, notes: "TT to CAT Genuine" },
  { category: "Bank charges", amount: 760, month: 7, date: 28, notes: "KCB ledger fees" },
  { category: "Training", amount: 25000, month: 3, date: 16, notes: "Store safety course" },
  { category: "Legal", amount: 15000, month: 6, date: 9, notes: "Lease review" },
  { category: "Cleaning", amount: 4500, month: 1, date: 6, notes: "Yard and washbay" },
  { category: "Cleaning", amount: 4500, month: 5, date: 6, notes: "Yard and washbay" },
  { category: "Cleaning", amount: 5200, month: 8, date: 6, notes: "Yard and washbay" },
  { category: "Loading", amount: 2400, month: 2, date: 18, notes: "Casual offload container" },
  { category: "Loading", amount: 3600, month: 5, date: 23, notes: "Casual offload container" },
  { category: "Loading", amount: 1800, month: 8, date: 27, notes: "Casual help — track shoes" },
  { category: "Office tea", amount: 2200, month: 0, date: 14, notes: "Staff tea and sugar" },
  { category: "Office tea", amount: 2600, month: 4, date: 14, notes: "Staff tea and sugar" },
  { category: "Office tea", amount: 2400, month: 8, date: 14, notes: "Staff tea and sugar" },
];

async function main() {
  const already = await prisma.expense.count({ where: { notes: { startsWith: MARK } } });
  if (already > 0) {
    console.log(`Expense dump already present (${already} rows). Skip.`);
    return;
  }
  const finance = await prisma.user.findFirst({ where: { role: { in: ["FINANCE", "SUPER_ADMIN", "ADMIN"] } } });
  if (!finance) throw new Error("No finance user");
  const { postExpense } = await import("../src/lib/ledger.js");
  let n = 0;
  for (const row of ROWS) {
    const date = day(2026, row.month, row.date);
    if (date.getTime() > Date.now()) continue;
    const vat = Math.round(row.amount * 0.16);
    const exp = await prisma.expense.create({
      data: {
        category: row.category,
        amount: row.amount,
        vat,
        date,
        notes: MARK + row.notes,
        userId: finance.id,
      },
    });
    await postExpense(exp, finance.id);
    n += 1;
  }
  const total = await prisma.expense.aggregate({ _sum: { amount: true }, _count: true });
  console.log(`Posted ${n} expenses. Books now have ${total._count} expenses totalling Ksh ${Math.round(total._sum.amount || 0).toLocaleString("en-KE")}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
