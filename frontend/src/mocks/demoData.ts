import { EmploymentType, ResultCenter } from "../types";
import { Competency, DemoBackup, DemoBenefitDefinition, DemoBenefitDistribution, DemoClosing, DemoCompany, DemoCostAllocation, DemoEmployee, DemoMovement, DemoSettings, MovementType } from "./demoTypes";

export const demoResultCenters: ResultCenter[] = [
  { id: 1, code: "ADM", name: "Administrativo", color: "#2563EB", active: true },
  { id: 2, code: "IND", name: "Industrial", color: "#F59E0B", active: true },
  { id: 3, code: "COM", name: "Comercial", color: "#10B981", active: true },
  { id: 4, code: "DIR", name: "Diretoria", color: "#8B5CF6", active: true }
];

export const demoEmploymentTypes: EmploymentType[] = [
  { id: 1, name: "CLT", has_charges: true, active: true },
  { id: 2, name: "MEI", has_charges: false, active: true },
  { id: 3, name: "Freelancer", has_charges: false, active: true },
  { id: 4, name: "Pró-labore", has_charges: false, active: true },
  { id: 5, name: "Outros", has_charges: false, active: true }
];

export const demoCompetencies: Competency[] = [
  { id: "2026-01", label: "Jan/2026", status: "CLOSED" },
  { id: "2026-02", label: "Fev/2026", status: "CLOSED" },
  { id: "2026-03", label: "Mar/2026", status: "CLOSED" },
  { id: "2026-04", label: "Abr/2026", status: "CLOSED" },
  { id: "2026-05", label: "Mai/2026", status: "OPEN" },
  { id: "2026-06", label: "Jun/2026", status: "OPEN" }
];

export const demoBenefitDefinitions: DemoBenefitDefinition[] = [
  { id: 1, code: "VT", name: "Vale transporte", active: true, mode: "DAILY", applies_to: ["ADM", "IND", "COM", "DIR"], notes: "Benefício diário com base em dias úteis e valor por dia." },
  { id: 2, code: "AL", name: "Alimentação", active: true, mode: "DAILY", applies_to: ["ADM", "IND", "COM", "DIR"], notes: "Pode ser distribuído em lote ou individualmente no mês." },
  { id: 3, code: "PS", name: "Plano de saúde", active: true, mode: "MONTHLY", applies_to: ["ADM", "IND", "COM", "DIR"], notes: "Valor mensal recorrente por colaborador." },
  { id: 4, code: "SV", name: "Seguro de vida", active: true, mode: "MONTHLY", applies_to: ["ADM", "IND", "COM", "DIR"], notes: "Valor mensal recorrente por colaborador." }
];

function buildSettings(
  companyName: string,
  cnpj: string,
  backupDirectory: string,
  dailyHours: number,
  holidays: string[],
  charges: DemoSettings["charges"],
  payrollRates: DemoSettings["payroll_rates"]
): DemoSettings {
  return {
    company_name: companyName,
    cnpj,
    company_logo: "",
    initial_month: "2026-01",
    default_daily_hours: dailyHours,
    include_saturdays: false,
    include_sundays: false,
    holidays,
    charges,
    payroll_rates: payrollRates,
    backup_directory: backupDirectory,
    auto_backup_on_start: true,
    backup_retention: 90
  };
}

export const demoCompanies: DemoCompany[] = [
  {
    id: 1,
    code: "ALFA-MAT",
    name: "Alfa Matriz Ltda.",
    kind: "MATRIZ",
    group: "Grupo Alfa",
    parent_company_id: null,
    active: true,
    settings: buildSettings(
      "Alfa Matriz Ltda.",
      "12.345.678/0001-90",
      "C:\\SistemaIndicadoresFolha\\AlfaMatriz\\backups",
      8.8,
      ["01/01/2026", "21/04/2026", "01/05/2026"],
      [{ name: "INSS", rate: 20 }, { name: "RAT", rate: 1.5 }, { name: "Terceiros", rate: 5.8 }, { name: "FGTS", rate: 8 }, { name: "Multa FGTS", rate: 50 }],
      { inss: 20, rat: 1.5, terceiros: 5.8, fgts: 8, fgts_vacation: 8, fgts_thirteenth: 8, fgts_notice: 8, multa_fgts: 50, patronal: 27.3 }
    ),
    backups: [
      { id: 1, date: "2026-06-05 08:10", file: "alfa_matriz_20260605_0810.dump", size: "42 MB", status: "Validado" },
      { id: 2, date: "2026-06-04 18:00", file: "alfa_matriz_20260604_1800.dump", size: "41 MB", status: "Concluído" }
    ],
    closing: {
      competency: "2026-06",
      status: "OPEN",
      checklist: {
        "Colaboradores conferidos": true,
        "Movimentações conferidas": true,
        "Folha importada": true,
        "Indicadores calculados": true,
        "Relatório mensal gerado": false,
        "Backup realizado": false
      }
    }
  },
  {
    id: 2,
    code: "ALFA-FIL",
    name: "Alfa Filial Indústria",
    kind: "FILIAL",
    group: "Grupo Alfa",
    parent_company_id: 1,
    active: true,
    settings: buildSettings(
      "Alfa Filial Indústria",
      "12.345.678/0002-71",
      "C:\\SistemaIndicadoresFolha\\AlfaFilial\\backups",
      8.6,
      ["01/01/2026", "21/04/2026", "07/09/2026"],
      [{ name: "INSS", rate: 20 }, { name: "RAT", rate: 2 }, { name: "Terceiros", rate: 6.2 }, { name: "FGTS", rate: 8 }, { name: "Multa FGTS", rate: 50 }],
      { inss: 20, rat: 2, terceiros: 6.2, fgts: 8, fgts_vacation: 8, fgts_thirteenth: 8, fgts_notice: 8, multa_fgts: 50, patronal: 27.3 }
    ),
    backups: [
      { id: 1, date: "2026-06-05 09:15", file: "alfa_filial_20260605_0915.dump", size: "39 MB", status: "Validado" },
      { id: 2, date: "2026-06-03 18:00", file: "alfa_filial_20260603_1800.dump", size: "38 MB", status: "Concluído" }
    ],
    closing: {
      competency: "2026-06",
      status: "OPEN",
      checklist: {
        "Colaboradores conferidos": true,
        "Movimentações conferidas": false,
        "Folha importada": true,
        "Indicadores calculados": true,
        "Relatório mensal gerado": false,
        "Backup realizado": false
      }
    }
  },
  {
    id: 3,
    code: "BETA-IND",
    name: "Beta Industrial S.A.",
    kind: "OUTRA",
    group: "Grupo Beta",
    parent_company_id: null,
    active: true,
    settings: buildSettings(
      "Beta Industrial S.A.",
      "45.987.321/0001-55",
      "C:\\SistemaIndicadoresFolha\\BetaIndustrial\\backups",
      8.0,
      ["01/01/2026", "07/09/2026", "12/10/2026"],
      [{ name: "INSS", rate: 20 }, { name: "RAT", rate: 3 }, { name: "Terceiros", rate: 7.5 }, { name: "FGTS", rate: 8 }, { name: "Multa FGTS", rate: 50 }],
      { inss: 20, rat: 3, terceiros: 7.5, fgts: 8, fgts_vacation: 8, fgts_thirteenth: 8, fgts_notice: 8, multa_fgts: 50, patronal: 27.3 }
    ),
    backups: [
      { id: 1, date: "2026-06-05 10:00", file: "beta_industrial_20260605_1000.dump", size: "44 MB", status: "Validado" }
    ],
    closing: {
      competency: "2026-06",
      status: "OPEN",
      checklist: {
        "Colaboradores conferidos": true,
        "Movimentações conferidas": true,
        "Folha importada": false,
        "Indicadores calculados": false,
        "Relatório mensal gerado": false,
        "Backup realizado": false
      }
    }
  },
  {
    id: 4,
    code: "GAMMA-COM",
    name: "Gamma Comércio Ltda.",
    kind: "OUTRA",
    group: "Grupo Gamma",
    parent_company_id: null,
    active: true,
    settings: buildSettings(
      "Gamma Comércio Ltda.",
      "78.901.234/0001-11",
      "C:\\SistemaIndicadoresFolha\\GammaComercio\\backups",
      7.5,
      ["01/01/2026", "21/04/2026", "25/12/2026"],
      [{ name: "INSS", rate: 20 }, { name: "RAT", rate: 1 }, { name: "Terceiros", rate: 5.2 }, { name: "FGTS", rate: 8 }, { name: "Multa FGTS", rate: 50 }],
      { inss: 20, rat: 1, terceiros: 5.2, fgts: 8, fgts_vacation: 8, fgts_thirteenth: 8, fgts_notice: 8, multa_fgts: 50, patronal: 27.3 }
    ),
    backups: [
      { id: 1, date: "2026-06-05 07:40", file: "gamma_comercio_20260605_0740.dump", size: "40 MB", status: "Concluído" }
    ],
    closing: {
      competency: "2026-06",
      status: "OPEN",
      checklist: {
        "Colaboradores conferidos": true,
        "Movimentações conferidas": true,
        "Folha importada": true,
        "Indicadores calculados": true,
        "Relatório mensal gerado": false,
        "Backup realizado": true
      }
    }
  }
];

const names = [
  "Ana Beatriz Rocha", "Marcelo Vieira Lima", "Paula Cristina Moura", "Rafael Martins Alves",
  "Juliana Freitas Campos", "Tiago Nascimento Reis", "Camila Prado Santos", "Bruno Henrique Dias",
  "Fernanda Lopes Ribeiro", "Leandro Costa Pires", "Helena Duarte Nunes", "Roberto Siqueira Tavares",
  "Marina Albuquerque Silva", "Daniel Correia Batista", "Patrícia Gomes Macedo", "Igor Pereira Antunes",
  "Natália Barros Queiroz", "André Luiz Cardoso", "Viviane Moreira Teixeira", "Eduardo Ramos Pinto",
  "Letícia Carvalho Mendes", "Gustavo Henrique Faria", "Renata Oliveira Neves", "Fábio Augusto Torres",
  "Sabrina Almeida Costa", "Caio Vinícius Franco", "Elaine Martins Duarte", "Márcio Vinícius Nogueira",
  "Bianca Ferreira Sá", "Rodrigo Azevedo Cunha", "Cristiane Matos Araujo", "Felipe Santana Monteiro",
  "Isabela Lima Fernandes", "Otávio Henrique Moraes", "Priscila Rocha Barreto", "Alexandre Pires Gomes",
  "Vanessa Tavares Melo", "Diego Castro Pinheiro", "Lorena Sampaio Reis", "Sérgio Amaral Brito",
  "Mônica Assis Paiva", "Henrique Barbosa Leal", "Débora Vasconcelos Maia", "Samuel Costa Borges"
];

const jobs = {
  ADM: ["Analista de RH", "Assistente Administrativo", "Analista Financeiro", "Coordenadora de RH"],
  IND: ["Operador de Produção", "Técnico de Manutenção", "Supervisor Industrial", "Auxiliar de Logística"],
  COM: ["Executivo de Contas", "Analista Comercial", "Representante Comercial", "Designer de Marketing"],
  DIR: ["Diretora Executiva", "Diretor Comercial", "Controller", "Assessora Executiva"]
};

const distribution = [
  ...Array(9).fill("ADM"),
  ...Array(19).fill("IND"),
  ...Array(11).fill("COM"),
  ...Array(5).fill("DIR")
] as ("ADM" | "IND" | "COM" | "DIR")[];

function cpf(index: number) {
  return String(10000000000 + index * 137291).slice(0, 11);
}

function pixTypeFor(index: number): "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM" {
  return ["CPF", "CNPJ", "EMAIL", "PHONE", "RANDOM"][index % 5] as "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";
}

function familyAllowanceFor(index: number, salaryBase: number): number {
  if (salaryBase > 3500 && index % 5 === 0) return 124.08;
  if (salaryBase > 4500 && index % 8 === 0) return 248.16;
  return 0;
}

function addressFor(index: number) {
  const streets = [
    "Rua das Acacias",
    "Avenida Central",
    "Rua do Comercio",
    "Alameda dos Ipês",
    "Rua Primavera",
    "Avenida Brasil",
    "Rua do Sol",
    "Travessa das Flores"
  ];
  const neighborhoods = [
    "Centro",
    "Jardim Paulista",
    "Vila Nova",
    "Distrito Industrial",
    "Parque das Nações",
    "Cidade Jardim"
  ];
  const cities = ["Sao Paulo", "Campinas", "Sorocaba", "Mogi das Cruzes", "Santo Andre", "Guarulhos"];
  const states = ["SP", "RJ", "MG", "PR"];

  return {
    street: `${streets[index % streets.length]}, ${100 + (index * 7) % 900}`,
    addressNumber: String(10 + (index * 13) % 220),
    neighborhood: neighborhoods[index % neighborhoods.length],
    city: cities[index % cities.length],
    state: states[index % states.length]
  };
}

function benefitsFor(index: number, centerCode: "ADM" | "IND" | "COM" | "DIR") {
  if (centerCode === "DIR") {
    return index % 2 === 0
      ? ["Plano de saúde", "Seguro de vida"]
      : ["Alimentação", "Plano de saúde"];
  }
  if (centerCode === "IND") {
    return index % 3 === 0
      ? ["Vale transporte", "Alimentação"]
      : index % 3 === 1
        ? ["Vale transporte"]
        : ["Seguro de vida"];
  }
  if (centerCode === "COM") {
    return index % 2 === 0
      ? ["Alimentação", "Vale transporte"]
      : ["Alimentação", "Plano de saúde"];
  }
  return index % 2 === 0
    ? ["Vale transporte", "Alimentação", "Plano de saúde"]
    : ["Vale transporte", "Seguro de vida"];
}

export function createDemoEmployees(): DemoEmployee[] {
  return names.map((name, index) => {
    const centerCode = distribution[index];
    const company = demoCompanies[index % demoCompanies.length];
    const center = demoResultCenters.find(item => item.code === centerCode)!;
    const type = demoEmploymentTypes[(index + (centerCode === "DIR" ? 3 : 0)) % demoEmploymentTypes.length];
    const salaryBase = centerCode === "DIR" ? 22000 + index * 310 : centerCode === "IND" ? 3300 + index * 95 : centerCode === "COM" ? 4200 + index * 120 : 3900 + index * 100;
    const status = index % 17 === 0 ? "ON_LEAVE" : index % 19 === 0 ? "INACTIVE" : "ACTIVE";
    const code = `${centerCode}-${String(index + 1).padStart(3, "0")}`;
    const admissionYear = 2021 + (index % 5);
    const admissionMonth = String((index % 12) + 1).padStart(2, "0");
    const jobList = jobs[centerCode];
    const familyAllowance = familyAllowanceFor(index, salaryBase);
    const supervisorName = centerCode === "DIR"
      ? "Diretoria"
      : centerCode === "COM"
        ? "Gerência Comercial"
        : centerCode === "IND"
          ? "Coordenação Industrial"
          : "Coordenação Administrativa";
    const address = addressFor(index);
    return {
      id: index + 1,
      company_id: company.id,
      employee_code: code,
      job_title: jobList[index % jobList.length],
      department: center.name,
      admission_date: `${admissionYear}-${admissionMonth}-10`,
      termination_date: status === "INACTIVE" ? "2026-05-18" : null,
      status,
      daily_hours: "8.80",
      notes: "Registro fictício para demonstração comercial.",
      supervisor_name: supervisorName,
      street: address.street,
      address_number: address.addressNumber,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      bank_name: centerCode === "DIR" ? "Banco Alfa" : "Banco Digital",
      bank_agency: `${String(1000 + (index % 300)).padStart(4, "0")}`,
      bank_account: String(50000 + index * 11),
      bank_account_digit: String((index % 9) + 1),
      pix_key_type: pixTypeFor(index),
      benefits: benefitsFor(index, centerCode),
      pix_key: pixTypeFor(index) === "CPF"
        ? cpf(index + 1)
        : pixTypeFor(index) === "EMAIL"
          ? `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ".")}@empresa-demo.com.br`
          : pixTypeFor(index) === "PHONE"
            ? `(11) 9${String(80000000 + index * 2317).slice(0, 8)}`
            : `PIX-DEMO-${index + 1}`,
      employee: { id: index + 1, cpf: cpf(index + 1), full_name: name },
      employment_type: type,
      result_center: center,
      salary_base: Math.round(salaryBase),
      email: `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ".")}@empresa-demo.com.br`,
      phone: `(11) 9${String(80000000 + index * 2317).slice(0, 8)}`,
      salary_history: [
        { date: "2026-01-01", amount: Math.round(salaryBase), family_allowance: familyAllowance, reason: familyAllowance ? "Revisão salarial com salário-família" : "Revisão salarial" },
        { date: "2025-01-01", amount: Math.round(salaryBase * 0.9), family_allowance: 0, reason: "Reajuste anual" }
      ],
      movement_history: [
        { date: "2026-02-12", description: "Conferência cadastral concluída" },
        { date: "2026-04-05", description: centerCode === "IND" ? "Treinamento operacional" : "Atualização de vínculo" }
      ],
      vacations: [{ period: index % 3 === 0 ? "15/07/2026 a 29/07/2026" : "Programação pendente", status: index % 3 === 0 ? "Programadas" : "A definir" }],
      leaves: status === "ON_LEAVE" ? [{ period: "03/06/2026 a 07/06/2026", reason: "Atestado médico", days: 5 }] : []
    };
  });
}

export function createDemoBenefitDistributions(employees = createDemoEmployees()): DemoBenefitDistribution[] {
  const competency = "2026-06";
  const items: DemoBenefitDistribution[] = [];
  employees
    .filter(employee => employee.status === "ACTIVE")
    .forEach((employee, index) => {
      const company = demoCompanies.find(item => item.id === employee.company_id) ?? demoCompanies[0];
      const baseDays = 22 - (index % 3);
      if (employee.benefits.includes("Vale transporte")) {
        items.push({
          id: items.length + 1,
          company_id: company.id,
          competency,
          benefit_code: "VT",
          benefit_name: "Vale transporte",
          employee_id: employee.id,
          employee_name: employee.employee.full_name,
          result_center: employee.result_center,
          supervisor_name: employee.supervisor_name,
          employment_type: employee.employment_type.name,
          state: employee.state,
          days_worked: baseDays,
          value_per_day: employee.result_center.code === "DIR" ? 18.5 : 14.8,
          monthly_value: 0,
          amount: roundMoney((employee.result_center.code === "DIR" ? 18.5 : 14.8) * baseDays),
          source: "Lote",
          description: "Distribuição inicial de vale transporte",
          created_at: "2026-06-01 08:00",
          created_by: "Sistema Demo"
        });
      }
      if (employee.benefits.includes("Alimentação")) {
        items.push({
          id: items.length + 1,
          company_id: company.id,
          competency,
          benefit_code: "AL",
          benefit_name: "Alimentação",
          employee_id: employee.id,
          employee_name: employee.employee.full_name,
          result_center: employee.result_center,
          supervisor_name: employee.supervisor_name,
          employment_type: employee.employment_type.name,
          state: employee.state,
          days_worked: baseDays,
          value_per_day: employee.result_center.code === "DIR" ? 32 : 24,
          monthly_value: 0,
          amount: roundMoney((employee.result_center.code === "DIR" ? 32 : 24) * baseDays),
          source: "Lote",
          description: "Distribuição inicial de alimentação",
          created_at: "2026-06-01 08:00",
          created_by: "Sistema Demo"
        });
      }
      if (employee.benefits.includes("Plano de saúde")) {
        items.push({
          id: items.length + 1,
          company_id: company.id,
          competency,
          benefit_code: "PS",
          benefit_name: "Plano de saúde",
          employee_id: employee.id,
          employee_name: employee.employee.full_name,
          result_center: employee.result_center,
          supervisor_name: employee.supervisor_name,
          employment_type: employee.employment_type.name,
          state: employee.state,
          days_worked: 0,
          value_per_day: 0,
          monthly_value: employee.result_center.code === "DIR" ? 860 : employee.employment_type.name === "CLT" ? 490 : 360,
          amount: employee.result_center.code === "DIR" ? 860 : employee.employment_type.name === "CLT" ? 490 : 360,
          source: "Lote",
          description: "Distribuição inicial de plano de saúde",
          created_at: "2026-06-01 08:00",
          created_by: "Sistema Demo"
        });
      }
      if (employee.benefits.includes("Seguro de vida")) {
        items.push({
          id: items.length + 1,
          company_id: company.id,
          competency,
          benefit_code: "SV",
          benefit_name: "Seguro de vida",
          employee_id: employee.id,
          employee_name: employee.employee.full_name,
          result_center: employee.result_center,
          supervisor_name: employee.supervisor_name,
          employment_type: employee.employment_type.name,
          state: employee.state,
          days_worked: 0,
          value_per_day: 0,
          monthly_value: employee.employment_type.name === "CLT" ? 75 : 52,
          amount: employee.employment_type.name === "CLT" ? 75 : 52,
          source: "Lote",
          description: "Distribuição inicial de seguro de vida",
          created_at: "2026-06-01 08:00",
          created_by: "Sistema Demo"
        });
      }
    });
  return items;
}

export function createDemoMovements(employees = createDemoEmployees()): DemoMovement[] {
  const types: MovementType[] = ["admissão", "desligamento", "falta", "atestado", "afastamento", "férias", "transferência de Centro de Resultado", "alteração salarial"];
  return demoCompetencies.flatMap((competency, monthIndex) =>
    employees.slice(monthIndex * 4, monthIndex * 4 + 10).map((employee, index) => ({
      id: monthIndex * 100 + index + 1,
      company_id: employee.company_id,
      competency: competency.id,
      employee_id: employee.id,
      employee_name: employee.employee.full_name,
      type: types[(index + monthIndex) % types.length],
      start_date: `${competency.id}-${String(3 + index).padStart(2, "0")}`,
      end_date: index % 3 === 0 ? `${competency.id}-${String(5 + index).padStart(2, "0")}` : null,
      days: index % 3 === 0 ? 3 : 1,
      hour_impact: index % 3 === 0 ? 26.4 : 8.8,
      result_center: employee.result_center,
      observation: "Movimentação fictícia para apresentação.",
      status: index % 4 === 0 ? "Pendente" : index % 4 === 1 ? "Conferida" : "Aplicada"
    }))
  );
}

export const demoSettings = demoCompanies[0].settings;
export const demoBackups = demoCompanies[0].backups;
export const demoClosing = demoCompanies[0].closing;
export const demoBenefitDistributions = createDemoBenefitDistributions();

export function createDemoCostAllocations(): DemoCostAllocation[] {
  return [
    { id: 1, company_id: 1, competency: "2026-06", result_center: demoResultCenters[0], category: "Despesas administrativas", description: "Rateio de infraestrutura administrativa", amount: 14850, source: "Lancto manual", allocated_at: "2026-06-03 09:10", status: "Lançado" },
    { id: 2, company_id: 1, competency: "2026-06", result_center: demoResultCenters[1], category: "Operação industrial", description: "Energia e insumos da produção", amount: 28600, source: "Lancto manual", allocated_at: "2026-06-04 10:30", status: "Revisado" },
    { id: 3, company_id: 2, competency: "2026-06", result_center: demoResultCenters[1], category: "Operação industrial", description: "Turno noturno e manutenção", amount: 22340, source: "Lancto manual", allocated_at: "2026-06-04 14:20", status: "Aprovado" },
    { id: 4, company_id: 3, competency: "2026-06", result_center: demoResultCenters[2], category: "Comercial", description: "Campanhas e apoio comercial", amount: 11980, source: "Lancto manual", allocated_at: "2026-06-05 11:00", status: "Lançado" },
    { id: 5, company_id: 4, competency: "2026-06", result_center: demoResultCenters[3], category: "Diretoria", description: "Custos executivos e representação", amount: 18500, source: "Lancto manual", allocated_at: "2026-06-05 16:45", status: "Revisado" }
  ];
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
