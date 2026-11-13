export type WarehouseTree = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  zones: {
    id: string;
    code: string;
    label: string;
    bins: { id: string; code: string; label?: string | null; _count?: { parts: number } }[];
  }[];
};

export type FlatWarehouseBin = {
  id: string;
  path: string;
  hint: string;
};

/** `MAIN-A-12-03` style paths for product stock location dropdowns. */
export function flattenWarehouseBins(sites: WarehouseTree[]): FlatWarehouseBin[] {
  const rows: FlatWarehouseBin[] = [];
  for (const site of sites) {
    for (const zone of site.zones) {
      for (const bin of zone.bins) {
        const path = `${site.code}-${zone.code}-${bin.code}`;
        const hint = [site.name, zone.label, bin.label].filter(Boolean).join(" · ");
        rows.push({ id: bin.id, path, hint });
      }
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
