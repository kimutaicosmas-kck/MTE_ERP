/** Product master / CSV import-export column layout. */
export const PRODUCT_MASTER_HEADERS = [
  "Part No",
  "Description",
  "Qty",
  "Location",
  "Brand",
  "Category",
  "Unit Price",
  "Total Price",
] as const;

export const PRODUCT_MASTER_TEMPLATE_SAMPLE = [
  "9T7774",
  "Hydraulic pump barrel",
  "6",
  "MAIN-A-12-03",
  "CAT",
  "Hydraulics",
  "27400",
  "164400",
];

type PartRow = {
  sku: string;
  oemNumber: string;
  name: string;
  category: string;
  binLocation: string;
  qtyOnHand: number;
  salePrice: number;
  cost?: number;
  compat?: { machineBrand: string; machineModel: string }[];
};

export function productMasterUnitPrice(p: PartRow, useCost: boolean) {
  return useCost ? (p.cost ?? p.salePrice) : p.salePrice;
}

export function productMasterCsvRow(p: PartRow, useCost: boolean): string[] {
  const unit = productMasterUnitPrice(p, useCost);
  const qty = p.qtyOnHand;
  const total = Math.round(qty * unit);
  const brand = p.compat?.[0]?.machineBrand ?? "";
  return [
    p.oemNumber || p.sku,
    p.name,
    String(qty),
    p.binLocation || "—",
    brand,
    p.category || "—",
    String(Math.round(unit)),
    String(total),
  ];
}
