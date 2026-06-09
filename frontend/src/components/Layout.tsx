import { ReactNode, useEffect, useState } from "react";
import { IS_DEMO_MODE } from "../api";
import { User } from "../types";

export type Page =
  | "dashboard"
  | "employees"
  | "movements"
  | "payroll"
  | "indicators"
  | "reports"
  | "import"
  | "backup"
  | "closing"
  | "settings"
  | "centers"
  | "types";

interface Props {
  user: User;
  page: Page;
  onPage: (page: Page) => void;
  onLogout: () => void;
  children: ReactNode;
}

const menu: { page: Page; label: string; icon: string; adminOnly?: boolean }[] = [
  { page: "dashboard", label: "Dashboard", icon: "▦" },
  { page: "employees", label: "Colaboradores", icon: "ID" },
  { page: "movements", label: "Movimentações", icon: "MV" },
  { page: "payroll", label: "Folha", icon: "R$" },
  { page: "indicators", label: "Indicadores", icon: "Σ" },
  { page: "reports", label: "Relatórios", icon: "RP" },
  { page: "import", label: "Importação", icon: "↥" },
  { page: "backup", label: "Backup", icon: "BK" },
  { page: "closing", label: "Fechamento", icon: "✓" },
  { page: "settings", label: "Configurações", icon: "⚙" },
  { page: "centers", label: "Centros de Resultado", icon: "CR" },
  { page: "types", label: "Modalidades", icon: "MC" }
];

export function Layout({ user, page, onPage, onLogout, children }: Props) {
  const [dark, setDark] = useState(localStorage.getItem("theme") === "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">IF</div>
          <div><strong>Indicadores</strong><span>Folha & Pessoas</span></div>
        </div>
        <nav>
          {menu.filter(item => !item.adminOnly || user.role === "ADMIN").map(item => (
            <button
              key={item.page}
              className={page === item.page ? "active" : ""}
              onClick={() => onPage(item.page)}
            >
              <span className="menu-icon">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setDark(!dark)}><span className="menu-icon">{dark ? "☼" : "◐"}</span>Tema</button>
          <button onClick={onLogout}><span className="menu-icon">↪</span>Sair</button>
        </div>
      </aside>
      <main className="main">
        <header>
          {IS_DEMO_MODE && <span className="demo-pill">Demo com dados fictícios</span>}
          <span className="competency-pill">Competência atual: Jun/2026</span>
          <div><span className="eyebrow">{IS_DEMO_MODE ? "Versão de apresentação" : "Sistema local"}</span><strong>{user.full_name}</strong></div>
          <span className="role">{user.role === "ADMIN" ? "Administrador" : "Consultor"}</span>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
