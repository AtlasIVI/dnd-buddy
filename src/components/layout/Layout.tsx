import { ReactNode } from "react";
import ThemeSwitcher from "../theme/ThemeSwitcher";
import { useAuth } from "../../contexts/AuthContext";

interface LayoutProps {
  children: ReactNode;
  showHeader?: boolean;
}

export default function Layout({ children, showHeader = true }: LayoutProps) {
  const { user, signOut } = useAuth();

  return (
    <div className="layout-container" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {showHeader && user && (
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.5rem 1rem",
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0
        }}>
          <h1 style={{ 
            fontFamily: "var(--font-display)", 
            color: "var(--color-accent)",
            fontSize: "1.125rem",
            margin: 0
          }}>
            DnD Buddy
          </h1>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <ThemeSwitcher />
            <button className="btn btn--ghost" onClick={signOut} style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
              Déconnexion
            </button>
          </div>
        </header>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
