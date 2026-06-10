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
  | "alteração salarial";

export interface Competency {
  id: string;
  label: string;
  status: CompetencyStatus;
}

export interface DemoEmployee extends Employment {
  company_id: number;
  salary_base: number;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  bank_account_digit: string;
  pix_key_type: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";
  pix_key: string;
  email: string;
  phone: string;
  salary_history: { date: string; amount: number; family_allowance: number; reason: string }[];
  movement_history: { date: string; description: string }[];
  vacations: { period: string; status: string }[];
  leaves: { period: string; reason: string; days: number }[];
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
  family_allowance: number;
  pro_labore: number;
  profit_distribution: number;
  cost_aid: number;
  meal: number;
  health: number;
  insurance: number;
  dental: number;
  charges: number;
  provisions: number;
  gross_payroll: number;
  net_payroll: number;
  total_cost: number;
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
  id: number;
  company_id: number;
  company_name: string;
  type: "Férias vencendo" | "Retorno de afastamento" | "Contrato próximo do vencimento" | "Ajuste pendente";
  employee_name: string;
  result_center: ResultCenter;
  due_date: string;
  message: string;
  severity: "Baixa" | "Média" | "Alta";
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
  initial_month: string;
  default_daily_hours: number;
  include_saturdays: boolean;
  include_sundays: boolean;
  holidays: string[];
  charges: { name: string; rate: number }[];
  backup_directory: string;
  auto_backup_on_start: boolean;
  backup_retention: number;
}

export interface DemoBackup {
  id: number;
  date: string;
  file: string;
  size: string;
  status: "Concluído" | "Validado";
}

export interface DemoClosing {
  competency: string;
  status: CompetencyStatus;
  checklist: Record<string, boolean>;
}

export type DemoCompanyKind = "MATRIZ" | "FILIAL" | "OUTRA";

export interface DemoCompany {
  id: number;
  code: string;
  name: string;
  kind: DemoCompanyKind;
  group: string;
  parent_company_id: number | null;
  active: boolean;
  settings: DemoSettings;
  backups: DemoBackup[];
  closing: DemoClosing;
}
