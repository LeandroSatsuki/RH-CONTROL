import { DashboardCard, ResultCenter } from "../types";
import { demoCompanies, demoEmploymentTypes, demoResultCenters } from "./demoData";
import { DemoBenefitDistribution, DemoEmployee, DemoMovement, IndicatorSummary, PayrollRow, DemoSettings } from "./demoTypes";

export function payrollRows(employees: DemoEmployee[], competency = "2026-06", benefitDistributions: DemoBenefitDistribution[] = []): PayrollRow[] {
  const [year, month] = competency.split("-").map(Number);
  return employees.filter(item => item.status !== "INACTIVE").map(employee => {
    const company = demoCompanies.find(item => item.id === employee.company_id) ?? demoCompanies[0];
    const rates = company.settings.payroll_rates;
    const benefitMap = benefitDistributions
      .filter(item => item.employee_id === employee.id && item.competency === competency)
      .reduce<Record<string, DemoBenefitDistribution[]>>((acc, item) => {
        const key = normalizeLabel(item.benefit_name);
        acc[key] = [...(acc[key] ?? []), item];
        return acc;
      }, {});
    const salary = employee.employment_type.name === "CLT" ? employee.salary_base : 0;
    const proLabore = employee.employment_type.name === "Pró-labore" ? employee.salary_base : 0;
    const profitDistribution = employee.result_center.code === "DIR" ? 2500 : employee.result_center.code === "COM" ? 650 : 0;
    const costAid = employee.employment_type.name === "CLT" ? 320 : Math.round(employee.salary_base * 0.08);
    const transport = sumBenefit(benefitMap["vale transporte"] ?? []);
    const meal = sumBenefit(benefitMap["alimentacao"] ?? []);
    const lodging = employee.benefits.some(item => normalizeLabel(item) === "hospedagem") ? (employee.result_center.code === "DIR" ? 900 : 550) : 0;
    const insurance = sumBenefit(benefitMap["seguro de vida"] ?? []);
    const healthPlan = sumBenefit(benefitMap["plano de saude"] ?? []);
    return recalculatePayrollRow({
      employee_id: employee.id,
      employee_name: employee.employee.full_name,
      result_center: employee.result_center,
      employment_type: employee.employment_type,
      salary,
      pro_labore: proLabore,
      profit_distribution: profitDistribution,
      cost_aid: costAid,
      transport,
      meal,
      lodging,
      insurance,
      health_plan: healthPlan,
      subtotal_earnings: 0,
      inss: 0,
      rat: 0,
      terceiros: 0,
      fgts: 0,
      charges: 0,
      vacation: 0,
      vacation_third: 0,
      fgts_vacation: 0,
      thirteenth_salary: 0,
      fgts_thirteenth_salary: 0,
      notice_indemnity: 0,
      fgts_notice: 0,
      fgts_fine: 0,
      employer_contribution: 0,
      total_provisions: 0,
      gross_payroll: 0,
      net_payroll: 0,
      total_cost: 0,
      grand_total: 0
    }, rates);
  });
}

export function recalculatePayrollRow(row: PayrollRow, rates: DemoSettings["payroll_rates"]): PayrollRow {
  const subtotalEarnings = roundMoney(row.salary + row.pro_labore + row.profit_distribution + row.cost_aid + row.transport + row.meal + row.lodging + row.insurance + row.health_plan);
  const inss = roundMoney(subtotalEarnings * (rates.inss / 100));
  const rat = roundMoney(subtotalEarnings * (rates.rat / 100));
  const terceiros = roundMoney(subtotalEarnings * (rates.terceiros / 100));
  const fgts = roundMoney(subtotalEarnings * (rates.fgts / 100));
  const charges = roundMoney(inss + rat + terceiros + fgts);

  const salaryBase = Math.max(row.salary, row.pro_labore, row.profit_distribution, row.cost_aid, 0);
  const vacation = roundMoney(salaryBase / 12);
  const vacationThird = roundMoney(vacation / 3);
  const fgtsVacation = roundMoney((vacation + vacationThird) * (rates.fgts_vacation / 100));
  const thirteenthSalary = roundMoney(salaryBase / 12);
  const fgtsThirteenthSalary = roundMoney(thirteenthSalary * (rates.fgts_thirteenth / 100));
  const noticeIndemnity = roundMoney(salaryBase / 12);
  const fgtsNotice = roundMoney(noticeIndemnity * (rates.fgts_notice / 100));
  const fgtsFine = roundMoney((fgts + fgtsVacation + fgtsThirteenthSalary + fgtsNotice) * (rates.multa_fgts / 100));
  const employerContribution = roundMoney((vacation + vacationThird + thirteenthSalary + noticeIndemnity) * (rates.patronal / 100));
  const totalProvisions = roundMoney(vacation + vacationThird + fgtsVacation + thirteenthSalary + fgtsThirteenthSalary + noticeIndemnity + fgtsNotice + fgtsFine + employerContribution);
  const grossPayroll = subtotalEarnings;
  const netPayroll = roundMoney(subtotalEarnings + charges);
  const totalCost = roundMoney(subtotalEarnings + charges + totalProvisions);

  return {
    ...row,
    subtotal_earnings: subtotalEarnings,
    inss,
    rat,
    terceiros,
    fgts,
    charges,
    vacation,
    vacation_third: vacationThird,
    fgts_vacation: fgtsVacation,
    thirteenth_salary: thirteenthSalary,
    fgts_thirteenth_salary: fgtsThirteenthSalary,
    notice_indemnity: noticeIndemnity,
    fgts_notice: fgtsNotice,
    fgts_fine: fgtsFine,
    employer_contribution: employerContribution,
    total_provisions: totalProvisions,
    gross_payroll: grossPayroll,
    net_payroll: netPayroll,
    total_cost: totalCost,
    grand_total: totalCost
  };
}

export function centerSummary(rows: PayrollRow[], centers: ResultCenter[] = demoResultCenters) {
  return centers.map(center => {
    const scoped = rows.filter(row => row.result_center.id === center.id);
    return {
      center,
      employees: scoped.length,
      gross: sum(scoped, "gross_payroll"),
      net: sum(scoped, "net_payroll"),
      total: sum(scoped, "total_cost")
    };
  });
}

export function dashboardCards(employees: DemoEmployee[], movements: DemoMovement[], competency = "2026-06", benefitDistributions: DemoBenefitDistribution[] = []): DashboardCard[] {
  const rows = payrollRows(employees, competency, benefitDistributions);
  const [year, month] = competency.split("-").map(Number);
  return demoResultCenters.map(center => {
    const centerEmployees = employees.filter(item => item.result_center.id === center.id && item.status !== "INACTIVE");
    const centerRows = rows.filter(row => row.result_center.id === center.id);
    const centerMovements = movements.filter(item => item.competency === competency && item.result_center.id === center.id);
    const byType = demoEmploymentTypes.reduce<Record<string, number>>((acc, type) => {
      const count = centerEmployees.filter(employee => employee.employment_type.id === type.id).length;
      if (count) acc[type.name] = count;
      return acc;
    }, {});
    const admissions = centerMovements.filter(item => item.type === "admissão").length;
    const terminations = centerMovements.filter(item => item.type === "desligamento").length;
    const nonProductiveHours = centerEmployees.reduce((acc, employee) => acc + nonProductiveHoursForEmployee(employee, centerMovements, year, month), 0);
    const plannedHours = Math.max(centerEmployees.reduce((acc, employee) => acc + scheduledHoursForEmployee(employee, year, month), 0), 1);
    const previous = Math.max(centerEmployees.length - admissions + terminations - (center.code === "IND" ? 1 : 0), 0);
    return {
      id: center.id,
      code: center.code,
      name: center.name,
      color: center.color,
      active_employees: centerEmployees.length,
      by_employment_type: byType,
      admissions,
      terminations,
      absenteeism: safeDivide(nonProductiveHours, plannedHours),
      turnover: safeDivide((admissions + terminations) / 2, centerEmployees.length),
      gross_payroll: sum(centerRows, "gross_payroll"),
      net_payroll: sum(centerRows, "net_payroll"),
      total_cost: sum(centerRows, "total_cost"),
      previous_active_employees: previous
    };
  });
}

export function consolidatedIndicators(employees: DemoEmployee[], movements: DemoMovement[], competency = "2026-06", benefitDistributions: DemoBenefitDistribution[] = []): IndicatorSummary {
  const rows = payrollRows(employees, competency, benefitDistributions);
  const active = employees.filter(item => item.status !== "INACTIVE").length;
  const competencyMovements = movements.filter(item => item.competency === competency);
  const admissions = competencyMovements.filter(item => item.type === "admissão").length;
  const terminations = competencyMovements.filter(item => item.type === "desligamento").length;
  const initial = Math.max(active - admissions + terminations, 0);
  const average = (initial + active) / 2;
  const [year, month] = competency.split("-").map(Number);
  const nonProductiveHours = employees.reduce((acc, employee) => acc + nonProductiveHoursForEmployee(employee, competencyMovements, year, month), 0);
  const programmedHours = Math.max(employees.reduce((acc, employee) => acc + scheduledHoursForEmployee(employee, year, month), 0), 1);
  return {
    initial_headcount: initial,
    admissions,
    terminations,
    final_headcount: active,
    average_headcount: average,
    absenteeism: safeDivide(nonProductiveHours, programmedHours),
    turnover: safeDivide((admissions + terminations) / 2, average),
    gross_payroll: sum(rows, "gross_payroll"),
    net_payroll: sum(rows, "net_payroll"),
    salary_per_capita: safeDivide(sum(rows, "gross_payroll"), active),
    total_cost: sum(rows, "total_cost"),
    productive_days: 22,
    non_productive_hours: nonProductiveHours
  };
}

export function topCostsByCenter(rows: PayrollRow[]) {
  return demoResultCenters.reduce<Record<string, { employee: string; cost: number }[]>>((acc, center) => {
    acc[center.code] = rows
      .filter(row => row.result_center.id === center.id)
      .sort((a, b) => b.total_cost - a.total_cost)
      .slice(0, 3)
      .map(row => ({ employee: row.employee_name, cost: row.total_cost }));
    return acc;
  }, {});
}

export const demoAlerts = [
  "Absenteísmo acima do mês anterior em IND",
  "Custo total de COM reduziu em relação ao mês anterior",
  "DIR possui nova admissão no mês",
  "Existem competências abertas para fechamento"
];

function sum<T>(items: T[], key: keyof T): number {
  return items.reduce((acc, item) => acc + Number(item[key] ?? 0), 0);
}

function safeDivide(value: number, denominator: number): number {
  return denominator ? value / denominator : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sumBenefit(items: DemoBenefitDistribution[]) {
  return items.reduce((acc, item) => acc + Number(item.amount ?? 0), 0);
}

function scheduledHoursForEmployee(employee: DemoEmployee, year: number, month: number) {
  const company = demoCompanies.find(item => item.id === employee.company_id) ?? demoCompanies[0];
  const workingDays = workingDaysInMonth(year, month, company.settings);
  return Number(employee.daily_hours) * workingDays;
}

function nonProductiveHoursForEmployee(employee: DemoEmployee, movements: DemoMovement[], year: number, month: number) {
  const competencyPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const movementHours = movements
    .filter(item => item.employee_id === employee.id && item.competency === competencyPrefix && ["falta", "atestado", "afastamento"].includes(item.type))
    .reduce((acc, item) => acc + item.hour_impact, 0);
  const vacationHours = employee.vacations.reduce((acc, vacation) => acc + vacationHoursForPeriod(vacation.period, employee, year, month), 0);
  const leaveHours = employee.leaves.reduce((acc, leave) => acc + leaveHoursForPeriod(leave.period, employee, year, month, leave.days), 0);
  return movementHours + vacationHours + leaveHours;
}

function vacationHoursForPeriod(period: string, employee: DemoEmployee, year: number, month: number) {
  const match = period.match(/(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/);
  if (!match) return 0;
  const { days } = overlapDaysInMonth(parseBrDate(match[1]), parseBrDate(match[2]), year, month);
  if (!days) return 0;
  return days * Number(employee.daily_hours);
}

function leaveHoursForPeriod(period: string, employee: DemoEmployee, year: number, month: number, fallbackDays: number) {
  const match = period.match(/(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/);
  if (match) {
    const { days } = overlapDaysInMonth(parseBrDate(match[1]), parseBrDate(match[2]), year, month);
    return days * Number(employee.daily_hours);
  }
  return fallbackDays * Number(employee.daily_hours);
}

function overlapDaysInMonth(start: Date | null, end: Date | null, year: number, month: number) {
  if (!start || !end || end < start) return { days: 0 };
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const effectiveStart = start > monthStart ? start : monthStart;
  const effectiveEnd = end < monthEnd ? end : monthEnd;
  if (effectiveEnd < effectiveStart) return { days: 0 };
  const days = Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1;
  return { days };
}

function workingDaysInMonth(year: number, month: number, settings: { include_saturdays: boolean; include_sundays: boolean; holidays: string[] }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const holidays = new Set(settings.holidays.map(normalizeBrDate));
  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const current = new Date(year, month - 1, day);
    const dayOfWeek = current.getDay();
    if (dayOfWeek === 6 && !settings.include_saturdays) continue;
    if (dayOfWeek === 0 && !settings.include_sundays) continue;
    if (holidays.has(formatBrDate(current))) continue;
    count += 1;
  }
  return count;
}

function parseBrDate(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day);
}

function formatBrDate(date: Date) {
  return [String(date.getDate()).padStart(2, "0"), String(date.getMonth() + 1).padStart(2, "0"), date.getFullYear()].join("/");
}

function normalizeBrDate(value: string) {
  const parsed = parseBrDate(value);
  return parsed ? formatBrDate(parsed) : value.trim();
}
