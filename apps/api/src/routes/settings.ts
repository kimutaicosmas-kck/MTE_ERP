import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { ensureCompany } from "../lib/sequence.js";
import { moduleAccess } from "../middleware/auth.js";
import { darajaStatus } from "../lib/daraja.js";

export const settingsRouter = Router();

function keepSecret(value: unknown) {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s || s.includes("•") || s === "********") return undefined;
  return s;
}

function publicSetting(setting: any, branches: unknown) {
  const { darajaConsumerKey, darajaConsumerSecret, darajaPasskey, darajaSecurityCredential, vapidPrivate, ...safe } = setting;
  return { ...safe, branches, daraja: darajaStatus(setting) };
}

settingsRouter.get("/", async (_req, res) => {
  const { setting } = await ensureCompany();
  const branches = await prisma.branch.findMany({ orderBy: { name: "asc" } });
  res.json(publicSetting(setting, branches));
});

settingsRouter.patch("/", moduleAccess("settings"), async (req, res) => {
  await ensureCompany();
  const next = await prisma.setting.update({
    where: { id: "default" },
    data: {
      companyName: req.body.companyName ?? undefined,
      legalName: req.body.legalName ?? undefined,
      address: req.body.address ?? undefined,
      phone: req.body.phone ?? undefined,
      email: req.body.email ?? undefined,
      kraPin: req.body.kraPin ?? undefined,
      vatRate: req.body.vatRate != null ? Number(req.body.vatRate) : undefined,
      currency: req.body.currency ?? undefined,
      invoicePrefix: req.body.invoicePrefix ?? undefined,
      mpesaPaybill: req.body.mpesaPaybill ?? undefined,
      mpesaAccount: req.body.mpesaAccount ?? undefined,
      darajaEnv: req.body.darajaEnv ?? undefined,
      darajaType: req.body.darajaType ?? undefined,
      darajaShortcode: req.body.darajaShortcode ?? undefined,
      darajaCallbackUrl: req.body.darajaCallbackUrl ?? undefined,
      darajaInitiator: req.body.darajaInitiator ?? undefined,
      darajaPartyB: req.body.darajaPartyB ?? undefined,
      darajaConsumerKey: keepSecret(req.body.darajaConsumerKey),
      darajaConsumerSecret: keepSecret(req.body.darajaConsumerSecret),
      darajaPasskey: keepSecret(req.body.darajaPasskey),
      darajaSecurityCredential: keepSecret(req.body.darajaSecurityCredential),
      defaultBranchId: req.body.defaultBranchId ?? undefined,
    },
  });
  if (next.darajaShortcode && !next.mpesaPaybill) {
    await prisma.setting.update({ where: { id: "default" }, data: { mpesaPaybill: next.darajaShortcode } });
  }
  await audit(req, { entity: "Setting", entityId: next.id, action: "UPDATE", newValue: { ...next, darajaConsumerSecret: undefined, darajaPasskey: undefined, darajaSecurityCredential: undefined } });
  const fresh = await prisma.setting.findUnique({ where: { id: "default" } });
  const branches = await prisma.branch.findMany({ orderBy: { name: "asc" } });
  res.json(publicSetting(fresh, branches));
});

settingsRouter.get("/branches", async (_req, res) => {
  await ensureCompany();
  res.json(await prisma.branch.findMany({ orderBy: { name: "asc" } }));
});

settingsRouter.post("/branches", moduleAccess("settings"), async (req, res) => {
  const code = String(req.body.code || "").toUpperCase();
  const name = String(req.body.name || "");
  if (!code || !name) return res.status(400).json({ error: "Code and name required" });
  const b = await prisma.branch.create({ data: { code, name, address: req.body.address } });
  await audit(req, { entity: "Branch", entityId: b.id, action: "CREATE", newValue: b });
  res.status(201).json(b);
});

settingsRouter.patch("/branches/:id", moduleAccess("settings"), async (req, res) => {
  const b = await prisma.branch.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name ?? undefined,
      address: req.body.address ?? undefined,
      active: typeof req.body.active === "boolean" ? req.body.active : undefined,
    },
  });
  res.json(b);
});
