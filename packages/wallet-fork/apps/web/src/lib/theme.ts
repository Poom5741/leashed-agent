// Theme (dark / white) — persisted in localStorage, applied via
// <html data-theme>. index.html sets it before first paint.

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "thaifi-theme";

export function getTheme(): Theme {
  return localStorage.getItem(KEY) === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme);
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event("thaifi-theme"));
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/** Logo variant per theme: logo-dark.svg (white text) for dark backgrounds,
 * logo-white.svg (navy text) for light. */
export function logoFor(theme: Theme): string {
  return theme === "dark" ? "/logo-dark.svg" : "/logo-white.svg";
}

/** React to theme changes from anywhere (storage event covers other tabs). */
export function useTheme(): [Theme, () => void] {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  useEffect(() => {
    const onChange = () => setThemeState(getTheme());
    window.addEventListener("thaifi-theme", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("thaifi-theme", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  const toggle = () => {
    toggleTheme();
  };
  return [theme, toggle];
}
