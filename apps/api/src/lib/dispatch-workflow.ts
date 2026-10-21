/** Enterprise dispatch lifecycle: Quotation → SO → Pick → Pack → QC → Dispatch → Transit → Deliver */

export const DISPATCH_QUEUE = [
  "CONFIRMED",
  "PICKING",
  "PACKING",
  "PICKED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "PARTIAL_DELIVERED",
  "RETURNED",
  "FAILED",
  "DELAYED",
  "CANCELLED",
] as const;

export type DispatchStatus = (typeof DISPATCH_QUEUE)[number];

export const DISPATCH_TRANSITIONS: Record<string, string[]> = {
  CONFIRMED: ["PICKING", "CANCELLED"],
  PICKING: ["PACKING", "PICKED", "CONFIRMED", "CANCELLED"],
  PACKING: ["PICKED", "PICKING", "CANCELLED"],
  PICKED: ["DISPATCHED", "PACKING", "CANCELLED"],
  DISPATCHED: ["IN_TRANSIT", "DELIVERED", "FAILED", "DELAYED"],
  IN_TRANSIT: ["DELIVERED", "FAILED", "DELAYED"],
  DELIVERED: ["RETURNED", "PARTIAL_DELIVERED"],
  PARTIAL_DELIVERED: ["RETURNED"],
  FAILED: ["PICKING", "CANCELLED"],
  DELAYED: ["IN_TRANSIT", "DELIVERED", "FAILED"],
  RETURNED: [],
  CANCELLED: [],
};

export const DISPATCH_LABELS: Record<string, string> = {
  CONFIRMED: "Waiting to pick",
  PICKING: "Picking",
  PACKING: "Packing",
  PICKED: "Ready to dispatch",
  DISPATCHED: "Dispatched",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
  PARTIAL_DELIVERED: "Partially delivered",
  RETURNED: "Returned",
  FAILED: "Failed delivery",
  DELAYED: "Delayed",
  CANCELLED: "Cancelled",
};

export const DISPATCH_NEXT: Record<string, { status: string; label: string; success?: boolean } | undefined> = {
  CONFIRMED: { status: "PICKING", label: "Start picking" },
  PICKING: { status: "PACKING", label: "Complete picking → Pack" },
  PACKING: { status: "PICKED", label: "Pass QC → Ready to dispatch" },
  PICKED: { status: "DISPATCHED", label: "Mark dispatched" },
  DISPATCHED: { status: "IN_TRANSIT", label: "Mark in transit" },
  IN_TRANSIT: { status: "DELIVERED", label: "Confirm delivery", success: true },
  DELAYED: { status: "IN_TRANSIT", label: "Resume transit" },
  FAILED: { status: "PICKING", label: "Re-pick & retry" },
};

export function canDispatchTransition(from: string, to: string) {
  if (from === to) return true;
  const allowed = DISPATCH_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function isDispatchStep(status: string) {
  return DISPATCH_QUEUE.includes(status as DispatchStatus);
}

export const DISPATCH_METHODS = ["SHOP_COLLECT", "COURIER", "COMPANY_VEHICLE", "THIRD_PARTY"] as const;

export const DISPATCH_PRIORITIES = ["NORMAL", "URGENT", "CRITICAL"] as const;
