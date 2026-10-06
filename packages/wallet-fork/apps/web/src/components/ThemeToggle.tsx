import { useTheme } from "../lib/theme";

/** Small circular light/dark switch, used on the auth screens. */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      className="theme-fab"
      onClick={toggle}
      title={theme === "dark" ? "Switch to white mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}
