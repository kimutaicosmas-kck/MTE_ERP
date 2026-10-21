export function friendlyError(err: unknown): { status: number; message: string } {
  const e = err as { code?: string; meta?: { target?: string | string[] }; message?: string };
  if (e?.code === "P2002") {
    const target = Array.isArray(e.meta?.target) ? e.meta!.target.join(" ") : String(e.meta?.target || "");
    if (/email/i.test(target)) return { status: 400, message: "Unable to save. The email address already exists." };
    if (/sku|oem/i.test(target)) return { status: 400, message: "Unable to save product. That part number already exists." };
    if (/number/i.test(target)) return { status: 400, message: "Unable to save. That document number already exists." };
    return { status: 400, message: "Unable to save. A record with this value already exists." };
  }
  if (e?.code === "P2003") return { status: 400, message: "Unable to save. A related record is missing." };
  if (e?.code === "P2025") return { status: 404, message: "That record was not found." };
  if (typeof e?.message === "string" && !/sqlstate|prisma|errno/i.test(e.message)) {
    const msg = e.message;
    if (/Enter a valid Safaricom|Amount must|already paid|not found|do not have access/i.test(msg)) {
      return { status: 400, message: msg };
    }
    if (/not set|Add them in Settings|callback URL|public HTTPS|localhost/i.test(msg)) {
      return { status: 400, message: msg };
    }
    if (/Daraja|Safaricom|M-Pesa|Lipa Na M-Pesa|STK|passkey|consumer key|shortcode/i.test(msg)) {
      return { status: 502, message: msg };
    }
    return { status: 500, message: msg };
  }
  return { status: 500, message: "Something went wrong. Please try again." };
}
