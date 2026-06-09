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
  salary_base: number;
  email: string;
  phone: string;
  salary_history: { date: string; amount: number; reason: string }[];
  movement_history: { date: string; description: string }[];
  vacations: { period: string; status: string }[];
  leaves: { period: string; reason: string; days: number }[];
}

export interface DemoMovement {
  id: number;
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

export interface DashboardResponseDemo {
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
  top_costs: Record<string, { employee: string; cost: number }[]>;
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
