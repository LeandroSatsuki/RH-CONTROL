import { EmploymentType, ResultCenter, User } from "./types";
import { consolidatedIndicators, dashboardCards, payrollRows } from "./mocks/demoCalculations";
import { createDemoBenefitDistributions, createDemoCostAllocations, createDemoEmployees, createDemoMovements, demoBenefitDefinitions, demoCompanies, demoCompetencies, demoEmploymentTypes, demoResultCenters } from "./mocks/demoData";
import { DemoAlert, DemoAuditEntry, DemoBackup, DemoBenefitDefinition, DemoBenefitDistribution, DemoClosing, DemoCompany, DemoCostAllocation, DemoEmployee, DemoMovement, DemoSettings } from "./mocks/demoTypes";

const STORAGE_KEY = "indicadores-demo-state-v6";
const ALL_COMPANIES_ID = 0;

const demoUsers: Record<string, User & { password: string; token: string }> = {
  admin: { id: 1, username: "admin", full_name: "Administrador Demo", role: "ADMIN", active: true, password: "admin", token: "demo-admin" },
  consultor: { id: 2, username: "consultor", full_name: "Consultor Demo", role: "CONSULTANT", active: true, password: "consultor", token: "demo-consultor" }
};

interface DemoState {
  companies: DemoCompany[];
  resultCenters: ResultCenter[];
  employmentTypes: EmploymentType[];
  employees: DemoEmployee[];
  movements: DemoMovement[];
  allocations: DemoCostAllocation[];
  benefitDefinitions: DemoBenefitDefinition[];
  benefitDistributions: DemoBenefitDistribution[];
  auditLogs: DemoAuditEntry[];
}

function defaultState(): DemoState {
  const employees = createDemoEmployees();
  return {
    companies: JSON.parse(JSON.stringify(demoCompanies)) as DemoCompany[],
    resultCenters: demoResultCenters,
    employmentTypes: demoEmploymentTypes,
    employees,
    movements: createDemoMovements(employees),
    allocations: createDemoCostAllocations(),
    benefitDefinitions: JSON.parse(JSON.stringify(demoBenefitDefinitions)) as DemoBenefitDefinition[],
    benefitDistributions: createDemoBenefitDistributions(employees),
    auditLogs: [
      {
        id: 1,
        company_id: 0,
        company_name: "Todas as empresas",
        module: "Sistema",
        action: "Carga inicial",
        performed_by: "Sistema",
        performed_role: "ADMIN",
        created_at: "2026-06-01 08:00",
        details: "Base demo carregada com empresas, colaboradores e movimentações."
      }
    ]
  };
}

function loadState(): DemoState {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return defaultState();
  try {
    const defaults = defaultState();
    const parsed = { ...defaults, ...JSON.parse(stored) } as DemoState;
    const fallbackRates = demoCompanies[0].settings.payroll_rates;
    parsed.companies = parsed.companies.map(company => ({
      ...company,
      settings: {
        ...demoCompanies[0].settings,
        ...company.settings,
        company_logo: company.settings?.company_logo ?? "",
        payroll_rates: { ...fallbackRates, ...(company.settings?.payroll_rates ?? {}) }
      }
    }));
    parsed.employees = parsed.employees.map((employee, index) => {
      const fallback = defaults.employees[index % defaults.employees.length];
      return {
        ...employee,
        supervisor_name: employee.supervisor_name ?? fallback.supervisor_name ?? "",
        street: employee.street ?? fallback.street ?? "",
        address_number: employee.address_number ?? fallback.address_number ?? "",
        neighborhood: employee.neighborhood ?? fallback.neighborhood ?? "",
        city: employee.city ?? fallback.city ?? "",
        state: employee.state ?? fallback.state ?? "",
        benefits: Array.isArray(employee.benefits) && employee.benefits.length ? employee.benefits : fallback.benefits ?? []
      };
    });
    parsed.benefitDefinitions = (parsed.benefitDefinitions ?? demoBenefitDefinitions).map(item => ({
      ...item,
      active: item.active ?? true,
      applies_to: item.applies_to ?? ["ADM", "IND", "COM", "DIR"],
      notes: item.notes ?? ""
    }));
    parsed.benefitDistributions = (parsed.benefitDistributions ?? createDemoBenefitDistributions(parsed.employees as DemoEmployee[])).map(item => ({
      ...item,
      source: item.source ?? "Lote",
      description: item.description ?? "",
      monthly_value: Number(item.monthly_value ?? 0),
      value_per_day: Number(item.value_per_day ?? 0),
      days_worked: Number(item.days_worked ?? 0),
      amount: Number(item.amount ?? 0)
    }));
    return parsed;
  } catch {
    return defaultState();
  }
}

function saveState(state: DemoState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCompanyId(params: URLSearchParams, state: DemoState): number {
  const raw = Number(params.get("company_id"));
  if (raw === ALL_COMPANIES_ID) return ALL_COMPANIES_ID;
  if (Number.isFinite(raw) && state.companies.some(company => company.id === raw)) {
    return raw;
  }
  return state.companies[0]?.id ?? 1;
}

function getCompany(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) {
    return {
      id: ALL_COMPANIES_ID,
      code: "TODAS",
      name: "Todas as empresas",
      kind: "OUTRA",
      group: "Todas as empresas",
      parent_company_id: null,
      active: true,
      settings: demoCompanies[0]?.settings,
      backups: [],
      closing: demoCompanies[0]?.closing
    } satisfies DemoCompany;
  }
  return state.companies.find(company => company.id === companyId) ?? state.companies[0];
}

function scopeEmployees(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return state.employees;
  return state.employees.filter(employee => employee.company_id === companyId);
}

function scopeMovements(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return state.movements;
  return state.movements.filter(movement => movement.company_id === companyId);
}

function scopeAllocations(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return state.allocations;
  return state.allocations.filter(allocation => allocation.company_id === companyId);
}

function scopeAuditLogs(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return state.auditLogs;
  return state.auditLogs.filter(item => item.company_id === companyId);
}

function scopeBenefitDistributions(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return state.benefitDistributions;
  return state.benefitDistributions.filter(item => item.company_id === companyId);
}

function companyNameFor(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return "Todas as empresas";
  return state.companies.find(company => company.id === companyId)?.name ?? "Sem empresa";
}

function normalizeBenefitCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function benefitLabelFor(code: string) {
  return {
    VT: "Vale transporte",
    AL: "Alimentação",
    PS: "Plano de saúde",
    SV: "Seguro de vida"
  }[normalizeBenefitCode(code)] ?? code;
}

function companyBenefitDistributionsFor(state: DemoState, companyId: number, competency: string) {
  return scopeBenefitDistributions(state, companyId).filter(item => item.competency === competency);
}

function missingBenefitDistributions(state: DemoState, companyId: number, competency: string) {
  const activeEmployees = scopeEmployees(state, companyId).filter(employee => employee.status === "ACTIVE");
  const monthlyDistributions = companyBenefitDistributionsFor(state, companyId, competency);
  return activeEmployees.flatMap(employee => {
    return (employee.benefits ?? []).flatMap(rawBenefit => {
      const label = normalizeText(String(rawBenefit));
      const requiredCodes = label === "vale transporte" || label === "transporte" ? ["VT"] : label === "alimentação" ? ["AL"] : label === "plano de saúde" || label === "plano de saude" ? ["PS"] : label === "seguro de vida" || label === "seguro" ? ["SV"] : [];
      return requiredCodes.flatMap(code => {
        if (monthlyDistributions.some(item => item.employee_id === employee.id && normalizeBenefitCode(item.benefit_code) === code)) return [];
        return [{ employee_name: employee.employee.full_name, benefit: benefitLabelFor(code) }];
      });
    });
  });
}

function appendAudit(state: DemoState, entry: Omit<DemoAuditEntry, "id" | "created_at" | "company_name"> & { company_name?: string }) {
  const record: DemoAuditEntry = {
    id: nextId(state.auditLogs),
    company_id: entry.company_id,
    company_name: entry.company_name ?? companyNameFor(state, entry.company_id),
    module: entry.module,
    action: entry.action,
    employee_name: entry.employee_name,
    result_center: entry.result_center,
    performed_by: entry.performed_by,
    performed_role: entry.performed_role,
    created_at: new Date().toLocaleString("pt-BR"),
    details: entry.details
  };
  state.auditLogs = [record, ...state.auditLogs].slice(0, 500);
}

function buildAlerts(state: DemoState, companyId: number): DemoAlert[] {
  const employees = scopeEmployees(state, companyId);
  return employees.flatMap((employee, index) => {
    const company = state.companies.find(item => item.id === employee.company_id) ?? state.companies[0];
    const alerts: DemoAlert[] = [];
    const vacation = employee.vacations[0];
    if (vacation && !vacation.period.toLowerCase().includes("pendente")) {
      alerts.push({
        id: employee.id * 10 + 1,
        company_id: company.id,
        company_name: company.name,
        type: "Férias vencendo",
        employee_name: employee.employee.full_name,
        result_center: employee.result_center,
        due_date: vacation.period.split(" a ")[0] ?? vacation.period,
        message: `${employee.employee.full_name} possui férias programadas para ${vacation.period}.`,
        severity: "Média"
      });
    }
    if (employee.leaves.length) {
      const leave = employee.leaves[0];
      const dueDate = leave.period.split(" a ").pop() ?? leave.period;
      alerts.push({
        id: employee.id * 10 + 2,
        company_id: company.id,
        company_name: company.name,
        type: "Retorno de afastamento",
        employee_name: employee.employee.full_name,
        result_center: employee.result_center,
        due_date: dueDate,
        message: `${employee.employee.full_name} retorna de afastamento em ${dueDate}.`,
        severity: "Alta"
      });
    }
    if (index % 11 === 0) {
      const dueDate = employee.termination_date ?? "31/12/2026";
      alerts.push({
        id: employee.id * 10 + 3,
        company_id: company.id,
        company_name: company.name,
        type: "Contrato próximo do vencimento",
        employee_name: employee.employee.full_name,
        result_center: employee.result_center,
        due_date: dueDate,
        message: `${employee.employee.full_name} deve ter vínculo revisado até ${dueDate}.`,
        severity: "Baixa"
      });
    }
    return alerts;
  }).slice(0, 24);
}

function updateCompany(state: DemoState, companyId: number, update: (company: DemoCompany) => DemoCompany) {
  state.companies = state.companies.map(company => (company.id === companyId ? update(company) : company));
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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export async function demoApi<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  await new Promise(resolve => window.setTimeout(resolve, 160));
  const method = options.method ?? "GET";
  const [route, queryString] = path.split("?");
  const params = new URLSearchParams(queryString ?? "");
  const state = loadState();
  const companyId = getCompanyId(params, state);
  const company = getCompany(state, companyId);

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
    const scopedEmployees = scopeEmployees(state, companyId);
    const scopedMovements = scopeMovements(state, companyId);
    const benefitDistributions = companyBenefitDistributionsFor(state, companyId, competency);
    const cards = dashboardCards(scopedEmployees, scopedMovements, competency, benefitDistributions);
    return {
      company: { id: company.id, code: company.code, name: company.name, kind: company.kind, group: company.group, group_name: company.group },
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
      alerts: buildAlerts(state, companyId).map(item => item.message)
    } as T;
  }

  if (route === "/demo/alerts" && method === "GET") return buildAlerts(state, companyId) as T;
  if (route === "/demo/audit-logs" && method === "GET") return scopeAuditLogs(state, companyId) as T;
  if (route === "/result-centers" && method === "GET") return state.resultCenters as T;
  if (route === "/employment-types" && method === "GET") return state.employmentTypes as T;
  if (route === "/employees" && method === "GET") return scopeEmployees(state, companyId) as T;
  if (route === "/demo/benefits/catalog" && method === "GET") return state.benefitDefinitions as T;
  if (route === "/demo/benefit-distributions" && method === "GET") {
    const competency = params.get("competency") ?? "2026-06";
    const benefitCode = params.get("benefit_code");
    return companyBenefitDistributionsFor(state, companyId, competency).filter(item => !benefitCode || normalizeBenefitCode(item.benefit_code) === normalizeBenefitCode(benefitCode)) as T;
  }

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

  if (route === "/demo/benefits/catalog" && method === "POST") {
    assertAdmin(token);
    const payload = body<Partial<DemoBenefitDefinition>>(options);
    const code = normalizeBenefitCode(String(payload.code ?? ""));
    const item: DemoBenefitDefinition = {
      id: nextId(state.benefitDefinitions),
      code: code || `B${nextId(state.benefitDefinitions)}`,
      name: String(payload.name ?? "").trim(),
      active: payload.active ?? true,
      mode: payload.mode ?? "DAILY",
      applies_to: Array.isArray(payload.applies_to) ? payload.applies_to.map(String) : ["ADM", "IND", "COM", "DIR"],
      notes: String(payload.notes ?? "")
    };
    state.benefitDefinitions = [...state.benefitDefinitions.filter(def => normalizeBenefitCode(def.code) !== item.code), item];
    saveState(state);
    return item as T;
  }

  if (route === "/demo/benefit-distributions" && method === "POST") {
    assertAdmin(token);
    if (companyId === ALL_COMPANIES_ID) throw new Error("Selecione uma empresa específica para distribuir benefícios.");
    const payload = body<{
      competency?: string;
      benefit_code?: string;
      employee_ids?: number[];
      items?: Array<{
        employee_id?: number;
        days_worked?: number;
        value_per_day?: number;
        monthly_value?: number;
      }>;
      description?: string;
      source?: "Lote" | "Individual";
      days_worked?: number;
      value_per_day?: number;
      monthly_value?: number;
    }>(options);
    const competency = payload.competency ?? "2026-06";
    const benefitCode = normalizeBenefitCode(String(payload.benefit_code ?? ""));
    const benefit = state.benefitDefinitions.find(item => normalizeBenefitCode(item.code) === benefitCode);
    if (!benefit || !benefit.active) throw new Error("Selecione um benefício ativo.");
    const employeeIds = Array.isArray(payload.employee_ids) ? [...new Set(payload.employee_ids.map(Number))] : [];
    if (!employeeIds.length) throw new Error("Selecione ao menos um colaborador.");
    const description = String(payload.description ?? "").trim();
    if (!description) throw new Error("Informe a descrição da distribuição.");
    if (benefit.mode === "DAILY" && (Number(payload.days_worked ?? 0) <= 0 || Number(payload.value_per_day ?? 0) <= 0)) {
      throw new Error("Informe dias trabalhados e valor por dia maiores que zero.");
    }
    if (benefit.mode === "MONTHLY" && Number(payload.monthly_value ?? 0) <= 0) {
      throw new Error("Informe um valor mensal maior que zero.");
    }
    const companyEmployees = scopeEmployees(state, companyId).filter(employee => employee.status === "ACTIVE");
    const eligibleEmployees = companyEmployees.filter(employee => employeeIds.includes(employee.id) && employee.benefits.some(item => normalizeText(item) === normalizeText(benefit.name) || normalizeText(item) === normalizeText(benefitLabelFor(benefit.code))));
    if (!eligibleEmployees.length) throw new Error("Nenhum colaborador elegível foi encontrado para este benefício.");
    const itemMap = new Map((payload.items ?? []).filter(item => Number(item.employee_id) > 0).map(item => [Number(item.employee_id), item]));
    let nextDistributionId = nextId(state.benefitDistributions);
    const created: DemoBenefitDistribution[] = eligibleEmployees.map(employee => {
      const item = itemMap.get(employee.id);
      const daysWorked = benefit.mode === "DAILY" ? Number(item?.days_worked ?? payload.days_worked ?? 0) : 0;
      const valuePerDay = benefit.mode === "DAILY" ? Number(item?.value_per_day ?? payload.value_per_day ?? 0) : 0;
      const monthlyValue = benefit.mode === "MONTHLY" ? Number(item?.monthly_value ?? payload.monthly_value ?? 0) : 0;
      const amount = benefit.mode === "DAILY" ? roundMoney(daysWorked * valuePerDay) : roundMoney(monthlyValue);
      return {
        id: nextDistributionId++,
        company_id: companyId,
        competency,
        benefit_code: benefit.code,
        benefit_name: benefit.name,
        employee_id: employee.id,
        employee_name: employee.employee.full_name,
        result_center: employee.result_center,
        supervisor_name: employee.supervisor_name,
        employment_type: employee.employment_type.name,
        state: employee.state,
        days_worked: daysWorked,
        value_per_day: valuePerDay,
        monthly_value: monthlyValue,
        amount,
        source: payload.source ?? "Lote",
        description,
        created_at: new Date().toLocaleString("pt-BR"),
        created_by: currentUser.full_name
      };
    });
    state.benefitDistributions = [...created, ...state.benefitDistributions];
    appendAudit(state, {
      company_id: companyId,
      module: "Benefícios",
      action: "Distribuição de benefício",
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${benefit.name} | ${description} | ${created.length} colaborador(es)`
    });
    saveState(state);
    return { created: created.length, items: created } as T;
  }

  if (route === "/employees" && method === "POST") {
    assertAdmin(token);
    if (companyId === ALL_COMPANIES_ID) throw new Error("Selecione uma empresa específica para cadastrar colaboradores.");
    const payload = body<Record<string, any>>(options);
    const cpf = String(payload.cpf ?? "").replace(/\D/g, "");
    if (state.employees.some(item => item.employee.cpf === cpf)) throw new Error("CPF já cadastrado no modo demo.");
    const type = state.employmentTypes.find(item => item.id === Number(payload.employment_type_id)) ?? state.employmentTypes[0];
    const center = state.resultCenters.find(item => item.id === Number(payload.result_center_id)) ?? state.resultCenters[0];
    const id = nextId(state.employees);
    const salary = Number(payload.salary_base || 4500);
    const item: DemoEmployee = {
      id,
      company_id: companyId,
      employee_code: String(payload.employee_code ?? "").trim().toUpperCase(),
      job_title: String(payload.job_title ?? ""),
      department: String(payload.department ?? center.name),
      admission_date: String(payload.admission_date ?? new Date().toISOString().slice(0, 10)),
      termination_date: null,
      status: "ACTIVE",
      daily_hours: String(payload.daily_hours ?? "8.80"),
      notes: String(payload.notes ?? ""),
      supervisor_name: String(payload.supervisor_name ?? ""),
      street: String(payload.street ?? ""),
      address_number: String(payload.address_number ?? ""),
      neighborhood: String(payload.neighborhood ?? ""),
      city: String(payload.city ?? ""),
      state: String(payload.state ?? ""),
      bank_name: String(payload.bank_name ?? "Banco Demo"),
      bank_agency: String(payload.bank_agency ?? "0001"),
      bank_account: String(payload.bank_account ?? "12345"),
      bank_account_digit: String(payload.bank_account_digit ?? "0"),
      pix_key_type: (payload.pix_key_type as DemoEmployee["pix_key_type"]) ?? "CPF",
      pix_key: String(payload.pix_key ?? cpf),
      benefits: Array.isArray(payload.benefits) ? payload.benefits.map(String) : [],
      employee: { id, cpf, full_name: String(payload.full_name ?? "") },
      employment_type: type,
      result_center: center,
      salary_base: salary,
      email: "novo.colaborador@empresa-demo.com.br",
      phone: "(11) 90000-0000",
      salary_history: [{ date: "2026-06-01", amount: salary, family_allowance: 0, reason: "Cadastro inicial" }],
      movement_history: [{ date: "2026-06-01", description: "Admissão simulada no modo demo" }],
      vacations: [{ period: "A definir", status: "Pendente" }],
      leaves: []
    };
    state.employees = [...state.employees, item];
    saveState(state);
    appendAudit(state, {
      company_id: companyId,
      module: "Colaboradores",
      action: "Cadastro de colaborador",
      employee_name: item.employee.full_name,
      result_center: item.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `CPF ${item.employee.cpf} | matrícula ${item.employee_code} | salário base ${item.salary_base}`
    });
    saveState(state);
    return item as T;
  }

  if (route.startsWith("/employees/") && route.endsWith("/salary-history") && method === "POST") {
    assertAdmin(token);
    const employmentId = Number(route.split("/")[2]);
    const payload = body<{
      effective_date?: string;
      amount?: number;
      family_allowance?: number;
      reason?: string;
    }>(options);
    const item = companyId === ALL_COMPANIES_ID
      ? state.employees.find(employee => employee.id === employmentId)
      : state.employees.find(employee => employee.id === employmentId && employee.company_id === companyId);
    if (!item) throw new Error("Vínculo não encontrado");
    const amount = Number(payload.amount ?? item.salary_base);
    const familyAllowance = Number(payload.family_allowance ?? 0);
    const effectiveDate = payload.effective_date ?? new Date().toISOString().slice(0, 10);
    if (item.salary_history.some(entry => entry.date === effectiveDate)) {
      throw new Error("Já existe um ajuste histórico para esta data.");
    }
    const historyEntry = {
      date: effectiveDate,
      amount,
      family_allowance: familyAllowance,
      reason: String(payload.reason ?? "Ajuste histórico")
    };
    item.salary_base = amount;
    item.salary_history = [historyEntry, ...item.salary_history];
    appendAudit(state, {
      company_id: companyId,
      module: "Colaboradores",
      action: "Atualização salarial",
      employee_name: item.employee.full_name,
      result_center: item.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `Novo salário ${amount} e salário-família ${familyAllowance} em ${effectiveDate}`
    });
    saveState(state);
    return item as T;
  }

  if (route === "/demo/movements" && method === "GET") return scopeMovements(state, companyId).filter(item => !params.get("competency") || item.competency === params.get("competency")) as T;
  if (route === "/demo/movements" && method === "POST") {
    assertAdmin(token);
    if (companyId === ALL_COMPANIES_ID) throw new Error("Selecione uma empresa específica para lançar movimentações.");
    const payload = body<Partial<DemoMovement>>(options);
    const companyEmployees = scopeEmployees(state, companyId);
    const employee = companyEmployees.find(item => item.id === Number(payload.employee_id)) ?? companyEmployees[0];
    const item: DemoMovement = {
      id: nextId(state.movements),
      company_id: companyId,
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
    appendAudit(state, {
      company_id: companyId,
      module: "Movimentações",
      action: "Movimentação criada",
      employee_name: item.employee_name,
      result_center: item.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${item.type} em ${item.competency} (${item.days} dia(s))`
    });
    saveState(state);
    return item as T;
  }

  if (route.startsWith("/demo/movements/") && method === "PATCH") {
    assertAdmin(token);
    const movementId = Number(route.split("/")[3]);
    const payload = body<Partial<DemoMovement> & { password?: string }>(options);
    const currentPassword = demoUsers[currentUser.username as keyof typeof demoUsers]?.password;
    if (!payload.password || payload.password !== currentPassword) {
      throw new Error("Senha de confirmação inválida.");
    }
    const index = companyId === ALL_COMPANIES_ID
      ? state.movements.findIndex(item => item.id === movementId)
      : state.movements.findIndex(item => item.id === movementId && item.company_id === companyId);
    if (index < 0) throw new Error("Movimentação não encontrada");
    const currentMovement = state.movements[index];
    const employee = scopeEmployees(state, companyId).find(item => item.id === Number(payload.employee_id)) ?? scopeEmployees(state, companyId).find(item => item.id === currentMovement.employee_id) ?? scopeEmployees(state, companyId)[0];
    const updated: DemoMovement = {
      ...currentMovement,
      competency: payload.competency ?? currentMovement.competency,
      employee_id: employee.id,
      employee_name: employee.employee.full_name,
      type: payload.type ?? currentMovement.type,
      start_date: payload.start_date ?? currentMovement.start_date,
      end_date: payload.end_date ?? currentMovement.end_date,
      days: payload.days ?? currentMovement.days,
      hour_impact: payload.hour_impact ?? currentMovement.hour_impact,
      result_center: employee.result_center,
      observation: payload.observation ?? currentMovement.observation,
      status: (payload.status as DemoMovement["status"]) ?? currentMovement.status
    };
    state.movements[index] = updated;
    appendAudit(state, {
      company_id: companyId,
      module: "Movimentações",
      action: "Movimentação editada",
      employee_name: updated.employee_name,
      result_center: updated.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${updated.type} em ${updated.competency} com confirmação por senha`
    });
    saveState(state);
    return updated as T;
  }

  if (route === "/demo/cost-allocations" && method === "GET") {
    const competency = params.get("competency") ?? "2026-06";
    return scopeAllocations(state, companyId).filter(item => item.competency === competency) as T;
  }
  if (route === "/demo/cost-allocations" && method === "POST") {
    assertAdmin(token);
    if (companyId === ALL_COMPANIES_ID) throw new Error("Selecione uma empresa específica para distribuir custos.");
    const payload = body<{
      competency?: string;
      result_center_id?: number;
      category?: string;
      description?: string;
      amount?: number;
      source?: string;
    }>(options);
    const center = state.resultCenters.find(item => item.id === Number(payload.result_center_id)) ?? state.resultCenters[0];
    const item: DemoCostAllocation = {
      id: nextId(state.allocations),
      company_id: companyId,
      competency: payload.competency ?? "2026-06",
      result_center: center,
      category: String(payload.category ?? "Custo operacional"),
      description: String(payload.description ?? "Rateio manual de custo"),
      amount: Number(payload.amount ?? 0),
      source: String(payload.source ?? "Lançamento manual"),
      allocated_at: new Date().toLocaleString("pt-BR"),
      status: "Lançado"
    };
    state.allocations = [item, ...state.allocations];
    appendAudit(state, {
      company_id: companyId,
      module: "Custos",
      action: "Rateio lançado",
      result_center: center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${item.category} - ${item.description} | ${item.amount}`
    });
    saveState(state);
    return item as T;
  }

  if (route === "/demo/payroll" && method === "GET") return payrollRows(scopeEmployees(state, companyId), params.get("competency") ?? "2026-06", companyBenefitDistributionsFor(state, companyId, params.get("competency") ?? "2026-06")) as T;
  if (route === "/demo/indicators" && method === "GET") return consolidatedIndicators(scopeEmployees(state, companyId), scopeMovements(state, companyId), params.get("competency") ?? "2026-06", companyBenefitDistributionsFor(state, companyId, params.get("competency") ?? "2026-06")) as T;
  if (route === "/demo/settings" && method === "GET") return company.settings as T;
  if (route === "/demo/settings" && method === "POST") {
    assertAdmin(token);
    updateCompany(state, companyId, current => ({ ...current, settings: { ...current.settings, ...body<Partial<DemoSettings>>(options) } }));
    appendAudit(state, {
      company_id: companyId,
      module: "Configurações",
      action: "Configuração alterada",
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: "Parâmetros da empresa atualizados"
    });
    saveState(state);
    return getCompany(state, companyId).settings as T;
  }
  if (route === "/demo/backups" && method === "GET") return company.backups as T;
  if (route === "/demo/backups" && method === "POST") {
    assertAdmin(token);
    const item: DemoBackup = { id: nextId(company.backups), date: new Date().toLocaleString("pt-BR"), file: `${company.code.toLowerCase()}_${Date.now()}.dump`, size: "43 MB", status: "Concluído" };
    updateCompany(state, companyId, current => ({ ...current, backups: [item, ...current.backups] }));
    appendAudit(state, {
      company_id: companyId,
      module: "Backup",
      action: "Backup gerado",
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: item.file
    });
    saveState(state);
    return { message: "Backup gerado com sucesso em modo demonstração.", backup: item } as T;
  }
  if (route === "/demo/closing" && method === "GET") {
    const competency = company.closing.competency ?? "2026-06";
    return { ...company.closing, warnings: missingBenefitDistributions(state, companyId, competency).map(item => `${item.employee_name} - ${item.benefit}`) } as T;
  }
  if (route === "/demo/closing" && method === "POST") {
    assertAdmin(token);
    const payload = body<{ status: "OPEN" | "CLOSED"; justification?: string }>(options);
    const missing = missingBenefitDistributions(state, companyId, company.closing.competency ?? "2026-06");
    if (payload.status === "CLOSED" && missing.length && !String(payload.justification ?? "").trim()) {
      throw new Error(`Há benefícios pendentes para fechamento: ${missing.map(item => `${item.employee_name} (${item.benefit})`).join(", ")}. Informe a justificativa para registrar a pendência.`);
    }
    updateCompany(state, companyId, current => ({ ...current, closing: { ...current.closing, status: payload.status } }));
    appendAudit(state, {
      company_id: companyId,
      module: "Fechamento",
      action: payload.status === "CLOSED" ? "Competência fechada" : "Competência reaberta",
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: payload.status === "CLOSED" ? `Status alterado para ${payload.status}${payload.justification ? ` | Justificativa: ${payload.justification}` : ""}` : `Status alterado para ${payload.status}`
    });
    if (payload.status === "CLOSED" && payload.justification) {
      state.movements = [
        {
          id: nextId(state.movements),
          company_id: companyId,
          competency: company.closing.competency ?? "2026-06",
          employee_id: 0,
          employee_name: "Sistema",
          type: "afastamento",
          start_date: new Date().toISOString().slice(0, 10),
          end_date: null,
          days: 0,
          hour_impact: 0,
          result_center: state.resultCenters[0],
          observation: `Fechamento mensal com justificativa: ${payload.justification}`,
          status: "Aplicada"
        },
        ...state.movements
      ];
    }
    saveState(state);
    return { ...getCompany(state, companyId).closing, warnings: missingBenefitDistributions(state, companyId, company.closing.competency ?? "2026-06").map(item => `${item.employee_name} - ${item.benefit}`) } as T;
  }
  if (route === "/demo/report-preview" && method === "GET") {
    const scopedEmployees = scopeEmployees(state, companyId);
    const scopedMovements = scopeMovements(state, companyId);
    const competency = params.get("competency") ?? "2026-06";
    return { company: company.settings.company_name, company_logo: company.settings.company_logo ?? "", competency, cards: dashboardCards(scopedEmployees, scopedMovements, competency, companyBenefitDistributionsFor(state, companyId, competency)) } as T;
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
