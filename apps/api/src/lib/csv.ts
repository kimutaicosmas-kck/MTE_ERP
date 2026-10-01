export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((c) => c)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some((c) => c)) rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = values[i] ?? "";
    });
    return rec;
  });
}

export function cell(row: Record<string, string>, ...keys: string[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-/#.]/g, "");
  const map = new Map(Object.entries(row).map(([k, v]) => [norm(k), v]));
  for (const key of keys) {
    const value = map.get(norm(key));
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function num(row: Record<string, string>, fallback = 0, ...keys: string[]) {
  const raw = cell(row, ...keys);
  if (!raw) return fallback;
  const n = Number(String(raw).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export function flag(row: Record<string, string>, ...keys: string[]) {
  return /^(1|true|yes|y|oem)$/i.test(cell(row, ...keys));
}
