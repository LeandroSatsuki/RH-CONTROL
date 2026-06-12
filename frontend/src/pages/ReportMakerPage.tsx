import { useEffect, useMemo, useRef, useState } from "react";
import { api, IS_DEMO_MODE } from "../api";
import { useDemoScope } from "../context/DemoScope";
import { Empty, ErrorMessage, SuccessMessage } from "../components/Feedback";
import { DemoBenefitDistribution, DemoEmployee, DemoMovement, PayrollRow } from "../mocks/demoTypes";
import { demoCompetencies } from "../mocks/demoData";
import { EmploymentType, ResultCenter, User } from "../types";
import { payrollRows } from "../mocks/demoCalculations";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const plainNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

type SourceName = "Colaboradores" | "Movimentações" | "Benefícios" | "Custo / Folha" | "Afastamentos";
type Aggregator = "none" | "sum" | "avg" | "count" | "min" | "max" | "multiply";

interface FieldMeta {
  id: string;
  source: SourceName;
  label: string;
  display?: "currency" | "number" | "text";
  extractor: (row: any) => string | number;
}

interface SelectedField {
  id: string;
  aggregator: Aggregator;
}

interface ReportTemplate {
  id: number;
  name: string;
  source: SourceName;
  groupBy: string;
  fields: SelectedField[];
  filters: Record<string, string>;
}

const STORAGE_KEY = "indicadores-report-maker-templates-v1";

const fieldLibrary: FieldMeta[] = [
  { id: "employee_name", source: "Colaboradores", label: "Colaborador", extractor: row => row.employee_name ?? row.full_name ?? "" },
  { id: "employee_code", source: "Colaboradores", label: "Matrícula", extractor: row => row.employee_code ?? "" },
  { id: "center", source: "Colaboradores", label: "Centro de Resultado", extractor: row => row.center ?? row.result_center?.code ?? "" },
  { id: "supervisor", source: "Colaboradores", label: "Supervisor", extractor: row => row.supervisor ?? row.supervisor_name ?? "" },
  { id: "state", source: "Colaboradores", label: "UF", extractor: row => row.state ?? "" },
  { id: "employment_type", source: "Colaboradores", label: "Modalidade", extractor: row => row.employment_type ?? "" },
  { id: "salary_base", source: "Colaboradores", label: "Salário base", display: "currency", extractor: row => Number(row.salary_base ?? 0) },
  { id: "status", source: "Colaboradores", label: "Status", extractor: row => row.status ?? "" },

  { id: "movement_type", source: "Movimentações", label: "Tipo", extractor: row => row.type ?? "" },
  { id: "movement_center", source: "Movimentações", label: "Centro de Resultado", extractor: row => row.center ?? row.result_center?.code ?? "" },
  { id: "movement_employee", source: "Movimentações", label: "Colaborador", extractor: row => row.employee_name ?? "" },
  { id: "movement_days", source: "Movimentações", label: "Dias", display: "number", extractor: row => Number(row.days ?? 0) },
  { id: "movement_hours", source: "Movimentações", label: "Horas impactadas", display: "number", extractor: row => Number(row.hour_impact ?? 0) },
  { id: "movement_reason", source: "Movimentações", label: "Observação", extractor: row => row.observation ?? "" },

  { id: "benefit_name", source: "Benefícios", label: "Benefício", extractor: row => row.benefit_name ?? "" },
  { id: "benefit_employee", source: "Benefícios", label: "Colaborador", extractor: row => row.employee_name ?? "" },
  { id: "benefit_center", source: "Benefícios", label: "Centro de Resultado", extractor: row => row.result_center?.code ?? row.center ?? "" },
  { id: "benefit_days", source: "Benefícios", label: "Dias trabalhados", display: "number", extractor: row => Number(row.days_worked ?? 0) },
  { id: "benefit_value_day", source: "Benefícios", label: "Valor por dia", display: "currency", extractor: row => Number(row.value_per_day ?? 0) },
  { id: "benefit_monthly", source: "Benefícios", label: "Valor mensal", display: "currency", extractor: row => Number(row.monthly_value ?? 0) },
  { id: "benefit_amount", source: "Benefícios", label: "Valor total", display: "currency", extractor: row => Number(row.amount ?? 0) },
  { id: "benefit_description", source: "Benefícios", label: "Descrição", extractor: row => row.description ?? "" },

  { id: "payroll_employee", source: "Custo / Folha", label: "Colaborador", extractor: row => row.employee_name ?? "" },
  { id: "payroll_center", source: "Custo / Folha", label: "Centro de Resultado", extractor: row => row.result_center?.code ?? "" },
  { id: "payroll_salary", source: "Custo / Folha", label: "Salário", display: "currency", extractor: row => Number(row.salary ?? 0) },
  { id: "payroll_transport", source: "Custo / Folha", label: "Vale transporte", display: "currency", extractor: row => Number(row.transport ?? 0) },
  { id: "payroll_meal", source: "Custo / Folha", label: "Alimentação", display: "currency", extractor: row => Number(row.meal ?? 0) },
  { id: "payroll_health", source: "Custo / Folha", label: "Plano de saúde", display: "currency", extractor: row => Number(row.health_plan ?? 0) },
  { id: "payroll_insurance", source: "Custo / Folha", label: "Seguro de vida", display: "currency", extractor: row => Number(row.insurance ?? 0) },
  { id: "payroll_total", source: "Custo / Folha", label: "Total geral", display: "currency", extractor: row => Number(row.grand_total ?? 0) },

  { id: "abs_employee", source: "Afastamentos", label: "Colaborador", extractor: row => row.employee_name ?? "" },
  { id: "abs_center", source: "Afastamentos", label: "Centro de Resultado", extractor: row => row.center ?? row.result_center?.code ?? "" },
  { id: "abs_type", source: "Afastamentos", label: "Tipo", extractor: row => row.type ?? "" },
  { id: "abs_days", source: "Afastamentos", label: "Dias", display: "number", extractor: row => Number(row.days ?? 0) },
  { id: "abs_hours", source: "Afastamentos", label: "Horas", display: "number", extractor: row => Number(row.hour_impact ?? 0) },
  { id: "abs_observation", source: "Afastamentos", label: "Justificativa", extractor: row => row.observation ?? "" }
];

const sourceDefaults: Record<SourceName, string[]> = {
  "Colaboradores": ["employee_name", "center", "supervisor", "state", "employment_type", "salary_base"],
  "Movimentações": ["movement_employee", "movement_center", "movement_type", "movement_days", "movement_hours"],
  "Benefícios": ["benefit_employee", "benefit_center", "benefit_name", "benefit_days", "benefit_value_day", "benefit_amount"],
  "Custo / Folha": ["payroll_employee", "payroll_center", "payroll_transport", "payroll_meal", "payroll_health", "payroll_insurance", "payroll_total"],
  "Afastamentos": ["abs_employee", "abs_center", "abs_type", "abs_days", "abs_hours", "abs_observation"]
};

export function ReportMakerPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [source, setSource] = useState<SourceName>("Custo / Folha");
  const [competency, setCompetency] = useState("2026-06");
  const [employees, setEmployees] = useState<DemoEmployee[]>([]);
  const [movements, setMovements] = useState<DemoMovement[]>([]);
  const [benefits, setBenefits] = useState<DemoBenefitDistribution[]>([]);
  const [centers, setCenters] = useState<ResultCenter[]>([]);
  const [types, setTypes] = useState<EmploymentType[]>([]);
  const [selectedFields, setSelectedFields] = useState<SelectedField[]>(sourceDefaults["Custo / Folha"].map(id => ({ id, aggregator: fieldLibrary.find(field => field.id === id)?.display !== "text" ? "sum" : "none" })));
  const [groupBy, setGroupBy] = useState("payroll_center");
  const [filterCenter, setFilterCenter] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterBenefit, setFilterBenefit] = useState("");
  const [query, setQuery] = useState("");
  const [templateName, setTemplateName] = useState("Relatório customizado");
  const [templates, setTemplates] = useState<ReportTemplate[]>(loadTemplates());
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const applyingTemplate = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [employeeList, movementList, benefitList, resultCenters, employmentTypes] = await Promise.all([
        api<DemoEmployee[]>("/employees", {}, token),
        api<DemoMovement[]>(`/demo/movements?competency=${competency}`, {}, token),
        api<DemoBenefitDistribution[]>(`/demo/benefit-distributions?competency=${competency}`, {}, token),
        api<ResultCenter[]>("/result-centers", {}, token),
        api<EmploymentType[]>("/employment-types", {}, token)
      ]);
      setEmployees(employeeList);
      setMovements(movementList);
      setBenefits(benefitList);
      setCenters(resultCenters);
      setTypes(employmentTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar relatório maker");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [competency, token, selectedCompany.id]);

  useEffect(() => {
    if (applyingTemplate.current) {
      applyingTemplate.current = false;
      return;
    }
    const defaults = sourceDefaults[source];
    setSelectedFields(defaults.map(id => ({ id, aggregator: fieldLibrary.find(field => field.id === id)?.display !== "text" ? "sum" : "none" })));
    setGroupBy(defaultGroupField(source));
  }, [source]);

  const sourceRows = useMemo(() => getSourceRows(source, employees, movements, benefits, competency), [benefits, competency, employees, movements, source]);
  const filteredRows = useMemo(() => sourceRows.filter(row => applyFilters(row, { filterCenter, filterState, filterType, filterBenefit, query })), [filterBenefit, filterCenter, filterState, filterType, query, sourceRows]);
  const previewRows = useMemo(() => buildPreviewRows(filteredRows, groupBy, selectedFields), [filteredRows, groupBy, selectedFields]);
  const reportTotal = useMemo(() => calculateReportTotal(source, filteredRows), [filteredRows, source]);
  const availableFields = fieldLibrary.filter(field => field.source === source);

  function addField(fieldId: string) {
    if (selectedFields.some(item => item.id === fieldId)) return;
    const meta = fieldLibrary.find(item => item.id === fieldId);
    setSelectedFields(current => [...current, { id: fieldId, aggregator: meta?.display !== "text" ? "sum" : "none" }]);
  }

  function updateField(id: string, aggregator: Aggregator) {
    setSelectedFields(current => current.map(item => item.id === id ? { ...item, aggregator } : item));
  }

  function removeField(id: string) {
    setSelectedFields(current => current.filter(item => item.id !== id));
  }

  function saveTemplates(next: ReportTemplate[]) {
    setTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function saveTemplate() {
    if (user.role !== "ADMIN") {
      setError("Seu perfil possui acesso somente para consulta.");
      return;
    }
    const item: ReportTemplate = {
      id: activeTemplateId ?? Date.now(),
      name: templateName.trim() || "Relatório customizado",
      source,
      groupBy,
      fields: selectedFields,
      filters: { center: filterCenter, state: filterState, type: filterType, benefit: filterBenefit, query }
    };
    const next = [item, ...templates.filter(existing => existing.id !== item.id)];
    saveTemplates(next);
    setActiveTemplateId(item.id);
    setSuccess("Template salvo para uso futuro.");
  }

  function loadTemplate(template: ReportTemplate) {
    applyingTemplate.current = true;
    setActiveTemplateId(template.id);
    setTemplateName(template.name);
    setSource(template.source);
    setGroupBy(template.groupBy);
    setSelectedFields(template.fields);
    setFilterCenter(template.filters.center ?? "");
    setFilterState(template.filters.state ?? "");
    setFilterType(template.filters.type ?? "");
    setFilterBenefit(template.filters.benefit ?? "");
    setQuery(template.filters.query ?? "");
  }

  function deleteTemplate(id: number) {
    saveTemplates(templates.filter(item => item.id !== id));
    if (activeTemplateId === id) setActiveTemplateId(null);
  }

  function applyAwayPreset() {
    applyingTemplate.current = true;
    setSource("Afastamentos");
    setTemplateName("Relatório financeiro de afastamentos");
    setFilterType("afastamento");
    setGroupBy("abs_center");
    setSelectedFields([
      { id: "abs_employee", aggregator: "none" },
      { id: "abs_center", aggregator: "none" },
      { id: "abs_type", aggregator: "none" },
      { id: "abs_days", aggregator: "sum" },
      { id: "abs_hours", aggregator: "sum" },
      { id: "abs_observation", aggregator: "none" }
    ]);
  }

  const groupField = fieldLibrary.find(item => item.id === groupBy) ?? fieldLibrary[0];

  return (
    <div>
      <div className="page-title">
        <div>
          <span className="eyebrow">Analytics</span>
          <h1>Relatório Maker</h1>
          <p>Monte relatórios misturando campos, filtros e agregações, e salve o modelo para reutilizar depois.</p>
        </div>
        <div className="actions">
          <button className="secondary" type="button" onClick={applyAwayPreset}>Preset afastamentos</button>
          <button className="primary" type="button" onClick={saveTemplate}>Salvar modelo</button>
        </div>
      </div>
      <ErrorMessage message={error} />
      <SuccessMessage message={success} />

      <div className="summary-grid">
        <Summary label="Fonte" value={source} />
        <Summary label="Linhas filtradas" value={String(filteredRows.length)} />
        <Summary label="Agrupamento" value={groupField.label} />
        <Summary label="Total do relatório" value={source === "Afastamentos" ? String(reportTotal) : money.format(reportTotal)} strong />
      </div>

      <div className="panel filters-panel report-maker-filters">
        <select value={competency} onChange={event => setCompetency(event.target.value)}>{demoCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <select value={source} onChange={event => setSource(event.target.value as SourceName)}>
          <option value="Colaboradores">Colaboradores</option>
          <option value="Movimentações">Movimentações</option>
          <option value="Benefícios">Benefícios</option>
          <option value="Custo / Folha">Custo / Folha</option>
          <option value="Afastamentos">Afastamentos</option>
        </select>
        <select value={groupBy} onChange={event => setGroupBy(event.target.value)}>
          {fieldLibrary.filter(field => field.source === source).map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
        </select>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filtro base por texto" />
        <select value={filterCenter} onChange={event => setFilterCenter(event.target.value)}><option value="">Todos os CRs</option>{centers.map(center => <option key={center.id} value={center.code}>{center.code}</option>)}</select>
        <select value={filterState} onChange={event => setFilterState(event.target.value)}><option value="">Todos os UF</option>{Array.from(new Set(employees.map(item => item.state).filter(Boolean))).map(state => <option key={state} value={state}>{state}</option>)}</select>
        <select value={filterType} onChange={event => setFilterType(event.target.value)}><option value="">Todas as modalidades</option>{types.map(type => <option key={type.id} value={type.name}>{type.name}</option>)}</select>
        <select value={filterBenefit} onChange={event => setFilterBenefit(event.target.value)}><option value="">Todos os benefícios</option>{Array.from(new Set(benefits.map(item => item.benefit_name))).map(benefit => <option key={benefit} value={benefit}>{benefit}</option>)}</select>
      </div>

      <div className="report-maker-grid">
        <section className="panel report-maker-panel">
          <h2>Campos disponíveis</h2>
          {availableFields.map(field => (
            <button key={field.id} type="button" className="report-field-row" onClick={() => addField(field.id)}>
              <span>{field.label}</span>
              <small>{field.display === "currency" ? "moeda" : field.display === "number" ? "numérico" : "texto"}</small>
            </button>
          ))}
        </section>

        <section className="panel report-maker-panel">
          <h2>Colunas do relatório</h2>
          {selectedFields.map(item => {
            const meta = fieldLibrary.find(field => field.id === item.id);
            return (
              <div className="report-selected-row" key={item.id}>
                <strong>{meta?.label ?? item.id}</strong>
                <select value={item.aggregator} onChange={event => updateField(item.id, event.target.value as Aggregator)}>
                  <option value="none">Sem agregação</option>
                  <option value="sum">Soma</option>
                  <option value="avg">Média</option>
                  <option value="count">Contagem</option>
                  <option value="min">Mínimo</option>
                  <option value="max">Máximo</option>
                  <option value="multiply">Multiplicação</option>
                </select>
                <button type="button" className="ghost" onClick={() => removeField(item.id)}>Remover</button>
              </div>
            );
          })}
        </section>
      </div>

      <div className="panel report-template-panel">
        <label>Nome do template<input value={templateName} onChange={event => setTemplateName(event.target.value)} /></label>
        <div className="report-template-list">
          {templates.length ? templates.map(template => (
            <div className={`report-template-item ${template.id === activeTemplateId ? "active" : ""}`} key={template.id}>
              <div>
                <strong>{template.name}</strong>
                <span>{template.source} • {fieldLibrary.find(field => field.id === template.groupBy)?.label ?? template.groupBy}</span>
              </div>
              <div className="actions">
                <button className="secondary" type="button" onClick={() => loadTemplate(template)}>Abrir</button>
                <button className="secondary" type="button" onClick={() => deleteTemplate(template.id)}>Excluir</button>
              </div>
            </div>
          )) : <Empty>Nenhum template salvo ainda.</Empty>}
        </div>
      </div>

      <div className="panel table-wrap report-maker-shell">
        {loading && <div className="inline-loading">Carregando dados do relatório...</div>}
        <table>
          <thead>
            <tr>
              <th>{groupField.label}</th>
              {selectedFields.map(field => <th key={field.id}>{fieldLibrary.find(item => item.id === field.id)?.label ?? field.id}</th>)}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, index) => (
              <tr key={`${String(row.__group ?? index)}-${index}`}>
                <td><strong>{String(row.__group ?? "-")}</strong></td>
                {selectedFields.map(field => {
                  const meta = fieldLibrary.find(item => item.id === field.id);
                  return <td key={field.id}>{formatPreviewValue(row[field.id], meta?.display ?? "text")}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!previewRows.length && !loading && <Empty>Nenhum dado disponível para a combinação escolhida.</Empty>}
      </div>
    </div>
  );
}

function DemoOnly() {
  return <div className="panel"><span className="eyebrow">Módulo demo</span><h2>Disponível na versão de apresentação</h2><p>Este módulo usa dados fictícios locais quando `VITE_DEMO_MODE=true`.</p></div>;
}

function Summary({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return <div className={`summary-card ${strong ? "strong" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function loadTemplates(): ReportTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ReportTemplate[];
  } catch {
    return [];
  }
}

function defaultGroupField(source: SourceName) {
  return sourceDefaults[source][0] ?? "";
}

function getSourceRows(source: SourceName, employees: DemoEmployee[], movements: DemoMovement[], benefits: DemoBenefitDistribution[], competency: string) {
  switch (source) {
    case "Colaboradores":
      return employees.filter(employee => employee.status !== "INACTIVE").map(employee => ({
        ...employee,
        full_name: employee.employee.full_name,
        employee_name: employee.employee.full_name,
        center: employee.result_center.code,
        supervisor: employee.supervisor_name,
        salary_base: employee.salary_base
      }));
    case "Movimentações":
      return movements.filter(item => item.competency === competency).map(item => ({
        ...item,
        center: item.result_center.code
      }));
    case "Benefícios":
      return benefits.map(item => ({
        ...item,
        center: item.result_center.code
      }));
    case "Custo / Folha":
      return payrollRows(employees, competency, benefits).map(item => ({
        ...item,
        center: item.result_center.code
      }));
    case "Afastamentos":
      return movements.filter(item => item.competency === competency && ["afastamento", "atestado", "férias"].includes(item.type)).map(item => ({
        ...item,
        center: item.result_center.code
      }));
    default:
      return [];
  }
}

function applyFilters(row: any, filters: { filterCenter: string; filterState: string; filterType: string; filterBenefit: string; query: string }) {
  const text = `${row.employee_name ?? ""} ${row.employee_code ?? ""} ${row.description ?? ""} ${row.observation ?? ""} ${row.center ?? ""} ${row.state ?? ""}`.toLowerCase();
  const center = row.center ?? row.result_center?.code ?? "";
  return (!filters.filterCenter || center === filters.filterCenter)
    && (!filters.filterState || row.state === filters.filterState)
    && (!filters.filterType || row.employment_type?.name === filters.filterType || row.employment_type === filters.filterType || row.type === filters.filterType)
    && (!filters.filterBenefit || row.benefit_name === filters.filterBenefit)
    && (!filters.query || text.includes(filters.query.toLowerCase()));
}

function buildPreviewRows(rows: any[], groupBy: string, selectedFields: SelectedField[]) {
  const groupField = fieldLibrary.find(item => item.id === groupBy);
  const grouped = rows.reduce<Record<string, any[]>>((acc, row) => {
    const key = String(groupField ? groupField.extractor(row) : row.center ?? row.employee_name ?? "Geral");
    acc[key] = [...(acc[key] ?? []), row];
    return acc;
  }, {});
  return Object.entries(grouped).map(([groupValue, items]) => {
    const result: Record<string, any> = { __group: groupValue };
    selectedFields.forEach(field => {
      const meta = fieldLibrary.find(item => item.id === field.id);
      const values = items
        .map(item => meta?.extractor(item))
        .filter((value): value is string | number => value !== undefined && value !== null);
      result[field.id] = aggregate(values, field.aggregator, meta?.display ?? "text");
    });
    return result;
  });
}

function aggregate(values: (string | number)[], aggregator: Aggregator, display: FieldMeta["display"]) {
  const numbers = values.map(value => Number(value)).filter(value => Number.isFinite(value));
  switch (aggregator) {
    case "count":
      return values.length;
    case "sum":
      return numbers.reduce((acc, value) => acc + value, 0);
    case "avg":
      return numbers.length ? numbers.reduce((acc, value) => acc + value, 0) / numbers.length : 0;
    case "min":
      return numbers.length ? Math.min(...numbers) : 0;
    case "max":
      return numbers.length ? Math.max(...numbers) : 0;
    case "multiply":
      return numbers.length ? numbers.reduce((acc, value) => acc * value, 1) : 0;
    case "none":
    default:
      if (display !== "text") return numbers[0] ?? 0;
      return values.find(value => String(value).trim()) ?? "";
  }
}

function formatPreviewValue(value: unknown, display: FieldMeta["display"]) {
  if (display === "currency") return money.format(Number(value ?? 0));
  if (display === "number") return plainNumber.format(Number(value ?? 0));
  return String(value ?? "-");
}

function calculateReportTotal(source: SourceName, rows: any[]) {
  switch (source) {
    case "Custo / Folha":
      return rows.reduce((acc, row) => acc + Number(row.grand_total ?? 0), 0);
    case "Benefícios":
      return rows.reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
    case "Colaboradores":
      return rows.reduce((acc, row) => acc + Number(row.salary_base ?? 0), 0);
    default:
      return 0;
  }
}
