/** Consistent date in module tables (en-GB, e.g. 23 Oct 2026). */
export function formatTableDate(iso: string | Date | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
