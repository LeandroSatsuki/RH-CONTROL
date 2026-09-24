import { describe, expect, it } from "vitest";
import { previewLaunchImport } from "./launchImport";
const employees = [{ employment_id: 1, employee_code: "ADM-001", employee_name: "Maria", amount: 0, note: "" }];
const row = { Matrícula: "ADM-001", Competência: "2026-09", Tipo: "MEI", Valor: "1.234,56" };
describe("conferência de lançamentos importados", () => {
  it("interpreta reais e mantém linhas válidas junto das inconsistências", () => {
    const result = previewLaunchImport([row, { ...row, Matrícula: "OUTRA" }], employees, "2026-09", "MEI");
    expect(result.items[0].amount).toBe(1234.56);
    expect(result.issues).toHaveLength(1);
  });
  it("recusa todas as ocorrências de matrícula duplicada", () => {
    const result = previewLaunchImport([row, row], employees, "2026-09", "MEI");
    expect(result.items).toHaveLength(0);
    expect(result.issues).toHaveLength(2);
  });
  it("não mistura competências, modalidades ou valores inválidos", () => {
    for (const patch of [{ Tipo: "FREELANCER" }, { Competência: "2026-08" }, { Valor: "-20" }, { Valor: "1.222" }, { Valor: "Infinity" }]) {
      expect(previewLaunchImport([{ ...row, ...patch }], employees, "2026-09", "MEI").items).toHaveLength(0);
    }
  });
});
