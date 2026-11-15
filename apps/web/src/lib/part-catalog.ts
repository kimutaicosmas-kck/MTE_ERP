/** Catalogue helpers — same description, different part numbers; per-store qty in siteStocks. */

export type PartSiteStockRow = {
  warehouseSiteId: string;
  qtyOnHand: number;
  binLocation?: string;
  warehouseSite?: { code: string; name: string };
};

export type PartWithSites = PartLike & { siteStocks?: PartSiteStockRow[] };

export type PartLike = {
  id?: string;
  sku: string;
  oemNumber: string;
  name: string;
  qtyOnHand?: number;
  binLocation?: string;
  category?: string;
};

export function partNumber(p: PartLike) {
  return (p.oemNumber || p.sku).trim();
}

/** Primary line in dropdowns: part number first so duplicates by name stay distinct. */
export function partSelectLabel(p: PartLike) {
  return `${partNumber(p)} — ${p.name}`;
}

export function qtyAtStore(part: PartWithSites, warehouseSiteId?: string) {
  if (!warehouseSiteId || !part.siteStocks?.length) return null;
  const row = part.siteStocks.find((s) => s.warehouseSiteId === warehouseSiteId);
  return row?.qtyOnHand ?? 0;
}

export function partSelectHint(p: PartWithSites, warehouseSiteId?: string, storeCode?: string) {
  const bits: string[] = [];
  const atStore = warehouseSiteId ? qtyAtStore(p, warehouseSiteId) : null;
  if (atStore != null) bits.push(`${atStore} at this store`);
  if (p.qtyOnHand != null) bits.push(`${p.qtyOnHand} company total`);
  if (p.binLocation) {
    const at = storeCode && !binBelongsToStore(p.binLocation, storeCode)
      ? `${p.binLocation} (other store)`
      : p.binLocation;
    bits.push(`Bin ${at}`);
  }
  if (p.sku && p.sku.toUpperCase() !== partNumber(p).toUpperCase()) bits.push(p.sku);
  if (p.category) bits.push(p.category);
  return bits.join(" · ");
}

export function binBelongsToStore(binPath: string, storeCode: string) {
  const code = storeCodeFromBinPath(binPath);
  return code !== "" && code === storeCode.trim().toUpperCase();
}

export function storeCodeFromBinPath(binPath: string) {
  const raw = binPath.trim();
  if (!raw) return "";
  const i = raw.indexOf("-");
  return (i > 0 ? raw.slice(0, i) : raw).toUpperCase();
}

/** Default pick bin when adding a line: use catalogue bin only if it is in the selected store. */
export function defaultPickLocation(
  part: Pick<PartLike, "binLocation"> | undefined,
  storeCode: string,
  siteBinPaths: string[],
) {
  const loc = part?.binLocation?.trim() || "";
  if (loc && storeCode && binBelongsToStore(loc, storeCode)) return loc;
  if (loc && !storeCode) return loc;
  if (siteBinPaths.length === 1) return siteBinPaths[0];
  return "";
}