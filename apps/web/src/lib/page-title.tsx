import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type PageMeta = { eyebrow: string; title: string; backTo?: string };

const PageTitleContext = createContext<{
  meta: PageMeta | null;
  setMeta: (meta: PageMeta | null) => void;
}>({ meta: null, setMeta: () => undefined });

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<PageMeta | null>(null);
  return <PageTitleContext.Provider value={{ meta, setMeta }}>{children}</PageTitleContext.Provider>;
}

export function usePageTitle() {
  return useContext(PageTitleContext);
}

export function useSetPageTitle(eyebrow: string, title: string, backTo?: string) {
  const { setMeta } = usePageTitle();
  useEffect(() => {
    setMeta({ eyebrow, title, backTo });
    return () => setMeta(null);
  }, [eyebrow, title, backTo, setMeta]);
}
