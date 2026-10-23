/** Global “New” destinations — single list used by the header menu and mobile FAB only. */
export const CREATE_ACTIONS = [
  { label: "New sales order", to: "/sales/new", module: "sales" },
  { label: "Add product", to: "/inventory?new=1", module: "inventory" },
  { label: "New customer", to: "/customers?new=1", module: "customers" },
  { label: "New vendor", to: "/vendors?new=1", module: "vendors" },
  { label: "New purchase", to: "/procurement/new", module: "procurement" },
  { label: "New employee", to: "/hr?new=1", module: "hr" },
] as const;

export type CreateAction = (typeof CREATE_ACTIONS)[number];
