import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = "staple.theme";
const DARK_THEME_COLOR = "#18181b";
const LIGHT_THEME_COLOR = "#ffffff";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveThemeFromDocument(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const isDark = theme === "dark";
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta instanceof HTMLMetaElement) {
    themeColorMeta.setAttribute("content", isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => resolveThemeFromDocument());
  const isInitialThemeEffect = useRef(true);
  const burstClearRef = useRef<number | null>(null);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    return () => {
      if (burstClearRef.current) clearTimeout(burstClearRef.current);
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("theme-transition-active");
      }
    };
  }, []);

  useEffect(() => {
    const persist = () => {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Ignore local storage write failures in restricted environments.
      }
    };

    const runApply = () => applyTheme(theme);

    if (isInitialThemeEffect.current) {
      isInitialThemeEffect.current = false;
      runApply();
      persist();
      return;
    }

    const root = document.documentElement;

    if (prefersReducedMotion()) {
      runApply();
    } else {
      if (burstClearRef.current) {
        clearTimeout(burstClearRef.current);
        burstClearRef.current = null;
      }
      root.classList.remove("theme-transition-active");
      root.classList.add("theme-transition-active");
      runApply();
      burstClearRef.current = window.setTimeout(() => {
        root.classList.remove("theme-transition-active");
        burstClearRef.current = null;
      }, 480);
    }

    persist();
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
