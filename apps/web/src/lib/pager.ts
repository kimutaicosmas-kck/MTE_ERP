import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "./mobile";

export const PAGE_SIZE = 12;

export function usePager<T>(rows: T[], resetKey: unknown = "", pageSize = PAGE_SIZE, paged = true) {
  const mobile = useIsMobile();
  const infinite = mobile && !paged;
  const [page, setPage] = useState(1);
  const [visible, setVisible] = useState(pageSize);
  useEffect(() => {
    setPage(1);
    setVisible(pageSize);
  }, [resetKey, pageSize]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const slice = useMemo(() => {
    if (infinite) return rows.slice(0, visible);
    return rows.slice((current - 1) * pageSize, current * pageSize);
  }, [rows, current, pageSize, infinite, visible]);
  const from = rows.length === 0 ? 0 : infinite ? 1 : (current - 1) * pageSize + 1;
  const to = infinite ? slice.length : Math.min(current * pageSize, rows.length);
  const loadMore = useCallback(() => setVisible((v) => v + pageSize), [pageSize]);
  return {
    page: current,
    setPage,
    pages,
    slice,
    total: rows.length,
    from,
    to,
    pageSize,
    infinite,
    hasMore: infinite && visible < rows.length,
    loadMore,
  };
}
