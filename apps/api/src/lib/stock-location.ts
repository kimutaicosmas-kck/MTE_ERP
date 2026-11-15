import { prisma } from "./prisma.js";

/** Log when a product's bin changes (same qty — moved between stores or aisles). */
export async function recordBinTransfer(opts: {
  partId: string;
  userId?: string | null;
  fromLocation: string;
  toLocation: string;
}) {
  const from = opts.fromLocation.trim();
  const to = opts.toLocation.trim();
  if (!to || from === to) return;
  await prisma.stockMovement.create({
    data: {
      partId: opts.partId,
      type: "TRANSFER",
      qty: 0,
      reason: `Relocated ${from || "—"} → ${to}`,
      reference: `${from || "—"}→${to}`,
      userId: opts.userId ?? undefined,
    },
  });
}