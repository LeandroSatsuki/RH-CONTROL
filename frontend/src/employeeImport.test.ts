import { describe, expect, it } from "vitest";
import { buildEmployeeImportTemplateRow, normalizeEmployeeText } from "./employeeImport";

describe("importação de colaboradores", () => {
  it("normaliza caracteres vindos das consultas de CNPJ e CEP", () => {
    expect(normalizeEmployeeText("João & Maria – Comércio: matriz")).toBe("JOÃO & MARIA - COMÉRCIO MATRIZ");
    expect(normalizeEmployeeText("Dias d'Ávila (Centro)")).toBe("DIAS D'ÁVILA (CENTRO)");
  });

  it("gera modelo com todos os campos atuais do cadastro", () => {
    const row = buildEmployeeImportTemplateRow({ centerCode: "COM", employmentType: "MEI", jobTitle: "PROMOTOR" });
    expect(row).toMatchObject({
      CR: "COM",
      CARGO: "PROMOTOR",
      MODALIDADE: "MEI",
      GRATIFICACAO: 0,
      "AJUDA DE CUSTO": 0,
      "CODIGO BANCO": "001",
      DIGITO: "0",
      OBSERVACOES: ""
    });
  });
});
