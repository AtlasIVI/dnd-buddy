import { getAvailableThemes } from "../../themes/theme-registry";
import { useTheme } from "../../contexts/ThemeContext";
import { GiPalette } from "react-icons/gi";

export default function ThemeSwitcher() {
  // Adaptez ces noms (themeName, setThemeName) selon ce qui est défini dans votre ThemeContext
  const { themeName, setTheme } = useTheme(); 
  const themes = getAvailableThemes();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <GiPalette size={20} style={{ color: "var(--color-text-secondary)" }} title="Changer de thème" />
      <select
        value={themeName}
        onChange={(e) => setTheme(e.target.value)}
        className="input"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-primary)",
          border: "1px solid var(--color-border)",
          padding: "0.25rem 0.5rem",
          borderRadius: "var(--input-radius)",
          fontFamily: "var(--font-body)",
          cursor: "pointer",
          fontSize: "0.875rem"
        }}
      >
        {themes.map((t) => (
          <option key={t.name} value={t.name}>
            {t.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}