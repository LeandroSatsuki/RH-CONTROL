export type Role = "ADMIN" | "CONSULTANT";

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

export interface Employment {
  id: number;
  employee_code: string;
  job_title: string;
  department: string;
  admission_date: string;
  termination_date: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
  daily_hours: string;
  notes: string;
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

