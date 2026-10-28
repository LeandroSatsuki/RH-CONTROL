import { describe, expect, it } from "vitest";
import { parseLaunchAmount } from "./launchAmounts";
import { contractSemesterEnd, contractDisplayStatus } from "./meiContracts";

describe("valores e contratos", () => {
  it.each([["1250,55", 1250.55], ["1.250,55", 1250.55], ["R$ 250,00", 250], ["250.50", 250.5], ["25", 25], ["", 0], ["0,", 0], ["-1", null], ["1,234", null], ["abc", null]])("interpreta %s sem ratear ou deslocar centavos", (input, expected) => {
    expect(parseLaunchAmount(input)).toBe(expected);
  });
  it("calcula seis meses e trata fevereiro", () => {
    expect(contractSemesterEnd("2026-01-01")).toBe("2026-06-30");
    expect(contractSemesterEnd("2026-08-31")).toBe("2027-02-27");
    expect(contractSemesterEnd("2023-08-31")).toBe("2024-02-28");
  });
  it("distingue finalizado de não renovado sem alterar o status operacional", () => {
    expect(contractDisplayStatus({ status: "Ativo", end_date: "2000-01-01" })).toBe("Finalizado / não renovado");
    expect(contractDisplayStatus({ status: "Renovado", end_date: "2000-01-01" })).toBe("Finalizado");
    expect(contractDisplayStatus({ status: "Pendente de assinatura", end_date: "2000-01-01" })).toBe("Ação necessária");
  });
});
