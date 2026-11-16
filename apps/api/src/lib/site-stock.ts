import { prisma } from "./prisma.js";
import { ensureDefaultWarehouse } from "./warehouse.js";

const siteStockInclude = {
  warehouseSite: { select: { id: true, code: true, name: true } },
} as const;

export function storeCodeFromBinPath(binPath: string) {
  const raw = binPath.trim();
  if (!raw) return "";
  const i = raw.indexOf("-");
  return (i > 0 ? raw.slice(0, i) : raw).toUpperCase();
}

export async function defaultWarehouseSiteId() {
  await ensureDefaultWarehouse();
  const main = await prisma.warehouseSite.findUnique({ where: { code: "MAIN" } });
  if (!main) throw new Error("Default store (MAIN) is not configured");
  return main.id;
}

export async function resolveWarehouseSiteIdFromBinPath(binPath: string) {
  const code = storeCodeFromBinPath(binPath);
  if (!code) return defaultWarehouseSiteId();
  const site = await prisma.warehouseSite.findUnique({ where: { code } });
  return site?.id || defaultWarehouseSiteId();
}

/** One-time / startup: put existing part totals on MAIN when per-store rows are missing. */
export async function backfillPartSiteStock() {
  await ensureDefaultWarehouse();
  const mainId = await defaultWarehouseSiteId();
  const parts = await prisma.part.findMany({ include: { siteStocks: true } });
  for (const part of parts) {
    const mainRow = part.siteStocks.find((s) => s.warehouseSiteId === mainId);
    if (!mainRow) {
      await prisma.partSiteStock.create({
        data: {
          partId: part.id,
          warehouseSiteId: mainId,
          qtyOnHand: part.qtyOnHand,
          binLocation: part.binLocation || "",
          warehouseBinId: part.warehouseBinId,
        },
      });
      continue;
    }
    const otherSum = part.siteStocks
      .filter((s) => s.warehouseSiteId !== mainId)
      .reduce((sum, s) => sum + s.qtyOnHand, 0);
    const totalFromSites = part.siteStocks.reduce((sum, s) => sum + s.qtyOnHand, 0);
    if (otherSum === 0 && totalFromSites !== part.qtyOnHand && part.qtyOnHand > 0) {
      await prisma.partSiteStock.update({
        where: { id: mainRow.id },
        data: {
          qtyOnHand: part.qtyOnHand,
          binLocation: part.binLocation || mainRow.binLocation,
          warehouseBinId: part.warehouseBinId ?? mainRow.warehouseBinId,
        },
      });
    }
  }
}

export async function syncPartTotalFromSites(partId: string) {
  const rows = await prisma.partSiteStock.findMany({ where: { partId } });
  const total = rows.reduce((s, r) => s + r.qtyOnHand, 0);
  const rounded = Math.round(total * 1000) / 1000;
  await prisma.part.update({ where: { id: partId }, data: { qtyOnHand: rounded } });
  return rounded;
}

export async function getSiteQty(partId: string, warehouseSiteId: string) {
  const row = await prisma.partSiteStock.findUnique({
    where: { partId_warehouseSiteId: { partId, warehouseSiteId } },
  });
  return row?.qtyOnHand ?? 0;
}

/**
 * Legacy parts may show company qtyOnHand while partSiteStock at the sale store is zero.
 * Attribute unattributed stock to the selling store before confirm/reserve.
 */
export async function ensurePartStockAtSite(partId: string, warehouseSiteId: string) {
  const part = await prisma.part.findUnique({
    where: { id: partId },
    include: { siteStocks: true },
  });
  if (!part) return 0;
  const atSite = await getSiteQty(partId, warehouseSiteId);
  if (atSite > 0.0001) return atSite;
  const otherSum = part.siteStocks
    .filter((s) => s.warehouseSiteId !== warehouseSiteId)
    .reduce((sum, s) => sum + s.qtyOnHand, 0);
  if (otherSum === 0 && part.qtyOnHand > 0.0001) {
    await prisma.partSiteStock.upsert({
      where: { partId_warehouseSiteId: { partId, warehouseSiteId } },
      create: {
        partId,
        warehouseSiteId,
        qtyOnHand: part.qtyOnHand,
        binLocation: part.binLocation || "",
        warehouseBinId: part.warehouseBinId,
      },
      update: {
        qtyOnHand: part.qtyOnHand,
        binLocation: part.binLocation || undefined,
        warehouseBinId: part.warehouseBinId ?? undefined,
      },
    });
    return part.qtyOnHand;
  }
  return atSite;
}

export async function saleSiteIdForLine(orderNotes: string | null | undefined, pickLocation?: string | null) {
  const pick = pickLocation?.trim();
  if (pick) return resolveWarehouseSiteIdFromBinPath(pick);
  return saleWarehouseSiteIdForOrder(orderNotes);
}

type SiteStockOpts = {
  binLocation?: string;
  warehouseBinId?: string | null;
};

export async function adjustSiteQty(
  partId: string,
  warehouseSiteId: string,
  delta: number,
  opts?: SiteStockOpts,
) {
  if (!delta) return getSiteQty(partId, warehouseSiteId);
  const existing = await prisma.partSiteStock.findUnique({
    where: { partId_warehouseSiteId: { partId, warehouseSiteId } },
  });
  const nextQty = (existing?.qtyOnHand ?? 0) + delta;
  if (nextQty < -0.0001) {
    throw Object.assign(new Error("Insufficient stock at this store"), { status: 400 });
  }
  const safeQty = Math.max(0, Math.round(nextQty * 1000) / 1000);
  await prisma.partSiteStock.upsert({
    where: { partId_warehouseSiteId: { partId, warehouseSiteId } },
    create: {
      partId,
      warehouseSiteId,
      qtyOnHand: safeQty,
      binLocation: opts?.binLocation || "",
      warehouseBinId: opts?.warehouseBinId ?? null,
    },
    update: {
      qtyOnHand: safeQty,
      ...(opts?.binLocation !== undefined ? { binLocation: opts.binLocation } : {}),
      ...(opts?.warehouseBinId !== undefined ? { warehouseBinId: opts.warehouseBinId } : {}),
    },
  });
  await syncPartTotalFromSites(partId);
  return safeQty;
}

export async function transferBetweenSites(input: {
  partId: string;
  fromWarehouseSiteId: string;
  toWarehouseSiteId: string;
  qty: number;
  toBinLocation?: string;
  toWarehouseBinId?: string | null;
  userId?: string | null;
}) {
  const qty = Number(input.qty);
  if (!qty || qty <= 0) throw Object.assign(new Error("Transfer quantity must be positive"), { status: 400 });
  if (input.fromWarehouseSiteId === input.toWarehouseSiteId) {
    throw Object.assign(new Error("Choose a different destination store"), { status: 400 });
  }
  const [fromSite, toSite] = await Promise.all([
    prisma.warehouseSite.findUnique({ where: { id: input.fromWarehouseSiteId } }),
    prisma.warehouseSite.findUnique({ where: { id: input.toWarehouseSiteId } }),
  ]);
  if (!fromSite || !toSite) throw Object.assign(new Error("Store not found"), { status: 400 });

  const fromQty = await getSiteQty(input.partId, input.fromWarehouseSiteId);
  if (fromQty < qty) {
    throw Object.assign(new Error(`Only ${fromQty} available at ${fromSite.name}`), { status: 400 });
  }

  await prisma.$transaction(async () => {
    await adjustSiteQty(input.partId, input.fromWarehouseSiteId, -qty);
    await adjustSiteQty(input.partId, input.toWarehouseSiteId, qty, {
      binLocation: input.toBinLocation,
      warehouseBinId: input.toWarehouseBinId,
    });
    const part = await prisma.part.findUnique({ where: { id: input.partId } });
    if (part && input.toBinLocation) {
      await prisma.part.update({
        where: { id: input.partId },
        data: {
          binLocation: input.toBinLocation,
          warehouseBinId: input.toWarehouseBinId ?? part.warehouseBinId,
        },
      });
    }
    await prisma.stockMovement.create({
      data: {
        partId: input.partId,
        type: "TRANSFER",
        qty,
        reference: `${fromSite.code}→${toSite.code}`,
        reason: `Moved ${qty} from ${fromSite.name} to ${toSite.name}`,
        userId: input.userId ?? undefined,
      },
    });
  });

  return syncPartTotalFromSites(input.partId);
}

export async function saleWarehouseSiteIdForOrder(notes?: string | null) {
  const { unpackDocStyle } = await import("./doc-style.js");
  const style = unpackDocStyle(notes);
  if (style.saleWarehouseSiteId) {
    const row = await prisma.warehouseSite.findUnique({ where: { id: style.saleWarehouseSiteId } });
    if (row) return row.id;
  }
  if (style.saleLocation) {
    const sites = await prisma.warehouseSite.findMany({ where: { active: true } });
    const loc = style.saleLocation.toLowerCase();
    const match = sites.find((s) => loc.includes(s.name.toLowerCase()) || loc.includes(s.code.toLowerCase()));
    if (match) return match.id;
  }
  return defaultWarehouseSiteId();
}

export async function patchSiteBinForPart(
  partId: string,
  binLocation: string,
  warehouseBinId?: string | null,
) {
  const siteId = await resolveWarehouseSiteIdFromBinPath(binLocation);
  await prisma.partSiteStock.upsert({
    where: { partId_warehouseSiteId: { partId, warehouseSiteId: siteId } },
    create: {
      partId,
      warehouseSiteId: siteId,
      qtyOnHand: 0,
      binLocation,
      warehouseBinId: warehouseBinId ?? null,
    },
    update: { binLocation, warehouseBinId: warehouseBinId ?? null },
  });
}

export function partSiteStockInclude() {
  return { siteStocks: { include: siteStockInclude } };
}