import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE = 12;

export function usePager<T>(rows: T[], resetKey: unknown = "", pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const slice = useMemo(
    () => rows.slice((current - 1) * pageSize, current * pageSize),
    [rows, current, pageSize]
  );
  const from = rows.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, rows.length);
  return { page: current, setPage, pages, slice, total: rows.length, from, to, pageSize };
}
