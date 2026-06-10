export type Role = "ADMIN" | "CONSULTANT";
export type CompanyKind = "MATRIZ" | "FILIAL" | "OUTRA";
export type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  active: boolean;
}

export interface ResultCenter {
  id: number;
  code: string;
  name: string;
  color: string;
  active: boolean;
}

export interface EmploymentType {
  id: number;
  name: string;
  has_charges: boolean;
  active: boolean;
}

export interface Company {
  id: number;
  code: string;
  name: string;
  kind: CompanyKind;
  group_name: string;
  parent_company_id: number | null;
  active: boolean;
}

export interface Employment {
  id: number;
  company_id: number;
  employee_code: string;
  job_title: string;
  department: string;
  admission_date: string;
  termination_date: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
  daily_hours: string;
  salary_base: number;
  notes: string;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  bank_account_digit: string;
  pix_key_type: PixKeyType;
  pix_key: string;
  salary_history?: { date: string; amount: number; family_allowance: number; reason: string }[];
  employee: { id: number; cpf: string; full_name: string };
  employment_type: EmploymentType;
  result_center: ResultCenter;
}

export interface DashboardCard {
  id: number;
  code: string;
  name: string;
  color: string;
  active_employees: number;
  by_employment_type: Record<string, number>;
  admissions: number;
  terminations: number;
  absenteeism: number;
  turnover: number;
  gross_payroll: number;
  net_payroll: number;
  total_cost: number;
  previous_active_employees: number;
}
