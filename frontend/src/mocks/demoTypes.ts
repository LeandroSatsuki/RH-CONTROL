import { DashboardCard, Employment, EmploymentType, ResultCenter } from "../types";

export type CompetencyStatus = "OPEN" | "CLOSED";
export type MovementType =
  | "admissão"
  | "desligamento"
  | "falta"
  | "atestado"
  | "afastamento"
  | "férias"
  | "transferência de Centro de Resultado"
  | "alteração salarial"
  | "contrato não assinado"
  | "contrato MEI a vencer";

export interface Competency {
  id: string;
  label: string;
  status: CompetencyStatus;
}

export interface DemoEmployee extends Employment {
  company_id: number;
  salary_base: number;
  cost_aid: number;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  bank_account_digit: string;
  pix_key_type: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";
  pix_key: string;
  benefits: string[];
  email: string;
  phone: string;
  salary_history: { date: string; effective_date?: string; amount: number; family_allowance: number; reason: string }[];
  movement_history: { date: string; description: string }[];
  vacations: { period: string; status: string }[];
  leaves: { period: string; reason: string; days: number }[];
}

export interface DemoAppUser {
  id: number;
  username: string;
  full_name: string;
  role: "ADMIN" | "CONSULTANT";
  active: boolean;
  password: string;
  token: string;
}

export interface DemoMovement {
  id: number;
  company_id: number;
  competency: string;
  employee_id: number;
  employee_name: string;
  type: MovementType;
  start_date: string;
  end_date: string | null;
  days: number;
  hour_impact: number;
  result_center: ResultCenter;
  observation: string;
  status: "Pendente" | "Conferida" | "Aplicada";
}

export interface PayrollRow {
  employee_id: number;
  employee_name: string;
  result_center: ResultCenter;
  employment_type: EmploymentType;
  salary: number;
  pro_labore: number;
  profit_distribution: number;
  cost_aid: number;
  transport: number;
  meal: number;
  lodging: number;
  insurance: number;
  health_plan: number;
  subtotal_earnings: number;
  inss: number;
  rat: number;
  terceiros: number;
  fgts: number;
  charges: number;
  vacation: number;
  vacation_third: number;
  fgts_vacation: number;
  thirteenth_salary: number;
  fgts_thirteenth_salary: number;
  notice_indemnity: number;
  fgts_notice: number;
  fgts_fine: number;
  employer_contribution: number;
  total_provisions: number;
  gross_payroll: number;
  net_payroll: number;
  total_cost: number;
  grand_total: number;
}

export interface DemoCostAllocation {
  id: number;
  company_id: number;
  competency: string;
  result_center: ResultCenter;
  category: string;
  description: string;
  amount: number;
  source: string;
  allocated_at: string;
  status: "Lançado" | "Revisado" | "Aprovado";
}

export interface DemoAlert {
  id: number | string;
  target_id?: number;
  company_id: number;
  company_name: string;
  type: "Férias vencendo" | "Retorno de afastamento" | "Contrato próximo do vencimento" | "Contrato não assinado" | "Ajuste pendente";
  employee_name: string;
  result_center: ResultCenter;
  due_date: string;
  message: string;
  severity: "Baixa" | "Média" | "Alta";
}

export interface DemoMeiContract {
  id: number;
  company_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  result_center: ResultCenter;
  employment_type: string;
  status: "Pendente de assinatura" | "Ativo";
  start_date: string;
  end_date: string;
  attachment_name: string | null;
  attachment_data_url: string | null;
  created_at: string;
  signed_at: string | null;
  signed_by: string | null;
  notified_not_signed: boolean;
  notified_15: boolean;
  notified_10: boolean;
  notified_5: boolean;
  movement_created_5: boolean;
}

export interface DemoAuditEntry {
  id: number;
  company_id: number;
  company_name: string;
  module: string;
  action: string;
  employee_name?: string;
  result_center?: ResultCenter;
  performed_by: string;
  performed_role: "ADMIN" | "CONSULTANT";
  created_at: string;
  details: string;
}

export interface DashboardResponseDemo {
  company: {
    id: number;
    code: string;
    name: string;
    kind: DemoCompanyKind;
    group: string;
    group_name?: string;
  } | null;
  month: number;
  year: number;
  competency: string;
  cards: DashboardCard[];
  consolidated: {
    active_employees: number;
    admissions: number;
    terminations: number;
    gross_payroll: number;
    net_payroll: number;
    total_cost: number;
    absenteeism: number;
    turnover: number;
  };
  alerts: string[];
}

export interface IndicatorSummary {
  initial_headcount: number;
  admissions: number;
  terminations: number;
  final_headcount: number;
  average_headcount: number;
  absenteeism: number;
  turnover: number;
  gross_payroll: number;
  net_payroll: number;
  salary_per_capita: number;
  total_cost: number;
  productive_days: number;
  non_productive_hours: number;
}

export interface DemoSettings {
  company_name: string;
  cnpj: string;
  company_logo: string;
  initial_month: string;
  default_daily_hours: number;
  include_saturdays: boolean;
  include_sundays: boolean;
  holidays: string[];
  charges: { name: string; rate: number }[];
  payroll_rates: {
    inss: number;
    rat: number;
    terceiros: number;
    fgts: number;
    fgts_vacation: number;
    fgts_thirteenth: number;
    fgts_notice: number;
    multa_fgts: number;
    patronal: number;
  };
  backup_directory: string;
  auto_backup_on_start: boolean;
  backup_retention: number;
  job_titles: string[];
}

export interface DemoBackup {
  id: number;
  date: string;
  file: string;
  size: string;
  status: "Concluído" | "Validado" | "Disponível";
}

export interface DemoClosing {
  competency: string;
  status: CompetencyStatus;
  checklist: Record<string, boolean>;
  warnings?: string[];
}

export type BenefitDistributionMode = "DAILY" | "MONTHLY";

export interface DemoBenefitDefinition {
  id: number;
  code: "VT" | "AL" | "PS" | "SV" | string;
  name: string;
  active: boolean;
  mode: BenefitDistributionMode;
  applies_to: string[];
  notes: string;
}

export interface DemoBenefitDistribution {
  id: number;
  company_id: number;
  competency: string;
  benefit_code: string;
  benefit_name: string;
  employee_id: number;
  employee_name: string;
  result_center: ResultCenter;
  supervisor_name: string;
  employment_type: string;
  state: string;
  days_worked: number;
  value_per_day: number;
  monthly_value: number;
  dependents_count?: number;
  dependent_value?: number;
  amount: number;
  source: "Lote" | "Individual";
  description: string;
  created_at: string;
  created_by: string;
}

export interface DemoReportTemplateField {
  source: string;
  field: string;
  label: string;
  aggregator: "none" | "sum" | "avg" | "count" | "min" | "max" | "multiply";
}

export type DemoCompanyKind = "MATRIZ" | "FILIAL" | "OUTRA";

export interface DemoCompany {
  id: number;
  code: string;
  cnpj?: string | null;
  name: string;
  trade_name?: string;
  kind: DemoCompanyKind;
  group: string;
  parent_company_id: number | null;
  active: boolean;
  is_primary: boolean;
  registration_status?: string;
  opening_date?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  settings: DemoSettings;
  backups: DemoBackup[];
  closing: DemoClosing;
}
