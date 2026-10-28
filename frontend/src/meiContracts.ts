import { DemoMeiContract } from "./mocks/demoTypes";

export function contractSemesterEnd(start: string): string {
  if (!start) return "";
  const [year, month, day] = start.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + 6, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay) - 1);
  return target.toISOString().slice(0, 10);
}

export function contractDisplayStatus(contract: Pick<DemoMeiContract, "status" | "end_date">): string {
  if (contract.status === "Renovado") return "Finalizado";
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (contract.status === "Ativo" && contract.end_date < today) return "Finalizado / não renovado";
  return contract.status === "Pendente de assinatura" ? "Ação necessária" : contract.status;
}
