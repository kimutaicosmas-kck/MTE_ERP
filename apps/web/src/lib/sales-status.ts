export const SALES_LABEL: Record<string, string> = {
  DRAFT: "Quotation",
  CONFIRMED: "Confirmed",
  PICKING: "In dispatch",
  PICKED: "In dispatch",
  DISPATCHED: "In dispatch",
  DELIVERED: "Completed",
  PAID: "Completed",
  CANCELLED: "Cancelled",
};

export function salesStatusLabel(status: string) {
  return SALES_LABEL[status] || status;
}
