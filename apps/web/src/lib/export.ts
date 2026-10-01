export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeCsv(value: string | number) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function printTable(title: string, headers: string[], rows: string[][]) {
  const win = window.open("", "_blank");
  if (!win) return;
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: sans-serif; padding: 24px; color: #111; }
      h1 { font-size: 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #111; color: #fff; }
    </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody></table>
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

export function printRecord(title: string, fields: [string, string][]) {
  const win = window.open("", "_blank");
  if (!win) return;
  const rows = fields
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join("");
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      body { font-family: Helvetica, Arial, sans-serif; color: #111; margin: 0; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border-bottom: 1px solid #ddd; padding: 8px 0; text-align: left; vertical-align: top; }
      th { width: 34%; color: #555; font-weight: 600; }
    </style></head><body>
    <h1>MTE ERP</h1>
    <div class="sub">${escapeHtml(title)}</div>
    <table>${rows}</table>
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
