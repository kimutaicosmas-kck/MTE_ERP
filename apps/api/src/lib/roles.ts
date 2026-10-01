export function seesAllOrders(role: string) {
  return role !== "SALES";
}

export function ownOrderWhere(user: { id: string; role: string }) {
  return seesAllOrders(user.role) ? {} : { salespersonId: user.id };
}

export function canAccessOrder(user: { id: string; role: string }, order: { salespersonId?: string | null }) {
  return seesAllOrders(user.role) || order.salespersonId === user.id;
}

export function hideMoneyForSales<T extends { cost?: number; profit?: number }>(role: string, row: T): T {
  if (role !== "SALES") return row;
  return { ...row, cost: undefined, profit: undefined };
}
