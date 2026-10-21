import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { recordActivity } from "../lib/activity.js";
import { postExpense, postJournal, postPayment, postVendorPayment, reverseJournal } from "../lib/ledger.js";
import { listInvoices, refreshInvoiceStatus } from "../lib/invoice.js";
import { queueApproval } from "../lib/approval-request.js";
import { syncCoaCatalog } from "../lib/sync-coa.js";
import { roles, moduleAccess } from "../middleware/auth.js";

export const financeRouter = Router();

financeRouter.use(moduleAccess("finance"));

financeRouter.get("/dashboard", async (_req, res) => {
  await syncCoaCatalog();
  const accounts = await prisma.account.findMany({ include: { lines: true } });
  const bal = (code: string) => {
    const a = accounts.find((x) => x.code === code);
    if (!a) return 0;
    return a.lines.reduce((s, l) => s + l.debit - l.credit, 0);
  };
  const cash = bal("1000") + bal("1010") + bal("1020") + bal("1130");
  const bank = bal("1020");
  const ar = bal("1100");
  const ap = -bal("2000");
  const inventory = bal("1200");
  const income = accounts.filter((a) => a.type === "INCOME").reduce((s, a) => s + a.lines.reduce((n, l) => n + l.credit - l.debit, 0), 0);
  const cogs = accounts.filter((a) => a.type === "COGS").reduce((s, a) => s + a.lines.reduce((n, l) => n + l.debit - l.credit, 0), 0);
  const expenses = accounts.filter((a) => a.type === "EXPENSE").reduce((s, a) => s + a.lines.reduce((n, l) => n + l.debit - l.credit, 0), 0);
  const gross = income - cogs;
  const net = gross - expenses;
  const vatOut = accounts.find((a) => a.code === "2100")?.lines.reduce((s, l) => s + l.credit - l.debit, 0) || 0;
  const vatIn = accounts.find((a) => a.code === "2110")?.lines.reduce((s, l) => s + l.debit - l.credit, 0) || 0;
  const taxDue = vatOut - vatIn;
  const assets = accounts.filter((a) => a.type === "ASSET").reduce((s, a) => s + a.lines.reduce((n, l) => n + l.debit - l.credit, 0), 0);
  const liabilities = accounts.filter((a) => a.type === "LIABILITY").reduce((s, a) => s + a.lines.reduce((n, l) => n + l.credit - l.debit, 0), 0);
  const equity = accounts.filter((a) => a.type === "EQUITY").reduce((s, a) => s + a.lines.reduce((n, l) => n + l.credit - l.debit, 0), 0);
  const workingCapital = ar + inventory - ap;
  const currentLiabilities = ap + Math.max(0, taxDue);
  const currentRatio = currentLiabilities > 0 ? (cash + ar + inventory) / currentLiabilities : null;
  const debtRatio = assets > 0 ? liabilities / assets : null;
  const invoices = await listInvoices();
  const outstanding = invoices.filter((i) => i.totals.balance > 0.01).reduce((s, i) => s + i.totals.balance, 0);
  const bills = await prisma.vendorBill.findMany();
  const apOpen = bills.reduce((s, b) => s + Math.max(0, b.gross - b.paid), 0);
  res.json({
    cashBalance: cash,
    bankBalance: bank,
    accountsReceivable: ar,
    accountsPayable: apOpen || ap,
    monthlyRevenue: income,
    grossProfit: gross,
    netProfit: net,
    expenses,
    taxDue,
    vatCollected: vatOut,
    inventoryValue: inventory,
    workingCapital,
    currentRatio,
    debtRatio,
    outstandingInvoices: outstanding,
    openBills: bills.filter((b) => b.gross - b.paid > 0.01).length,
    equity,
    assets,
    liabilities,
  });
});

financeRouter.get("/ledger", async (req, res) => {
  const code = String(req.query.account || req.query.code || "");
  if (!code) return res.status(400).json({ error: "account code required" });
  const account = await prisma.account.findUnique({ where: { code } });
  if (!account) return res.status(404).json({ error: "Account not found" });
  const lines = await prisma.journalLine.findMany({
    where: { accountId: account.id },
    include: { journal: { include: { user: { select: { name: true } } } } },
    orderBy: { journal: { date: "asc" } },
  });
  let running = 0;
  const rows = lines.map((l) => {
    running += l.debit - l.credit;
    return {
      id: l.id,
      date: l.journal.date,
      memo: l.journal.memo,
      source: l.journal.source,
      debit: l.debit,
      credit: l.credit,
      balance: running,
      user: l.journal.user?.name || "System",
    };
  });
  res.json({ account, rows, balance: running });
});

financeRouter.post("/accounts/sync", roles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  await syncCoaCatalog();
  await audit(req, { entity: "Account", entityId: "catalog", action: "SYNC", newValue: { ok: true } });
  res.json({ ok: true });
});

financeRouter.get("/invoices", async (_req, res) => {
  res.json(await listInvoices());
});

financeRouter.post("/invoices/:id/pay", async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { order: { include: { lines: true, payments: true } } },
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  const amount = Number(req.body.amount);
  const method = String(req.body.method || "CASH");
  const reference = req.body.reference ? String(req.body.reference) : null;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Amount required" });
  if (method === "MPESA" && !reference) return res.status(400).json({ error: "M-Pesa reference required" });
  const pay = await prisma.payment.create({
    data: { orderId: invoice.orderId, method, amount, reference, userId: req.user!.id },
  });
  await postPayment({ orderId: invoice.orderId, number: invoice.number, method, amount, userId: req.user!.id });
  const updated = await refreshInvoiceStatus(invoice.orderId);
  await recordActivity(req, {
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
  res.status(201).json({ payment: pay, invoice: updated });
});

function moneyLabel(n: number) {
  return `KES ${Math.round(n).toLocaleString("en-KE")}`;
}

financeRouter.get("/accounts", async (_req, res) => {
  res.json(await prisma.account.findMany({ orderBy: { code: "asc" } }));
});

financeRouter.get("/journals", async (_req, res) => {
  res.json(
    await prisma.journal.findMany({
      include: { lines: { include: { account: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 80,
    })
  );
});

financeRouter.post("/journals", async (req, res) => {
  if (await queueApproval(req, res, {
    type: "POST_JOURNAL",
    entity: "Journal",
    entityId: "new",
    newValue: req.body,
    reason: req.body.reason || req.body.memo || "Manual journal",
  })) return;
  const j = await postJournal({
    memo: req.body.memo,
    source: "MANUAL",
    userId: req.user!.id,
    lines: req.body.lines,
  });
  await audit(req, { entity: "Journal", entityId: j.id, action: "CREATE", newValue: j, reason: req.body.reason });
  res.status(201).json(j);
});

financeRouter.get("/trial-balance", async (_req, res) => {
  const accounts = await prisma.account.findMany({
    include: { lines: true },
    orderBy: { code: "asc" },
  });
  const rows = accounts.map((a) => {
    const debit = a.lines.reduce((s, l) => s + l.debit, 0);
    const credit = a.lines.reduce((s, l) => s + l.credit, 0);
    return { code: a.code, name: a.name, type: a.type, debit, credit, balance: debit - credit };
  });
  res.json({
    rows,
    totalDebit: rows.reduce((s, r) => s + r.debit, 0),
    totalCredit: rows.reduce((s, r) => s + r.credit, 0),
  });
});

financeRouter.get("/pnl", async (_req, res) => {
  const accounts = await prisma.account.findMany({ include: { lines: true } });
  const sum = (type: string) =>
    accounts
      .filter((a) => a.type === type)
      .reduce((s, a) => s + a.lines.reduce((n, l) => n + l.credit - l.debit, 0), 0);
  const income = sum("INCOME");
  const cogs = -sum("COGS");
  const expenses = -sum("EXPENSE");
  res.json({ income, cogs, expenses, gross: income - cogs, net: income - cogs - expenses });
});

financeRouter.get("/balance-sheet", async (_req, res) => {
  const accounts = await prisma.account.findMany({ include: { lines: true } });
  const byType = (type: string) =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => ({
        code: a.code,
        name: a.name,
        balance: a.lines.reduce((s, l) => s + l.debit - l.credit, 0),
      }));
  const assets = byType("ASSET").map((a) => ({ ...a, balance: a.balance }));
  const liabilities = byType("LIABILITY").map((a) => ({ ...a, balance: -a.balance }));
  const equity = byType("EQUITY").map((a) => ({ ...a, balance: -a.balance }));
  const income = accounts
    .filter((a) => a.type === "INCOME")
    .reduce((s, a) => s + a.lines.reduce((n, l) => n + l.credit - l.debit, 0), 0);
  const cogs = accounts
    .filter((a) => a.type === "COGS")
    .reduce((s, a) => s + a.lines.reduce((n, l) => n + l.debit - l.credit, 0), 0);
  const expenses = accounts
    .filter((a) => a.type === "EXPENSE")
    .reduce((s, a) => s + a.lines.reduce((n, l) => n + l.debit - l.credit, 0), 0);
  const retained = income - cogs - expenses;
  res.json({
    assets,
    liabilities,
    equity: [...equity, { code: "3900", name: "Retained earnings", balance: retained }],
    totals: {
      assets: assets.reduce((s, a) => s + a.balance, 0),
      liabilities: liabilities.reduce((s, a) => s + a.balance, 0) + equity.reduce((s, a) => s + a.balance, 0) + retained,
    },
  });
});

financeRouter.get("/vat", async (_req, res) => {
  const output = await prisma.account.findUnique({ where: { code: "2100" }, include: { lines: true } });
  const input = await prisma.account.findUnique({ where: { code: "2110" }, include: { lines: true } });
  const vatOut = output?.lines.reduce((s, l) => s + l.credit - l.debit, 0) || 0;
  const vatIn = input?.lines.reduce((s, l) => s + l.debit - l.credit, 0) || 0;
  res.json({ output: vatOut, input: vatIn, payable: vatOut - vatIn });
});

financeRouter.get("/vat/kra-export", async (_req, res) => {
  const { setting } = await import("../lib/sequence.js").then((m) => m.ensureCompany());
  const output = await prisma.account.findUnique({ where: { code: "2100" }, include: { lines: true } });
  const input = await prisma.account.findUnique({ where: { code: "2110" }, include: { lines: true } });
  const vatOut = output?.lines.reduce((s, l) => s + l.credit - l.debit, 0) || 0;
  const vatIn = input?.lines.reduce((s, l) => s + l.debit - l.credit, 0) || 0;
  const payable = vatOut - vatIn;
  const period = new Date().toISOString().slice(0, 7);
  const lines = [
    "Field,Value",
    `Taxpayer PIN,${setting.kraPin || ""}`,
    `Legal name,${setting.legalName || setting.companyName}`,
    `Period,${period}`,
    `Output VAT (2100),${Math.round(vatOut * 100) / 100}`,
    `Input VAT (2110),${Math.round(vatIn * 100) / 100}`,
    `Net VAT payable,${Math.round(payable * 100) / 100}`,
    `Currency,${setting.currency || "KES"}`,
    `Generated,${new Date().toISOString()}`,
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="vat-return-${period}.csv"`);
  res.send(lines.join("\n"));
});

financeRouter.get("/expenses", async (_req, res) => {
  res.json(await prisma.expense.findMany({ include: { user: { select: { name: true } } }, orderBy: { date: "desc" } }));
});

financeRouter.post("/expenses", async (req, res) => {
  const exp = await prisma.expense.create({
    data: {
      category: req.body.category,
      amount: Number(req.body.amount),
      vat: Number(req.body.vat || 0),
      date: new Date(req.body.date || Date.now()),
      notes: req.body.notes,
      userId: req.user!.id,
    },
  });
  await postExpense(exp, req.user!.id);
  await audit(req, { entity: "Expense", entityId: exp.id, action: "CREATE", newValue: exp });
  res.status(201).json(exp);
});

financeRouter.delete("/expenses/:id", async (req, res) => {
  const exp = await prisma.expense.findUnique({ where: { id: req.params.id } });
  if (!exp) return res.status(404).json({ error: "Expense not found" });
  if (await queueApproval(req, res, {
    type: "DELETE_EXPENSE",
    entity: "Expense",
    entityId: exp.id,
    oldValue: exp,
    newValue: { deleted: true },
    reason: String(req.body?.reason || `Remove ${exp.category} expense`),
  })) return;
  const journals = await prisma.journal.findMany({
    where: { source: "EXPENSE", sourceId: exp.id, reversed: false },
  });
  for (const j of journals) await reverseJournal(j.id, req.user!.id);
  await prisma.expense.delete({ where: { id: exp.id } });
  await audit(req, { entity: "Expense", entityId: exp.id, action: "DELETE", oldValue: exp });
  res.json({ ok: true });
});

financeRouter.post("/payments/:id/void", async (req, res) => {
  const pay = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!pay) return res.status(404).json({ error: "Payment not found" });
  if (pay.method === "CREDIT_NOTE") return res.status(400).json({ error: "Void the sales return instead of this credit note" });
  if (await queueApproval(req, res, {
    type: "VOID_PAYMENT",
    entity: "Payment",
    entityId: pay.id,
    oldValue: pay,
    newValue: { voided: true },
    reason: String(req.body?.reason || "Void payment"),
  })) return;
  const order = await prisma.order.findUnique({ where: { id: pay.orderId }, include: { invoice: true } });
  const cashCode = pay.method === "MPESA" ? "1010" : pay.method === "BANK" ? "1020" : "1000";
  await postJournal({
    memo: `Void payment ${order?.invoice?.number || order?.number || pay.id}`,
    source: "REVERSAL",
    sourceId: pay.id,
    userId: req.user!.id,
    lines: [
      { code: "1100", debit: pay.amount },
      { code: cashCode, credit: pay.amount },
    ],
  });
  await prisma.payment.delete({ where: { id: pay.id } });
  await refreshInvoiceStatus(pay.orderId);
  await audit(req, { entity: "Payment", entityId: pay.id, action: "DELETE", oldValue: pay, reason: req.body?.reason });
  res.json({ ok: true });
});

financeRouter.get("/periods", async (_req, res) => {
  res.json(await prisma.period.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }] }));
});

financeRouter.post("/periods/close", roles("SUPER_ADMIN"), async (req, res) => {
  const year = Number(req.body.year);
  const month = Number(req.body.month);
  const p = await prisma.period.upsert({
    where: { year_month: { year, month } },
    update: { locked: true },
    create: { year, month, locked: true },
  });
  await audit(req, { entity: "Period", entityId: p.id, action: "CLOSE", newValue: p });
  res.json(p);
});

financeRouter.post("/periods/unlock", roles("SUPER_ADMIN"), async (req, res) => {
  const year = Number(req.body.year);
  const month = Number(req.body.month);
  const p = await prisma.period.upsert({
    where: { year_month: { year, month } },
    update: { locked: false },
    create: { year, month, locked: false },
  });
  await audit(req, { entity: "Period", entityId: p.id, action: "UNLOCK", newValue: p, reason: req.body.reason });
  res.json(p);
});

async function ensureBanks() {
  const n = await prisma.bankAccount.count();
  if (n > 0) return;
  await prisma.bankAccount.createMany({
    data: [
      { code: "KCB", name: "KCB current" },
      { code: "MPESA", name: "M-Pesa till" },
    ],
  });
}

financeRouter.get("/banks", async (_req, res) => {
  await ensureBanks();
  const banksRaw = await prisma.bankAccount.findMany({ include: { lines: { orderBy: { date: "desc" } } } });
  const accounts = await prisma.account.findMany({ include: { lines: true } });
  const glBal = (code: string) => {
    const a = accounts.find((x) => x.code === code);
    if (!a) return 0;
    return a.lines.reduce((s, l) => s + l.debit - l.credit, 0);
  };
  const bookCash = glBal("1000") + glBal("1010") + glBal("1020") + glBal("1130");
  const bookBank = glBal("1020");
  const banks = banksRaw.map((b) => {
    const stmtTotal = b.lines.reduce((s, l) => s + l.amount, 0);
    const openLines = b.lines.filter((l) => !l.matched);
    const openAmount = openLines.reduce((s, l) => s + l.amount, 0);
    const bookBalance = b.code === "MPESA" ? glBal("1010") : bookBank;
    return {
      ...b,
      statementTotal: Math.round(stmtTotal * 100) / 100,
      openStatementLines: openLines.length,
      openStatementAmount: Math.round(openAmount * 100) / 100,
      bookBalanceGL: Math.round(bookBalance * 100) / 100,
      variance: Math.round((stmtTotal - bookBalance) * 100) / 100,
    };
  });
  const payments = await prisma.payment.findMany({
    include: { order: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const vendorPayments = await prisma.vendorPayment.findMany({
    include: { bill: { select: { number: true, vendor: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const matchedIds = new Set(
    (await prisma.bankStatementLine.findMany({ where: { paymentId: { not: null } } })).map((l) => l.paymentId)
  );
  res.json({
    banks,
    bookCashGL: Math.round(bookCash * 100) / 100,
    unmatchedPayments: payments.filter((p) => !matchedIds.has(p.id) && (p.method === "BANK" || p.method === "MPESA")),
    unmatchedVendorPayments: vendorPayments.filter((p) => p.method === "BANK" || p.method === "MPESA"),
  });
});

financeRouter.post("/banks/:id/lines", async (req, res) => {
  const line = await prisma.bankStatementLine.create({
    data: {
      bankAccountId: req.params.id,
      date: new Date(req.body.date || Date.now()),
      description: req.body.description,
      amount: Number(req.body.amount),
    },
  });
  await audit(req, { entity: "BankLine", entityId: line.id, action: "CREATE", newValue: line });
  res.status(201).json(line);
});

financeRouter.post("/banks/match", async (req, res) => {
  const line = await prisma.bankStatementLine.update({
    where: { id: req.body.lineId },
    data: { matched: true, paymentId: req.body.paymentId || null },
  });
  await audit(req, { entity: "BankLine", entityId: line.id, action: "MATCH", newValue: line });
  res.json(line);
});

financeRouter.get("/bills", async (_req, res) => {
  const bills = await prisma.vendorBill.findMany({
    include: {
      vendor: true,
      purchase: { select: { number: true } },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(bills.map((b) => ({ ...b, balance: Math.round((b.gross - b.paid) * 100) / 100 })));
});

financeRouter.post("/bills/:id/pay", async (req, res) => {
  const bill = await prisma.vendorBill.findUnique({ where: { id: req.params.id }, include: { payments: true } });
  if (!bill) return res.status(404).json({ error: "Vendor bill not found" });
  if (bill.status === "VOID") return res.status(400).json({ error: "Bill is void" });
  const amount = Number(req.body.amount);
  const method = String(req.body.method || "BANK");
  if (!amount || amount <= 0) return res.status(400).json({ error: "Amount required" });
  const due = bill.gross - bill.paid;
  if (amount > due + 0.01) return res.status(400).json({ error: "Cannot pay more than the balance" });
  const pay = await prisma.vendorPayment.create({
    data: { billId: bill.id, method, amount, reference: req.body.reference, userId: req.user!.id },
  });
  await postVendorPayment({ billId: bill.id, number: bill.number, method, amount, userId: req.user!.id });
  const paid = bill.paid + amount;
  const status = paid + 0.01 >= bill.gross ? "PAID" : "PARTIAL";
  const updated = await prisma.vendorBill.update({ where: { id: bill.id }, data: { paid, status } });
  await audit(req, { entity: "VendorPayment", entityId: pay.id, action: "CREATE", newValue: { bill: bill.number, amount } });
  res.status(201).json({ payment: pay, bill: { ...updated, balance: Math.round((updated.gross - updated.paid) * 100) / 100 } });
});

financeRouter.post("/banks/unmatch", async (req, res) => {
  const line = await prisma.bankStatementLine.update({
    where: { id: req.body.lineId },
    data: { matched: false, paymentId: null },
  });
  res.json(line);
});
