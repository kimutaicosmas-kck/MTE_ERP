import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { canModule } from "../lib/access.js";
import { moduleAccess } from "../middleware/auth.js";
import {
  b2cPayout,
  darajaStatus,
  loadDarajaConfig,
  normalizeMsisdn,
  queryBalance,
  queryTransaction,
  registerC2B,
  resultParams,
  reversePayment,
  simulateC2B,
  stkAccountRef,
  stkItems,
  stkPush,
  stkQuery,
  testDaraja,
} from "../lib/daraja.js";
import { allocateUnmatched, applyMpesaReceipt, findInvoiceByRef } from "../lib/mpesa-apply.js";
import { limit } from "../middleware/rateLimit.js";

export const mpesaPublicRouter = Router();
export const mpesaRouter = Router();

function canCollect(user: { role: string; modules?: string | null }) {
  return canModule(user, "finance") || canModule(user, "sales");
}

mpesaPublicRouter.post("/stk", async (req, res) => {
  const parsed = stkItems(req.body);
  await prisma.webhookInbox.create({ data: { source: "daraja-stk", payload: JSON.stringify(req.body ?? {}) } });
  const txn = parsed.checkoutRequest
    ? await prisma.mpesaTxn.findFirst({ where: { checkoutRequest: parsed.checkoutRequest } })
    : null;
  if (parsed.resultCode !== "0") {
    if (txn) {
      await prisma.mpesaTxn.update({
        where: { id: txn.id },
        data: {
          status: parsed.resultCode === "1032" ? "CANCELLED" : "FAILED",
          resultCode: parsed.resultCode,
          resultDesc: parsed.resultDesc,
          rawCallback: JSON.stringify(req.body ?? {}),
        },
      });
    }
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
  await applyMpesaReceipt({
    receipt: parsed.receipt,
    amount: parsed.amount,
    phone: parsed.phone,
    invoiceId: txn?.invoiceId,
    orderId: txn?.orderId,
    accountRef: txn?.accountRef,
    txnId: txn?.id,
    raw: req.body,
  });
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

mpesaPublicRouter.post("/c2b/validation", async (req, res) => {
  await prisma.webhookInbox.create({ data: { source: "daraja-c2b-validate", payload: JSON.stringify(req.body ?? {}) } });
  res.json({ ResultCode: "0", ResultDesc: "Accepted" });
});

mpesaPublicRouter.post("/c2b/confirmation", async (req, res) => {
  await prisma.webhookInbox.create({ data: { source: "daraja-c2b", payload: JSON.stringify(req.body ?? {}) } });
  const receipt = String(req.body?.TransID || "");
  const amount = Number(req.body?.TransAmount || 0);
  const accountRef = String(req.body?.BillRefNumber || req.body?.InvoiceNumber || "");
  const phone = String(req.body?.MSISDN || "");
  let txn = receipt ? await prisma.mpesaTxn.findFirst({ where: { receipt } }) : null;
  if (!txn) {
    txn = await prisma.mpesaTxn.create({
      data: {
        kind: "C2B",
        status: "PENDING",
        phone,
        amount,
        accountRef,
        receipt,
        rawCallback: JSON.stringify(req.body ?? {}),
      },
    });
  }
  await applyMpesaReceipt({
    receipt,
    amount,
    phone,
    accountRef,
    txnId: txn.id,
    raw: req.body,
  });
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

mpesaPublicRouter.post("/timeout", async (req, res) => {
  await prisma.webhookInbox.create({ data: { source: "daraja-timeout", payload: JSON.stringify(req.body ?? {}) } });
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

mpesaPublicRouter.post("/result", async (req, res) => {
  await prisma.webhookInbox.create({ data: { source: "daraja-result", payload: JSON.stringify(req.body ?? {}) } });
  const parsed = resultParams(req.body);
  const txn = parsed.conversationId
    ? await prisma.mpesaTxn.findFirst({ where: { conversationId: parsed.conversationId } })
    : parsed.originatorConv
      ? await prisma.mpesaTxn.findFirst({ where: { originatorConv: parsed.originatorConv } })
      : null;
  if (txn) {
    const ok = parsed.resultCode === "0";
    await prisma.mpesaTxn.update({
      where: { id: txn.id },
      data: {
        status: ok ? "SUCCESS" : "FAILED",
        resultCode: parsed.resultCode,
        resultDesc: parsed.resultDesc || parsed.balance,
        receipt: parsed.receipt || parsed.transId || txn.receipt,
        rawCallback: JSON.stringify(req.body ?? {}),
      },
    });
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

mpesaRouter.get("/status", async (_req, res) => {
  const setting = await prisma.setting.findUnique({ where: { id: "default" } });
  res.json(darajaStatus(setting || {}));
});

mpesaRouter.post("/test", moduleAccess("settings", "finance"), async (_req, res) => {
  res.json(await testDaraja());
});

mpesaRouter.get("/transactions", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { role: true, modules: true } });
  if (!user || !canCollect(user)) {
    return res.status(403).json({ error: "You do not have access to this module" });
  }
  res.json(
    await prisma.mpesaTxn.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  );
});

mpesaRouter.get("/transactions/:id", async (req, res) => {
  const row = await prisma.mpesaTxn.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: "Transaction not found" });
  res.json(row);
});

mpesaRouter.post("/stk", limit("stk"), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { role: true, modules: true } });
  if (!user || !canCollect(user)) {
    return res.status(403).json({ error: "You do not have access to this module" });
  }
  const invoice = req.body.invoiceId
    ? await prisma.invoice.findUnique({ where: { id: req.body.invoiceId }, include: { customer: true, order: { include: { payments: true, lines: true } } } })
    : req.body.orderId
      ? await prisma.invoice.findUnique({ where: { orderId: req.body.orderId }, include: { customer: true, order: { include: { payments: true, lines: true } } } })
      : req.body.accountRef
        ? await findInvoiceByRef(req.body.accountRef)
        : null;
  if (!invoice) return res.status(404).json({ error: "Invoice not found. Confirm the sale first." });
  const phone = String(req.body.phone || invoice.customer.phone || "");
  const paid = invoice.order.payments.reduce((s, p) => s + p.amount, 0);
  const gross = invoice.order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0) * (1 + invoice.vatRate);
  const balance = Math.max(0, Math.round((gross - paid) * 100) / 100);
  const amount = Number(req.body.amount || balance);
  if (amount <= 0) return res.status(400).json({ error: "This invoice is already paid" });
  const accountRef = stkAccountRef(invoice.number);
  const pushed = await stkPush({
    phone,
    amount,
    accountRef,
    description: invoice.number.replace(/^INV-/, "").slice(0, 13),
  });
  const txn = await prisma.mpesaTxn.create({
    data: {
      kind: "STK",
      status: "PENDING",
      phone: pushed.phone,
      amount: pushed.amount,
      invoiceId: invoice.id,
      orderId: invoice.orderId,
      accountRef,
      description: invoice.number,
      merchantRequest: pushed.MerchantRequestID,
      checkoutRequest: pushed.CheckoutRequestID,
      rawRequest: JSON.stringify(pushed.request || {}),
      userId: req.user!.id,
    },
  });
  res.status(201).json({
    id: txn.id,
    checkoutRequest: txn.checkoutRequest,
    merchantRequest: txn.merchantRequest,
    phone: txn.phone,
    amount: txn.amount,
    invoice: invoice.number,
    message: `Prompt sent to ${txn.phone}. Ask the customer to enter their M-Pesa PIN.`,
  });
});

mpesaRouter.post("/stk/:id/query", async (req, res) => {
  const txn = await prisma.mpesaTxn.findUnique({ where: { id: req.params.id } });
  if (!txn?.checkoutRequest) return res.status(404).json({ error: "STK request not found" });
  const data = await stkQuery(txn.checkoutRequest);
  const code = String(data.ResultCode ?? "");
  if (code === "0" && txn.receipt) {
    await applyMpesaReceipt({
      receipt: txn.receipt,
      amount: txn.amount,
      phone: txn.phone || undefined,
      invoiceId: txn.invoiceId,
      orderId: txn.orderId,
      accountRef: txn.accountRef || undefined,
      txnId: txn.id,
    });
  } else if (code && code !== "0" && txn.status === "PENDING") {
    await prisma.mpesaTxn.update({
      where: { id: txn.id },
      data: { resultCode: code, resultDesc: data.ResultDesc, status: code === "1032" ? "CANCELLED" : "FAILED" },
    });
  }
  res.json({ ...data, txn: await prisma.mpesaTxn.findUnique({ where: { id: txn.id } }) });
});

mpesaRouter.post("/register-c2b", moduleAccess("settings", "finance"), async (_req, res) => {
  res.json(await registerC2B());
});

mpesaRouter.post("/simulate", moduleAccess("settings", "finance"), async (req, res) => {
  const invoice = req.body.invoiceId
    ? await prisma.invoice.findUnique({ where: { id: req.body.invoiceId } })
    : null;
  const billRef = String(req.body.billRef || (invoice ? stkAccountRef(invoice.number) : ""));
  const data = await simulateC2B({
    amount: Number(req.body.amount),
    phone: String(req.body.phone),
    billRef,
  });
  res.json(data);
});

mpesaRouter.post("/status-query", moduleAccess("finance"), async (req, res) => {
  const transId = String(req.body.transId || "");
  if (!transId) return res.status(400).json({ error: "M-Pesa receipt / transaction ID required" });
  const data = await queryTransaction(transId);
  const txn = await prisma.mpesaTxn.create({
    data: {
      kind: "STATUS",
      status: "PENDING",
      receipt: transId,
      conversationId: data.ConversationID,
      originatorConv: data.OriginatorConversationID,
      rawRequest: JSON.stringify(req.body || {}),
      userId: req.user!.id,
    },
  });
  res.json({ ...data, id: txn.id });
});

mpesaRouter.post("/balance", moduleAccess("finance"), async (req, res) => {
  const data = await queryBalance();
  const txn = await prisma.mpesaTxn.create({
    data: {
      kind: "BALANCE",
      status: "PENDING",
      conversationId: data.ConversationID,
      originatorConv: data.OriginatorConversationID,
      userId: req.user!.id,
    },
  });
  res.json({ ...data, id: txn.id, message: "Balance request sent. The result arrives on the callback shortly." });
});

mpesaRouter.post("/reverse", moduleAccess("finance"), async (req, res) => {
  const transId = String(req.body.transId || "");
  const amount = Number(req.body.amount);
  if (!transId || !amount) return res.status(400).json({ error: "Receipt and amount required" });
  const data = await reversePayment({ transId, amount, remarks: req.body.remarks });
  const txn = await prisma.mpesaTxn.create({
    data: {
      kind: "REVERSAL",
      status: "PENDING",
      receipt: transId,
      amount,
      conversationId: data.ConversationID,
      originatorConv: data.OriginatorConversationID,
      userId: req.user!.id,
    },
  });
  res.json({ ...data, id: txn.id });
});

mpesaRouter.post("/b2c", moduleAccess("finance"), async (req, res) => {
  const phone = normalizeMsisdn(String(req.body.phone || ""));
  const amount = Number(req.body.amount);
  if (!phone || !amount) return res.status(400).json({ error: "Phone and amount required" });
  const data = await b2cPayout({
    phone,
    amount,
    remarks: req.body.remarks,
    occasion: req.body.occasion,
    command: req.body.command,
  });
  const txn = await prisma.mpesaTxn.create({
    data: {
      kind: "B2C",
      status: "PENDING",
      phone,
      amount,
      description: req.body.remarks,
      conversationId: data.ConversationID,
      originatorConv: data.OriginatorConversationID,
      userId: req.user!.id,
    },
  });
  res.json({ ...data, id: txn.id, message: `Payout of KES ${amount} sent to ${phone}` });
});

mpesaRouter.post("/transactions/:id/allocate", moduleAccess("finance"), async (req, res) => {
  const result = await allocateUnmatched(req.params.id, String(req.body.invoiceId), req.user!.id);
  if (!result.ok) return res.status(400).json({ error: result.reason === "unmatched" ? "Invoice not found" : "Could not allocate" });
  res.json(result);
});

mpesaRouter.get("/ready-check", async (_req, res) => {
  try {
    const cfg = await loadDarajaConfig();
    res.json({ ok: true, env: cfg.env, shortcode: cfg.shortcode });
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : "Daraja is not configured" });
  }
});
