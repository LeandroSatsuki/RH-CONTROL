import { describe, expect, it } from "vitest";
import { buildEmployeeImportTemplateRow, normalizeEmployeeImportRow, normalizeEmployeeText, validateEmployeeImportRows } from "./employeeImport";

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

  it("aceita formatos numéricos do Excel e usa o documento como PIX quando aplicável", () => {
    const row = normalizeEmployeeImportRow({
      NOME: "Pessoa Teste",
      "CPF/CNPJ": "529.982.247-25",
      CR: "ADM",
      CARGO: "ANALISTA",
      MODALIDADE: "CLT",
      SALARIO: "3.000,50",
      "AJUDA DE CUSTO": "150.25",
      ADMISSAO: "27/08/2026",
      "PIX TIPO": "CPF"
    });
    expect(row.salary).toBe(3000.5);
    expect(row.costAid).toBe(150.25);
    expect(row.admission).toBe("2026-08-27");
    expect(row.pixType).toBe("CPF");
    expect(row.pix).toBe("52998224725");
    expect(normalizeEmployeeImportRow({ "PIX TIPO": "telefone", PIX: "(27) 99999-0000" }).pixType).toBe("PHONE");
    expect(normalizeEmployeeImportRow({ "PIX TIPO": "telefone", PIX: "(27) 99999-0000" }).pix).toBe("27999990000");
  });

  it("detalha inconsistências por linha e mantém as linhas válidas", () => {
    const rows = validateEmployeeImportRows([
      { NOME: "Pessoa Válida", "CPF/CNPJ": "52998224725", CR: "ADM", CARGO: "ANALISTA", MODALIDADE: "CLT", SALARIO: 3000, "PIX TIPO": "CPF", PIX: "52998224725" },
      { NOME: "Pessoa Inválida", "CPF/CNPJ": "111", CR: "INEXISTENTE", CARGO: "", MODALIDADE: "OUTRA", SALARIO: 0 }
    ], { centers: [{ code: "ADM" }], types: [{ name: "CLT" }] });
    expect(rows[0].issues).toHaveLength(0);
    expect(rows[1].issues.map(issue => issue.field)).toEqual(expect.arrayContaining(["CPF/CNPJ", "Centro de Resultado", "Modalidade", "Cargo", "Salário"]));
    expect(rows[1].issues.every(issue => Boolean(issue.suggestion))).toBe(true);
  });

  it("identifica documentos já cadastrados e repetidos na planilha", () => {
    const base = { NOME: "Pessoa", CR: "ADM", CARGO: "ANALISTA", MODALIDADE: "CLT", SALARIO: 3000, "PIX TIPO": "CPF", PIX: "52998224725" };
    const rows = validateEmployeeImportRows([
      { ...base, "CPF/CNPJ": "52998224725" },
      { ...base, "CPF/CNPJ": "52998224725" }
    ], { centers: [{ code: "ADM" }], types: [{ name: "CLT" }], existingDocuments: ["39053344705"] });
    expect(rows[0].issues).toHaveLength(0);
    expect(rows[1].issues.some(issue => issue.message.includes("própria planilha"))).toBe(true);
  });
});
