import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { hashPassword } from "../lib/auth.js";
import { cell, flag, num, parseCsv } from "../lib/csv.js";
import { moduleAccess } from "../middleware/auth.js";
import { ROLE_MODULES } from "../lib/access.js";

export const importRouter = Router();

const TEMPLATES: Record<string, string[]> = {
  customers: ["name", "phone", "email", "kraPin", "creditLimit", "paymentTerms", "notes"],
  parts: ["sku", "oemNumber", "name", "category", "binLocation", "cost", "salePrice", "reorderLevel", "critical", "qtyOnHand"],
  users: ["name", "email", "password", "role", "department", "phone", "monthlyTarget", "commissionRate", "salary"],
  vendors: ["name", "phone", "leadDays", "oem"],
};

type Result = { created: number; updated: number; skipped: number; errors: { row: number; error: string }[] };

function emptyResult(): Result {
  return { created: 0, updated: 0, skipped: 0, errors: [] };
}

function rowsFrom(req: { body: any }): Record<string, string>[] {
  if (Array.isArray(req.body?.rows)) return req.body.rows;
  if (typeof req.body?.csv === "string") return parseCsv(req.body.csv);
  return [];
}

importRouter.get("/:kind/template", (req, res) => {
  const headers = TEMPLATES[req.params.kind];
  if (!headers) return res.status(404).json({ error: "Unknown import type" });
  res.json({ kind: req.params.kind, headers, filename: `${req.params.kind}-template.csv` });
});

importRouter.post("/customers", moduleAccess("customers"), async (req, res) => {
  const rows = rowsFrom(req);
  if (!rows.length) return res.status(400).json({ error: "Upload a CSV with a header row" });
  const result = emptyResult();
  for (const [i, row] of rows.entries()) {
    const name = cell(row, "name", "customer", "customerName");
    if (!name) {
      result.errors.push({ row: i + 2, error: "Name required" });
      continue;
    }
    try {
      const phone = cell(row, "phone", "mobile") || null;
      const existing = await prisma.customer.findFirst({
        where: phone ? { OR: [{ name }, { phone }] } : { name },
      });
      const data = {
        name,
        phone,
        email: cell(row, "email") || null,
        kraPin: cell(row, "kraPin", "pin", "kra") || null,
        creditLimit: num(row, 0, "creditLimit", "credit"),
        paymentTerms: cell(row, "paymentTerms", "terms") || "COD",
        notes: cell(row, "notes") || null,
      };
      if (existing) {
        await prisma.customer.update({ where: { id: existing.id }, data });
        result.updated++;
      } else {
        const created = await prisma.customer.create({ data });
        await audit(req, { entity: "Customer", entityId: created.id, action: "IMPORT", newValue: { name } });
        result.created++;
      }
    } catch (err) {
      result.errors.push({ row: i + 2, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  res.json(result);
});

importRouter.post("/parts", moduleAccess("inventory"), async (req, res) => {
  const rows = rowsFrom(req);
  if (!rows.length) return res.status(400).json({ error: "Upload a CSV with a header row" });
  const result = emptyResult();
  const canQty = req.user!.role === "SUPER_ADMIN";
  for (const [i, row] of rows.entries()) {
    const sku = cell(row, "sku", "code").toUpperCase();
    const name = cell(row, "name", "part", "description");
    if (!sku || !name) {
      result.errors.push({ row: i + 2, error: "SKU and name required" });
      continue;
    }
    try {
      const existing = await prisma.part.findUnique({ where: { sku } });
      const qty = num(row, 0, "qtyOnHand", "qty", "quantity", "stock");
      const data = {
        oemNumber: cell(row, "oemNumber", "oem") || sku,
        name,
        category: cell(row, "category") || "General",
        binLocation: cell(row, "binLocation", "bin") || "UNASSIGNED",
        cost: num(row, 0, "cost"),
        salePrice: num(row, 0, "salePrice", "price"),
        reorderLevel: num(row, 2, "reorderLevel", "reorder"),
        critical: flag(row, "critical"),
      };
      if (existing) {
        await prisma.part.update({ where: { id: existing.id }, data });
        if (canQty && qty > 0 && existing.qtyOnHand === 0) {
          await prisma.part.update({ where: { id: existing.id }, data: { qtyOnHand: qty } });
          await prisma.stockMovement.create({
            data: { partId: existing.id, type: "OPENING", qty, reason: "Bulk import opening stock", userId: req.user!.id },
          });
        } else if (qty > 0 && !canQty) {
          result.errors.push({ row: i + 2, error: `${sku}: catalogue updated; only Super Admin can import opening qty` });
        }
        result.updated++;
      } else {
        const part = await prisma.part.create({
          data: { sku, ...data, qtyOnHand: canQty && qty > 0 ? qty : 0 },
        });
        if (canQty && qty > 0) {
          await prisma.stockMovement.create({
            data: { partId: part.id, type: "OPENING", qty, reason: "Bulk import opening stock", userId: req.user!.id },
          });
        } else if (qty > 0 && !canQty) {
          result.errors.push({ row: i + 2, error: `${sku}: created at qty 0; only Super Admin can import opening qty` });
        }
        await audit(req, { entity: "Part", entityId: part.id, action: "IMPORT", newValue: { sku } });
        result.created++;
      }
    } catch (err) {
      result.errors.push({ row: i + 2, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  res.json(result);
});

importRouter.post("/users", moduleAccess("hr", "staff"), async (req, res) => {
  const rows = rowsFrom(req);
  if (!rows.length) return res.status(400).json({ error: "Upload a CSV with a header row" });
  const result = emptyResult();
  const allowed = new Set(["SALES", "WAREHOUSE", "FINANCE", "ADMIN"]);
  for (const [i, row] of rows.entries()) {
    const name = cell(row, "name");
    const email = cell(row, "email").toLowerCase();
    if (!name || !email) {
      result.errors.push({ row: i + 2, error: "Name and email required" });
      continue;
    }
    const role = (cell(row, "role") || "SALES").toUpperCase().replace(" ", "_");
    if (!allowed.has(role)) {
      result.errors.push({ row: i + 2, error: `Role ${role} is not allowed on import` });
      continue;
    }
    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      const password = cell(row, "password") || "Mte@2026";
      const data = {
        name,
        phone: cell(row, "phone") || null,
        role,
        department: cell(row, "department") || "Operations",
        modules: JSON.stringify(ROLE_MODULES[role] || ROLE_MODULES.SALES),
        monthlyTarget: num(row, 0, "monthlyTarget", "target"),
        commissionRate: num(row, 0.03, "commissionRate", "commission"),
        salary: num(row, 0, "salary"),
      };
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            ...data,
            ...(cell(row, "password") ? { passwordHash: await hashPassword(password) } : {}),
          },
        });
        result.updated++;
      } else {
        const user = await prisma.user.create({
          data: { email, passwordHash: await hashPassword(password), ...data },
        });
        await audit(req, { entity: "User", entityId: user.id, action: "IMPORT", newValue: { email, role } });
        result.created++;
      }
    } catch (err) {
      result.errors.push({ row: i + 2, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  res.json(result);
});

importRouter.post("/vendors", moduleAccess("vendors"), async (req, res) => {
  const rows = rowsFrom(req);
  if (!rows.length) return res.status(400).json({ error: "Upload a CSV with a header row" });
  const result = emptyResult();
  for (const [i, row] of rows.entries()) {
    const name = cell(row, "name", "vendor");
    if (!name) {
      result.errors.push({ row: i + 2, error: "Name required" });
      continue;
    }
    try {
      const existing = await prisma.vendor.findFirst({ where: { name } });
      const data = {
        name,
        phone: cell(row, "phone") || null,
        leadDays: num(row, 7, "leadDays", "lead"),
        oem: flag(row, "oem"),
      };
      if (existing) {
        await prisma.vendor.update({ where: { id: existing.id }, data });
        result.updated++;
      } else {
        const vendor = await prisma.vendor.create({ data });
        await audit(req, { entity: "Vendor", entityId: vendor.id, action: "IMPORT", newValue: { name } });
        result.created++;
      }
    } catch (err) {
      result.errors.push({ row: i + 2, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  res.json(result);
});
