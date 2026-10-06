import { useTheme } from "../lib/theme";
import { Ico } from "./icons";

/** Small circular light/dark switch, used on the auth screens. */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      className="theme-fab"
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Ico name={theme === "dark" ? "sun" : "moon"} size={16} />
    </button>
  );
}
