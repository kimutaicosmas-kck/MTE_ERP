import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { buildOrderPdf, documentSlug } from "../lib/pdf.js";
import { ensureCompany, formatSaleNumber } from "../lib/sequence.js";
import { orderIdFromShareToken, unpackDocStyle } from "../lib/doc-style.js";
import { orderMoneyTotals } from "../lib/vat-totals.js";

export const publicShareRouter = Router();

function totals(order: { vatRate: number; lines: { qty: number; salePrice: number }[]; payments: { amount: number }[] }) {
  return orderMoneyTotals(order);
}

async function loadShared(token: string) {
  const id = orderIdFromShareToken(token);
  if (!id) return null;
  return prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      salesperson: { select: { name: true } },
      lines: { include: { part: true } },
      payments: true,
      invoice: true,
    },
  });
}

publicShareRouter.get("/:token", async (req, res) => {
  const order = await loadShared(req.params.token);
  if (!order) return res.status(404).json({ error: "This document link is not valid" });
  const { setting } = await ensureCompany();
  const style = unpackDocStyle(order.notes);
  const t = totals(order);
  res.json({
    kind: order.status === "DRAFT" ? "quotation" : "sales-order",
    number: formatSaleNumber(order.number, order.createdAt),
    status: order.status,
    createdAt: order.createdAt,
    customer: { name: order.customer.name, phone: order.customer.phone },
    salesperson: order.salesperson,
    theme: style.theme,
    intro: style.intro,
    validDays: style.validDays,
    dispatchMethod: order.dispatchMethod,
    lpo: order.lpo,
    vatRate: order.vatRate,
    lines: order.lines.map((l) => ({
      sku: l.part.sku,
      name: l.part.name,
      qty: l.qty,
      price: l.salePrice,
    })),
    totals: t,
    company: {
      name: setting.companyName,
      legalName: setting.legalName,
      phone: setting.phone,
      email: setting.email,
      address: setting.address,
      mpesaPaybill: setting.mpesaPaybill,
      mpesaAccount: setting.mpesaAccount,
    },
  });
});

publicShareRouter.get("/:token/pdf", async (req, res) => {
  const order = await loadShared(req.params.token);
  if (!order) return res.status(404).json({ error: "This document link is not valid" });
  const { setting } = await ensureCompany();
  const style = unpackDocStyle(order.notes);
  const t = totals(order);
  const orderNo = formatSaleNumber(order.number, order.createdAt);
  const buf = await buildOrderPdf({
    kind: "order",
    number: orderNo,
    orderNumber: orderNo,
    lpo: order.lpo,
    status: order.status,
    channel: order.channel,
    createdAt: order.createdAt,
    dispatchMethod: order.dispatchMethod,
    notes: style.intro || style.notes,
    vatRate: order.vatRate,
    theme: style.theme,
    validDays: style.validDays,
    customer: order.customer,
    salesperson: order.salesperson,
    company: {
      name: setting.companyName,
      legalName: setting.legalName,
      phone: setting.phone,
      email: setting.email,
      address: setting.address,
      mpesaPaybill: setting.mpesaPaybill,
      mpesaAccount: setting.mpesaAccount,
    },
    lines: order.lines.map((line) => ({
      sku: line.part.sku,
      name: line.part.name,
      bin: line.part.binLocation,
      qty: line.qty,
      price: line.salePrice,
    })),
    totals: t,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${orderNo}-${documentSlug(kind, order.status)}.pdf"`);
  res.send(buf);
});
