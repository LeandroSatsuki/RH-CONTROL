import { FormEvent, useEffect, useState } from "react";
import { ALLOW_LOCAL_MODE, API_URL, api, enableLocalDataMode, isLocalDataMode, saveApiUrl, stripApiSuffix } from "./api";
import { AppError } from "./components/Feedback";
import { Layout, Page } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { AlertsPage, AuditPage, BackupPage, ClosingPage, CompaniesPage, ImportPage, MeiContractsPage, MovementsPage, PayrollPage, ReportsPage, SettingsPage } from "./pages/DemoPages";
import { IndicatorsPage } from "./pages/IndicatorsPage";
import { BenefitsPage } from "./pages/BenefitsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { ReportMakerPage } from "./pages/ReportMakerPage";
import { DemoScopeProvider, ScopedCompany } from "./context/DemoScope";
import { Company, User } from "./types";

type LoadState = "loading" | "ready" | "error";

const isDev = import.meta.env.DEV;
const LAST_PAGE_KEY = "nexo:last-page";
const pages: Page[] = ["dashboard", "alerts", "audit", "employees", "movements", "mei-contracts", "benefits", "payroll", "indicators", "report-maker", "reports", "import", "backup", "closing", "settings", "centers", "types"];

function storedPage(): Page {
  const value = localStorage.getItem(LAST_PAGE_KEY);
  return pages.includes(value as Page) ? value as Page : "dashboard";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro inesperado.";
}

function devLog(message: string, details: Record<string, unknown>) {
  if (isDev) console.debug(`[app] ${message}`, details);
}

export default function App() {
  const [setupState, setSetupState] = useState<LoadState>("loading");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [setupError, setSetupError] = useState("");
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<"idle" | "checking">("idle");
  const [authError, setAuthError] = useState("");
  const [page, setPage] = useState<Page>(storedPage);
  const [setupRetry, setSetupRetry] = useState(0);
  const [companiesRetry, setCompaniesRetry] = useState(0);
  const [localMode, setLocalMode] = useState(isLocalDataMode);
  const [companies, setCompanies] = useState<ScopedCompany[]>([]);
  const [companiesState, setCompaniesState] = useState<LoadState>("loading");
  const [companiesError, setCompaniesError] = useState("");
  const [updateStatus, setUpdateStatus] = useState<NexoUpdateStatus | null>(null);
  const [serverAddress, setServerAddress] = useState(() => {
    const stripped = stripApiSuffix(API_URL);
    return stripped && stripped !== "/api" ? stripped : window.location.origin;
  });
  const [serverAddressError, setServerAddressError] = useState("");

  useEffect(() => {
    if (!window.nexoUpdater) return;
    return window.nexoUpdater.onStatus(status => {
      setUpdateStatus(status.state === "idle" ? null : status);
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function checkSetup() {
      setSetupState("loading");
      setSetupError("");
      devLog("setup-check-start", {
        route: window.location.pathname,
        apiUrl: API_URL,
        tokenPresent: Boolean(localStorage.getItem("token"))
      });
      try {
        const result = await api<{ configured: boolean }>("/setup/status");
        if (!active) return;
        setConfigured(result.configured);
        setSetupState("ready");
        devLog("setup-check-ok", {
          route: window.location.pathname,
          configured: result.configured
        });
      } catch (error) {
        if (!active) return;
        if (ALLOW_LOCAL_MODE) {
          enableLocalDataMode();
          setLocalMode(true);
          setConfigured(true);
          setCompanies([]);
          setCompaniesState("loading");
          setSetupError("");
          setSetupState("ready");
        } else {
          setSetupError(errorMessage(error));
          setSetupState("error");
        }
        devLog("setup-check-error", {
          route: window.location.pathname,
          error: errorMessage(error),
          localMode: ALLOW_LOCAL_MODE
        });
      }
    }

    void checkSetup();
    return () => {
      active = false;
    };
  }, [setupRetry]);

  useEffect(() => {
    if (setupState !== "ready" || !token || !user) return;
    const currentUser = user;

    let active = true;
    async function loadCompanies() {
      setCompaniesState("loading");
      setCompaniesError("");
      devLog("companies-load-start", {
        route: window.location.pathname,
        tokenPresent: Boolean(token),
        userRole: currentUser.role
      });
      try {
        const response = await api<Company[]>("/companies", {}, token);
        if (!active) return;
        const mapped = response.map(company => ({
          id: company.id,
          code: company.code,
          cnpj: company.cnpj ?? null,
          name: company.name,
          trade_name: company.trade_name ?? "",
          kind: company.kind,
          group: company.group_name,
          group_name: company.group_name,
          parent_company_id: company.parent_company_id,
          active: company.active,
          is_primary: company.is_primary,
          registration_status: company.registration_status ?? "",
          opening_date: company.opening_date ?? "",
          address: company.address ?? "",
          city: company.city ?? "",
          state: company.state ?? "",
          zip_code: company.zip_code ?? ""
        }));
        setCompanies(mapped.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.code.localeCompare(b.code)));
        setCompaniesState("ready");
        devLog("companies-load-ok", {
          route: window.location.pathname,
          count: mapped.length
        });
      } catch (error) {
        if (!active) return;
        const message = errorMessage(error);
        setCompaniesError(message);
        setCompaniesState("error");
        devLog("companies-load-error", {
          route: window.location.pathname,
          error: message
        });
      }
    }

    void loadCompanies();
    return () => {
      active = false;
    };
  }, [companiesRetry, localMode, setupState, token, user?.username]);

  useEffect(() => {
    function refreshCompanies() {
      setCompaniesRetry(value => value + 1);
    }
    window.addEventListener("nexo:companies-changed", refreshCompanies);
    return () => window.removeEventListener("nexo:companies-changed", refreshCompanies);
  }, []);

  useEffect(() => {
    if (companiesState !== "ready" || !companies.length) return;
    const stored = Number(localStorage.getItem("indicadores-selected-company-id"));
    if (!Number.isFinite(stored) || !companies.some(company => company.id === stored)) {
      localStorage.setItem("indicadores-selected-company-id", String(companies[0].id));
    }
  }, [companies, companiesState]);

  useEffect(() => {
    if (setupState !== "ready") return;
    if (!token) {
      setUser(null);
      setAuthState("idle");
      return;
    }

    let active = true;
    async function checkSession() {
      setAuthState("checking");
      setAuthError("");
      devLog("auth-check-start", {
        route: window.location.pathname,
        page,
        configured,
        tokenPresent: true
      });
      try {
        const currentUser = await api<User>("/auth/me", {}, token);
        if (!active) return;
        setUser(currentUser);
        devLog("auth-check-ok", {
          route: window.location.pathname,
          page,
          role: currentUser.role
        });
      } catch (error) {
        if (!active) return;
        setAuthError(errorMessage(error));
        logout();
        devLog("auth-check-error", {
          route: window.location.pathname,
          page,
          error: errorMessage(error)
        });
      } finally {
        if (active) setAuthState("idle");
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, [configured, page, setupState, token]);

  function login(newToken: string, newUser: User) {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(newUser);
    setAuthError("");
    navigate("dashboard");
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setCompanies([]);
    setCompaniesState("loading");
  }

  function configureServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerAddressError("");
    try {
      saveApiUrl(serverAddress);
      window.location.reload();
    } catch (error) {
      setServerAddressError(errorMessage(error));
    }
  }

  function navigate(nextPage: Page) {
    localStorage.setItem(LAST_PAGE_KEY, nextPage);
    setPage(nextPage);
  }

  function refreshCurrentPage() {
    localStorage.setItem(LAST_PAGE_KEY, page);
    window.location.reload();
  }

  devLog("render-state", {
    route: window.location.pathname,
    page,
    setupState,
    configured,
    authState,
    authenticated: Boolean(token && user)
  });

  if (setupState === "loading") return <div className="loading">Carregando sistema...</div>;
  if (setupState === "error") {
    return (
      <main className="app-error">
        <section>
          <span className="eyebrow">Servidor indisponível</span>
          <h1>Não foi possível conectar ao Nexo</h1>
          <p>{setupError || "A API e o banco de dados precisam estar ativos no computador servidor."}</p>
          <form className="server-config-form" onSubmit={configureServer}>
            <label>Endereço do servidor
              <input
                value={serverAddress}
                onChange={event => setServerAddress(event.target.value)}
                placeholder="http://192.168.0.10:8000"
                required
              />
            </label>
            <small>Use 127.0.0.1 somente quando a API estiver instalada neste computador.</small>
            {serverAddressError && <div className="feedback error">{serverAddressError}</div>}
            <div className="actions server-config-actions">
              <button type="button" className="secondary" onClick={() => setSetupRetry(value => value + 1)}>Tentar novamente</button>
              <button type="submit" className="primary">Salvar e conectar</button>
            </div>
          </form>
        </section>
      </main>
    );
  }
  if (!configured) return <SetupPage onComplete={() => setConfigured(true)} />;
  if (token && !user && authState === "checking") return <div className="loading">Validando sessão...</div>;
  if (!token || !user) return <LoginPage onLogin={login} initialError={authError} localMode={localMode} />;
  if (companiesState === "loading") return <div className="loading">Carregando empresas...</div>;
  if (companiesState === "error") {
    return (
      <AppError
        title="Não foi possível carregar as empresas"
        message={companiesError || "Verifique a conexão com a API e o banco de dados."}
        onRetry={() => setCompaniesRetry(value => value + 1)}
      />
    );
  }

  return (
    <DemoScopeProvider companies={companies}>
      <Layout user={user} token={token} page={page} onPage={navigate} onRefresh={refreshCurrentPage} onLogout={logout} localMode={localMode}>
        {updateStatus && (
          <div className={`update-banner update-${updateStatus.state}`}>
            <span>{updateStatus.message}</span>
            {updateStatus.state === "ready" && (
              <button className="secondary" onClick={() => window.nexoUpdater?.restart()}>
                Reiniciar
              </button>
            )}
          </div>
        )}
        {page === "dashboard" && <DashboardPage token={token} />}
        {page === "alerts" && <AlertsPage token={token} user={user} onPage={navigate} />}
        {page === "audit" && <AuditPage token={token} user={user} />}
        {page === "employees" && <EmployeesPage token={token} user={user} />}
        {page === "movements" && <MovementsPage token={token} user={user} />}
        {page === "mei-contracts" && <MeiContractsPage token={token} user={user} />}
        {page === "benefits" && <BenefitsPage token={token} user={user} />}
        {page === "payroll" && <PayrollPage token={token} user={user} />}
        {page === "indicators" && <IndicatorsPage token={token} />}
        {page === "report-maker" && <ReportMakerPage token={token} user={user} />}
        {page === "reports" && <ReportsPage token={token} />}
        {page === "import" && <ImportPage token={token} user={user} />}
        {page === "backup" && <BackupPage token={token} user={user} />}
        {page === "closing" && <ClosingPage token={token} user={user} />}
        {page === "companies" && <CompaniesPage token={token} user={user} />}
        {page === "settings" && <SettingsPage token={token} user={user} />}
      </Layout>
    </DemoScopeProvider>
  );
}
