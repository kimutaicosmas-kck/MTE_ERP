import { prisma } from "./prisma.js";

export function wantsCustomerList(message: string) {
  const q = message.toLowerCase();
  return (
    /list\s+(all\s+)?customers/.test(q) ||
    /all\s+customers/.test(q) ||
    /pull\s+(all\s+)?customers/.test(q) ||
    /show\s+(me\s+)?(all\s+)?customers/.test(q) ||
    /customer\s+list/.test(q)
  );
}

export function customerSearchTerms(message: string) {
  const raw = message.toLowerCase().split(/[^a-z0-9/-]+/).filter(Boolean);
  const stop = new Set(["customer", "number", "list", "all", "pull", "show", "the", "me", "for", "find", "search"]);
  return [...new Set(raw.filter((t) => t.length >= 2 && !stop.has(t)))].slice(0, 5);
}

export async function listAllCustomers(limit = 50) {
  return prisma.customer.findMany({
    take: limit,
    orderBy: { name: "asc" },
    select: { id: true, customerNumber: true, name: true, phone: true },
  });
}

export async function searchCustomers(terms: string[], take = 8) {
  if (!terms.length) return [];
  const or = terms.flatMap((t) => [
    { name: { contains: t } },
    { phone: { contains: t } },
    { email: { contains: t } },
    { customerNumber: { contains: t.toUpperCase() } },
    { kraPin: { contains: t.toUpperCase() } },
  ]);
  const rows = await prisma.customer.findMany({
    where: { OR: or },
    take: Math.min(take * 3, 40),
    select: { id: true, customerNumber: true, name: true, phone: true },
  });
  const score = (name: string, number: string | null) => {
    const n = name.toLowerCase();
    let s = 0;
    for (const t of terms) {
      const tl = t.toLowerCase();
      if (number?.toLowerCase() === tl || number?.toLowerCase().includes(tl)) s += 100;
      if (n === tl) s += 80;
      else if (n.startsWith(tl)) s += 50;
      else if (n.includes(tl)) s += 20;
    }
    return s;
  };
  return rows
    .map((r) => ({ ...r, _score: score(r.name, r.customerNumber) }))
    .filter((r) => r._score > 0)
    .sort((a, b) => b._score - a._score || a.name.localeCompare(b.name))
    .slice(0, take)
    .map(({ _score, ...r }) => r);
}

/** Sales staff name match (e.g. "amina" → Amina Yusuf), not a customer account. */
export async function matchSalespersonHint(terms: string[]) {
  if (!terms.length) return null;
  const users = await prisma.user.findMany({
    where: { role: "SALES", active: true },
    select: { id: true, name: true, email: true },
  });
  for (const t of terms) {
    const tl = t.toLowerCase();
    const hit = users.find((u) => u.name.toLowerCase().includes(tl) || u.email.toLowerCase().startsWith(tl));
    if (hit) return hit;
  }
  return null;
}
