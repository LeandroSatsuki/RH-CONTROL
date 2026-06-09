import { useEffect, useState } from "react";
import { API_URL, api } from "./api";
import { AppError } from "./components/Feedback";
import { Layout, Page } from "./components/Layout";
import { CentersPage, TypesPage } from "./pages/CatalogPages";
import { DashboardPage } from "./pages/DashboardPage";
import { BackupPage, ClosingPage, ImportPage, IndicatorsPage, MovementsPage, PayrollPage, ReportsPage, SettingsPage } from "./pages/DemoPages";
import { EmployeesPage } from "./pages/EmployeesPage";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { User } from "./types";

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

  return (
    <Layout user={user} page={page} onPage={setPage} onLogout={logout}>
      {page === "dashboard" && <DashboardPage token={token} />}
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
  );
}
