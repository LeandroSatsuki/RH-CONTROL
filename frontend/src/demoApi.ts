import { EmploymentType, ResultCenter, User } from "./types";
import { consolidatedIndicators, dashboardCards, demoAlerts, payrollRows, topCostsByCenter } from "./mocks/demoCalculations";
import { createDemoEmployees, createDemoMovements, demoBackups, demoClosing, demoCompetencies, demoEmploymentTypes, demoResultCenters, demoSettings } from "./mocks/demoData";
import { DemoBackup, DemoClosing, DemoEmployee, DemoMovement, DemoSettings } from "./mocks/demoTypes";

const STORAGE_KEY = "indicadores-demo-state-v2";

const demoUsers: Record<string, User & { password: string; token: string }> = {
  admin: { id: 1, username: "admin", full_name: "Administrador Demo", role: "ADMIN", active: true, password: "admin", token: "demo-admin" },
  consultor: { id: 2, username: "consultor", full_name: "Consultor Demo", role: "CONSULTANT", active: true, password: "consultor", token: "demo-consultor" }
};

interface DemoState {
  resultCenters: ResultCenter[];
  employmentTypes: EmploymentType[];
  employees: DemoEmployee[];
  movements: DemoMovement[];
  settings: DemoSettings;
  backups: DemoBackup[];
  closing: DemoClosing;
}

function defaultState(): DemoState {
  const employees = createDemoEmployees();
  return {
    resultCenters: demoResultCenters,
    employmentTypes: demoEmploymentTypes,
    employees,
    movements: createDemoMovements(employees),
    settings: demoSettings,
    backups: demoBackups,
    closing: demoClosing
  };
}

function loadState(): DemoState {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return defaultState();
  try {
    return { ...defaultState(), ...JSON.parse(stored) } as DemoState;
  } catch {
    return defaultState();
  }
}

function saveState(state: DemoState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function cleanUser(user: User & { password: string; token: string }): User {
  return { id: user.id, username: user.username, full_name: user.full_name, role: user.role, active: user.active };
}

function getTokenUser(token?: string | null): User | null {
  const found = Object.values(demoUsers).find(user => user.token === token);
  return found ? cleanUser(found) : null;
}

function assertAdmin(token?: string | null) {
  const user = getTokenUser(token);
  if (user?.role !== "ADMIN") throw new Error("Seu perfil possui acesso somente para consulta.");
}

function nextId(items: { id: number }[]) {
  return Math.max(0, ...items.map(item => item.id)) + 1;
}

function body<T>(options: RequestInit): T {
  return JSON.parse(String(options.body ?? "{}")) as T;
}

export async function demoApi<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  await new Promise(resolve => window.setTimeout(resolve, 160));
  const method = options.method ?? "GET";
  const [route, queryString] = path.split("?");
  const params = new URLSearchParams(queryString ?? "");
  const state = loadState();

  if (route === "/setup/status" && method === "GET") return { configured: true } as T;

  if (route === "/auth/login" && method === "POST") {
    const payload = body<{ username?: string; password?: string }>(options);
    const user = payload.username ? demoUsers[payload.username.trim()] : undefined;
    if (!user || payload.password !== user.password) throw new Error("Usuário ou senha inválidos. Use admin/admin ou consultor/consultor.");
    return { access_token: user.token, user: cleanUser(user) } as T;
  }

  if (route === "/auth/me" && method === "GET") {
    const user = getTokenUser(token);
    if (!user) throw new Error("Sessão demo expirada. Entre novamente.");
    return user as T;
  }

  const currentUser = getTokenUser(token);
  if (!currentUser) throw new Error("Entre para acessar o modo demo.");

  if (route === "/demo/competencies" && method === "GET") return demoCompetencies as T;

  if (route === "/dashboard" && method === "GET") {
    const competency = params.get("competency") ?? "2026-06";
    const cards = dashboardCards(state.employees, state.movements, competency);
    const rows = payrollRows(state.employees, competency);
    return {
      month: Number(competency.slice(5, 7)),
      year: Number(competency.slice(0, 4)),
      competency,
      cards,
      consolidated: cards.reduce((acc, card) => ({
        active_employees: acc.active_employees + card.active_employees,
        admissions: acc.admissions + card.admissions,
        terminations: acc.terminations + card.terminations,
        gross_payroll: acc.gross_payroll + card.gross_payroll,
        net_payroll: acc.net_payroll + card.net_payroll,
        total_cost: acc.total_cost + card.total_cost,
        absenteeism: acc.absenteeism + card.absenteeism / cards.length,
        turnover: acc.turnover + card.turnover / cards.length
      }), { active_employees: 0, admissions: 0, terminations: 0, gross_payroll: 0, net_payroll: 0, total_cost: 0, absenteeism: 0, turnover: 0 }),
      alerts: demoAlerts,
      top_costs: topCostsByCenter(rows)
    } as T;
  }

  if (route === "/result-centers" && method === "GET") return state.resultCenters as T;
  if (route === "/employment-types" && method === "GET") return state.employmentTypes as T;
  if (route === "/employees" && method === "GET") return state.employees as T;

  if (route === "/result-centers" && method === "POST") {
    assertAdmin(token);
    const payload = body<Partial<ResultCenter>>(options);
    const item = { id: nextId(state.resultCenters), code: String(payload.code ?? "").trim().toUpperCase(), name: String(payload.name ?? "").trim(), color: payload.color ?? "#2563eb", active: true };
    state.resultCenters = [...state.resultCenters, item];
    saveState(state);
    return item as T;
  }

  if (route === "/employment-types" && method === "POST") {
    assertAdmin(token);
    const payload = body<Partial<EmploymentType>>(options);
    const item = { id: nextId(state.employmentTypes), name: String(payload.name ?? "").trim(), has_charges: Boolean(payload.has_charges), active: true };
    state.employmentTypes = [...state.employmentTypes, item];
    saveState(state);
    return item as T;
  }

  if (route === "/employees" && method === "POST") {
    assertAdmin(token);
    const payload = body<Record<string, string>>(options);
    const cpf = String(payload.cpf ?? "").replace(/\D/g, "");
    if (state.employees.some(item => item.employee.cpf === cpf)) throw new Error("CPF já cadastrado no modo demo.");
    const type = state.employmentTypes.find(item => item.id === Number(payload.employment_type_id)) ?? state.employmentTypes[0];
    const center = state.resultCenters.find(item => item.id === Number(payload.result_center_id)) ?? state.resultCenters[0];
    const id = nextId(state.employees);
    const salary = Number(payload.salary_base || 4500);
    const item: DemoEmployee = {
      id,
      employee_code: String(payload.employee_code ?? "").trim().toUpperCase(),
      job_title: String(payload.job_title ?? ""),
      department: String(payload.department ?? center.name),
      admission_date: String(payload.admission_date ?? new Date().toISOString().slice(0, 10)),
      termination_date: null,
      status: "ACTIVE",
      daily_hours: String(payload.daily_hours ?? "8.80"),
      notes: String(payload.notes ?? ""),
      employee: { id, cpf, full_name: String(payload.full_name ?? "") },
      employment_type: type,
      result_center: center,
      salary_base: salary,
      email: "novo.colaborador@empresa-demo.com.br",
      phone: "(11) 90000-0000",
      salary_history: [{ date: "2026-06-01", amount: salary, reason: "Cadastro inicial" }],
      movement_history: [{ date: "2026-06-01", description: "Admissão simulada no modo demo" }],
      vacations: [{ period: "A definir", status: "Pendente" }],
      leaves: []
    };
    state.employees = [...state.employees, item];
    saveState(state);
    return item as T;
  }

  if (route === "/demo/movements" && method === "GET") return state.movements.filter(item => !params.get("competency") || item.competency === params.get("competency")) as T;
  if (route === "/demo/movements" && method === "POST") {
    assertAdmin(token);
    const payload = body<Partial<DemoMovement>>(options);
    const employee = state.employees.find(item => item.id === Number(payload.employee_id)) ?? state.employees[0];
    const item: DemoMovement = {
      id: nextId(state.movements),
      competency: payload.competency ?? "2026-06",
      employee_id: employee.id,
      employee_name: employee.employee.full_name,
      type: payload.type ?? "falta",
      start_date: payload.start_date ?? "2026-06-10",
      end_date: payload.end_date ?? null,
      days: payload.days ?? 1,
      hour_impact: payload.hour_impact ?? 8.8,
      result_center: employee.result_center,
      observation: payload.observation ?? "Movimentação criada em modo demonstração.",
      status: "Pendente"
    };
    state.movements = [item, ...state.movements];
    saveState(state);
    return item as T;
  }

  if (route === "/demo/payroll" && method === "GET") return payrollRows(state.employees, params.get("competency") ?? "2026-06") as T;
  if (route === "/demo/indicators" && method === "GET") return consolidatedIndicators(state.employees, state.movements, params.get("competency") ?? "2026-06") as T;
  if (route === "/demo/settings" && method === "GET") return state.settings as T;
  if (route === "/demo/settings" && method === "POST") {
    assertAdmin(token);
    state.settings = { ...state.settings, ...body<Partial<DemoSettings>>(options) };
    saveState(state);
    return state.settings as T;
  }
  if (route === "/demo/backups" && method === "GET") return state.backups as T;
  if (route === "/demo/backups" && method === "POST") {
    assertAdmin(token);
    const item: DemoBackup = { id: nextId(state.backups), date: new Date().toLocaleString("pt-BR"), file: `indicadores_demo_${Date.now()}.dump`, size: "43 MB", status: "Concluído" };
    state.backups = [item, ...state.backups];
    saveState(state);
    return { message: "Backup gerado com sucesso em modo demonstração.", backup: item } as T;
  }
  if (route === "/demo/closing" && method === "GET") return state.closing as T;
  if (route === "/demo/closing" && method === "POST") {
    assertAdmin(token);
    const payload = body<{ status: "OPEN" | "CLOSED" }>(options);
    state.closing = { ...state.closing, status: payload.status };
    saveState(state);
    return state.closing as T;
  }
  if (route === "/demo/report-preview" && method === "GET") {
    const rows = payrollRows(state.employees, params.get("competency") ?? "2026-06");
    return { company: state.settings.company_name, competency: params.get("competency") ?? "2026-06", cards: dashboardCards(state.employees, state.movements), rows: topCostsByCenter(rows) } as T;
  }
  if (route === "/demo/import-preview" && method === "POST") {
    assertAdmin(token);
    return {
      rows: 18,
      valid: 14,
      errors: ["CPF duplicado na linha 4", "Centro de Resultado inválido na linha 7", "Campo obrigatório ausente na linha 11", "Valor numérico inválido na linha 16"],
      message: "Prévia gerada em modo demonstração."
    } as T;
  }

  throw new Error(`Rota demo não implementada: ${method} ${route}`);
}
