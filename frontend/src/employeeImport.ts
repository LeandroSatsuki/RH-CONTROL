export function buildEmployeeImportTemplateRow(options: {
  centerCode?: string;
  jobTitle?: string;
  employmentType?: string;
}) {
  return {
    NOME: "NOME COMPLETO",
    "CPF/CNPJ": "52998224725",
    ADMISSAO: "2026-08-01",
    EMAIL: "NOME@EMPRESA.COM.BR",
    TELEFONE: "27999990000",
    CR: options.centerCode || "ADM",
    CARGO: options.jobTitle || "ANALISTA",
    SUPERVISOR: "",
    MODALIDADE: options.employmentType || "CLT",
    SALARIO: 3000,
    GRATIFICACAO: 0,
    CEP: "29000000",
    RUA: "RUA EXEMPLO",
    NUMERO: "100",
    COMPLEMENTO: "SALA 1",
    BAIRRO: "CENTRO",
    CIDADE: "VITORIA",
    UF: "ES",
    "CODIGO BANCO": "001",
    "NOME BANCO": "BANCO DO BRASIL",
    AGENCIA: "0001",
    CONTA: "12345",
    DIGITO: "0",
    "PIX TIPO": "CPF",
    PIX: "52998224725",
    BENEFICIOS: "Vale transporte, Alimentação, Cesta básica",
    "AJUDA DE CUSTO": 0,
    OBSERVACOES: ""
  };
}

export function normalizeEmployeeText(value: string) {
  return value
    .toUpperCase()
    .normalize("NFC")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N} .,\/ºª&'()"\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
