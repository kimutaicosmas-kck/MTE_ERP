import { prisma } from "./prisma.js";

export function binFullPath(bin: {
  code: string;
  zone: { code: string; warehouse: { code: string } };
}) {
  return `${bin.zone.warehouse.code}-${bin.zone.code}-${bin.code}`;
}

const binInclude = {
  zone: { include: { warehouse: true } },
} as const;

export async function ensureDefaultWarehouse() {
  const site = await prisma.warehouseSite.upsert({
    where: { code: "MAIN" },
    update: {},
    create: { code: "MAIN", name: "Main store", address: "Nairobi, Kenya" },
  });
  const zoneCodes = ["A", "B", "C", "D", "E", "F", "G", "H"];
  for (const code of zoneCodes) {
    await prisma.warehouseZone.upsert({
      where: { warehouseId_code: { warehouseId: site.id, code } },
      update: {},
      create: { warehouseId: site.id, code, label: `Zone ${code}` },
    });
  }
  return site;
}

/** Link legacy `binLocation` strings (e.g. A-01-01) to warehouse bins. */
export async function syncLegacyPartBins() {
  await ensureDefaultWarehouse();
  const site = await prisma.warehouseSite.findUnique({
    where: { code: "MAIN" },
    include: { zones: { include: { bins: true } } },
  });
  if (!site) return;
  const parts = await prisma.part.findMany({ where: { warehouseBinId: null } });
  for (const part of parts) {
    const raw = part.binLocation?.trim();
    if (!raw) continue;
    const m = raw.match(/^([A-Za-z])[-/](\d{2})[-/](\d{2})$/);
    if (!m) continue;
    const [, zCode, row, col] = m;
    const zone = site.zones.find((z) => z.code.toUpperCase() === zCode.toUpperCase());
    if (!zone) continue;
    const binCode = `${row}-${col}`;
    let bin = zone.bins.find((b) => b.code === binCode);
    if (!bin) {
      bin = await prisma.warehouseBin.create({
        data: { zoneId: zone.id, code: binCode, label: `R${row} C${col}` },
      });
    }
    const full = `${site.code}-${zone.code}-${bin.code}`;
    await prisma.part.update({
      where: { id: part.id },
      data: { warehouseBinId: bin.id, binLocation: full },
    });
  }
}

export async function loadWarehousesTree() {
  await syncLegacyPartBins();
  return prisma.warehouseSite.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    include: {
      zones: {
        orderBy: { code: "asc" },
        include: {
          bins: {
            orderBy: { code: "asc" },
            include: { _count: { select: { parts: true } } },
          },
        },
      },
    },
  });
}

export async function resolveBinId(binId: string | undefined) {
  if (!binId) return null;
  const bin = await prisma.warehouseBin.findUnique({ where: { id: binId }, include: binInclude });
  if (!bin) return null;
  return { id: bin.id, binLocation: binFullPath(bin) };
}
