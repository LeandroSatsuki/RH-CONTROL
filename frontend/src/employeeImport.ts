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

export interface NormalizedEmployeeImportRow {
  name: string;
  document: string;
  admission: string;
  email: string;
  phone: string;
  center: string;
  jobTitle: string;
  supervisor: string;
  type: string;
  salary: number;
  gratification: number;
  costAid: number;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  bankCode: string;
  bankName: string;
  agency: string;
  account: string;
  accountDigit: string;
  pixType: string;
  pix: string;
  benefits: string[];
  notes: string;
}

export interface EmployeeImportIssue {
  rowNumber: number;
  field: string;
  value: string;
  message: string;
  suggestion: string;
}

export interface EmployeeImportRowResult {
  rowNumber: number;
  data: NormalizedEmployeeImportRow;
  issues: EmployeeImportIssue[];
}

interface EmployeeImportValidationOptions {
  centers: Array<{ code: string }>;
  types: Array<{ name: string }>;
  existingDocuments?: string[];
}

function normalizedKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!text) return 0;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBenefitName(value: string) {
  const normalized = normalizedKey(value);
  return ({
    "vale transporte": "Vale transporte",
    alimentacao: "Alimentação",
    "cesta basica": "Cesta básica",
    "plano de saude": "Plano de saúde",
    "seguro de vida": "Seguro de vida",
    "ajuda de custo": "Ajuda de custo"
  } as Record<string, string>)[normalized] ?? normalizeEmployeeText(value);
}

function normalizeDate(value: string) {
  const text = value.trim();
  if (!text) return new Date().toISOString().slice(0, 10);
  const brazilian = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (brazilian) return `${brazilian[3]}-${brazilian[2].padStart(2, "0")}-${brazilian[1].padStart(2, "0")}`;
  return text;
}

function normalizePixType(value: string, document: string) {
  const normalized = normalizedKey(value);
  if (!normalized) return document.length === 14 ? "CNPJ" : "CPF";
  return ({
    cpf: "CPF",
    cnpj: "CNPJ",
    email: "EMAIL",
    "e-mail": "EMAIL",
    telefone: "PHONE",
    celular: "PHONE",
    phone: "PHONE"
  } as Record<string, string>)[normalized] ?? normalizeEmployeeText(value);
}

function isValidIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === Number(match[1])
    && date.getMonth() + 1 === Number(match[2])
    && date.getDate() === Number(match[3]);
}

export function normalizeEmployeeImportRow(row: Record<string, unknown>): NormalizedEmployeeImportRow {
  const readValue = (...names: string[]) => {
    const entry = Object.entries(row).find(([key]) => names.some(name => normalizedKey(key) === normalizedKey(name)));
    return entry?.[1] ?? "";
  };
  const read = (...names: string[]) => String(readValue(...names) ?? "").trim();
  const document = onlyDigits(read("CPF/CNPJ", "CPF", "CNPJ"));
  const pixType = normalizePixType(read("PIX TIPO", "TIPO PIX", "TIPO DE PIX"), document);
  const rawPix = read("PIX", "CHAVE PIX");
  const pix = pixType === "EMAIL"
    ? rawPix.toLowerCase()
    : ["CPF", "CNPJ", "PHONE"].includes(pixType)
      ? onlyDigits(rawPix || ((pixType === "CPF" || pixType === "CNPJ") ? document : ""))
      : rawPix;
  return {
    name: normalizeEmployeeText(read("NOME", "NOME COMPLETO")),
    document,
    admission: normalizeDate(read("ADMISSAO", "ADMISSÃO", "DATA ADMISSAO", "DATA ADMISSÃO", "DATA DE ADMISSÃO")),
    email: read("EMAIL", "E-MAIL"),
    phone: onlyDigits(read("TELEFONE", "CELULAR")),
    center: normalizeEmployeeText(read("CR", "CENTRO", "CENTRO DE RESULTADO")),
    jobTitle: normalizeEmployeeText(read("CARGO", "FUNCAO", "FUNÇÃO", "CARGO/FUNCAO", "CARGO/FUNÇÃO")),
    supervisor: normalizeEmployeeText(read("SUPERVISOR")),
    type: normalizeEmployeeText(read("MODALIDADE", "TIPO CONTRATO", "TIPO DE CONTRATO", "CONTRATO")),
    salary: parseNumber(readValue("SALARIO", "SALÁRIO")),
    gratification: parseNumber(readValue("GRATIFICACAO", "GRATIFICAÇÃO")),
    costAid: parseNumber(readValue("AJUDA DE CUSTO", "AJUDA CUSTO")),
    cep: onlyDigits(read("CEP")),
    street: normalizeEmployeeText(read("RUA", "LOGRADOURO")),
    number: read("NUMERO", "NÚMERO"),
    complement: normalizeEmployeeText(read("COMPLEMENTO")),
    neighborhood: normalizeEmployeeText(read("BAIRRO")),
    city: normalizeEmployeeText(read("CIDADE")),
    state: normalizeEmployeeText(read("UF", "ESTADO")).slice(0, 2),
    bankCode: onlyDigits(read("BANCO", "CODIGO BANCO", "CÓDIGO BANCO")).slice(0, 3),
    bankName: normalizeEmployeeText(read("NOME BANCO", "BANCO NOME")),
    agency: read("AGENCIA", "AGÊNCIA"),
    account: read("CONTA"),
    accountDigit: read("DIGITO", "DÍGITO"),
    pixType,
    pix,
    benefits: read("BENEFICIOS", "BENEFÍCIOS", "BENEFICIO", "BENEFÍCIO").split(",").map(normalizeBenefitName).filter(Boolean),
    notes: normalizeEmployeeText(read("OBSERVACOES", "OBSERVAÇÕES", "OBSERVACAO", "OBSERVAÇÃO"))
  };
}

export function validateEmployeeImportRows(rows: Record<string, unknown>[], options: EmployeeImportValidationOptions): EmployeeImportRowResult[] {
  const existingDocuments = new Set((options.existingDocuments ?? []).map(onlyDigits));
  const documentsInFile = new Set<string>();
  const centerCodes = options.centers.map(item => normalizeEmployeeText(item.code));
  const typeNames = options.types.map(item => normalizeEmployeeText(item.name));
  return rows.map((raw, index) => {
    const data = normalizeEmployeeImportRow(raw);
    const rowNumber = index + 2;
    const issues: EmployeeImportIssue[] = [];
    const add = (field: string, value: string, message: string, suggestion: string) => issues.push({ rowNumber, field, value: value || "(vazio)", message, suggestion });
    if (data.name.length < 3) add("Nome", data.name, "Nome não informado ou muito curto.", "Preencha a coluna NOME com pelo menos 3 caracteres.");
    if (!isValidCpfCnpjImport(data.document)) {
      add("CPF/CNPJ", data.document, "Documento inválido.", "Informe um CPF válido com 11 dígitos ou um CNPJ válido com 14 dígitos.");
    } else if (existingDocuments.has(data.document)) {
      add("CPF/CNPJ", data.document, "Documento já cadastrado nesta empresa.", "Remova esta linha ou informe outro CPF/CNPJ.");
    } else if (documentsInFile.has(data.document)) {
      add("CPF/CNPJ", data.document, "Documento repetido na própria planilha.", "Mantenha apenas uma linha para este CPF/CNPJ.");
    }
    if (data.document) documentsInFile.add(data.document);
    if (!centerCodes.includes(data.center)) {
      add("Centro de Resultado", data.center, "Centro de Resultado não encontrado.", centerCodes.length ? `Use um código cadastrado: ${centerCodes.join(", ")}.` : "Cadastre um Centro de Resultado antes da importação.");
    }
    if (!typeNames.includes(data.type)) {
      add("Modalidade", data.type, "Modalidade não encontrada.", typeNames.length ? `Use uma modalidade cadastrada: ${typeNames.join(", ")}.` : "Cadastre uma modalidade antes da importação.");
    }
    if (data.jobTitle.length < 2) add("Cargo", data.jobTitle, "Cargo não informado ou muito curto.", "Preencha a coluna CARGO com pelo menos 2 caracteres.");
    if (!isValidIsoDate(data.admission)) add("Admissão", data.admission, "Data de admissão inválida.", "Use uma data válida em DD/MM/AAAA ou AAAA-MM-DD.");
    if (data.salary <= 0) add("Salário", String(data.salary || ""), "Salário ausente ou inválido.", "Informe um valor maior que zero, por exemplo 3000,00.");
    if (data.gratification < 0) add("Gratificação", String(data.gratification), "Gratificação não pode ser negativa.", "Informe zero ou um valor positivo.");
    if (data.costAid < 0) add("Ajuda de custo", String(data.costAid), "Ajuda de custo não pode ser negativa.", "Informe zero ou um valor positivo.");
    if (!["CPF", "CNPJ", "EMAIL", "PHONE"].includes(data.pixType)) add("Tipo PIX", data.pixType, "Tipo de chave PIX não reconhecido.", "Use CPF, CNPJ, EMAIL ou TELEFONE.");
    if (data.pix.length < 3 || data.pix.length > 120) add("PIX", data.pix, "Chave PIX ausente ou com tamanho inválido.", "Preencha uma chave entre 3 e 120 caracteres; CPF/CNPJ pode usar o próprio documento.");
    return { rowNumber, data, issues };
  });
}

export function createEmployeeImportApiIssue(rowNumber: number, data: NormalizedEmployeeImportRow, message: string): EmployeeImportIssue {
  return {
    rowNumber,
    field: "Cadastro",
    value: data.name || data.document || "(linha sem identificação)",
    message,
    suggestion: "Revise os dados indicados pelo servidor e importe novamente somente esta linha."
  };
}

function isValidCpfCnpjImport(value: string) {
  if (value.length === 14) return isValidCnpj(value);
  if (value.length !== 11 || /^(\d)\1+$/.test(value)) return false;
  const digit = (size: number) => {
    const sum = value.slice(0, size).split("").reduce((total, item, index) => total + Number(item) * (size + 1 - index), 0);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(9) === Number(value[9]) && digit(10) === Number(value[10]);
}

function isValidCnpj(value: string) {
  if (value.length !== 14 || /^(\d)\1+$/.test(value)) return false;
  const calculate = (base: string, weights: number[]) => {
    const sum = base.split("").reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calculate(value.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculate(value.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return value.endsWith(`${first}${second}`);
}
