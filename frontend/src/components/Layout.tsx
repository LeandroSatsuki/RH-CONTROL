import { ReactNode, useEffect, useState } from "react";
import { IS_DEMO_MODE } from "../api";
import { useDemoScope } from "../context/DemoScope";
import { User } from "../types";

export type Page =
  | "dashboard"
  | "alerts"
  | "audit"
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
  { page: "payroll", label: "Custo / Folha", icon: "CF" },
  { page: "indicators", label: "Indicadores", icon: "Σ" },
  { page: "reports", label: "Relatórios", icon: "RP" },
  { page: "closing", label: "Fechamento", icon: "✓" },
  { page: "alerts", label: "Alertas", icon: "!" },
  { page: "audit", label: "Auditoria", icon: "LG" },
  { page: "settings", label: "Ajustes do sistema", icon: "⚙", adminOnly: true }
];

export function Layout({ user, page, onPage, onLogout, children }: Props) {
  const [dark, setDark] = useState(localStorage.getItem("theme") === "dark");
  const { companies, selectedCompany, selectedCompanyId, setSelectedCompanyId } = useDemoScope();

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">IF</div>
          <div><strong>Indicadores</strong><span>Custos & Pessoas</span></div>
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
          <select
            className="company-switch"
            value={selectedCompanyId}
            onChange={event => setSelectedCompanyId(Number(event.target.value))}
            aria-label="Selecionar empresa"
          >
            {companies.map(company => (
              <option key={company.id} value={company.id}>
                {company.id === 0 ? "Todas as empresas" : `${company.code} - ${company.name}`}
              </option>
            ))}
          </select>
          <span className="competency-pill">Competência atual: Jun/2026</span>
          <div>
            <span className="eyebrow">{IS_DEMO_MODE ? "Versão de apresentação" : "Sistema local"}</span>
            <strong>{user.full_name}</strong>
            <small>{selectedCompany.id === 0 ? "Todas as empresas" : `${selectedCompany.code} - ${selectedCompany.kind.toLowerCase()} • ${selectedCompany.group}`}</small>
          </div>
          <span className="role">{user.role === "ADMIN" ? "Administrador" : "Consultor"}</span>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
