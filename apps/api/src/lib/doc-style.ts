import { createHmac } from "node:crypto";

const SECRET = process.env.JWT_SECRET || "mte-erp-local-dev-secret-change-in-production";

export type DocTheme = "navy" | "classic" | "gold";

export type DocStyle = {
  theme: DocTheme;
  validDays?: number;
  intro?: string;
  notes?: string;
};

export function packDocStyle(style: DocStyle) {
  return JSON.stringify({
    theme: style.theme || "navy",
    validDays: style.validDays || undefined,
    intro: style.intro || "",
    notes: style.notes || "",
  });
}

export function unpackDocStyle(raw?: string | null): DocStyle {
  if (!raw) return { theme: "navy" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && (parsed.theme || parsed.intro != null || parsed.validDays != null)) {
      const theme = parsed.theme === "classic" || parsed.theme === "gold" ? parsed.theme : "navy";
      return {
        theme,
        validDays: parsed.validDays ? Number(parsed.validDays) : undefined,
        intro: typeof parsed.intro === "string" ? parsed.intro : "",
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
      };
    }
  } catch {
    /* plain notes from older records */
  }
  return { theme: "navy", intro: raw, notes: raw };
}

export function shareTokenFor(orderId: string) {
  const sig = createHmac("sha256", SECRET).update(orderId).digest("hex").slice(0, 18);
  return `${Buffer.from(orderId).toString("base64url")}.${sig}`;
}

export function orderIdFromShareToken(token: string) {
  const [idPart, sig] = String(token || "").split(".");
  if (!idPart || !sig) return null;
  try {
    const id = Buffer.from(idPart, "base64url").toString("utf8");
    if (shareTokenFor(id) !== `${idPart}.${sig}`) return null;
    return id;
  } catch {
    return null;
  }
}

export function themeInk(theme?: string) {
  if (theme === "gold") return "#8a5a00";
  if (theme === "classic") return "#111111";
  return "#0B3A4A";
}
