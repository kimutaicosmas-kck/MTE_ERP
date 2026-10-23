import { useCallback, useEffect, useState } from "react";

const EVENT = "mte:exclusive-dropdown";

/** Close every registered dropdown except `id` (call when one opens). */
export function notifyExclusiveDropdownOpen(id: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id } }));
}

/** Only one popover/dropdown (notifications, share, selects, sidebar groups) open at a time. */
export function useExclusiveDropdown(id: string) {
  const [open, setOpenRaw] = useState(false);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const other = (e as CustomEvent<{ id: string }>).detail?.id;
      if (other && other !== id) setOpenRaw(false);
    };
    window.addEventListener(EVENT, onEvent);
    return () => window.removeEventListener(EVENT, onEvent);
  }, [id]);

  const setOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setOpenRaw((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      if (value) notifyExclusiveDropdownOpen(id);
      return value;
    });
  }, [id]);

  const toggle = useCallback(() => {
    setOpen((v) => !v);
  }, [setOpen]);

  return { open, setOpen, toggle };
}
