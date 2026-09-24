import { DemoEmployee, DemoMovement, DemoSettings } from "./mocks/demoTypes";

export function monthDates(competency: string) {
  const [year, month] = competency.split("-").map(Number);
  return { start: `${competency}-01`, end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
}
export function shiftDay(value: string, days: number) {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
function datesBetween(start: string, end: string) {
  const result: string[] = [];
  for (let value = start; value <= end; value = shiftDay(value, 1)) result.push(value);
  return result;
}
export function businessDates(start: string, end: string, settings?: DemoSettings) {
  return datesBetween(start, end).filter(value => {
    const weekday = new Date(`${value}T00:00:00Z`).getUTCDay();
    return (weekday > 0 && weekday < 6 || weekday === 6 && settings?.include_saturdays || weekday === 0 && settings?.include_sundays) && !settings?.holidays.includes(value);
  });
}
export function effectiveEmployees(employees: DemoEmployee[], movements: DemoMovement[]) {
  return employees.map(employee => {
    const ending = movements.filter(item => item.employee_id === employee.id && item.type === "desligamento").map(item => item.start_date);
    if (employee.termination_date) ending.push(employee.termination_date);
    return ending.length ? { ...employee, termination_date: ending.sort()[0] } : employee;
  });
}
export function activeDuring(employee: DemoEmployee, start: string, end: string) {
  return employee.admission_date <= end && (!employee.termination_date || employee.termination_date >= start);
}
export function movementInMonth(movement: DemoMovement, competency: string, settings?: DemoSettings): DemoMovement | null {
  const { start, end } = monthDates(competency);
  const last = movement.end_date || movement.start_date;
  if (movement.start_date > end || last < start) return null;
  const dates = movement.type === "desligamento" ? businessDates(shiftDay(movement.start_date, 1), last, settings) : datesBetween(movement.start_date, last);
  const totalDays = movement.total_days ?? movement.days;
  const totalHours = movement.total_hour_impact ?? movement.hour_impact;
  const before = dates.filter(value => value < start).length;
  const through = dates.filter(value => value <= end).length;
  const daysTo = (count: number) => dates.length ? Math.round(totalDays * count / dates.length) : 0;
  const hoursTo = (count: number) => dates.length ? Math.round((totalDays ? totalHours * daysTo(count) / totalDays : totalHours * count / dates.length) * 100) / 100 : 0;
  return { ...movement, source_competency: movement.source_competency ?? movement.competency, competency,
    total_days: totalDays, total_hour_impact: totalHours, days: daysTo(through) - daysTo(before),
    hour_impact: Math.round((hoursTo(through) - hoursTo(before)) * 100) / 100 };
}
export function monthlyOperational(employees: DemoEmployee[], movements: DemoMovement[], competency: string, settings: Record<number, DemoSettings>) {
  const { start, end } = monthDates(competency);
  const clt = effectiveEmployees(employees, movements).filter(item => item.employment_type.name.toUpperCase() === "CLT");
  const previous = shiftDay(start, -1);
  const initial = new Set(clt.filter(item => activeDuring(item, previous, previous)).map(item => item.employee.id)).size;
  const final = new Set(clt.filter(item => activeDuring(item, end, end)).map(item => item.employee.id)).size;
  const admissions = new Set(clt.filter(item => item.admission_date >= start && item.admission_date <= end && !clt.some(other => other.id !== item.id && other.employee.id === item.employee.id && other.termination_date === shiftDay(item.admission_date, -1))).map(item => item.employee.id)).size;
  const ids = new Set(clt.map(item => item.id));
  const terminations = new Set(movements.filter(item => ids.has(item.employee_id) && item.type === "desligamento" && item.start_date >= start && item.start_date <= end).map(item => item.employee_id)).size;
  const scoped = movements.filter(item => ids.has(item.employee_id)).map(item => movementInMonth(item, competency, settings[item.company_id])).filter((item): item is DemoMovement => item !== null);
  const unproductive = scoped.filter(item => ["falta", "atestado", "afastamento", "férias", "desligamento"].includes(item.type)).reduce((sum, item) => sum + item.hour_impact, 0);
  const scheduled = clt.filter(item => activeDuring(item, start, end)).reduce((sum, item) => {
    const dismissed = movements.some(m => m.employee_id === item.id && m.type === "desligamento" && m.start_date >= start && m.start_date <= end);
    const last = dismissed ? end : item.termination_date && item.termination_date < end ? item.termination_date : end;
    return sum + businessDates(item.admission_date > start ? item.admission_date : start, last, settings[item.company_id]).length * Number(item.daily_hours);
  }, 0);
  const absenceDays = scoped.filter(item => ["falta", "atestado", "afastamento", "férias"].includes(item.type)).reduce((sum, item) => sum + item.days, 0);
  return { initial, final, admissions, terminations, scheduled, unproductive, absenceDays, average: (initial + final) / 2 };
}
