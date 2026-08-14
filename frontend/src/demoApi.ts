import { EmploymentType, ResultCenter, User } from "./types";
import { consolidatedIndicators, dashboardCards, payrollRows, recalculatePayrollRow } from "./mocks/demoCalculations";
import { createDemoBenefitDistributions, createDemoCostAllocations, createDemoEmployees, createDemoMeiContracts, createDemoMovements, demoBenefitDefinitions, demoCompanies, demoCompetencies, demoEmploymentTypes, demoResultCenters } from "./mocks/demoData";
import { DemoAlert, DemoAppUser, DemoAuditEntry, DemoBackup, DemoBenefitDefinition, DemoBenefitDistribution, DemoClosing, DemoCompany, DemoCostAllocation, DemoEmployee, DemoMeiContract, DemoMovement, DemoSettings } from "./mocks/demoTypes";

const DEMO_STORAGE_KEY = "indicadores-demo-state-v6";
const LOCAL_STORAGE_KEY = "nexo-local-state-v1";
const LOCAL_MODE_STORAGE_KEY = "nexo-local-mode";
const PRESENTATION_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const ALL_COMPANIES_ID = 0;

interface DemoLaunchItem { employment_id: number; amount: number; note: string }
interface DemoLaunchBatch {
  id: number; company_id: number; competency: string; kind: "MEI" | "BASIC_BASKET" | "BONUS";
  status: "PENDING" | "CONFIRMED"; filters: Record<string, string>; items: DemoLaunchItem[];
  created_by: string; updated_by: string; created_at: string; updated_at: string; confirmed_at: string | null;
}

interface DemoState {
  companies: DemoCompany[];
  closings: Record<string, DemoClosing>;
  resultCenters: ResultCenter[];
  employmentTypes: EmploymentType[];
  employees: DemoEmployee[];
  users: DemoAppUser[];
  meiContracts: DemoMeiContract[];
  movements: DemoMovement[];
  allocations: DemoCostAllocation[];
  benefitDefinitions: DemoBenefitDefinition[];
  benefitDistributions: DemoBenefitDistribution[];
  auditLogs: DemoAuditEntry[];
  reportTemplates: Record<string, unknown[]>;
  indicatorRevenue: Record<string, Record<string, number>>;
  payrollOverrides: Record<string, Partial<Record<string, number>>>;
  launchBatches: DemoLaunchBatch[];
}

function isOperationalLocalMode() {
  return !PRESENTATION_DEMO_MODE && localStorage.getItem(LOCAL_MODE_STORAGE_KEY) === "true";
}

function storageKey() {
  return isOperationalLocalMode() ? LOCAL_STORAGE_KEY : DEMO_STORAGE_KEY;
}

function localCompany(): DemoCompany {
  const settings = JSON.parse(JSON.stringify(demoCompanies[0].settings)) as DemoSettings;
  return {
    id: 1,
    code: "EMPRESA",
    cnpj: null,
    name: "Empresa Principal",
    trade_name: "Empresa Principal",
    kind: "MATRIZ",
    group: "Empresa Principal",
    parent_company_id: null,
    active: true,
    is_primary: true,
    registration_status: "",
    opening_date: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    settings: {
      ...settings,
      company_name: "Empresa Principal",
      cnpj: "",
      company_logo: "",
      initial_month: "2026-06",
      backup_directory: "C:\\Nexo\\backups"
    },
    backups: [],
    closing: {
      competency: "2026-06",
      status: "OPEN",
      checklist: {
        "Colaboradores conferidos": false,
        "Movimentações conferidas": false,
        "Folha importada": false,
        "Indicadores calculados": false,
        "Relatório mensal gerado": false,
        "Backup realizado": false
      }
    }
  };
}

function localDefaultState(): DemoState {
  return {
    companies: [localCompany()],
    closings: {},
    resultCenters: demoResultCenters.map(item => ({ ...item, company_id: 1 })),
    employmentTypes: demoEmploymentTypes.map(item => ({ ...item, company_id: 1 })),
    employees: [],
    users: [
      { id: 1, username: "admin", full_name: "Administrador", role: "ADMIN", active: true, password: "admin", token: "local-admin" },
      { id: 2, username: "consultor", full_name: "Consultor", role: "CONSULTANT", active: true, password: "consultor", token: "local-consultor" }
    ],
    meiContracts: [],
    movements: [],
    allocations: [],
    benefitDefinitions: JSON.parse(JSON.stringify(demoBenefitDefinitions)) as DemoBenefitDefinition[],
    benefitDistributions: [],
    reportTemplates: {},
    indicatorRevenue: {},
    payrollOverrides: {},
    launchBatches: [],
    auditLogs: [
      {
        id: 1,
        company_id: 0,
        company_name: "Todas as empresas",
        module: "Sistema",
        action: "Carga inicial",
        performed_by: "Sistema",
        performed_role: "ADMIN",
        created_at: new Date().toLocaleString("pt-BR"),
        details: "Base local criada para uso operacional sem servidor."
      }
    ]
  };
}

function presentationDemoDefaultState(): DemoState {
  const employees = createDemoEmployees();
  return {
    companies: JSON.parse(JSON.stringify(demoCompanies)) as DemoCompany[],
    closings: {},
    resultCenters: demoResultCenters,
    employmentTypes: demoEmploymentTypes,
    employees,
    users: [
      { id: 1, username: "admin", full_name: "Administrador Demo", role: "ADMIN", active: true, password: "admin", token: "demo-admin" },
      { id: 2, username: "consultor", full_name: "Consultor Demo", role: "CONSULTANT", active: true, password: "consultor", token: "demo-consultor" }
    ],
    meiContracts: createDemoMeiContracts(employees),
    movements: createDemoMovements(employees),
    allocations: createDemoCostAllocations(),
    benefitDefinitions: JSON.parse(JSON.stringify(demoBenefitDefinitions)) as DemoBenefitDefinition[],
    benefitDistributions: createDemoBenefitDistributions(employees),
    reportTemplates: {},
    indicatorRevenue: {},
    payrollOverrides: {},
    launchBatches: [],
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
        details: "Base demo carregada com empresas, colaboradores, movimentações e contratos MEI."
      }
    ]
  };
}

function defaultState(): DemoState {
  return isOperationalLocalMode() ? localDefaultState() : presentationDemoDefaultState();
}

function loadState(): DemoState {
  const stored = localStorage.getItem(storageKey());
  if (!stored) return defaultState();
  try {
    const defaults = defaultState();
    const parsed = { ...defaults, ...JSON.parse(stored) } as DemoState;
    parsed.closings = parsed.closings ?? {};
    parsed.reportTemplates = parsed.reportTemplates ?? {};
    parsed.indicatorRevenue = parsed.indicatorRevenue ?? {};
    parsed.payrollOverrides = parsed.payrollOverrides ?? {};
    parsed.launchBatches = parsed.launchBatches ?? [];
    const fallbackRates = demoCompanies[0].settings.payroll_rates;
    parsed.companies = parsed.companies.map(company => ({
      ...company,
      settings: {
        ...demoCompanies[0].settings,
        ...company.settings,
        company_logo: company.settings?.company_logo ?? "",
        payroll_rates: { ...fallbackRates, ...(company.settings?.payroll_rates ?? {}) },
        job_titles: company.settings?.job_titles ?? demoCompanies[0].settings.job_titles
      }
    }));
    parsed.users = (parsed.users ?? defaults.users).map(user => ({
      ...user,
      active: user.active ?? true,
      password: user.password ?? user.username,
      token: user.token ?? `demo-${user.username.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`
    }));
    parsed.employees = parsed.employees.map((employee, index) => {
      const fallback = defaults.employees.length ? defaults.employees[index % defaults.employees.length] : undefined;
      return {
        ...employee,
        supervisor_name: employee.supervisor_name ?? fallback?.supervisor_name ?? "",
        street: employee.street ?? fallback?.street ?? "",
        address_number: employee.address_number ?? fallback?.address_number ?? "",
        address_complement: employee.address_complement ?? fallback?.address_complement ?? "",
        neighborhood: employee.neighborhood ?? fallback?.neighborhood ?? "",
        city: employee.city ?? fallback?.city ?? "",
        state: employee.state ?? fallback?.state ?? "",
        cep: employee.cep ?? fallback?.cep ?? "",
        bank_code: employee.bank_code ?? fallback?.bank_code ?? "",
        benefits: Array.isArray(employee.benefits) && employee.benefits.length ? employee.benefits : fallback?.benefits ?? []
      };
    });
    parsed.meiContracts = (parsed.meiContracts ?? createDemoMeiContracts(parsed.employees as DemoEmployee[])).map(item => ({
      ...item,
      status: item.status ?? "Pendente de assinatura",
      attachment_name: item.attachment_name ?? null,
      attachment_data_url: item.attachment_data_url ?? null,
      signed_at: item.signed_at ?? null,
      signed_by: item.signed_by ?? null,
      notified_not_signed: Boolean(item.notified_not_signed),
      notified_15: Boolean(item.notified_15),
      notified_10: Boolean(item.notified_10),
      notified_5: Boolean(item.notified_5),
      movement_created_5: Boolean(item.movement_created_5)
    }));
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
      dependents_count: Number(item.dependents_count ?? 0),
      dependent_value: Number(item.dependent_value ?? 0),
      value_per_day: Number(item.value_per_day ?? 0),
      days_worked: Number(item.days_worked ?? 0),
      amount: Number(item.amount ?? 0)
    }));
    normalizeCompanyCatalogs(parsed);
    saveState(parsed);
    return parsed;
  } catch {
    return defaultState();
  }
}

function normalizeCompanyCatalogs(state: DemoState) {
  const primaryCompanyId = state.companies.find(item => item.is_primary)?.id ?? state.companies[0]?.id ?? 1;
  const centerTemplates = new Map<string, ResultCenter>();
  const typeTemplates = new Map<string, EmploymentType>();
  state.resultCenters.forEach(item => {
    const key = item.code.trim().toUpperCase();
    if (!centerTemplates.has(key) || item.company_id === primaryCompanyId) centerTemplates.set(key, item);
  });
  state.employmentTypes.forEach(item => {
    const key = normalizeText(item.name);
    if (!typeTemplates.has(key) || item.company_id === primaryCompanyId) typeTemplates.set(key, item);
  });
  let centerId = Math.max(0, ...state.resultCenters.map(item => item.id));
  let typeId = Math.max(0, ...state.employmentTypes.map(item => item.id));

  for (const company of state.companies) {
    for (const template of centerTemplates.values()) {
      const existing = state.resultCenters.find(item => item.company_id === company.id && item.code.trim().toUpperCase() === template.code.trim().toUpperCase());
      if (existing) Object.assign(existing, { code: template.code, name: template.name, color: template.color, active: template.active });
      else {
        state.resultCenters.push({ ...template, id: ++centerId, company_id: company.id });
      }
    }
    for (const template of typeTemplates.values()) {
      const existing = state.employmentTypes.find(item => item.company_id === company.id && normalizeText(item.name) === normalizeText(template.name));
      if (existing) Object.assign(existing, { name: template.name, has_charges: template.has_charges, active: template.active });
      else {
        state.employmentTypes.push({ ...template, id: ++typeId, company_id: company.id });
      }
    }
  }

  state.resultCenters = state.resultCenters.filter(item => Boolean(item.company_id));
  state.employmentTypes = state.employmentTypes.filter(item => Boolean(item.company_id));
  const centerFor = (companyId: number, current: ResultCenter) => state.resultCenters.find(item => item.company_id === companyId && item.code === current.code) ?? current;
  const typeFor = (companyId: number, current: EmploymentType) => state.employmentTypes.find(item => item.company_id === companyId && normalizeText(item.name) === normalizeText(current.name)) ?? current;
  state.employees.forEach(item => {
    item.result_center = centerFor(item.company_id, item.result_center);
    item.employment_type = typeFor(item.company_id, item.employment_type);
  });
  state.movements.forEach(item => { item.result_center = centerFor(item.company_id, item.result_center); });
  state.allocations.forEach(item => { item.result_center = centerFor(item.company_id, item.result_center); });
  state.meiContracts.forEach(item => { item.result_center = centerFor(item.company_id, item.result_center); });
  state.benefitDistributions.forEach(item => { item.result_center = centerFor(item.company_id, item.result_center); });
  const globalJobTitles = [...new Set(state.companies.flatMap(item => item.settings.job_titles ?? []).map(item => item.trim().toUpperCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  state.companies.forEach(item => { item.settings.job_titles = globalJobTitles; });
}

function saveState(state: DemoState) {
  localStorage.setItem(storageKey(), JSON.stringify(state));
}

function getCompanyId(params: URLSearchParams, state: DemoState): number {
  const requested = params.get("company_id");
  if (requested === null || requested === "") return state.companies[0]?.id ?? 1;
  const raw = Number(requested);
  if (raw === ALL_COMPANIES_ID) return ALL_COMPANIES_ID;
  if (Number.isFinite(raw) && state.companies.some(company => company.id === raw)) {
    return raw;
  }
  throw new Error("Empresa não encontrada.");
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
      is_primary: false,
      settings: state.companies[0]?.settings ?? demoCompanies[0]?.settings,
      backups: [],
      closing: state.companies[0]?.closing ?? demoCompanies[0]?.closing
    } satisfies DemoCompany;
  }
  return state.companies.find(company => company.id === companyId) ?? state.companies[0];
}

function scopeEmployees(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return state.employees;
  return state.employees.filter(employee => employee.company_id === companyId);
}

function scopeResultCenters(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return state.resultCenters;
  return state.resultCenters.filter(item => !item.company_id || item.company_id === companyId);
}

function scopeEmploymentTypes(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return state.employmentTypes;
  return state.employmentTypes.filter(item => !item.company_id || item.company_id === companyId);
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

function scopeMeiContracts(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return state.meiContracts;
  return state.meiContracts.filter(item => item.company_id === companyId);
}

function companyNameFor(state: DemoState, companyId: number) {
  if (companyId === ALL_COMPANIES_ID) return "Todas as empresas";
  return state.companies.find(company => company.id === companyId)?.name ?? "Sem empresa";
}

function settingsByCompany(state: DemoState) {
  return Object.fromEntries(state.companies.map(company => [company.id, company.settings])) as Record<number, DemoSettings>;
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

function localLaunchEligible(employee: DemoEmployee, kind: DemoLaunchBatch["kind"]) {
  if (employee.status === "INACTIVE") return false;
  if (kind === "MEI") return normalizeText(employee.employment_type.name) === "mei";
  if (kind === "BASIC_BASKET") return employee.benefits.some(value => normalizeText(value) === "cesta basica");
  return true;
}

function localLaunchResponse(state: DemoState, batch: DemoLaunchBatch) {
  const stored = new Map(batch.items.map(item => [item.employment_id, item]));
  const eligible = state.employees.filter(item => item.company_id === batch.company_id && localLaunchEligible(item, batch.kind));
  return {
    ...batch,
    total: roundMoney(batch.items.reduce((sum, item) => sum + item.amount, 0)),
    filled_count: batch.items.filter(item => item.amount > 0).length,
    eligible_count: eligible.length,
    employees: eligible.map(employee => ({
      employment_id: employee.id,
      employee_name: employee.employee.full_name,
      employee_code: employee.employee_code,
      supervisor_name: employee.supervisor_name,
      employment_type: employee.employment_type.name,
      result_center: employee.result_center,
      amount: stored.get(employee.id)?.amount ?? 0,
      note: stored.get(employee.id)?.note ?? ""
    }))
  };
}

function isValidCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

function isValidCpf(value: string) {
  if (/^(\d)\1+$/.test(value)) return false;
  const calc = (length: number) => {
    const sum = value.slice(0, length).split("").reduce((acc, digit, index) => acc + Number(digit) * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(value[9]) && calc(10) === Number(value[10]);
}

function isValidCnpj(value: string) {
  if (/^(\d)\1+$/.test(value)) return false;
  const calc = (length: 12 | 13) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = value.slice(0, length).split("").reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(value[12]) && calc(13) === Number(value[13]);
}

function benefitLabelFor(code: string) {
  return {
    VT: "Vale transporte",
    AL: "Alimentação",
    CB: "Cesta básica",
    PS: "Plano de saúde",
    SV: "Seguro de vida"
  }[normalizeBenefitCode(code)] ?? code;
}

function companyBenefitDistributionsFor(state: DemoState, companyId: number, competency: string) {
  return scopeBenefitDistributions(state, companyId).filter(item => item.competency === competency);
}

function closingKey(companyId: number, competency: string) {
  return `${companyId}:${competency}`;
}

function baseClosing(company: DemoCompany | undefined, competency: string): DemoClosing {
  const checklist = company?.closing?.checklist ?? demoCompanies[0].closing.checklist;
  return {
    competency,
    status: company?.closing?.competency === competency ? company.closing.status : "OPEN",
    checklist: { ...checklist }
  };
}

function getClosingFor(state: DemoState, companyId: number, competency: string) {
  const company = getCompany(state, companyId);
  return state.closings[closingKey(companyId, competency)] ?? baseClosing(company, competency);
}

function setClosingFor(state: DemoState, companyId: number, closing: DemoClosing) {
  state.closings = {
    ...state.closings,
    [closingKey(companyId, closing.competency)]: {
      ...closing,
      checklist: { ...closing.checklist }
    }
  };
  if (companyId !== ALL_COMPANIES_ID) {
    updateCompany(state, companyId, current => ({ ...current, closing }));
  }
}

function isCompetencyClosed(state: DemoState, companyId: number, competency: string) {
  return getClosingFor(state, companyId, competency).status === "CLOSED";
}

function closedCompanyIds(state: DemoState, companyId: number, competency: string) {
  const candidates = companyId === ALL_COMPANIES_ID
    ? state.companies.map(company => company.id)
    : [companyId];
  return candidates.filter(id => isCompetencyClosed(state, id, competency));
}

function daysUntil(value: string) {
  const target = new Date(`${value}T00:00:00`);
  const today = new Date();
  const diff = target.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.ceil(diff / 86400000);
}

function syncMeiContracts(state: DemoState) {
  let changed = false;
  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const hasMovement = (contractId: number, stage: string) =>
    state.movements.some(item => item.observation.includes(`MEI#${contractId}`) && item.observation.includes(stage));

  state.meiContracts.forEach(contract => {
    const daysLeft = Math.ceil((new Date(`${contract.end_date}T00:00:00`).getTime() - todayKey) / 86400000);

    if (contract.status === "Pendente de assinatura" && !contract.notified_not_signed) {
      contract.notified_not_signed = true;
      state.movements = [{
        id: nextId(state.movements),
        company_id: contract.company_id,
        competency: contract.end_date.slice(0, 7),
        employee_id: contract.employee_id,
        employee_name: contract.employee_name,
        type: "contrato não assinado",
        start_date: contract.created_at.slice(0, 10),
        end_date: contract.end_date,
        days: Math.max(daysLeft, 0),
        hour_impact: 0,
        result_center: contract.result_center,
        observation: `MEI#${contract.id} - contrato pendente de assinatura`,
        status: "Pendente"
      }, ...state.movements];
      changed = true;
    }

    if (contract.status === "Ativo") {
      if (daysLeft <= 15 && !contract.notified_15) {
        contract.notified_15 = true;
        changed = true;
      }
      if (daysLeft <= 10 && !contract.notified_10) {
        contract.notified_10 = true;
        changed = true;
      }
      if (daysLeft <= 5 && !contract.notified_5) {
        contract.notified_5 = true;
        changed = true;
      }
      if (daysLeft <= 5 && !contract.movement_created_5 && !hasMovement(contract.id, "5 dias")) {
        contract.movement_created_5 = true;
        state.movements = [{
          id: nextId(state.movements),
          company_id: contract.company_id,
          competency: contract.end_date.slice(0, 7),
          employee_id: contract.employee_id,
          employee_name: contract.employee_name,
          type: "contrato MEI a vencer",
          start_date: contract.end_date,
          end_date: contract.end_date,
          days: daysLeft,
          hour_impact: 0,
          result_center: contract.result_center,
          observation: `MEI#${contract.id} - falta renovação em ${Math.max(daysLeft, 0)} dia(s)`,
          status: "Pendente"
        }, ...state.movements];
        changed = true;
      }
    }
  });

  return changed;
}

function missingBenefitDistributions(state: DemoState, companyId: number, competency: string) {
  const activeEmployees = scopeEmployees(state, companyId).filter(employee => employee.status === "ACTIVE");
  const monthlyDistributions = companyBenefitDistributionsFor(state, companyId, competency);
  return activeEmployees.flatMap(employee => {
    return (employee.benefits ?? []).flatMap(rawBenefit => {
      const label = normalizeText(String(rawBenefit));
      const requiredCodes = label === "vale transporte" || label === "transporte" ? ["VT"] : label === "alimentação" ? ["AL"] : label === "cesta básica" || label === "cesta basica" ? ["CB"] : label === "plano de saúde" || label === "plano de saude" ? ["PS"] : label === "seguro de vida" || label === "seguro" ? ["SV"] : [];
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
  const meiAlerts = scopeMeiContracts(state, companyId).flatMap(contract => {
    const daysLeft = daysUntil(contract.end_date);
    const alerts: DemoAlert[] = [];
    if (contract.status === "Pendente de assinatura") {
      alerts.push({
        id: contract.id * 100 + 1,
        target_id: contract.id,
        company_id: contract.company_id,
        company_name: companyNameFor(state, contract.company_id),
        type: "Contrato não assinado",
        employee_name: contract.employee_name,
        result_center: contract.result_center,
        due_date: contract.end_date,
        message: `${contract.employee_name} possui contrato MEI aguardando assinatura.`,
        severity: "Alta"
      });
    }
    if (contract.status === "Ativo" && daysLeft <= 15) {
      alerts.push({
        id: contract.id * 100 + 2,
        target_id: contract.id,
        company_id: contract.company_id,
        company_name: companyNameFor(state, contract.company_id),
        type: "Contrato próximo do vencimento",
        employee_name: contract.employee_name,
        result_center: contract.result_center,
        due_date: contract.end_date,
        message: `${contract.employee_name} possui contrato MEI vencendo em ${Math.max(daysLeft, 0)} dia(s).`,
        severity: daysLeft <= 5 ? "Alta" : daysLeft <= 10 ? "Média" : "Baixa"
      });
    }
    return alerts;
  });
  const employees = scopeEmployees(state, companyId);
  return [...meiAlerts, ...employees.flatMap((employee, index) => {
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
  })].slice(0, 24);
}

function updateCompany(state: DemoState, companyId: number, update: (company: DemoCompany) => DemoCompany) {
  state.companies = state.companies.map(company => (company.id === companyId ? update(company) : company));
}

function cleanCompany(company: DemoCompany) {
  return {
    id: company.id,
    code: company.code,
    cnpj: company.cnpj ?? null,
    name: company.name,
    trade_name: company.trade_name ?? "",
    kind: company.kind,
    group_name: company.group,
    parent_company_id: company.parent_company_id,
    active: company.active,
    is_primary: company.is_primary,
    registration_status: company.registration_status ?? "",
    opening_date: company.opening_date ?? "",
    address: company.address ?? "",
    city: company.city ?? "",
    state: company.state ?? "",
    zip_code: company.zip_code ?? ""
  };
}

function cleanUser(user: User & { password: string; token: string }): User {
  return { id: user.id, username: user.username, full_name: user.full_name, role: user.role, active: user.active };
}

function getTokenUser(token?: string | null): User | null {
  const state = loadState();
  const found = state.users.find(user => user.token === token);
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

function formatCnpj(digits: string) {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function formatCep(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits.replace(/^(\d{5})(\d{3})$/, "$1-$2") : String(value ?? "");
}

function kindFromBrasilApi(value: unknown): DemoCompany["kind"] {
  const description = String(value ?? "").toUpperCase();
  if (description.includes("FILIAL")) return "FILIAL";
  if (description.includes("MATRIZ")) return "MATRIZ";
  return "OUTRA";
}

async function lookupBrasilApiCompany(digits: string) {
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!response.ok) throw new Error("Consulta de CNPJ indisponível no momento. Tente novamente ou preencha a empresa manualmente.");
  const data = await response.json() as Record<string, unknown>;
  const logradouro = [data.descricao_tipo_de_logradouro, data.logradouro].filter(Boolean).join(" ").trim();
  const address = [logradouro, data.numero, data.complemento, data.bairro].filter(Boolean).join(", ");
  const name = String(data.razao_social ?? "").trim() || `Empresa ${digits.slice(8, 12)}`;
  const tradeName = String(data.nome_fantasia ?? "").trim() || name;
  return {
    cnpj: formatCnpj(digits),
    code: `EMPRESA-${digits.slice(8, 12)}`,
    name,
    trade_name: tradeName,
    kind: kindFromBrasilApi(data.descricao_identificador_matriz_filial),
    group_name: tradeName,
    parent_company_id: null,
    active: String(data.descricao_situacao_cadastral ?? "").toUpperCase() !== "BAIXADA",
    status: String(data.descricao_situacao_cadastral ?? "ATIVA"),
    opening_date: String(data.data_inicio_atividade ?? ""),
    address,
    city: String(data.municipio ?? ""),
    state: String(data.uf ?? ""),
    zip_code: formatCep(data.cep),
    source: "BrasilAPI"
  };
}

const indicatorMonthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthCompetency(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function sumRows(rows: ReturnType<typeof payrollRows>, key: keyof ReturnType<typeof payrollRows>[number]) {
  return rows.reduce((acc, row) => acc + Number(row[key] ?? 0), 0);
}

function average(values: number[]) {
  const filled = values.filter(value => Number.isFinite(value));
  return filled.length ? filled.reduce((acc, value) => acc + value, 0) / filled.length : 0;
}

function buildIndicatorSheets(state: DemoState, companyId: number, competency: string) {
  const year = Number(competency.slice(0, 4)) || new Date().getFullYear();
  const centers = scopeResultCenters(state, companyId)
    .filter(center => center.active !== false)
    .filter((center, index, items) => items.findIndex(candidate => candidate.code === center.code) === index);
  const scopedEmployees = scopeEmployees(state, companyId);
  const scopedMovements = scopeMovements(state, companyId);

  const sheets = centers.reduce<Record<string, any>>((acc, center) => {
    const monthly = indicatorMonthLabels.map((monthLabel, monthIndex) => {
      const monthCompetence = monthCompetency(year, monthIndex);
      const closedIds = closedCompanyIds(state, companyId, monthCompetence);
      if (!closedIds.length) {
        return {
          monthLabel,
          rows: [],
          card: null,
          closed: false,
          salary: 0,
          proLabore: 0,
          profit: 0,
          benefit: 0,
          patronal: 0,
          fgts: 0,
          provision: 0,
          total: 0,
          plannedHours: 0,
          nonProductiveHours: 0
        };
      }

      const employees = scopedEmployees.filter(employee => closedIds.includes(employee.company_id) && employee.result_center.code === center.code);
      const monthMovements = scopedMovements.filter(item => closedIds.includes(item.company_id));
      const benefitDistributions = companyBenefitDistributionsFor(state, companyId, monthCompetence).filter(item => closedIds.includes(item.company_id) && item.result_center.code === center.code);
      const rows = payrollRows(employees, monthCompetence, benefitDistributions, settingsByCompany(state));
      const cards = dashboardCards(employees, monthMovements, monthCompetence, benefitDistributions, settingsByCompany(state), centers);
      const card = cards.find(item => item.code === center.code) ?? null;
      const plannedHours = Math.max(card?.active_employees ?? 0, 0) * 22 * 8;
      const nonProductiveHours = plannedHours * (card?.absenteeism ?? 0);
      const benefit = sumRows(rows, "transport") + sumRows(rows, "meal") + sumRows(rows, "lodging") + sumRows(rows, "insurance") + sumRows(rows, "health_plan");

      return {
        monthLabel,
        rows,
        card,
        closed: true,
        salary: sumRows(rows, "salary"),
        proLabore: sumRows(rows, "pro_labore"),
        profit: sumRows(rows, "profit_distribution"),
        benefit,
        patronal: sumRows(rows, "employer_contribution"),
        fgts: sumRows(rows, "fgts"),
        provision: sumRows(rows, "total_provisions"),
        total: sumRows(rows, "grand_total"),
        plannedHours,
        nonProductiveHours
      };
    });

    const costValues = (key: keyof typeof monthly[number]) => monthly.map(item => Number(item[key] ?? 0));
    const costRows = [
      { label: "Salário", values: costValues("salary"), total: costValues("salary").reduce((a, b) => a + b, 0) },
      { label: "Prolabore", values: costValues("proLabore"), total: costValues("proLabore").reduce((a, b) => a + b, 0) },
      { label: "Dist. Lucro", values: costValues("profit"), total: costValues("profit").reduce((a, b) => a + b, 0) },
      { label: "Benefício", values: costValues("benefit"), total: costValues("benefit").reduce((a, b) => a + b, 0) },
      { label: "Patronal", values: costValues("patronal"), total: costValues("patronal").reduce((a, b) => a + b, 0) },
      { label: "FGTS", values: costValues("fgts"), total: costValues("fgts").reduce((a, b) => a + b, 0) },
      { label: "Provisão", values: costValues("provision"), total: costValues("provision").reduce((a, b) => a + b, 0) },
      { label: "Total", values: costValues("total"), total: costValues("total").reduce((a, b) => a + b, 0) }
    ];

    const admissions = monthly.map(item => item.card?.admissions ?? 0);
    const terminations = monthly.map(item => item.card?.terminations ?? 0);
    const finalHeadcount = monthly.map(item => item.card?.active_employees ?? 0);
    const initialHeadcount = monthly.map(item => Math.max((item.card?.previous_active_employees ?? item.card?.active_employees ?? 0), 0));
    const averageHeadcount = monthly.map((item, index) => (initialHeadcount[index] + finalHeadcount[index]) / 2);
    const plannedHours = monthly.map(item => item.plannedHours);
    const nonProductiveHours = monthly.map(item => item.nonProductiveHours);
    const turnoverValues = monthly.map(item => item.card?.turnover ?? 0);
    const absenteeismValues = monthly.map(item => item.card?.absenteeism ?? 0);

    acc[center.code] = {
      title: `${center.code} ${year}`,
      subtitle: center.name,
      costRows,
      operationalRows: [
        { label: "Efetivo Inicial (Un)", values: initialHeadcount, total: initialHeadcount.at(-1) ?? 0 },
        { label: "Afastamentos", values: nonProductiveHours.map(value => value > 0 ? 1 : 0), total: nonProductiveHours.filter(value => value > 0).length },
        { label: "Novas Contratações (Un)", values: admissions, total: admissions.reduce((a, b) => a + b, 0) },
        { label: "Desligamentos (Un)", values: terminations, total: terminations.reduce((a, b) => a + b, 0) },
        { label: "Horas Programadas", values: plannedHours, total: plannedHours.reduce((a, b) => a + b, 0) },
        { label: "Horas não Produtivas", values: nonProductiveHours, total: nonProductiveHours.reduce((a, b) => a + b, 0) },
        { label: "Efetivo Médio", values: averageHeadcount, total: average(averageHeadcount) },
        { label: "Efetivo Final", values: finalHeadcount, total: finalHeadcount.at(-1) ?? 0 }
      ],
      financeRows: monthly.map((item, index) => ({
        month: indicatorMonthLabels[index],
        faturamento: 0,
        custo: item.total,
        percent: 0,
        meta: 0.09,
        metric: finalHeadcount[index],
        metricLabel: "Colab",
        costPerMetric: finalHeadcount[index] ? item.total / finalHeadcount[index] : 0
      })),
      turnoverRows: monthly.map((item, index) => ({
        month: indicatorMonthLabels[index],
        admissions: admissions[index],
        terminations: terminations[index],
        employees: finalHeadcount[index],
        turnover: turnoverValues[index],
        average: average(turnoverValues.slice(0, index + 1)),
        meta: 0.05
      })),
      absenteeismRows: monthly.map((item, index) => ({
        month: indicatorMonthLabels[index],
        planned: plannedHours[index],
        unproductive: nonProductiveHours[index],
        absenteeism: absenteeismValues[index],
        average: average(absenteeismValues.slice(0, index + 1)),
        meta: 0.04
      })),
      financeMetricLabel: "Colab",
      financeMetricUnit: "colaboradores",
      turnoverMeta: 0.05,
      absenteeismMeta: 0.04,
      costMeta: 0.09
    };
    return acc;
  }, {});

  return { year, centers, sheets };
}

export async function demoApi<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  await new Promise(resolve => window.setTimeout(resolve, 160));
  const method = options.method ?? "GET";
  const [route, queryString] = path.split("?");
  const params = new URLSearchParams(queryString ?? "");
  const state = loadState();
  const syncChanged = syncMeiContracts(state);
  if (syncChanged) saveState(state);
  const companyId = getCompanyId(params, state);
  const company = getCompany(state, companyId);

  if (route === "/setup/status" && method === "GET") return { configured: true } as T;

  if (route === "/auth/login" && method === "POST") {
    const payload = body<{ username?: string; password?: string }>(options);
    const username = String(payload.username ?? "").trim();
    const user = username ? state.users.find(item => item.username === username) : undefined;
    if (!user || !user.active || payload.password !== user.password) throw new Error("Usuário ou senha inválidos. Use admin/admin, consultor/consultor ou um usuário cadastrado e ativo.");
    return { access_token: user.token, user: cleanUser(user) } as T;
  }

  if (route === "/auth/me" && method === "GET") {
    const user = getTokenUser(token);
    if (!user) throw new Error("Sessão expirada. Entre novamente.");
    return user as T;
  }

  const currentUser = getTokenUser(token);
  if (!currentUser) throw new Error("Entre para acessar o sistema.");

  if (route === "/demo/competencies" && method === "GET") return demoCompetencies as T;

  if (route === "/dashboard" && method === "GET") {
    const competency = params.get("competency") ?? "2026-06";
    const scopedEmployees = scopeEmployees(state, companyId);
    const scopedMovements = scopeMovements(state, companyId);
    const benefitDistributions = companyBenefitDistributionsFor(state, companyId, competency);
    const cards = dashboardCards(scopedEmployees, scopedMovements, competency, benefitDistributions, settingsByCompany(state), scopeResultCenters(state, companyId).filter(item => item.active));
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

  if (route === "/companies" && method === "GET") return [...state.companies].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.code.localeCompare(b.code)).map(cleanCompany) as T;
  if (route === "/companies/lookup" && method === "GET") {
    const digits = String(params.get("cnpj") ?? "").replace(/\D/g, "");
    if (digits.length !== 14) throw new Error("CNPJ deve ter 14 dígitos.");
    const company = state.companies.find(item => item.cnpj?.replace(/\D/g, "") === digits);
    if (isOperationalLocalMode()) {
      const lookup = await lookupBrasilApiCompany(digits);
      return {
        ...lookup,
        code: company?.code ?? `EMPRESA-${digits.slice(8, 12)}`,
        parent_company_id: company?.parent_company_id ?? null,
        active: company?.active ?? lookup.active
      } as T;
    }
    return {
      cnpj: formatCnpj(digits),
      code: company?.code ?? `EMP-${digits.slice(8, 12)}`,
      name: company?.name ?? `Empresa ${digits.slice(0, 8)}`,
      trade_name: company?.group ?? company?.name ?? "Empresa Demo",
      kind: company?.kind ?? "OUTRA",
      group_name: company?.group ?? company?.name ?? "Grupo Demo",
      parent_company_id: company?.parent_company_id ?? null,
      active: company?.active ?? true,
      status: "ATIVA",
      opening_date: "2026-01-01",
      address: "Rua Demo, 100",
      city: "São Paulo",
      state: "SP",
      zip_code: "01000-000",
      source: "Modo demo"
    } as T;
  }
  if (route === "/companies" && method === "POST") {
    assertAdmin(token);
    const payload = body<{ code?: string; cnpj?: string; name?: string; trade_name?: string; kind?: DemoCompany["kind"]; group_name?: string; parent_company_id?: number | null; active?: boolean; is_primary?: boolean; registration_status?: string; opening_date?: string; address?: string; city?: string; state?: string; zip_code?: string }>(options);
    const item: DemoCompany = {
      id: nextId(state.companies),
      code: String(payload.code ?? `EMP-${nextId(state.companies)}`).trim().toUpperCase(),
      cnpj: payload.cnpj ? String(payload.cnpj) : null,
      name: String(payload.name ?? "Nova empresa").trim(),
      trade_name: String(payload.trade_name ?? payload.name ?? "").trim(),
      kind: (payload.kind as DemoCompany["kind"]) ?? "OUTRA",
      group: String(payload.group_name ?? payload.name ?? "Grupo").trim(),
      parent_company_id: payload.parent_company_id ?? null,
      active: typeof payload.active === "boolean" ? payload.active : true,
      is_primary: Boolean(payload.is_primary) || state.companies.length === 0,
      registration_status: String(payload.registration_status ?? "").trim(),
      opening_date: String(payload.opening_date ?? "").trim(),
      address: String(payload.address ?? "").trim(),
      city: String(payload.city ?? "").trim(),
      state: String(payload.state ?? "").trim().toUpperCase(),
      zip_code: String(payload.zip_code ?? "").trim(),
      settings: {
        ...(JSON.parse(JSON.stringify(demoCompanies[0].settings)) as DemoSettings),
        company_name: String(payload.name ?? "Nova empresa").trim(),
        cnpj: payload.cnpj ? String(payload.cnpj) : ""
      },
      backups: [],
      closing: JSON.parse(JSON.stringify(demoCompanies[0].closing)) as DemoClosing
    };
    if (item.is_primary) state.companies = state.companies.map(company => ({ ...company, is_primary: false }));
    state.companies = [...state.companies, item];
    const sourceCompanyId = state.companies.find(company => company.id !== item.id)?.id;
    const sourceCenters = state.resultCenters.filter(center => center.company_id === sourceCompanyId);
    const sourceTypes = state.employmentTypes.filter(type => type.company_id === sourceCompanyId);
    let nextCenterId = nextId(state.resultCenters);
    let nextTypeId = nextId(state.employmentTypes);
    state.resultCenters = [...state.resultCenters, ...sourceCenters.map(center => ({ ...center, id: nextCenterId++, company_id: item.id }))];
    state.employmentTypes = [...state.employmentTypes, ...sourceTypes.map(type => ({ ...type, id: nextTypeId++, company_id: item.id }))];
    saveState(state);
    return cleanCompany(item) as T;
  }
  if (route.startsWith("/companies/") && method === "PATCH") {
    assertAdmin(token);
    const id = Number(route.split("/")[2]);
    const payload = body<Partial<DemoCompany> & { group_name?: string }>(options);
    const current = state.companies.find(item => item.id === id);
    if (!current) throw new Error("Empresa não encontrada.");
    if (payload.is_primary) {
      state.companies = state.companies.map(company => ({ ...company, is_primary: company.id === id }));
    }
    state.companies = state.companies.map(company => company.id === id ? {
      ...company,
      code: payload.code ? String(payload.code).toUpperCase() : company.code,
      cnpj: payload.cnpj === undefined ? company.cnpj : String(payload.cnpj || ""),
      name: payload.name ? String(payload.name) : company.name,
      trade_name: payload.trade_name === undefined ? company.trade_name : String(payload.trade_name || ""),
      kind: payload.kind ?? company.kind,
      group: payload.group_name ? String(payload.group_name) : company.group,
      parent_company_id: payload.parent_company_id === undefined ? company.parent_company_id : payload.parent_company_id ?? null,
      active: payload.active === undefined ? company.active : Boolean(payload.active),
      is_primary: payload.is_primary === undefined ? company.is_primary : Boolean(payload.is_primary),
      registration_status: payload.registration_status === undefined ? company.registration_status : String(payload.registration_status || ""),
      opening_date: payload.opening_date === undefined ? company.opening_date : String(payload.opening_date || ""),
      address: payload.address === undefined ? company.address : String(payload.address || ""),
      city: payload.city === undefined ? company.city : String(payload.city || ""),
      state: payload.state === undefined ? company.state : String(payload.state || "").toUpperCase(),
      zip_code: payload.zip_code === undefined ? company.zip_code : String(payload.zip_code || ""),
      settings: {
        ...company.settings,
        company_name: payload.name ? String(payload.name) : company.settings.company_name,
        cnpj: payload.cnpj === undefined ? company.settings.cnpj : String(payload.cnpj || "")
      }
    } : company);
    saveState(state);
    return cleanCompany(state.companies.find(item => item.id === id) ?? current) as T;
  }
  if (route.startsWith("/companies/") && method === "DELETE") {
    assertAdmin(token);
    const id = Number(route.split("/")[2]);
    const payload = body<{ password?: string }>(options);
    const storedUser = state.users.find(user => user.token === token);
    if (!storedUser || payload.password !== storedUser.password) throw new Error("Senha de confirmação inválida.");
    const company = state.companies.find(item => item.id === id);
    if (!company) throw new Error("Empresa não encontrada.");
    if (company.is_primary) throw new Error("A empresa principal não pode ser excluída. Defina outra empresa como principal primeiro.");
    if (state.companies.some(item => item.parent_company_id === id)) throw new Error("Esta empresa possui filiais vinculadas. Remova ou transfira as filiais primeiro.");
    const blockers = [
      state.employees.some(item => item.company_id === id) && "colaboradores",
      state.movements.some(item => item.company_id === id) && "movimentações",
      state.meiContracts.some(item => item.company_id === id) && "contratos MEI",
      state.benefitDistributions.some(item => item.company_id === id) && "benefícios lançados",
      state.allocations.some(item => item.company_id === id) && "custos alocados",
      state.auditLogs.some(item => item.company_id === id) && "registros de auditoria"
    ].filter(Boolean);
    if (blockers.length) throw new Error(`Esta empresa possui registros vinculados: ${blockers.join(", ")}. Inative-a para preservar o histórico.`);
    const auditCompany = state.companies.find(item => item.id !== id && item.is_primary) ?? state.companies.find(item => item.id !== id);
    if (!auditCompany) throw new Error("A última empresa do sistema não pode ser excluída.");
    state.companies = state.companies.filter(item => item.id !== id);
    state.resultCenters = state.resultCenters.filter(item => item.company_id !== id);
    state.employmentTypes = state.employmentTypes.filter(item => item.company_id !== id);
    appendAudit(state, {
      company_id: auditCompany.id,
      module: "Empresas",
      action: "Empresa excluída",
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${company.code} | ${company.name} | cadastro sem movimentações ou registros operacionais`
    });
    saveState(state);
    return { deleted: true } as T;
  }

  if (route === "/demo/alerts" && method === "GET") return buildAlerts(state, companyId) as T;
  if (route === "/demo/audit-logs" && method === "GET") {
    const module = params.get("module")?.trim().toLowerCase() ?? "";
    const query = params.get("query")?.trim().toLowerCase() ?? "";
    const limit = Math.min(Math.max(Number(params.get("limit") ?? 100), 1), 200);
    return scopeAuditLogs(state, companyId)
      .filter(item => !module || item.module.toLowerCase() === module)
      .filter(item => !query || `${item.action} ${item.details} ${item.employee_name ?? ""} ${item.performed_by}`.toLowerCase().includes(query))
      .slice(0, limit) as T;
  }
  if (route === "/result-centers" && method === "GET") return scopeResultCenters(state, companyId) as T;
  if (route === "/employment-types" && method === "GET") return scopeEmploymentTypes(state, companyId) as T;
  if (route === "/employees" && method === "GET") return scopeEmployees(state, companyId) as T;
  if (route === "/demo/benefits/catalog" && method === "GET") return state.benefitDefinitions as T;
  if (route === "/demo/benefit-distributions" && method === "GET") {
    const competency = params.get("competency") ?? "2026-06";
    const benefitCode = params.get("benefit_code");
    return companyBenefitDistributionsFor(state, companyId, competency).filter(item => !benefitCode || normalizeBenefitCode(item.benefit_code) === normalizeBenefitCode(benefitCode)) as T;
  }

  if (route === "/demo/mei-contracts" && method === "GET") {
    return scopeMeiContracts(state, companyId).sort((a, b) => b.id - a.id) as T;
  }

  if (route === "/demo/mei-contracts" && method === "POST") {
    assertAdmin(token);
    if (companyId === ALL_COMPANIES_ID) throw new Error("Selecione uma empresa específica para lançar contratos MEI.");
    const payload = body<{ employee_id?: number; start_date?: string; end_date?: string }>(options);
    const employee = scopeEmployees(state, companyId).find(item => item.id === Number(payload.employee_id));
    if (!employee) throw new Error("Selecione um MEI cadastrado.");
    if (employee.employment_type.name !== "MEI") throw new Error("Selecione apenas colaboradores da modalidade MEI.");
    const startDate = String(payload.start_date ?? "").trim();
    const endDate = String(payload.end_date ?? "").trim();
    if (!startDate || !endDate) throw new Error("Informe a vigência do contrato.");
    const contract: DemoMeiContract = {
      id: nextId(state.meiContracts),
      company_id: companyId,
      employee_id: employee.id,
      employee_name: employee.employee.full_name,
      employee_code: employee.employee_code,
      result_center: employee.result_center,
      employment_type: employee.employment_type.name,
      status: "Pendente de assinatura",
      start_date: startDate,
      end_date: endDate,
      attachment_name: null,
      attachment_data_url: null,
      created_at: new Date().toLocaleString("pt-BR"),
      signed_at: null,
      signed_by: null,
      notified_not_signed: false,
      notified_15: false,
      notified_10: false,
      notified_5: false,
      movement_created_5: false
    };
    state.meiContracts = [contract, ...state.meiContracts];
    syncMeiContracts(state);
    appendAudit(state, {
      company_id: companyId,
      module: "Contratos MEI",
      action: "Contrato lançado",
      employee_name: contract.employee_name,
      result_center: contract.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${contract.start_date} até ${contract.end_date} | pendente de assinatura`
    });
    saveState(state);
    return contract as T;
  }

  if (route.startsWith("/demo/mei-contracts/") && route.endsWith("/sign") && method === "PATCH") {
    assertAdmin(token);
    const contractId = Number(route.split("/")[3]);
    const payload = body<{ attachment_name?: string; attachment_data_url?: string }>(options);
    const index = companyId === ALL_COMPANIES_ID
      ? state.meiContracts.findIndex(item => item.id === contractId)
      : state.meiContracts.findIndex(item => item.id === contractId && item.company_id === companyId);
    if (index < 0) throw new Error("Contrato MEI não encontrado");
    const current = state.meiContracts[index];
    if (!payload.attachment_name) throw new Error("Anexe o contrato para concluir a assinatura.");
    const updated: DemoMeiContract = {
      ...current,
      status: "Ativo",
      attachment_name: payload.attachment_name,
      attachment_data_url: payload.attachment_data_url ?? null,
      signed_at: new Date().toLocaleString("pt-BR"),
      signed_by: currentUser.full_name
    };
    state.meiContracts[index] = updated;
    state.movements.filter(item => item.observation.includes(`MEI#${contractId} - contrato pendente`)).forEach(item => { item.status = "Aplicada"; });
    syncMeiContracts(state);
    appendAudit(state, {
      company_id: companyId,
      module: "Contratos MEI",
      action: "Contrato assinado",
      employee_name: updated.employee_name,
      result_center: updated.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${updated.attachment_name} | contrato ativado`
    });
    saveState(state);
    return updated as T;
  }

  if (route.startsWith("/demo/mei-contracts/") && route.endsWith("/renew") && method === "POST") {
    assertAdmin(token);
    const contractId = Number(route.split("/")[3]);
    const source = state.meiContracts.find(item => item.id === contractId && (companyId === ALL_COMPANIES_ID || item.company_id === companyId));
    if (!source) throw new Error("Contrato MEI não encontrado");
    if (source.status !== "Ativo") throw new Error("Somente contratos ativos podem ser renovados.");
    if (state.meiContracts.some(item => item.company_id === source.company_id && item.employee_id === source.employee_id && item.status === "Pendente de assinatura")) throw new Error("Já existe uma renovação pendente de assinatura para este MEI.");
    const payload = body<{ start_date?: string; end_date?: string }>(options);
    const startDate = String(payload.start_date ?? "");
    const endDate = String(payload.end_date ?? "");
    if (!startDate || !endDate || endDate < startDate) throw new Error("Informe uma vigência válida.");
    const renewed: DemoMeiContract = { ...source, id: nextId(state.meiContracts), status: "Pendente de assinatura", start_date: startDate, end_date: endDate, attachment_name: null, attachment_data_url: null, created_at: new Date().toLocaleString("pt-BR"), signed_at: null, signed_by: null, notified_not_signed: false, notified_15: false, notified_10: false, notified_5: false, movement_created_5: false };
    state.meiContracts = [renewed, ...state.meiContracts];
    syncMeiContracts(state);
    appendAudit(state, { company_id: source.company_id, module: "Contratos MEI", action: "Renovação de contrato criada", employee_name: source.employee_name, result_center: source.result_center, performed_by: currentUser.full_name, performed_role: currentUser.role, details: `Contrato anterior #${source.id} | nova vigência ${startDate} a ${endDate}` });
    saveState(state);
    return renewed as T;
  }

  if (route.startsWith("/demo/mei-contracts/") && method === "PATCH") {
    assertAdmin(token);
    const contractId = Number(route.split("/")[3]);
    const index = state.meiContracts.findIndex(item => item.id === contractId && (companyId === ALL_COMPANIES_ID || item.company_id === companyId));
    if (index < 0) throw new Error("Contrato MEI não encontrado");
    const current = state.meiContracts[index];
    if (current.status !== "Pendente de assinatura") throw new Error("Contrato assinado não pode ser alterado. Use Renovar para preservar o documento original.");
    const payload = body<{ employee_id?: number; start_date?: string; end_date?: string }>(options);
    const employee = state.employees.find(item => item.id === Number(payload.employee_id ?? current.employee_id) && item.company_id === current.company_id && item.status === "ACTIVE" && item.employment_type.name === "MEI");
    if (!employee) throw new Error("Selecione um colaborador MEI ativo.");
    const startDate = String(payload.start_date ?? current.start_date);
    const endDate = String(payload.end_date ?? current.end_date);
    if (endDate < startDate) throw new Error("A vigência final não pode ser anterior à inicial.");
    const updated: DemoMeiContract = { ...current, employee_id: employee.id, employee_name: employee.employee.full_name, employee_code: employee.employee_code, result_center: employee.result_center, start_date: startDate, end_date: endDate };
    state.meiContracts[index] = updated;
    appendAudit(state, { company_id: updated.company_id, module: "Contratos MEI", action: "Contrato pendente editado", employee_name: updated.employee_name, result_center: updated.result_center, performed_by: currentUser.full_name, performed_role: currentUser.role, details: `${current.start_date} a ${current.end_date} → ${startDate} a ${endDate}` });
    saveState(state);
    return updated as T;
  }

  if (route.startsWith("/demo/mei-contracts/") && method === "DELETE") {
    assertAdmin(token);
    const contractId = Number(route.split("/")[3]);
    const index = state.meiContracts.findIndex(item => item.id === contractId && (companyId === ALL_COMPANIES_ID || item.company_id === companyId));
    if (index < 0) throw new Error("Contrato MEI não encontrado");
    const current = state.meiContracts[index];
    if (current.status !== "Pendente de assinatura") throw new Error("Contrato assinado não pode ser excluído; ele deve permanecer no histórico.");
    const payload = body<{ password?: string }>(options);
    const currentPassword = state.users.find(item => item.username === currentUser.username)?.password;
    if (!payload.password || payload.password !== currentPassword) throw new Error("Senha de confirmação inválida.");
    state.meiContracts.splice(index, 1);
    state.movements = state.movements.filter(item => !item.observation.includes(`MEI#${contractId} - contrato pendente`));
    appendAudit(state, { company_id: current.company_id, module: "Contratos MEI", action: "Contrato pendente excluído", employee_name: current.employee_name, result_center: current.result_center, performed_by: currentUser.full_name, performed_role: currentUser.role, details: `Contrato #${current.id} | ${current.start_date} a ${current.end_date}` });
    saveState(state);
    return { deleted: true } as T;
  }

  if (route === "/result-centers" && method === "POST") {
    assertAdmin(token);
    const payload = body<Partial<ResultCenter>>(options);
    const code = String(payload.code ?? "").trim().toUpperCase();
    const name = String(payload.name ?? "").trim().toUpperCase();
    if (!code || !name) throw new Error("Informe código e nome do Centro de Resultado.");
    if (state.resultCenters.some(item => item.code.toUpperCase() === code)) throw new Error("Código de Centro de Resultado já cadastrado no catálogo global.");
    let id = nextId(state.resultCenters);
    const created = state.companies.map(company => ({ id: id++, company_id: company.id, code, name, color: payload.color ?? "#2563eb", active: true }));
    state.resultCenters = [...state.resultCenters, ...created];
    saveState(state);
    return (created.find(item => item.company_id === companyId) ?? created[0]) as T;
  }

  if (route === "/employment-types" && method === "POST") {
    assertAdmin(token);
    const payload = body<Partial<EmploymentType>>(options);
    const name = String(payload.name ?? "").trim().toUpperCase();
    if (!name) throw new Error("Informe o nome da modalidade.");
    if (state.employmentTypes.some(item => normalizeText(item.name) === normalizeText(name))) throw new Error("Modalidade já cadastrada no catálogo global.");
    let id = nextId(state.employmentTypes);
    const created = state.companies.map(company => ({ id: id++, company_id: company.id, name, has_charges: Boolean(payload.has_charges), active: true }));
    state.employmentTypes = [...state.employmentTypes, ...created];
    saveState(state);
    return (created.find(item => item.company_id === companyId) ?? created[0]) as T;
  }

  if (route.startsWith("/result-centers/") && method === "PATCH") {
    assertAdmin(token);
    const id = Number(route.split("/")[2]);
    const item = state.resultCenters.find(center => center.id === id);
    if (!item) throw new Error("Centro de Resultado não encontrado.");
    const payload = body<Partial<ResultCenter>>(options);
    const nextCode = String(payload.code ?? item.code).trim().toUpperCase();
    if (state.resultCenters.some(center => center.code !== item.code && center.code === nextCode)) {
      throw new Error("Código de Centro de Resultado já cadastrado no catálogo global.");
    }
    state.resultCenters.filter(center => center.code === item.code).forEach(center => Object.assign(center, { code: nextCode, name: String(payload.name ?? item.name).trim().toUpperCase(), color: payload.color ?? item.color, active: payload.active ?? item.active }));
    saveState(state);
    return item as T;
  }

  if (route.startsWith("/result-centers/") && method === "DELETE") {
    assertAdmin(token);
    const id = Number(route.split("/")[2]);
    const item = state.resultCenters.find(center => center.id === id);
    if (!item) throw new Error("Centro de Resultado não encontrado.");
    const inUse = state.employees.some(employee => employee.result_center.code === item.code) || state.movements.some(movement => movement.result_center.code === item.code);
    if (inUse) throw new Error("Este Centro de Resultado possui colaboradores ou movimentações vinculadas. Inative-o em vez de excluir.");
    state.resultCenters = state.resultCenters.filter(center => center.code !== item.code);
    saveState(state);
    return undefined as T;
  }

  if (route.startsWith("/employment-types/") && method === "PATCH") {
    assertAdmin(token);
    const id = Number(route.split("/")[2]);
    const item = state.employmentTypes.find(type => type.id === id);
    if (!item) throw new Error("Modalidade não encontrada.");
    const payload = body<Partial<EmploymentType>>(options);
    const nextName = String(payload.name ?? item.name).trim().toUpperCase();
    if (state.employmentTypes.some(type => normalizeText(type.name) !== normalizeText(item.name) && normalizeText(type.name) === normalizeText(nextName))) {
      throw new Error("Modalidade já cadastrada no catálogo global.");
    }
    state.employmentTypes.filter(type => normalizeText(type.name) === normalizeText(item.name)).forEach(type => Object.assign(type, { name: nextName, has_charges: payload.has_charges ?? item.has_charges, active: payload.active ?? item.active }));
    saveState(state);
    return item as T;
  }

  if (route.startsWith("/employment-types/") && method === "DELETE") {
    assertAdmin(token);
    const id = Number(route.split("/")[2]);
    const item = state.employmentTypes.find(type => type.id === id);
    if (!item) throw new Error("Modalidade não encontrada.");
    if (state.employees.some(employee => normalizeText(employee.employment_type.name) === normalizeText(item.name))) throw new Error("Esta modalidade possui colaboradores, contratos ou movimentações vinculadas. Inative-a em vez de excluir.");
    state.employmentTypes = state.employmentTypes.filter(type => normalizeText(type.name) !== normalizeText(item.name));
    saveState(state);
    return undefined as T;
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
        dependents_count?: number;
        dependent_value?: number;
      }>;
      description?: string;
      source?: "Lote" | "Individual";
      days_worked?: number;
      value_per_day?: number;
      monthly_value?: number;
      dependents_count?: number;
      dependent_value?: number;
    }>(options);
    const competency = payload.competency ?? "2026-06";
    if (isCompetencyClosed(state, companyId, competency)) throw new Error("Competência fechada. Reabra o mês para alterar benefícios.");
    const benefitCode = normalizeBenefitCode(String(payload.benefit_code ?? ""));
    const benefit = state.benefitDefinitions.find(item => normalizeBenefitCode(item.code) === benefitCode);
    if (!benefit || !benefit.active) throw new Error("Selecione um benefício ativo.");
    const employeeIds = Array.isArray(payload.employee_ids) ? [...new Set(payload.employee_ids.map(Number))] : [];
    if (!employeeIds.length) throw new Error("Selecione ao menos um colaborador.");
    const description = String(payload.description ?? "").trim();
    if (!description) throw new Error("Informe a descrição da distribuição.");
    const payloadItems = payload.items ?? [];
    const hasDailyValue = Number(payload.days_worked ?? 0) > 0 && Number(payload.value_per_day ?? 0) > 0
      || payloadItems.some(item => Number(item.days_worked ?? 0) > 0 && Number(item.value_per_day ?? 0) > 0);
    const hasMonthlyValue = Number(payload.monthly_value ?? 0) > 0
      || payloadItems.some(item => Number(item.monthly_value ?? 0) + Number(item.dependents_count ?? 0) * Number(item.dependent_value ?? 0) > 0);
    if (benefit.mode === "DAILY" && !hasDailyValue) {
      throw new Error("Informe dias trabalhados e valor por dia maiores que zero.");
    }
    if (benefit.mode === "MONTHLY" && !hasMonthlyValue) {
      throw new Error("Informe um valor mensal maior que zero.");
    }
    const companyEmployees = scopeEmployees(state, companyId).filter(employee => employee.status === "ACTIVE");
    const eligibleEmployees = companyEmployees.filter(employee => employeeIds.includes(employee.id) && employee.benefits.some(item => normalizeText(item) === normalizeText(benefit.name) || normalizeText(item) === normalizeText(benefitLabelFor(benefit.code))));
    if (!eligibleEmployees.length) throw new Error("Nenhum colaborador elegível foi encontrado para este benefício.");
    const itemMap = new Map(payloadItems.filter(item => Number(item.employee_id) > 0).map(item => [Number(item.employee_id), item]));
    let nextDistributionId = nextId(state.benefitDistributions);
    const created: DemoBenefitDistribution[] = eligibleEmployees.map(employee => {
      const item = itemMap.get(employee.id);
      const daysWorked = benefit.mode === "DAILY" ? Number(item?.days_worked ?? payload.days_worked ?? 0) : 0;
      const valuePerDay = benefit.mode === "DAILY" ? Number(item?.value_per_day ?? payload.value_per_day ?? 0) : 0;
      const monthlyValue = benefit.mode === "MONTHLY" ? Number(item?.monthly_value ?? payload.monthly_value ?? 0) : 0;
      const dependentsCount = benefit.mode === "MONTHLY" ? Number(item?.dependents_count ?? payload.dependents_count ?? 0) : 0;
      const dependentValue = benefit.mode === "MONTHLY" ? Number(item?.dependent_value ?? payload.dependent_value ?? 0) : 0;
      const amount = benefit.mode === "DAILY" ? roundMoney(daysWorked * valuePerDay) : roundMoney(monthlyValue + dependentsCount * dependentValue);
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
        dependents_count: dependentsCount,
        dependent_value: dependentValue,
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

  if (route.startsWith("/demo/benefit-distributions/") && method === "PATCH") {
    assertAdmin(token);
    const id = Number(route.split("/")[3]);
    const payload = body<Partial<DemoBenefitDistribution>>(options);
    const item = state.benefitDistributions.find(distribution => distribution.id === id);
    if (!item) throw new Error("Distribuição de benefício não encontrada.");
    if (isCompetencyClosed(state, item.company_id, item.competency)) throw new Error("Competência fechada. Reabra o mês para alterar benefícios.");
    item.days_worked = Number(payload.days_worked ?? item.days_worked ?? 0);
    item.value_per_day = Number(payload.value_per_day ?? item.value_per_day ?? 0);
    item.monthly_value = Number(payload.monthly_value ?? item.monthly_value ?? 0);
    item.dependents_count = Number(payload.dependents_count ?? item.dependents_count ?? 0);
    item.dependent_value = Number(payload.dependent_value ?? item.dependent_value ?? 0);
    item.description = String(payload.description ?? item.description ?? "").trim();
    item.amount = item.days_worked > 0
      ? roundMoney(item.days_worked * item.value_per_day)
      : roundMoney(item.monthly_value + Number(item.dependents_count ?? 0) * Number(item.dependent_value ?? 0));
    appendAudit(state, {
      company_id: item.company_id,
      module: "Benefícios",
      action: "Distribuição alterada",
      employee_name: item.employee_name,
      result_center: item.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${item.benefit_name} | ${item.competency} | ${item.description}`
    });
    saveState(state);
    return item as T;
  }

  if (route.startsWith("/demo/benefit-distributions/") && method === "DELETE") {
    assertAdmin(token);
    const id = Number(route.split("/")[3]);
    const item = state.benefitDistributions.find(distribution => distribution.id === id);
    if (!item) throw new Error("Distribuição de benefício não encontrada.");
    if (isCompetencyClosed(state, item.company_id, item.competency)) throw new Error("Competência fechada. Reabra o mês para alterar benefícios.");
    state.benefitDistributions = state.benefitDistributions.filter(distribution => distribution.id !== id);
    appendAudit(state, {
      company_id: item.company_id,
      module: "Benefícios",
      action: "Distribuição removida",
      employee_name: item.employee_name,
      result_center: item.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${item.benefit_name} | ${item.competency} | ${item.description}`
    });
    saveState(state);
    return { ok: true } as T;
  }

  if (route === "/employees" && method === "POST") {
    assertAdmin(token);
    if (companyId === ALL_COMPANIES_ID) throw new Error("Selecione uma empresa específica para cadastrar colaboradores.");
    const payload = body<Record<string, any>>(options);
    const cpf = String(payload.cpf ?? "").replace(/\D/g, "");
    if (!isValidCpfCnpj(cpf)) throw new Error("CPF/CNPJ inválido.");
    const duplicate = state.employees.find(item => String(item.employee.cpf ?? "").replace(/\D/g, "") === cpf);
    if (duplicate) throw new Error(`CPF/CNPJ já cadastrado para ${duplicate.employee.full_name}. Reative ou transfira o cadastro existente.`);
    const type = state.employmentTypes.find(item => item.id === Number(payload.employment_type_id) && item.company_id === companyId);
    const center = state.resultCenters.find(item => item.id === Number(payload.result_center_id) && item.company_id === companyId);
    if (!type) throw new Error("Modalidade não pertence à empresa selecionada.");
    if (!center) throw new Error("Centro de Resultado não pertence à empresa selecionada.");
    const id = nextId(state.employees);
    const salary = Number(payload.salary_base || 0);
    const item: DemoEmployee = {
      id,
      company_id: companyId,
      employee_code: String(payload.employee_code ?? "").trim().toUpperCase(),
      job_title: String(payload.job_title ?? "").trim().toUpperCase(),
      department: String(payload.department ?? center.name).trim().toUpperCase(),
      admission_date: String(payload.admission_date ?? new Date().toISOString().slice(0, 10)),
      termination_date: null,
      status: "ACTIVE",
      daily_hours: String(payload.daily_hours ?? "8.80"),
      notes: String(payload.notes ?? "").trim().toUpperCase(),
      supervisor_name: String(payload.supervisor_name ?? "").trim().toUpperCase(),
      street: String(payload.street ?? "").trim().toUpperCase(),
      cep: String(payload.cep ?? ""),
      address_number: String(payload.address_number ?? ""),
      address_complement: String(payload.address_complement ?? "").trim().toUpperCase(),
      neighborhood: String(payload.neighborhood ?? "").trim().toUpperCase(),
      city: String(payload.city ?? "").trim().toUpperCase(),
      state: String(payload.state ?? "").trim().toUpperCase(),
      bank_code: String(payload.bank_code ?? ""),
      bank_name: String(payload.bank_name ?? "").trim().toUpperCase(),
      bank_agency: String(payload.bank_agency ?? ""),
      bank_account: String(payload.bank_account ?? ""),
      bank_account_digit: String(payload.bank_account_digit ?? ""),
      pix_key_type: (payload.pix_key_type as DemoEmployee["pix_key_type"]) ?? "CPF",
      pix_key: String(payload.pix_key ?? cpf),
      benefits: Array.isArray(payload.benefits) ? payload.benefits.map(value => String(value).trim()) : [],
      employee: { id, cpf, full_name: String(payload.full_name ?? "").trim().toUpperCase() },
      employment_type: type,
      result_center: center,
      salary_base: salary,
      cost_aid: payload.benefits?.includes("Ajuda de custo") ? Number(payload.cost_aid || 0) : 0,
      email: String(payload.email ?? ""),
      phone: String(payload.phone ?? ""),
      salary_history: [{ date: new Date().toISOString().slice(0, 10), amount: salary, family_allowance: 0, reason: "Cadastro inicial" }],
      movement_history: [{ date: new Date().toISOString().slice(0, 10), description: "Admissão cadastrada no sistema" }],
      vacations: [{ period: "A definir", status: "Pendente" }],
      leaves: []
    };
    state.employees = [...state.employees, item];
    saveState(state);
    appendAudit(state, {
      company_id: item.company_id,
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
    state.movements = [{
      id: nextId(state.movements),
      company_id: item.company_id,
      competency: effectiveDate.slice(0, 7),
      employee_id: item.id,
      employee_name: item.employee.full_name,
      type: "alteração salarial",
      start_date: effectiveDate,
      end_date: null,
      days: 0,
      hour_impact: 0,
      result_center: item.result_center,
      observation: `AJUSTE SALARIAL: ${historyEntry.reason} | NOVO SALÁRIO ${amount}`,
      status: "Aplicada"
    }, ...state.movements];
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

  if (route.startsWith("/employees/") && method === "PATCH") {
    assertAdmin(token);
    const employmentId = Number(route.split("/")[2]);
    const payload = body<Record<string, any>>(options);
    const item = companyId === ALL_COMPANIES_ID
      ? state.employees.find(employee => employee.id === employmentId)
      : state.employees.find(employee => employee.id === employmentId && employee.company_id === companyId);
    if (!item) throw new Error("Vínculo não encontrado");
    const previousCompanyId = item.company_id;
    const targetCompanyId = Number(payload.company_id ?? item.company_id);
    if (!state.companies.some(company => company.id === targetCompanyId)) throw new Error("Empresa de destino não encontrada.");
    const type = payload.employment_type_id ? state.employmentTypes.find(typeItem => typeItem.id === Number(payload.employment_type_id) && typeItem.company_id === targetCompanyId) : item.employment_type;
    const center = payload.result_center_id ? state.resultCenters.find(centerItem => centerItem.id === Number(payload.result_center_id) && centerItem.company_id === targetCompanyId) : item.result_center;
    if (!type) throw new Error("Modalidade não encontrada.");
    if (!center) throw new Error("Centro de Resultado não encontrado.");
    if (targetCompanyId !== previousCompanyId) {
      const lastNumber = state.employees
        .filter(employee => employee.id !== item.id && employee.company_id === targetCompanyId && employee.employee_code.startsWith(`${center.code}-`))
        .map(employee => Number(employee.employee_code.split("-").at(-1) ?? 0))
        .filter(Number.isFinite)
        .reduce((max, value) => Math.max(max, value), 0);
      item.company_id = targetCompanyId;
      item.employee_code = `${center.code}-${String(lastNumber + 1).padStart(3, "0")}`;
      state.movements = [{
        id: nextId(state.movements),
        company_id: targetCompanyId,
        competency: new Date().toISOString().slice(0, 7),
        employee_id: item.id,
        employee_name: item.employee.full_name,
        type: "transferência de Centro de Resultado",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: null,
        days: 0,
        hour_impact: 0,
        result_center: center,
        observation: `TRANSFERÊNCIA ENTRE EMPRESAS: ${companyNameFor(state, previousCompanyId)} PARA ${companyNameFor(state, targetCompanyId)}`,
        status: "Aplicada"
      }, ...state.movements];
    }
    const nextSalary = payload.salary_base === undefined ? item.salary_base : Number(payload.salary_base || 0);
    item.employee.full_name = String(payload.full_name ?? item.employee.full_name).trim().toUpperCase();
    item.job_title = String(payload.job_title ?? item.job_title).trim().toUpperCase();
    item.supervisor_name = String(payload.supervisor_name ?? item.supervisor_name).trim().toUpperCase();
    item.employment_type = type;
    item.result_center = center;
    item.admission_date = String(payload.admission_date ?? item.admission_date);
    item.status = (payload.status as DemoEmployee["status"]) ?? item.status;
    item.salary_base = nextSalary;
    item.cost_aid = Array.isArray(payload.benefits) && payload.benefits.includes("Ajuda de custo")
      ? Number(payload.cost_aid ?? item.cost_aid ?? 0)
      : 0;
    item.cep = String(payload.cep ?? item.cep);
    item.street = String(payload.street ?? item.street).trim().toUpperCase();
    item.address_number = String(payload.address_number ?? item.address_number);
    item.address_complement = String(payload.address_complement ?? item.address_complement).trim().toUpperCase();
    item.neighborhood = String(payload.neighborhood ?? item.neighborhood).trim().toUpperCase();
    item.city = String(payload.city ?? item.city).trim().toUpperCase();
    item.state = String(payload.state ?? item.state).trim().toUpperCase();
    item.email = String(payload.email ?? item.email).trim();
    item.phone = String(payload.phone ?? item.phone).replace(/\D/g, "");
    item.bank_code = String(payload.bank_code ?? item.bank_code);
    item.bank_name = String(payload.bank_name ?? item.bank_name).trim().toUpperCase();
    item.bank_agency = String(payload.bank_agency ?? item.bank_agency);
    item.bank_account = String(payload.bank_account ?? item.bank_account);
    item.bank_account_digit = String(payload.bank_account_digit ?? item.bank_account_digit);
    item.pix_key_type = (payload.pix_key_type as DemoEmployee["pix_key_type"]) ?? item.pix_key_type;
    item.pix_key = String(payload.pix_key ?? item.pix_key);
    item.notes = String(payload.notes ?? item.notes).trim().toUpperCase();
    item.benefits = Array.isArray(payload.benefits) ? payload.benefits.map(String) : item.benefits;
    if (payload.salary_mode === "correction" && item.salary_history.length) {
      const latest = [...item.salary_history].sort((a, b) => b.date.localeCompare(a.date))[0];
      latest.amount = nextSalary;
      latest.reason = "CORREÇÃO CADASTRAL";
    }
    appendAudit(state, {
      company_id: targetCompanyId,
      module: "Colaboradores",
      action: payload.salary_mode === "correction" ? "Correção cadastral" : "Edição cadastral",
      employee_name: item.employee.full_name,
      result_center: item.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `Cadastro atualizado | matrícula ${item.employee_code}`
    });
    saveState(state);
    return item as T;
  }
  if (route.startsWith("/employees/") && method === "DELETE") {
    assertAdmin(token);
    const employmentId = Number(route.split("/")[2]);
    const payload = body<{ password?: string }>(options);
    const storedUser = state.users.find(user => user.token === token);
    if (!storedUser || payload.password !== storedUser.password) throw new Error("Senha de confirmação inválida.");
    const item = companyId === ALL_COMPANIES_ID
      ? state.employees.find(employee => employee.id === employmentId)
      : state.employees.find(employee => employee.id === employmentId && employee.company_id === companyId);
    if (!item) throw new Error("Vínculo não encontrado");
    const blockers = [
      state.movements.some(movement => movement.employee_id === employmentId) && "movimentações",
      state.meiContracts.some(contract => contract.employee_id === employmentId) && "contratos MEI",
      state.benefitDistributions.some(distribution => distribution.employee_id === employmentId) && "benefícios lançados",
      Object.keys(state.payrollOverrides).some(key => key.endsWith(`:${employmentId}`)) && "ajustes de folha"
    ].filter(Boolean);
    if (blockers.length) throw new Error(`Este colaborador possui registros vinculados: ${blockers.join(", ")}. Inative-o para preservar o histórico.`);
    state.employees = state.employees.filter(employee => employee.id !== employmentId);
    appendAudit(state, {
      company_id: item.company_id,
      module: "Colaboradores",
      action: "Colaborador excluído",
      employee_name: item.employee.full_name,
      result_center: item.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `Matrícula ${item.employee_code} | cadastro sem movimentações ou registros operacionais`
    });
    saveState(state);
    return { deleted: true } as T;
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
      observation: payload.observation ?? "Movimentação criada no sistema.",
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
    const currentPassword = state.users.find(item => item.username === currentUser.username)?.password;
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

  if (route.startsWith("/demo/movements/") && method === "DELETE") {
    assertAdmin(token);
    const movementId = Number(route.split("/")[3]);
    const payload = body<{ password?: string }>(options);
    const currentPassword = state.users.find(item => item.username === currentUser.username)?.password;
    if (!payload.password || payload.password !== currentPassword) {
      throw new Error("Senha de confirmação inválida.");
    }
    const index = companyId === ALL_COMPANIES_ID
      ? state.movements.findIndex(item => item.id === movementId)
      : state.movements.findIndex(item => item.id === movementId && item.company_id === companyId);
    if (index < 0) throw new Error("Movimentação não encontrada");
    const [removed] = state.movements.splice(index, 1);
    appendAudit(state, {
      company_id: removed.company_id,
      module: "Movimentações",
      action: "Movimentação excluída",
      employee_name: removed.employee_name,
      result_center: removed.result_center,
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${removed.type} em ${removed.competency} excluída com confirmação por senha`
    });
    saveState(state);
    return undefined as T;
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

  if (route === "/demo/launches" && method === "GET") {
    const competency = params.get("competency") ?? "2026-06";
    return state.launchBatches
      .filter(item => item.company_id === companyId && item.competency === competency)
      .map(item => localLaunchResponse(state, item)) as T;
  }
  if (route === "/demo/launches" && method === "POST") {
    assertAdmin(token);
    if (companyId === ALL_COMPANIES_ID) throw new Error("Selecione uma empresa específica para realizar lançamentos.");
    const payload = body<{ competency: string; kind: DemoLaunchBatch["kind"] }>(options);
    let batch = state.launchBatches.find(item => item.company_id === companyId && item.competency === payload.competency && item.kind === payload.kind);
    if (!batch) {
      const now = new Date().toISOString();
      batch = { id: nextId(state.launchBatches), company_id: companyId, competency: payload.competency, kind: payload.kind, status: "PENDING", filters: {}, items: [], created_by: currentUser.full_name, updated_by: currentUser.full_name, created_at: now, updated_at: now, confirmed_at: null };
      state.launchBatches.push(batch);
      saveState(state);
    }
    return localLaunchResponse(state, batch) as T;
  }
  const launchMatch = route.match(/^\/demo\/launches\/(\d+)$/);
  if (launchMatch && method === "GET") {
    const batch = state.launchBatches.find(item => item.id === Number(launchMatch[1]) && item.company_id === companyId);
    if (!batch) throw new Error("Lançamento não encontrado.");
    return localLaunchResponse(state, batch) as T;
  }
  if (launchMatch && method === "PATCH") {
    assertAdmin(token);
    const batch = state.launchBatches.find(item => item.id === Number(launchMatch[1]) && item.company_id === companyId);
    if (!batch) throw new Error("Lançamento não encontrado.");
    if (batch.status !== "PENDING") throw new Error("Lançamento já confirmado e bloqueado para edição.");
    const payload = body<{ filters?: Record<string, string>; items?: DemoLaunchItem[] }>(options);
    const eligible = new Set(state.employees.filter(item => item.company_id === companyId && localLaunchEligible(item, batch.kind)).map(item => item.id));
    batch.filters = payload.filters ?? {};
    batch.items = (payload.items ?? []).filter(item => eligible.has(item.employment_id) && Number(item.amount) > 0).map(item => ({ ...item, amount: roundMoney(Number(item.amount)) }));
    batch.updated_by = currentUser.full_name;
    batch.updated_at = new Date().toISOString();
    saveState(state);
    return localLaunchResponse(state, batch) as T;
  }
  const confirmLaunchMatch = route.match(/^\/demo\/launches\/(\d+)\/confirm$/);
  if (confirmLaunchMatch && method === "POST") {
    assertAdmin(token);
    const batch = state.launchBatches.find(item => item.id === Number(confirmLaunchMatch[1]) && item.company_id === companyId);
    if (!batch) throw new Error("Lançamento não encontrado.");
    if (batch.status !== "PENDING") throw new Error("Este lançamento já foi confirmado.");
    if (!batch.items.length) throw new Error("Informe ao menos um valor antes de confirmar.");
    if (batch.kind === "BASIC_BASKET") {
      for (const item of batch.items) {
        const employee = state.employees.find(value => value.id === item.employment_id)!;
        state.benefitDistributions.push({
          id: nextId(state.benefitDistributions), company_id: companyId, competency: batch.competency,
          benefit_code: "CB", benefit_name: "Cesta básica", employee_id: employee.id,
          employee_name: employee.employee.full_name, result_center: employee.result_center,
          supervisor_name: employee.supervisor_name, employment_type: employee.employment_type.name,
          state: employee.state, days_worked: 0, value_per_day: 0, monthly_value: item.amount,
          amount: item.amount, source: "Lançamentos", description: "Lançamento mensal confirmado",
          created_at: new Date().toLocaleString("pt-BR"), created_by: currentUser.full_name
        });
      }
    } else {
      const field = batch.kind === "MEI" ? "pro_labore" : "profit_distribution";
      for (const item of batch.items) {
        const key = `${companyId}:${batch.competency}:${item.employment_id}`;
        state.payrollOverrides[key] = { ...(state.payrollOverrides[key] ?? {}), [field]: item.amount };
      }
    }
    batch.status = "CONFIRMED";
    batch.confirmed_at = new Date().toISOString();
    batch.updated_at = batch.confirmed_at;
    appendAudit(state, { company_id: companyId, module: "Lançamentos", action: "Lançamento confirmado", performed_by: currentUser.full_name, performed_role: currentUser.role, details: `${batch.kind} | ${batch.competency} | ${batch.items.length} colaborador(es)` });
    saveState(state);
    return localLaunchResponse(state, batch) as T;
  }

  if (route === "/demo/payroll" && method === "GET") {
    const competency = params.get("competency") ?? "2026-06";
    const rows = payrollRows(scopeEmployees(state, companyId), competency, companyBenefitDistributionsFor(state, companyId, competency), settingsByCompany(state));
    return rows.map(row => {
      const override = state.payrollOverrides[`${row.result_center.company_id ?? companyId}:${competency}:${row.employee_id}`] ?? state.payrollOverrides[`${companyId}:${competency}:${row.employee_id}`];
      const employee = state.employees.find(item => item.id === row.employee_id);
      const rates = employee ? settingsByCompany(state)[employee.company_id]?.payroll_rates : undefined;
      return override && rates ? recalculatePayrollRow({ ...row, ...override }, rates) : row;
    }) as T;
  }
  if (route.startsWith("/demo/payroll/") && method === "PATCH") {
    assertAdmin(token);
    const employmentId = Number(route.split("/").at(-1));
    const competency = params.get("competency") ?? "2026-06";
    if (isCompetencyClosed(state, companyId, competency)) throw new Error("Competência fechada. Reabra o mês para editar o custo.");
    state.payrollOverrides[`${companyId}:${competency}:${employmentId}`] = body<Record<string, number>>(options);
    saveState(state);
    return { saved: true, employment_id: employmentId, competency } as T;
  }
  if (route === "/demo/indicators" && method === "GET") {
    const competency = params.get("competency") ?? "2026-06";
    const closedIds = closedCompanyIds(state, companyId, competency);
    const employees = scopeEmployees(state, companyId).filter(item => closedIds.includes(item.company_id));
    const movements = scopeMovements(state, companyId).filter(item => closedIds.includes(item.company_id));
    const benefits = companyBenefitDistributionsFor(state, companyId, competency).filter(item => closedIds.includes(item.company_id));
    return consolidatedIndicators(employees, movements, competency, benefits, settingsByCompany(state)) as T;
  }
  if (route === "/demo/indicators/sheets" && method === "GET") return buildIndicatorSheets(state, companyId, params.get("competency") ?? "2026-06") as T;
  if (route === "/demo/settings" && method === "GET") return company.settings as T;
  if (route === "/demo/report-templates" && method === "GET") {
    return (state.reportTemplates[String(companyId)] ?? []) as T;
  }
  if (route === "/demo/report-templates" && method === "PUT") {
    assertAdmin(token);
    const payload = body<unknown[]>(options);
    state.reportTemplates[String(companyId)] = Array.isArray(payload) ? payload : [];
    saveState(state);
    return state.reportTemplates[String(companyId)] as T;
  }
  if (route === "/demo/indicator-revenue" && method === "GET") {
    return state.indicatorRevenue as T;
  }
  if (route === "/demo/indicator-revenue" && method === "PATCH") {
    assertAdmin(token);
    const payload = body<{ scope?: string; values?: Record<string, number> }>(options);
    if (!payload.scope || !payload.values) throw new Error("Escopo e valores de faturamento são obrigatórios.");
    state.indicatorRevenue[payload.scope] = payload.values;
    saveState(state);
    return state.indicatorRevenue as T;
  }
  if (route === "/demo/settings" && method === "POST") {
    assertAdmin(token);
    const payload = body<Partial<DemoSettings>>(options);
    const normalizedPayload: Partial<DemoSettings> = { ...payload };
    if (Array.isArray(payload.job_titles)) {
      normalizedPayload.job_titles = [...new Set(payload.job_titles.map(item => String(item).trim().toUpperCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    if (Array.isArray(normalizedPayload.job_titles)) {
      state.companies = state.companies.map(current => ({ ...current, settings: { ...current.settings, job_titles: normalizedPayload.job_titles! } }));
      delete normalizedPayload.job_titles;
    }
    if (companyId === ALL_COMPANIES_ID) {
      state.companies = state.companies.map(current => ({ ...current, settings: { ...current.settings, ...normalizedPayload } }));
    } else {
      updateCompany(state, companyId, current => ({ ...current, settings: { ...current.settings, ...normalizedPayload } }));
    }
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
  if (route === "/users" && method === "GET") {
    return state.users.map(cleanUser) as T;
  }
  if (route === "/users" && method === "POST") {
    assertAdmin(token);
    const payload = body<{ username?: string; full_name?: string; role?: User["role"]; password?: string }>(options);
    const username = String(payload.username ?? "").trim().toLowerCase();
    const fullName = String(payload.full_name ?? "").trim();
    const password = String(payload.password ?? "").trim();
    const role = (payload.role as User["role"]) ?? "CONSULTANT";
    if (!username || !fullName || !password) throw new Error("Informe usuário, nome e senha.");
    if (state.users.some(item => item.username.toLowerCase() === username)) throw new Error("Já existe um usuário com esse login.");
    const item: DemoAppUser = {
      id: nextId(state.users),
      username,
      full_name: fullName,
      role,
      active: true,
      password,
      token: `demo-${username.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`
    };
    state.users = [...state.users, item];
    appendAudit(state, {
      company_id: companyId,
      module: "Usuários",
      action: "Usuário cadastrado",
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${item.username} (${item.role})`
    });
    saveState(state);
    return cleanUser(item) as T;
  }
  if (route.startsWith("/users/") && method === "PATCH") {
    assertAdmin(token);
    const payload = body<{ id?: number; active?: boolean; password?: string }>(options);
    const item = state.users.find(user => user.id === Number(route.split("/").at(-1)));
    if (!item) throw new Error("Usuário não encontrado.");
    if (typeof payload.active === "boolean") item.active = payload.active;
    if (payload.password) item.password = String(payload.password);
    appendAudit(state, {
      company_id: companyId,
      module: "Usuários",
      action: "Usuário atualizado",
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: `${item.username} | ${item.active ? "ativo" : "inativo"}`
    });
    saveState(state);
    return cleanUser(item) as T;
  }
  if ((route === "/demo/backups" || route === "/backups") && method === "GET") return company.backups as T;
  if ((route === "/demo/backups" || route === "/backups") && method === "POST") {
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
    return { message: "Backup registrado com sucesso.", path: item.file, backup: item } as T;
  }
  if (route === "/demo/closing" && method === "GET") {
    const competency = params.get("competency") ?? company.closing.competency ?? "2026-06";
    const closing = getClosingFor(state, companyId, competency);
    return { ...closing, warnings: missingBenefitDistributions(state, companyId, competency).map(item => `${item.employee_name} - ${item.benefit}`) } as T;
  }
  if (route === "/demo/closing" && method === "POST") {
    assertAdmin(token);
    const payload = body<{ competency?: string; status: "OPEN" | "CLOSED"; justification?: string }>(options);
    const competency = payload.competency ?? company.closing.competency ?? "2026-06";
    const currentClosing = getClosingFor(state, companyId, competency);
    const missing = missingBenefitDistributions(state, companyId, competency);
    if (payload.status === "CLOSED" && missing.length && !String(payload.justification ?? "").trim()) {
      throw new Error(`Há benefícios pendentes para fechamento: ${missing.map(item => `${item.employee_name} (${item.benefit})`).join(", ")}. Informe a justificativa para registrar a pendência.`);
    }
    const updatedClosing: DemoClosing = { ...currentClosing, competency, status: payload.status };
    setClosingFor(state, companyId, updatedClosing);
    appendAudit(state, {
      company_id: companyId,
      module: "Fechamento",
      action: payload.status === "CLOSED" ? "Competência fechada" : "Competência reaberta",
      performed_by: currentUser.full_name,
      performed_role: currentUser.role,
      details: payload.status === "CLOSED" ? `${competency} | Status alterado para ${payload.status}${payload.justification ? ` | Justificativa: ${payload.justification}` : ""}` : `${competency} | Status alterado para ${payload.status}`
    });
    if (payload.status === "CLOSED" && payload.justification) {
      state.movements = [
        {
          id: nextId(state.movements),
          company_id: companyId,
          competency,
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
    return { ...getClosingFor(state, companyId, competency), warnings: missingBenefitDistributions(state, companyId, competency).map(item => `${item.employee_name} - ${item.benefit}`) } as T;
  }
  if (route === "/demo/report-preview" && method === "GET") {
    const scopedEmployees = scopeEmployees(state, companyId);
    const scopedMovements = scopeMovements(state, companyId);
    const competency = params.get("competency") ?? "2026-06";
    return { company: company.settings.company_name, company_logo: company.settings.company_logo ?? "", competency, cards: dashboardCards(scopedEmployees, scopedMovements, competency, companyBenefitDistributionsFor(state, companyId, competency), settingsByCompany(state), scopeResultCenters(state, companyId).filter(item => item.active)) } as T;
  }
  if (route === "/demo/import-preview" && method === "POST") {
    assertAdmin(token);
    return {
      rows: 18,
      valid: 14,
      errors: ["CPF duplicado na linha 4", "Centro de Resultado inválido na linha 7", "Campo obrigatório ausente na linha 11", "Valor numérico inválido na linha 16"],
      message: "Prévia gerada com sucesso."
    } as T;
  }

  throw new Error(`Rota demo não implementada: ${method} ${route}`);
}
