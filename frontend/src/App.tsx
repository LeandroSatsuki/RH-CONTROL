import { useEffect, useState } from "react";
import { API_URL, IS_DEMO_MODE, api } from "./api";
import { AppError } from "./components/Feedback";
import { Layout, Page } from "./components/Layout";
import { CentersPage, TypesPage } from "./pages/CatalogPages";
import { DashboardPage } from "./pages/DashboardPage";
import { AlertsPage, AuditPage, BackupPage, ClosingPage, ImportPage, IndicatorsPage, MovementsPage, PayrollPage, ReportsPage, SettingsPage } from "./pages/DemoPages";
import { EmployeesPage } from "./pages/EmployeesPage";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { DemoScopeProvider, ScopedCompany } from "./context/DemoScope";
import { Company, User } from "./types";
import { demoCompanies } from "./mocks/demoData";

type LoadState = "loading" | "ready" | "error";

const isDev = import.meta.env.DEV;

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
  const [page, setPage] = useState<Page>("dashboard");
  const [setupRetry, setSetupRetry] = useState(0);
  const [companiesRetry, setCompaniesRetry] = useState(0);
  const [companies, setCompanies] = useState<ScopedCompany[]>(IS_DEMO_MODE ? demoCompanies : []);
  const [companiesState, setCompaniesState] = useState<LoadState>(IS_DEMO_MODE ? "ready" : "loading");
  const [companiesError, setCompaniesError] = useState("");

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
        setConfigured(null);
        setSetupError(errorMessage(error));
        setSetupState("error");
        devLog("setup-check-error", {
          route: window.location.pathname,
          error: errorMessage(error)
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
    if (IS_DEMO_MODE) {
      setCompanies(demoCompanies);
      setCompaniesState("ready");
      return;
    }

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
          name: company.name,
          kind: company.kind,
          group: company.group_name,
          group_name: company.group_name,
          parent_company_id: company.parent_company_id,
          active: company.active
        }));
        setCompanies(mapped);
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
  }, [companiesRetry, setupState, token, user?.username]);

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
    setPage("dashboard");
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setCompanies(IS_DEMO_MODE ? demoCompanies : []);
    setCompaniesState(IS_DEMO_MODE ? "ready" : "loading");
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
      <AppError
        title="Não foi possível iniciar o sistema"
        message={setupError || "Verifique se o backend e o banco de dados estão disponíveis."}
        onRetry={() => setSetupRetry(value => value + 1)}
      />
    );
  }
  if (!configured) return <SetupPage onComplete={() => setConfigured(true)} />;
  if (token && !user && authState === "checking") return <div className="loading">Validando sessão...</div>;
  if (!token || !user) return <LoginPage onLogin={login} initialError={authError} />;
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
      <Layout user={user} page={page} onPage={setPage} onLogout={logout}>
        {page === "dashboard" && <DashboardPage token={token} />}
        {page === "alerts" && <AlertsPage token={token} user={user} />}
        {page === "audit" && <AuditPage token={token} user={user} />}
        {page === "employees" && <EmployeesPage token={token} user={user} />}
        {page === "movements" && <MovementsPage token={token} user={user} />}
        {page === "payroll" && <PayrollPage token={token} user={user} />}
        {page === "indicators" && <IndicatorsPage token={token} />}
        {page === "reports" && <ReportsPage token={token} />}
        {page === "import" && <ImportPage token={token} user={user} />}
        {page === "backup" && <BackupPage token={token} user={user} />}
        {page === "closing" && <ClosingPage token={token} user={user} />}
        {page === "settings" && <SettingsPage token={token} user={user} />}
        {page === "centers" && <CentersPage token={token} user={user} />}
        {page === "types" && <TypesPage token={token} user={user} />}
      </Layout>
    </DemoScopeProvider>
  );
}
