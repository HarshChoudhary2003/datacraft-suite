import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "cyberpunk" | "emerald" | "oled";

const ALL_THEMES: Theme[] = ["light", "dark", "cyberpunk", "emerald", "oled"];

const ThemeCtx = createContext<{
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
} | null>(null);
const KEY = "dataiq.theme";

function initial(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved && ALL_THEMES.includes(saved)) return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(initial());
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    ALL_THEMES.forEach((t) => root.classList.remove(t));
    if (theme !== "light") {
      root.classList.add(theme);
    }
    // Also toggle dark class for themes that are dark-based (dark, cyberpunk, emerald, oled)
    if (theme !== "light") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    root.style.colorScheme = theme === "light" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return (
    <ThemeCtx.Provider
      value={{
        theme,
        setTheme,
        toggle: () =>
          setTheme((t) => {
            const idx = ALL_THEMES.indexOf(t);
            return ALL_THEMES[(idx + 1) % ALL_THEMES.length];
          }),
      }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
