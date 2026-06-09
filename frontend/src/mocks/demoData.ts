import { EmploymentType, ResultCenter } from "../types";
import { Competency, DemoBackup, DemoClosing, DemoEmployee, DemoMovement, DemoSettings, MovementType } from "./demoTypes";

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

export function createDemoEmployees(): DemoEmployee[] {
  return names.map((name, index) => {
    const centerCode = distribution[index];
    const center = demoResultCenters.find(item => item.code === centerCode)!;
    const type = demoEmploymentTypes[(index + (centerCode === "DIR" ? 3 : 0)) % demoEmploymentTypes.length];
    const salaryBase = centerCode === "DIR" ? 22000 + index * 310 : centerCode === "IND" ? 3300 + index * 95 : centerCode === "COM" ? 4200 + index * 120 : 3900 + index * 100;
    const status = index % 17 === 0 ? "ON_LEAVE" : index % 19 === 0 ? "INACTIVE" : "ACTIVE";
    const code = `${centerCode}-${String(index + 1).padStart(3, "0")}`;
    const admissionYear = 2021 + (index % 5);
    const admissionMonth = String((index % 12) + 1).padStart(2, "0");
    const jobList = jobs[centerCode];
    return {
      id: index + 1,
      employee_code: code,
      job_title: jobList[index % jobList.length],
      department: center.name,
      admission_date: `${admissionYear}-${admissionMonth}-10`,
      termination_date: status === "INACTIVE" ? "2026-05-18" : null,
      status,
      daily_hours: "8.80",
      notes: "Registro fictício para demonstração comercial.",
      employee: { id: index + 1, cpf: cpf(index + 1), full_name: name },
      employment_type: type,
      result_center: center,
      salary_base: Math.round(salaryBase),
      email: `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ".")}@empresa-demo.com.br`,
      phone: `(11) 9${String(80000000 + index * 2317).slice(0, 8)}`,
      salary_history: [
        { date: "2025-01-01", amount: Math.round(salaryBase * 0.9), reason: "Reajuste anual" },
        { date: "2026-01-01", amount: Math.round(salaryBase), reason: "Revisão salarial" }
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

export function createDemoMovements(employees = createDemoEmployees()): DemoMovement[] {
  const types: MovementType[] = ["admissão", "desligamento", "falta", "atestado", "afastamento", "férias", "transferência de Centro de Resultado", "alteração salarial"];
  return demoCompetencies.flatMap((competency, monthIndex) =>
    employees.slice(monthIndex * 4, monthIndex * 4 + 10).map((employee, index) => ({
      id: monthIndex * 100 + index + 1,
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

export const demoSettings: DemoSettings = {
  company_name: "Empresa Demonstração Ltda.",
  cnpj: "12.345.678/0001-90",
  initial_month: "2026-01",
  default_daily_hours: 8.8,
  include_saturdays: false,
  include_sundays: false,
  holidays: ["01/01/2026", "21/04/2026", "01/05/2026"],
  charges: [
    { name: "INSS", rate: 20 },
    { name: "RAT", rate: 1.5 },
    { name: "Terceiros", rate: 5.8 },
    { name: "FGTS", rate: 8 },
    { name: "Multa FGTS", rate: 50 }
  ],
  backup_directory: "C:\\SistemaIndicadoresFolha\\backups",
  auto_backup_on_start: true,
  backup_retention: 90
};

export const demoBackups: DemoBackup[] = [
  { id: 1, date: "2026-06-05 08:10", file: "indicadores_20260605_0810.dump", size: "42 MB", status: "Validado" },
  { id: 2, date: "2026-06-04 18:00", file: "indicadores_20260604_1800.dump", size: "41 MB", status: "Concluído" },
  { id: 3, date: "2026-06-03 18:00", file: "indicadores_20260603_1800.dump", size: "41 MB", status: "Concluído" }
];

export const demoClosing: DemoClosing = {
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
};
