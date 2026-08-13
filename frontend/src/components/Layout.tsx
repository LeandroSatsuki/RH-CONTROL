import { ReactNode, useEffect, useState } from "react";
import { api, IS_DEMO_MODE } from "../api";
import { useDemoScope } from "../context/DemoScope";
import { User } from "../types";
import { DemoAlert } from "../mocks/demoTypes";
import nexoLogoMark from "../assets/nexo-logo-mark.png";

export type Page =
  | "dashboard"
  | "alerts"
  | "audit"
  | "employees"
  | "movements"
  | "mei-contracts"
  | "benefits"
  | "payroll"
  | "companies"
  | "indicators"
  | "report-maker"
  | "reports"
  | "import"
  | "backup"
  | "closing"
  | "settings"
  | "centers"
  | "types";

interface Props {
  user: User;
  token: string;
  page: Page;
  onPage: (page: Page) => void;
  onLogout: () => void;
  children: ReactNode;
  localMode?: boolean;
}

const menu: { page: Page; label: string; icon: string; adminOnly?: boolean }[] = [
  { page: "dashboard", label: "Dashboard", icon: "▦" },
  { page: "employees", label: "Colaboradores", icon: "ID" },
  { page: "companies", label: "Empresas", icon: "EM", adminOnly: true },
  { page: "movements", label: "Movimentações", icon: "MV" },
  { page: "mei-contracts", label: "Contratos MEI", icon: "ME" },
  { page: "benefits", label: "Benefícios", icon: "BF" },
  { page: "payroll", label: "Custo / Folha", icon: "CF" },
  { page: "indicators", label: "Indicadores", icon: "IG" },
  { page: "report-maker", label: "Relatório Maker", icon: "MK" },
  { page: "reports", label: "Relatórios", icon: "RP" },
  { page: "closing", label: "Fechamento", icon: "✓" },
  { page: "alerts", label: "Alertas", icon: "!" },
  { page: "audit", label: "Auditoria", icon: "LG" },
  { page: "settings", label: "Ajustes do sistema", icon: "⚙", adminOnly: true }
];

export function Layout({ user, token, page, onPage, onLogout, children, localMode = IS_DEMO_MODE }: Props) {
  const [dark, setDark] = useState(localStorage.getItem("theme") === "dark");
  const [alerts, setAlerts] = useState<DemoAlert[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { companies, selectedCompany, selectedCompanyId, setSelectedCompanyId } = useDemoScope();

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    let active = true;
    const loadAlerts = async () => {
      try {
        const response = await api<DemoAlert[]>("/demo/alerts", {}, token);
        if (active) setAlerts(response);
      } catch {
        if (active) setAlerts([]);
      }
    };
    void loadAlerts();
    const timer = window.setInterval(() => { void loadAlerts(); }, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedCompany.id, token]);

  function openAlert(alert: DemoAlert) {
    setNotificationsOpen(false);
    onPage(alert.type.includes("Contrato") ? "mei-contracts" : "employees");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo-mark" src={nexoLogoMark} alt="Nexo" />
          <div><strong>Nexo</strong><span>Custos & Pessoas</span></div>
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
          {localMode && <span className="demo-pill">Modo local sem servidor</span>}
          <select
            className="company-switch"
            value={selectedCompanyId}
            onChange={event => setSelectedCompanyId(Number(event.target.value))}
            aria-label="Selecionar empresa"
          >
            {companies.map(company => (
              <option key={company.id} value={company.id}>
                {company.id === 0 ? "Todas as empresas" : `${company.code} - ${company.name}${company.is_primary ? " (principal)" : ""}${company.active ? "" : " (inativa)"}`}
              </option>
            ))}
          </select>
          <span className="competency-pill">Competência atual: Jun/2026</span>
          <div className="notification-menu">
            <button type="button" className="notification-button" onClick={() => setNotificationsOpen(value => !value)} aria-label="Abrir notificações" aria-expanded={notificationsOpen}>
              <span aria-hidden="true">🔔</span>{alerts.length > 0 && <b>{Math.min(alerts.length, 99)}</b>}
            </button>
            {notificationsOpen && <div className="notification-popover">
              <strong>Alertas em aberto</strong>
              {!alerts.length && <p>Nenhum alerta pendente.</p>}
              {alerts.slice(0, 5).map(alert => <button key={alert.id} type="button" onClick={() => openAlert(alert)}>
                <span className={alert.severity === "Alta" ? "severity-pill severity-high" : alert.severity === "Média" ? "severity-pill severity-medium" : "severity-pill severity-low"}>{alert.severity}</span>
                <span>{alert.message}</span>
              </button>)}
              {alerts.length > 5 && <button className="notification-more" type="button" onClick={() => { setNotificationsOpen(false); onPage("alerts"); }}>Ver mais alertas</button>}
            </div>}
          </div>
          <div>
            <span className="eyebrow">{localMode ? "Operação local" : "Sistema conectado"}</span>
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
