import { createContext, useContext, useEffect, useState } from "react";

type Theme = "default" | "high-contrast";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  isHighContrast: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  toggleTheme: () => {},
  isHighContrast: false,
});

const STORAGE_KEY = "mi-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "high-contrast") return "high-contrast";
    } catch {}
    return "default";
  });

  useEffect(() => {
    const html = document.documentElement;
    if (theme === "high-contrast") {
      html.setAttribute("data-theme", "high-contrast");
    } else {
      html.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => (t === "default" ? "high-contrast" : "default"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isHighContrast: theme === "high-contrast" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
