/** Plain-language labels shown in lists and job screens. */
export const DISPATCH_LABEL: Record<string, string> = {
  CONFIRMED: "To pick",
  PICKING: "Picking",
  PACKING: "Picking",
  PICKED: "Ready to ship",
  DISPATCHED: "On the way",
  IN_TRANSIT: "On the way",
  DELIVERED: "Delivered",
  PARTIAL_DELIVERED: "Partly delivered",
  RETURNED: "Returned",
  FAILED: "Problem",
  DELAYED: "Late",
  CANCELLED: "Cancelled",
};

/** One clear action per stage — backend may still use finer statuses internally. */
export const DISPATCH_NEXT: Record<string, { status: string; label: string; success?: boolean } | undefined> = {
  CONFIRMED: { status: "PICKED", label: "Mark ready to ship" },
  PICKING: { status: "PICKED", label: "Mark ready to ship" },
  PACKING: { status: "PICKED", label: "Mark ready to ship" },
  PICKED: { status: "DISPATCHED", label: "Mark as shipped" },
  DISPATCHED: { status: "DELIVERED", label: "Confirm delivery", success: true },
  IN_TRANSIT: { status: "DELIVERED", label: "Confirm delivery", success: true },
  DELAYED: { status: "DELIVERED", label: "Confirm delivery", success: true },
  FAILED: { status: "PICKING", label: "Start over" },
};

/** Simple list filters — group related backend statuses together. */
export const DISPATCH_TABS = [
  ["all", "All"],
  ["pick", "To pick"],
  ["ready", "Ready to ship"],
  ["shipping", "On the way"],
  ["done", "Delivered"],
  ["problems", "Problems"],
] as const;

export const DISPATCH_TAB_STATUSES: Record<string, string[] | null> = {
  all: null,
  pick: ["CONFIRMED", "PICKING", "PACKING"],
  ready: ["PICKED"],
  shipping: ["DISPATCHED", "IN_TRANSIT"],
  done: ["DELIVERED", "PARTIAL_DELIVERED"],
  problems: ["FAILED", "DELAYED", "RETURNED"],
};

export function matchesDispatchTab(status: string, tab: string) {
  if (tab === "all") return true;
  const group = DISPATCH_TAB_STATUSES[tab];
  if (group) return group.includes(status);
  return status === tab;
}

export function countDispatchTab(queue: { status: string }[], tab: string) {
  if (tab === "all") return queue.length;
  return queue.filter((o) => matchesDispatchTab(o.status, tab)).length;
}

/** Four steps users see on the job screen. */
export const DISPATCH_STEPS = ["CONFIRMED", "PICKED", "DISPATCHED", "DELIVERED"] as const;

export function dispatchStepIndex(status: string) {
  if (["CONFIRMED", "PICKING", "PACKING"].includes(status)) return 0;
  if (status === "PICKED") return 1;
  if (["DISPATCHED", "IN_TRANSIT", "DELAYED"].includes(status)) return 2;
  if (["DELIVERED", "PARTIAL_DELIVERED"].includes(status)) return 3;
  return -1;
}

export function dispatchStepOn(step: string, status: string) {
  const idx = dispatchStepIndex(status);
  const stepIdx = DISPATCH_STEPS.indexOf(step as (typeof DISPATCH_STEPS)[number]);
  if (stepIdx < 0 || idx < 0) return false;
  return idx >= stepIdx;
}

const STEP_LABELS: Record<string, string> = {
  CONFIRMED: "Pick items",
  PICKED: "Ready",
  DISPATCHED: "Shipped",
  DELIVERED: "Delivered",
};

export function dispatchStepLabel(step: string) {
  return STEP_LABELS[step] || DISPATCH_LABEL[step] || step;
}

export const DISPATCH_METHODS = [
  { id: "SHOP_COLLECT", label: "Customer pickup" },
  { id: "COURIER", label: "Courier" },
  { id: "COMPANY_VEHICLE", label: "Company vehicle" },
  { id: "THIRD_PARTY", label: "Third-party transport" },
];

export const DISPATCH_PRIORITIES = [
  { id: "NORMAL", label: "Normal" },
  { id: "URGENT", label: "Urgent" },
  { id: "CRITICAL", label: "Critical" },
];
