import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { api, IS_DEMO_MODE } from "../api";
import { useDemoScope } from "../context/DemoScope";
import { Empty, ErrorMessage, SuccessMessage } from "../components/Feedback";
import { demoBenefitDefinitions, demoCompetencies } from "../mocks/demoData";
import { DemoBenefitDefinition, DemoEmployee } from "../mocks/demoTypes";
import { EmploymentType, ResultCenter, User } from "../types";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface BenefitFilter {
  competency: string;
  benefitCode: string;
  source: "Lote" | "Individual";
  center: string;
  state: string;
  supervisor: string;
  type: string;
  query: string;
}

interface SelectedOverride {
  daysWorked: number;
  valuePerDay: number;
  monthlyValue: number;
  manual: boolean;
}

interface ExportRow {
  employeeName: string;
  employeeCode: string;
  centerCode: string;
  source: string;
  daysWorked: number;
  valuePerDay: number;
  monthlyValue: number;
  amount: number;
}

interface ExportBatch {
  benefitName: string;
  competency: string;
  source: string;
  rows: ExportRow[];
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function defaultFilter(): BenefitFilter {
  return {
    competency: "2026-06",
    benefitCode: "VT",
    source: "Lote",
    center: "",
    state: "",
    supervisor: "",
    type: "",
    query: ""
  };
}

export function BenefitsPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [benefits, setBenefits] = useState<DemoBenefitDefinition[]>([]);
  const [employees, setEmployees] = useState<DemoEmployee[]>([]);
  const [centers, setCenters] = useState<ResultCenter[]>([]);
  const [types, setTypes] = useState<EmploymentType[]>([]);
  const [draft, setDraft] = useState<BenefitFilter>(defaultFilter());
  const [appliedFilter, setAppliedFilter] = useState<BenefitFilter | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedOverrides, setSelectedOverrides] = useState<Record<number, SelectedOverride>>({});
  const [daysWorked, setDaysWorked] = useState(22);
  const [valuePerDay, setValuePerDay] = useState(0);
  const [monthlyValue, setMonthlyValue] = useState(0);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [overrideCandidate, setOverrideCandidate] = useState<DemoEmployee | null>(null);
  const [description, setDescription] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastExportBatch, setLastExportBatch] = useState<ExportBatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [benefitCatalog, employeeList, resultCenters, employmentTypes] = await Promise.all([
        api<DemoBenefitDefinition[]>("/demo/benefits/catalog", {}, token),
        api<DemoEmployee[]>("/employees", {}, token),
        api<ResultCenter[]>("/result-centers", {}, token),
        api<EmploymentType[]>("/employment-types", {}, token)
      ]);
      const catalog = benefitCatalog.length ? benefitCatalog : demoBenefitDefinitions;
      setBenefits(catalog);
      setEmployees(employeeList);
      setCenters(resultCenters);
      setTypes(employmentTypes);
      setDraft(current => {
        const codes = new Set(catalog.map(item => item.code));
        const fallback = catalog.find(item => item.active)?.code ?? catalog[0]?.code ?? "VT";
        return { ...current, benefitCode: codes.has(current.benefitCode) ? current.benefitCode : fallback };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar benefícios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.competency, token, selectedCompany.id]);

  const activeBenefit = benefits.find(item => item.code === (appliedFilter?.benefitCode ?? draft.benefitCode)) ?? benefits[0];
  const effectiveFilter = appliedFilter ?? null;

  const eligibleEmployees = useMemo(() => {
    if (!effectiveFilter || !activeBenefit) return [];
    const benefitMatchesOnly = employees.filter(employee => {
      if (employee.status !== "ACTIVE") return false;
      if (!employee.benefits.some(item => benefitMatches(item, activeBenefit))) return false;
      return true;
    });
    const refined = benefitMatchesOnly.filter(employee => {
      if (effectiveFilter.center && employee.result_center.code !== effectiveFilter.center) return false;
      if (effectiveFilter.state && employee.state !== effectiveFilter.state) return false;
      if (effectiveFilter.supervisor && !normalizeText(employee.supervisor_name).includes(normalizeText(effectiveFilter.supervisor))) return false;
      if (effectiveFilter.type && employee.employment_type.name !== effectiveFilter.type) return false;
      if (effectiveFilter.query) {
        const text = `${employee.employee.full_name} ${employee.employee_code} ${employee.supervisor_name} ${employee.state} ${employee.result_center.code}`.toLowerCase();
        if (!text.includes(effectiveFilter.query.toLowerCase())) return false;
      }
      return true;
    });
    return refined.length ? refined : benefitMatchesOnly;
  }, [activeBenefit, employees, effectiveFilter]);

  const selectedEmployeeRows = selectedIds
    .map(id => employees.find(employee => employee.id === id))
    .filter((employee): employee is DemoEmployee => Boolean(employee))
    .map(employee => ({
      employee,
      override: selectedOverrides[employee.id] ?? buildDefaultOverride(employee, activeBenefit, daysWorked, valuePerDay, monthlyValue, false)
    }));
  const selectedEmployees = eligibleEmployees.filter(employee => selectedIds.includes(employee.id));
  const pendingCount = Math.max(eligibleEmployees.length - selectedEmployees.length, 0);
  const previewTotal = selectedEmployeeRows.reduce((total, item) => {
    if (activeBenefit?.mode === "DAILY") return total + item.override.daysWorked * item.override.valuePerDay;
    return total + item.override.monthlyValue;
  }, 0);

  useEffect(() => {
    if (!activeBenefit) return;
    if (activeBenefit.mode === "DAILY") {
      setDaysWorked(22);
      setValuePerDay(activeBenefit.code === "VT" ? 14.8 : 24);
      setMonthlyValue(0);
    } else {
      setMonthlyValue(activeBenefit.code === "PS" ? 490 : 75);
      setDaysWorked(0);
      setValuePerDay(0);
    }
  }, [activeBenefit?.code]);

  function applyFilter() {
    if (!activeBenefit) {
      setError("Selecione um benefício ativo.");
      return;
    }
    setAppliedFilter({ ...draft });
    const ids = eligibleEmployeeIds(employees, draft, activeBenefit);
    setSelectedIds(ids);
    setSelectedOverrides(buildOverridesForSelection(employees, ids, activeBenefit, daysWorked, valuePerDay, monthlyValue, false));
    setConfirmOpen(false);
    setDescription("");
    setEmployeeQuery("");
    setOverrideCandidate(null);
    setAddPanelOpen(false);
  }

  function clearFilter() {
    setAppliedFilter(null);
    setSelectedIds([]);
    setSelectedOverrides({});
    setConfirmOpen(false);
    setDescription("");
    setEmployeeQuery("");
    setOverrideCandidate(null);
    setAddPanelOpen(false);
  }

  function toggleEmployee(id: number) {
    setSelectedIds(current => {
      if (current.includes(id)) {
        setSelectedOverrides(overrides => {
          const next = { ...overrides };
          delete next[id];
          return next;
        });
        return current.filter(item => item !== id);
      }
      const employee = employees.find(item => item.id === id);
      if (employee) {
        setSelectedOverrides(currentOverrides => ({
          ...currentOverrides,
          [id]: buildDefaultOverride(employee, activeBenefit, daysWorked, valuePerDay, monthlyValue, false)
        }));
      }
      return [...current, id];
    });
  }

  function selectAll() {
    const ids = eligibleEmployees.map(item => item.id);
    setSelectedIds(ids);
    setSelectedOverrides(buildOverridesForSelection(employees, ids, activeBenefit, daysWorked, valuePerDay, monthlyValue, false));
  }

  function clearSelection() {
    setSelectedIds([]);
    setSelectedOverrides({});
  }

  function updateOverride(id: number, patch: Partial<SelectedOverride>) {
    setSelectedOverrides(current => ({
      ...current,
      [id]: {
        ...buildDefaultOverride(employees.find(employee => employee.id === id) ?? employees[0], activeBenefit, daysWorked, valuePerDay, monthlyValue, false),
        ...(current[id] ?? {}),
        ...patch
      }
    }));
  }

  function addEmployee(employee: DemoEmployee, manual: boolean) {
    setSelectedIds(current => (current.includes(employee.id) ? current : [...current, employee.id]));
    setSelectedOverrides(current => ({
      ...current,
      [employee.id]: buildDefaultOverride(employee, activeBenefit, daysWorked, valuePerDay, monthlyValue, manual)
    }));
    setEmployeeQuery("");
    setAddPanelOpen(true);
  }

  function addEmployeeByQuery() {
    const query = employeeQuery.trim();
    if (!query) {
      setError("Digite o nome do colaborador para adicionar.");
      return;
    }
    const matches = employees.filter(employee => matchesEmployee(employee, query));
    if (!matches.length) {
      setError("Nenhum colaborador encontrado com esse nome.");
      return;
    }
    const employee = matches[0];
    if (selectedIds.includes(employee.id)) {
      setEmployeeQuery("");
      setAddPanelOpen(true);
      return;
    }
    if (!eligibleEmployees.some(item => item.id === employee.id)) {
      setOverrideCandidate(employee);
      return;
    }
    addEmployee(employee, false);
    setAddPanelOpen(true);
  }

  function confirmOverrideCandidate() {
    if (!overrideCandidate) return;
    addEmployee(overrideCandidate, true);
    setOverrideCandidate(null);
    setAddPanelOpen(true);
  }

  function cancelOverrideCandidate() {
    setOverrideCandidate(null);
  }

  function removeSelected(id: number) {
    setSelectedIds(current => current.filter(item => item !== id));
    setSelectedOverrides(current => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function confirmDistribution() {
    if (user.role !== "ADMIN") {
      setError("Seu perfil possui acesso somente para consulta.");
      return;
    }
    if (!activeBenefit) {
      setError("Selecione um benefício ativo.");
      return;
    }
    if (!appliedFilter) {
      setError("Aplique o filtro antes de confirmar a distribuição.");
      return;
    }
    if (!selectedEmployeeRows.length) {
      setError("Selecione ao menos um colaborador.");
      return;
    }
    if (!description.trim()) {
      setError("Informe a descrição da distribuição.");
      return;
    }
    setSaving(true);
    try {
      await api("/demo/benefit-distributions", {
        method: "POST",
        body: JSON.stringify({
          competency: appliedFilter.competency,
          benefit_code: activeBenefit.code,
          employee_ids: selectedEmployeeRows.map(item => item.employee.id),
          description: description.trim(),
          source: appliedFilter.source,
          days_worked: daysWorked,
          value_per_day: valuePerDay,
          monthly_value: monthlyValue,
            items: selectedEmployeeRows.map(item => ({
              employee_id: item.employee.id,
              days_worked: item.override.daysWorked,
              value_per_day: item.override.valuePerDay,
              monthly_value: item.override.monthlyValue
            }))
        })
      }, token);
      setSuccess("Distribuição confirmada e integrada ao custo/folha.");
      setDescription("");
      setConfirmOpen(false);
      setSelectedIds([]);
      setLastExportBatch({
        benefitName: activeBenefit.name,
        competency: appliedFilter.competency,
        source: appliedFilter.source,
        rows: selectedEmployeeRows.map(item => ({
          employeeName: item.employee.employee.full_name,
          employeeCode: item.employee.employee_code,
          centerCode: item.employee.result_center.code,
          source: appliedFilter.source,
          daysWorked: item.override.daysWorked,
          valuePerDay: item.override.valuePerDay,
          monthlyValue: item.override.monthlyValue,
          amount: activeBenefit.mode === "DAILY"
            ? item.override.daysWorked * item.override.valuePerDay
            : item.override.monthlyValue
        }))
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao confirmar distribuição");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <span className="eyebrow">Financeiro</span>
          <h1>Benefícios</h1>
          <p>Primeiro travamos o filtro, depois você ajusta a lista de colaboradores e confirma o lançamento.</p>
        </div>
      </div>
      <ErrorMessage message={error} />
      <SuccessMessage message={success} />
      {lastExportBatch && (
        <div className="panel export-panel">
          <div>
            <span className="eyebrow">Exportação</span>
            <h2>{lastExportBatch.benefitName}</h2>
            <p>Lote confirmado para {lastExportBatch.competency}. Baixe agora a planilha ou o PDF.</p>
          </div>
          <div className="actions">
            <button className="secondary" type="button" onClick={() => exportBenefitExcel(lastExportBatch)}>Baixar Excel</button>
            <button className="secondary" type="button" onClick={() => exportBenefitPdf(lastExportBatch)}>Baixar PDF</button>
          </div>
        </div>
      )}

      <div className="summary-grid">
        <Summary label="Benefício" value={activeBenefit?.name ?? "-"} />
        <Summary label="Elegíveis" value={String(eligibleEmployees.length)} />
        <Summary label="Selecionados" value={String(selectedEmployeeRows.length)} />
        <Summary label="Pendentes" value={String(pendingCount)} strong />
      </div>

      <div className="panel benefits-filter-shell">
        <div className="filters-panel benefits-filters">
          <select value={draft.competency} onChange={event => setDraft(current => ({ ...current, competency: event.target.value }))} disabled={Boolean(appliedFilter)}>
            {demoCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <select value={draft.benefitCode} onChange={event => setDraft(current => ({ ...current, benefitCode: event.target.value }))} disabled={Boolean(appliedFilter)}>
            {benefits.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
          <select value={draft.source} onChange={event => setDraft(current => ({ ...current, source: event.target.value as "Lote" | "Individual" }))} disabled={Boolean(appliedFilter)}>
            <option value="Lote">Lote</option>
            <option value="Individual">Individual</option>
          </select>
          <select value={draft.type} onChange={event => setDraft(current => ({ ...current, type: event.target.value }))} disabled={Boolean(appliedFilter)}>
            <option value="">Todas as modalidades</option>
            {types.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
          <select value={draft.center} onChange={event => setDraft(current => ({ ...current, center: event.target.value }))} disabled={Boolean(appliedFilter)}>
            <option value="">Todos os CRs</option>
            {centers.map(item => <option key={item.id} value={item.code}>{item.code}</option>)}
          </select>
          <select value={draft.state} onChange={event => setDraft(current => ({ ...current, state: event.target.value }))} disabled={Boolean(appliedFilter)}>
            <option value="">Todos os UF</option>
            {Array.from(new Set(employees.map(item => item.state).filter(Boolean))).map(state => <option key={state} value={state}>{state}</option>)}
          </select>
          <input value={draft.supervisor} onChange={event => setDraft(current => ({ ...current, supervisor: event.target.value }))} placeholder="Supervisor opcional" disabled={Boolean(appliedFilter)} />
          <input value={draft.query} onChange={event => setDraft(current => ({ ...current, query: event.target.value }))} placeholder="Buscar colaborador" disabled={Boolean(appliedFilter)} />
          {!appliedFilter ? (
            <button className="primary" type="button" onClick={applyFilter} disabled={loading}>OK</button>
          ) : (
            <button className="secondary" type="button" onClick={clearFilter}>Editar filtro</button>
          )}
        </div>
        {appliedFilter && (
          <p className="note">
            Filtro travado para {activeBenefit?.name ?? "-"} em {demoCompetencies.find(item => item.id === appliedFilter.competency)?.label ?? appliedFilter.competency}.
            Agora você pode marcar e desmarcar colaboradores antes de confirmar.
          </p>
        )}
      </div>

      {!appliedFilter ? (
        <div className="panel"><p>Escolha os filtros acima e clique em <strong>OK</strong> para listar os colaboradores.</p></div>
      ) : (
        <>
          <div className="panel benefits-workbench">
            <div className="benefit-review">
              <div>
                <h2>Lançamento do benefício</h2>
                <p>Adicione ou remova colaboradores na lista abaixo. O mesmo benefício pode ser lançado mais de uma vez no mês com descrições diferentes.</p>
              </div>
              <div className="actions">
                <button className="secondary" type="button" onClick={selectAll}>Selecionar todos</button>
                <button className="secondary" type="button" onClick={clearSelection}>Limpar seleção</button>
                <button className="primary" type="button" onClick={() => setConfirmOpen(true)} disabled={!selectedEmployeeRows.length || !activeBenefit}>Confirmar distribuição</button>
              </div>
            </div>

            <div className="summary-grid benefits-summary">
              <Summary label="Valor estimado" value={money.format(previewTotal)} strong />
              <Summary label="Modo" value={activeBenefit?.mode === "DAILY" ? `${daysWorked} dias x ${money.format(valuePerDay)}` : money.format(monthlyValue)} />
              <Summary label="Descrição" value={description || "Obrigatória na confirmação"} />
            </div>

            {activeBenefit?.mode === "DAILY" ? (
              <div className="benefits-amounts">
                <label>Dias trabalhados<input type="number" min="0" step="1" value={daysWorked} onChange={event => setDaysWorked(Number(event.target.value))} /></label>
                <label>Valor por dia<input type="number" min="0" step="0.01" value={valuePerDay} onChange={event => setValuePerDay(Number(event.target.value))} /></label>
              </div>
            ) : (
              <div className="benefits-amounts">
                <label>Valor mensal<input type="number" min="0" step="0.01" value={monthlyValue} onChange={event => setMonthlyValue(Number(event.target.value))} /></label>
              </div>
            )}
          </div>

          <div className="panel selected-panel">
            <div className="selected-panel-head">
              <h2>Selecionados</h2>
              <div className="selected-panel-actions">
                <button className="secondary" type="button" onClick={() => setAddPanelOpen(current => !current)}>Adicionar colaborador</button>
                <span>Use o X para remover da relação</span>
              </div>
            </div>
            {addPanelOpen && (
              <div className="selected-addbar">
                <input
                  value={employeeQuery}
                  onChange={event => setEmployeeQuery(event.target.value)}
                  placeholder="Pesquisar por nome"
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addEmployeeByQuery();
                    }
                  }}
                />
                <button className="primary" type="button" onClick={addEmployeeByQuery}>Adicionar</button>
              </div>
            )}
            {addPanelOpen && employeeQuery.trim() && (
              <div className="add-suggestions">
                {employees
                  .filter(employee => matchesEmployee(employee, employeeQuery))
                  .slice(0, 6)
                  .map(employee => (
                    <button
                      key={employee.id}
                      type="button"
                      className="add-suggestion"
                      onClick={() => {
                        if (!eligibleEmployees.some(item => item.id === employee.id)) {
                          setOverrideCandidate(employee);
                          return;
                        }
                        addEmployee(employee, false);
                      }}
                    >
                      <strong>{employee.employee.full_name}</strong>
                      <span>{employee.employee_code} • {employee.result_center.code}</span>
                    </button>
                  ))}
              </div>
            )}
            <div className="selected-grid-head">
              <span></span>
              <span>Colaborador</span>
              <span>CR</span>
              <span>Dias</span>
              <span>{activeBenefit?.mode === "DAILY" ? "Valor/dia" : "Valor mensal"}</span>
              <span>Total</span>
            </div>
            <div className="selected-list">
              {selectedEmployeeRows.length ? selectedEmployeeRows.map(({ employee, override }) => (
                <div key={employee.id} className="selected-row">
                  <button type="button" className="remove-chip" onClick={() => removeSelected(employee.id)}>X</button>
                  <div className="selected-identity">
                    <strong>{employee.employee.full_name}</strong>
                    <span>{employee.result_center.code} • {override.manual ? "Adicionado manualmente" : "Vindo do filtro"}</span>
                  </div>
                  <span>{employee.result_center.code}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={override.daysWorked}
                    onChange={event => updateOverride(employee.id, { daysWorked: Number(event.target.value) })}
                    aria-label={`Dias trabalhados de ${employee.employee.full_name}`}
                  />
                  {activeBenefit?.mode === "DAILY" ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={override.valuePerDay}
                      onChange={event => updateOverride(employee.id, { valuePerDay: Number(event.target.value) })}
                      aria-label={`Valor por dia de ${employee.employee.full_name}`}
                    />
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={override.monthlyValue}
                      onChange={event => updateOverride(employee.id, { monthlyValue: Number(event.target.value) })}
                      aria-label={`Valor mensal de ${employee.employee.full_name}`}
                    />
                  )}
                  <strong>{money.format(activeBenefit?.mode === "DAILY" ? override.daysWorked * override.valuePerDay : override.monthlyValue)}</strong>
                </div>
              )) : <Empty>Nenhum colaborador selecionado.</Empty>}
            </div>
          </div>
        </>
      )}

      {confirmOpen && activeBenefit && appliedFilter && (
        <div className="panel benefit-confirm">
          <h2>Confirmar distribuição</h2>
          <p>{selectedEmployeeRows.length} colaborador(es) serão lançados para {activeBenefit.name}. Use uma descrição curta para diferenciar lançamentos repetidos no mesmo mês.</p>
          <label>Descrição da distribuição<textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: vale transporte adicional para turno noturno" /></label>
          <div className="actions">
            <button className="secondary" type="button" onClick={() => setConfirmOpen(false)}>Cancelar</button>
            <button className="primary" type="button" onClick={() => void confirmDistribution()} disabled={saving}>Confirmar agora</button>
          </div>
        </div>
      )}

      {appliedFilter && !eligibleEmployees.length && !loading && (
        <div className="panel">
          <h2>Nenhum colaborador encontrado</h2>
          <p>Essa combinação de benefício, competência e filtros não trouxe resultados. Tente abrir a modalidade, a UF ou o supervisor para ampliar a busca.</p>
        </div>
      )}

      {overrideCandidate && (
        <div className="panel benefit-confirm">
          <h2>Adicionar fora do filtro?</h2>
          <p>{overrideCandidate.employee.full_name} não entra nos filtros atuais. Deseja adicioná-lo mesmo assim?</p>
          <div className="actions">
            <button className="secondary" type="button" onClick={cancelOverrideCandidate}>Cancelar</button>
            <button className="primary" type="button" onClick={confirmOverrideCandidate}>Sim, adicionar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function benefitMatches(rawBenefit: string, benefit: DemoBenefitDefinition) {
  const label = normalizeText(rawBenefit);
  const aliases = [
    benefit.code,
    benefit.name,
    benefit.code === "VT" ? "vale transporte" : "",
    benefit.code === "VT" ? "transporte" : "",
    benefit.code === "AL" ? "alimentacao" : "",
    benefit.code === "PS" ? "plano de saude" : "",
    benefit.code === "SV" ? "seguro de vida" : ""
  ].map(normalizeText).filter(Boolean);

  return aliases.some(alias => label === alias || label.includes(alias) || alias.includes(label));
}

function eligibleEmployeeIds(employees: DemoEmployee[], filter: BenefitFilter, benefit: DemoBenefitDefinition) {
  const benefitOnly = employees
    .filter(employee => employee.status === "ACTIVE")
    .filter(employee => employee.benefits.some(raw => benefitMatches(raw, benefit)))
    .map(employee => employee.id);

  const refined = employees
    .filter(employee => employee.status === "ACTIVE")
    .filter(employee => employee.benefits.some(raw => benefitMatches(raw, benefit)))
    .filter(employee => !filter.center || employee.result_center.code === filter.center)
    .filter(employee => !filter.state || employee.state === filter.state)
    .filter(employee => !filter.supervisor || normalizeText(employee.supervisor_name).includes(normalizeText(filter.supervisor)))
    .filter(employee => !filter.type || employee.employment_type.name === filter.type)
    .filter(employee => {
      if (!filter.query) return true;
      const text = `${employee.employee.full_name} ${employee.employee_code} ${employee.supervisor_name} ${employee.state} ${employee.result_center.code}`.toLowerCase();
      return text.includes(filter.query.toLowerCase());
    })
    .map(employee => employee.id);

  return refined.length ? refined : benefitOnly;
}

function matchesEmployee(employee: DemoEmployee, query: string) {
  const search = normalizeText(query);
  if (!search) return false;
  return normalizeText(employee.employee.full_name).includes(search)
    || normalizeText(employee.employee_code).includes(search);
}

function buildDefaultOverride(
  employee: DemoEmployee,
  benefit: DemoBenefitDefinition | undefined,
  defaultDays: number,
  defaultValuePerDay: number,
  defaultMonthlyValue: number,
  manual: boolean
): SelectedOverride {
  const daily = benefit?.mode === "DAILY";
  return {
    daysWorked: daily ? defaultDays : 0,
    valuePerDay: daily ? defaultValuePerDay : 0,
    monthlyValue: daily ? 0 : defaultMonthlyValue,
    manual
  };
}

function buildOverridesForSelection(
  employees: DemoEmployee[],
  ids: number[],
  benefit: DemoBenefitDefinition | undefined,
  defaultDays: number,
  defaultValuePerDay: number,
  defaultMonthlyValue: number,
  manual: boolean
) {
  return ids.reduce<Record<number, SelectedOverride>>((acc, id) => {
    const employee = employees.find(item => item.id === id);
    if (!employee) return acc;
    acc[id] = buildDefaultOverride(employee, benefit, defaultDays, defaultValuePerDay, defaultMonthlyValue, manual);
    return acc;
  }, {});
}

function exportBenefitExcel(batch: ExportBatch) {
  const workbook = XLSX.utils.book_new();
  const rows = batch.rows.map(row => ({
    Beneficio: batch.benefitName,
    Competencia: batch.competency,
    Colaborador: row.employeeName,
    Codigo: row.employeeCode,
    Centro: row.centerCode,
    Fonte: row.source,
    Dias: row.daysWorked,
    "Valor por dia": row.valuePerDay,
    "Valor mensal": row.monthlyValue,
    Total: row.amount
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Beneficios");
  XLSX.writeFile(workbook, `beneficios-${batch.competency}-${batch.benefitName.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
}

function exportBenefitPdf(batch: ExportBatch) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const marginX = 36;
  let y = 42;
  doc.setFontSize(16);
  doc.text(`Benefícios - ${batch.benefitName}`, marginX, y);
  y += 18;
  doc.setFontSize(10);
  doc.text(`Competência: ${batch.competency} | Fonte: ${batch.source}`, marginX, y);
  y += 18;
  doc.text(`Total de colaboradores: ${batch.rows.length}`, marginX, y);
  y += 18;

  batch.rows.forEach((row, index) => {
    if (y > 540) {
      doc.addPage();
      y = 42;
    }
    doc.setFontSize(11);
    doc.text(`${index + 1}. ${row.employeeName} - ${row.employeeCode} - ${row.centerCode}`, marginX, y);
    y += 14;
    doc.setFontSize(9);
    const amount = row.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const detail = row.daysWorked > 0
      ? `Dias: ${row.daysWorked} | Valor/dia: ${row.valuePerDay.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} | Total: ${amount}`
      : `Valor mensal: ${row.monthlyValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} | Total: ${amount}`;
    doc.text(detail, marginX + 12, y);
    y += 16;
  });

  doc.save(`beneficios-${batch.competency}-${batch.benefitName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

function DemoOnly() {
  return <div className="panel"><span className="eyebrow">Módulo demo</span><h2>Disponível na versão de apresentação</h2><p>Este módulo usa dados fictícios locais quando `VITE_DEMO_MODE=true`.</p></div>;
}

function Summary({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return <div className={`summary-card ${strong ? "strong" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
