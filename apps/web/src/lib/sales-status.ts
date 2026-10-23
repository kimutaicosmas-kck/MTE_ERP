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

export function canConfirmOrder(status: string) {
  return status === "DRAFT";
}

/** Cancel from list: quotations and in-dispatch only (not after confirm). */
export function canCancelOrder(status: string) {
  return status === "DRAFT" || ["PICKING", "PACKING", "PICKED"].includes(status);
}
