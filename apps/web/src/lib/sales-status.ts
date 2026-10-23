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

/** Cancel from Sales before the order is out for delivery. */
export function canCancelOrder(status: string) {
  return ["DRAFT", "CONFIRMED", "PICKING", "PACKING", "PICKED"].includes(status);
}
