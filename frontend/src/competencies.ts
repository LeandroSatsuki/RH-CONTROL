import { Competency } from "./mocks/demoTypes";

const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function currentCompetency(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function buildOperationalCompetencies(reference = new Date()): Competency[] {
  const current = currentCompetency(reference);
  const years = [reference.getFullYear() - 1, reference.getFullYear(), reference.getFullYear() + 1];
  return years.flatMap(year => monthLabels.map((label, index) => {
    const id = `${year}-${String(index + 1).padStart(2, "0")}`;
    return { id, label: `${label}/${year}`, status: id < current ? "CLOSED" : "OPEN" } as Competency;
  }));
}

export const operationalCompetencies = buildOperationalCompetencies();
