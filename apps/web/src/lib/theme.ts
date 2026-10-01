import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

type ThemeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

function apply(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

const saved = (localStorage.getItem("mte_theme") as ThemeMode) || "system";
if (typeof document !== "undefined") apply(saved);

export const useTheme = create<ThemeState>((set) => ({
  mode: saved,
  setMode(mode) {
    localStorage.setItem("mte_theme", mode);
    apply(mode);
    set({ mode });
  },
}));

if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const mode = (localStorage.getItem("mte_theme") as ThemeMode) || "system";
    if (mode === "system") apply("system");
  });
}
