import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { IS_DEMO_MODE, api } from "../api";
import { useDemoScope } from "../context/DemoScope";
import { Empty, ErrorMessage, SuccessMessage } from "../components/Feedback";
import { demoBenefitDefinitions, demoCompetencies, demoResultCenters, demoSettings } from "../mocks/demoData";
import { DemoAlert, DemoAuditEntry, DemoBackup, DemoBenefitDistribution, DemoClosing, DemoCostAllocation, DemoEmployee, DemoMovement, DemoSettings, IndicatorSummary, PayrollRow } from "../mocks/demoTypes";
import { recalculatePayrollRow } from "../mocks/demoCalculations";
import { CentersPage, TypesPage } from "./CatalogPages";
import { User } from "../types";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const plainNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function DemoOnly() {
  return <div className="panel"><span className="eyebrow">Módulo demo</span><h2>Disponível na versão de apresentação</h2><p>Este módulo usa dados fictícios locais quando `VITE_DEMO_MODE=true`.</p></div>;
}

function useFeedback() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const notify = (message: string) => { setError(""); setSuccess(message); };
  const fail = (message: string) => { setSuccess(""); setError(message); };
  return { error, success, notify, fail, setError, setSuccess };
}

function restricted(user: User, fail: (message: string) => void) {
  if (user.role !== "ADMIN") {
    fail("Seu perfil possui acesso somente para consulta.");
    return true;
  }
  return false;
}

export function MovementsPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState("2026-06");
  const [type, setType] = useState("");
  const [center, setCenter] = useState("");
  const [items, setItems] = useState<DemoMovement[]>([]);
  const [selected, setSelected] = useState<DemoMovement | null>(null);
  const [loading, setLoading] = useState(false);
  const fb = useFeedback();

  async function load() {
    setLoading(true);
    try { setItems(await api<DemoMovement[]>(`/demo/movements?competency=${competency}`, {}, token)); }
    catch (err) { fb.fail(err instanceof Error ? err.message : "Erro ao carregar movimentações"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [competency, token, selectedCompany.id]);

  const filtered = items.filter(item => (!type || item.type === type) && (!center || item.result_center.code === center));
  const absences = filtered.filter(item => ["falta", "atestado", "afastamento"].includes(item.type)).reduce((acc, item) => acc + item.days, 0);

  async function createMovement() {
    if (selectedCompany.id === 0) return fb.fail("Selecione uma empresa específica para lançar movimentações.");
    if (restricted(user, fb.fail)) return;
    try {
      await api("/demo/movements", { method: "POST", body: JSON.stringify({ competency, type: "falta", days: 1, observation: "Movimentação criada pela apresentação." }) }, token);
      fb.notify("Movimentação criada em modo demonstração.");
      void load();
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao criar movimentação");
    }
  }

  return <PageShell title="Movimentações" subtitle="Eventos mensais que impactam pessoas, custos e histórico." error={fb.error} success={fb.success}
    actions={user.role === "ADMIN" && <button className="primary" onClick={createMovement} disabled={selectedCompany.id === 0}>Nova movimentação</button>}>
    <div className="summary-grid">
      <Summary label="Movimentações" value={String(filtered.length)} />
      <Summary label="Dias de ausência" value={String(absences)} />
      <Summary label="Horas impactadas" value={String(filtered.reduce((acc, item) => acc + item.hour_impact, 0).toFixed(1))} />
      <Summary label="Pendentes" value={String(filtered.filter(item => item.status === "Pendente").length)} strong />
    </div>
    <div className="panel filters-panel">
      <select value={competency} onChange={e => setCompetency(e.target.value)}>{demoCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select value={type} onChange={e => setType(e.target.value)}><option value="">Todos os tipos</option>{movementTypes.map(item => <option key={item}>{item}</option>)}</select>
      <select value={center} onChange={e => setCenter(e.target.value)}><option value="">Todos os CRs</option>{demoResultCenters.map(item => <option key={item.id}>{item.code}</option>)}</select>
    </div>
    <p className="note">Empresa selecionada: <strong>{selectedCompany.name}</strong>. Aqui o usuário consegue revisar e editar lançamentos com confirmação por senha.</p>
    <DataTable loading={loading} empty="Nenhuma movimentação encontrada.">
      <table><thead><tr><th>Colaborador</th><th>Tipo</th><th>Início</th><th>Fim</th><th>Dias</th><th>Horas</th><th>CR</th><th>Status</th><th>Observação</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.id} className="clickable" onClick={() => setSelected(item)}><td>{item.employee_name}</td><td>{item.type}</td><td>{date(item.start_date)}</td><td>{item.end_date ? date(item.end_date) : "-"}</td><td>{item.days}</td><td>{item.hour_impact}</td><td><span className="color-dot" style={{ background: item.result_center.color }} />{item.result_center.code}</td><td><span className="status">{item.status}</span></td><td>{item.observation}</td></tr>)}</tbody></table>
      {!filtered.length && !loading && <Empty>Nenhuma movimentação encontrada.</Empty>}
    </DataTable>
    {selected && <MovementDrawer item={selected} token={token} user={user} onClose={() => setSelected(null)} onSaved={updated => {
      setSelected(updated);
      void load();
    }} />}
  </PageShell>;
}

export function CostDistributionPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState("2026-06");
  const [center, setCenter] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const fb = useFeedback();
  const payrollRates = selectedCompany.settings?.payroll_rates ?? demoSettings.payroll_rates;

  async function load() {
    setLoading(true);
    fb.setError("");
    try {
      const response = await api<PayrollRow[]>(`/demo/payroll?competency=${competency}`, {}, token);
      setRows(response.map(row => recalculatePayrollRow(row, payrollRates)));
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao carregar custo/folha");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [competency, token, selectedCompany.id]);

  const filtered = rows.filter(item => (!center || item.result_center.code === center) && (!query || `${item.employee_name} ${item.result_center.code} ${item.employment_type.name}`.toLowerCase().includes(query.toLowerCase())));
  const totals = filtered.reduce((acc, item) => ({
    salary: acc.salary + item.salary,
    proLabore: acc.proLabore + item.pro_labore,
    profit: acc.profit + item.profit_distribution,
    costAid: acc.costAid + item.cost_aid,
    transport: acc.transport + item.transport,
    meal: acc.meal + item.meal,
    lodging: acc.lodging + item.lodging,
    insurance: acc.insurance + item.insurance,
    healthPlan: acc.healthPlan + item.health_plan,
    subtotal: acc.subtotal + item.subtotal_earnings,
    inss: acc.inss + item.inss,
    rat: acc.rat + item.rat,
    terceiros: acc.terceiros + item.terceiros,
    fgts: acc.fgts + item.fgts,
    charges: acc.charges + item.charges,
    vacation: acc.vacation + item.vacation,
    vacationThird: acc.vacationThird + item.vacation_third,
    fgtsVacation: acc.fgtsVacation + item.fgts_vacation,
    thirteenth: acc.thirteenth + item.thirteenth_salary,
    fgtsThirteenth: acc.fgtsThirteenth + item.fgts_thirteenth_salary,
    notice: acc.notice + item.notice_indemnity,
    fgtsNotice: acc.fgtsNotice + item.fgts_notice,
    fgtsFine: acc.fgtsFine + item.fgts_fine,
    employerContribution: acc.employerContribution + item.employer_contribution,
    totalProvisions: acc.totalProvisions + item.total_provisions,
    grandTotal: acc.grandTotal + item.grand_total
  }), {
    salary: 0, proLabore: 0, profit: 0, costAid: 0, transport: 0, meal: 0, lodging: 0, insurance: 0, healthPlan: 0,
    subtotal: 0, inss: 0, rat: 0, terceiros: 0, fgts: 0, charges: 0, vacation: 0, vacationThird: 0,
    fgtsVacation: 0, thirteenth: 0, fgtsThirteenth: 0, notice: 0, fgtsNotice: 0, fgtsFine: 0,
    employerContribution: 0, totalProvisions: 0, grandTotal: 0
  });
  const centerTotals = filtered.reduce<Record<string, number>>((acc, item) => {
    acc[item.result_center.code] = (acc[item.result_center.code] ?? 0) + item.grand_total;
    return acc;
  }, {});
  function updateRowField(rowId: number, field: keyof Pick<PayrollRow, "salary" | "pro_labore" | "profit_distribution" | "cost_aid" | "transport" | "meal" | "lodging" | "insurance" | "health_plan">, value: number) {
    setRows(current => current.map(row => {
      if (row.employee_id !== rowId) return row;
      return recalculatePayrollRow({ ...row, [field]: value } as PayrollRow, payrollRates);
    }));
  }

  return <PageShell
    title="Custo / Folha"
    subtitle="Leitura mensal por colaborador e Centro de Resultado, espelhando a estrutura da planilha ADM_Fopag."
    error={fb.error}
    success={fb.success}
    actions={
      <>
        <button className="secondary" onClick={() => downloadPayrollCsv(filtered, selectedCompany, competency)}>Baixar Excel</button>
        <button
          className={editMode ? "primary" : "secondary"}
          onClick={() => {
            if (user.role !== "ADMIN") {
              fb.fail("Seu perfil possui acesso somente para consulta.");
              return;
            }
            setEditMode(value => !value);
          }}
        >
          {editMode ? "Sair do modo edição" : "Entrar em modo edição"}
        </button>
        <button className="secondary" onClick={() => void load()}>Atualizar visão</button>
      </>
    }
  >
    <div className="summary-grid payroll-summary">
      <Summary label="Colaboradores" value={String(filtered.length)} />
      <Summary label="Subtotal" value={money.format(totals.subtotal)} />
      <Summary label="Encargos" value={money.format(totals.charges)} />
      <Summary label="Provisões" value={money.format(totals.totalProvisions)} />
      <Summary label="Total geral" value={money.format(totals.grandTotal)} strong />
    </div>
    <div className="panel filters-panel payroll-filters">
      <select value={competency} onChange={e => setCompetency(e.target.value)}>{demoCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select value={center} onChange={e => setCenter(e.target.value)}><option value="">Todos os CRs</option>{demoResultCenters.map(item => <option key={item.id} value={item.code}>{item.code}</option>)}</select>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar colaborador ou modalidade" />
    </div>
    <p className="note">Empresa selecionada: <strong>{selectedCompany.id === 0 ? "Todas as empresas" : selectedCompany.name}</strong>. Na visão consolidada, os percentuais podem variar por empresa.</p>
    <div className="panel list payroll-centers">
      {Object.entries(centerTotals).map(([code, amount]) => (
        <div className="list-row payroll-center" key={code}>
          <span className="color-dot" style={{ background: demoResultCenters.find(item => item.code === code)?.color ?? "#999" }} />
          <strong>{code}</strong>
          <span>Total da competência</span>
          <span>{money.format(amount)}</span>
        </div>
      ))}
    </div>
    <DataTable loading={loading} empty="Nenhum registro encontrado." className="payroll-table-shell">
      <table className="payroll-table">
        <thead>
          <tr>
            <th rowSpan={2}>Colaborador</th>
            <th rowSpan={2}>Centro de resultado</th>
            <th colSpan={10} className="group-head group-earnings">Composições</th>
            <th colSpan={5} className="group-head group-charges">Encargos</th>
            <th colSpan={10} className="group-head group-provisions">Provisões</th>
            <th rowSpan={2} className="group-head group-total">Total Geral</th>
          </tr>
          <tr>
            <th className="group-earnings">Salário</th>
            <th className="group-earnings">Prolabore</th>
            <th className="group-earnings">Distribuição de Lucro</th>
            <th className="group-earnings">Ajuda de Custo</th>
            <th className="group-earnings">Vale transporte</th>
            <th className="group-earnings">Alimentação</th>
            <th className="group-earnings">Hospedagem</th>
            <th className="group-earnings">Seguro</th>
            <th className="group-earnings">Plano de Saúde</th>
            <th className="group-earnings">Subtotal</th>
            <th className="group-charges">INSS</th>
            <th className="group-charges">RAT</th>
            <th className="group-charges">Terceiros</th>
            <th className="group-charges">FGTS</th>
            <th className="group-charges">Total Encargos</th>
            <th className="group-provisions">Férias</th>
            <th className="group-provisions">1/3 Férias</th>
            <th className="group-provisions">FGTS Férias</th>
            <th className="group-provisions">13° Salário</th>
            <th className="group-provisions">FGTS 13° Salário</th>
            <th className="group-provisions">Aviso Prévio</th>
            <th className="group-provisions">FGTS Aviso</th>
            <th className="group-provisions">Multa FGTS</th>
            <th className="group-provisions">Patronal</th>
            <th className="group-provisions">Total Provisões</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(item => (
            <tr key={item.employee_id}>
              <td>{item.employee_name}<small>{item.employment_type.name}</small></td>
              <td><span className="color-dot" style={{ background: item.result_center.color }} />{item.result_center.code}</td>
              <EditablePayrollCell
                value={item.salary}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "salary", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.pro_labore}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "pro_labore", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.profit_distribution}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "profit_distribution", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.cost_aid}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "cost_aid", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.transport}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "transport", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.meal}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "meal", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.lodging}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "lodging", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.insurance}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "insurance", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.health_plan}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "health_plan", value)}
                className="group-earnings"
              />
              <td className="group-earnings strong subtotal-cell">{money.format(item.subtotal_earnings)}</td>
              <td className="group-charges">{money.format(item.inss)}</td>
              <td className="group-charges">{money.format(item.rat)}</td>
              <td className="group-charges">{money.format(item.terceiros)}</td>
              <td className="group-charges">{money.format(item.fgts)}</td>
              <td className="group-charges">{money.format(item.charges)}</td>
              <td className="group-provisions">{money.format(item.vacation)}</td>
              <td className="group-provisions">{money.format(item.vacation_third)}</td>
              <td className="group-provisions">{money.format(item.fgts_vacation)}</td>
              <td className="group-provisions">{money.format(item.thirteenth_salary)}</td>
              <td className="group-provisions">{money.format(item.fgts_thirteenth_salary)}</td>
              <td className="group-provisions">{money.format(item.notice_indemnity)}</td>
              <td className="group-provisions">{money.format(item.fgts_notice)}</td>
              <td className="group-provisions">{money.format(item.fgts_fine)}</td>
              <td className="group-provisions">{money.format(item.employer_contribution)}</td>
              <td className="group-provisions">{money.format(item.total_provisions)}</td>
              <td className="group-total strong">{money.format(item.grand_total)}</td>
            </tr>
          ))}
          {filtered.length > 0 && (
            <tr className="totals-row">
              <td colSpan={2}><strong>Total da competência</strong></td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.salary)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.proLabore)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.profit)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.costAid)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.transport)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.meal)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.lodging)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.insurance)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.healthPlan)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.subtotal)}</td>
              <td className="group-charges strong">{money.format(totals.inss)}</td>
              <td className="group-charges strong">{money.format(totals.rat)}</td>
              <td className="group-charges strong">{money.format(totals.terceiros)}</td>
              <td className="group-charges strong">{money.format(totals.fgts)}</td>
              <td className="group-charges strong">{money.format(totals.charges)}</td>
              <td className="group-provisions strong">{money.format(totals.vacation)}</td>
              <td className="group-provisions strong">{money.format(totals.vacationThird)}</td>
              <td className="group-provisions strong">{money.format(totals.fgtsVacation)}</td>
              <td className="group-provisions strong">{money.format(totals.thirteenth)}</td>
              <td className="group-provisions strong">{money.format(totals.fgtsThirteenth)}</td>
              <td className="group-provisions strong">{money.format(totals.notice)}</td>
              <td className="group-provisions strong">{money.format(totals.fgtsNotice)}</td>
              <td className="group-provisions strong">{money.format(totals.fgtsFine)}</td>
              <td className="group-provisions strong">{money.format(totals.employerContribution)}</td>
              <td className="group-provisions strong">{money.format(totals.totalProvisions)}</td>
              <td className="group-total strong">{money.format(totals.grandTotal)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {!filtered.length && !loading && <Empty>Nenhum registro de custo/folha encontrado.</Empty>}
    </DataTable>
  </PageShell>;
}

export function AlertsPage({ token }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [items, setItems] = useState<DemoAlert[]>([]);
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const fb = useFeedback();

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      fb.setError("");
      try {
        const response = await api<DemoAlert[]>("/demo/alerts", {}, token);
        if (active) setItems(response);
      } catch (err) {
        if (active) fb.fail(err instanceof Error ? err.message : "Erro ao carregar alertas");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [token, selectedCompany.id]);

  const filtered = items.filter(item => (!type || item.type === type) && (!severity || item.severity === severity) && (!query || `${item.employee_name} ${item.message} ${item.result_center.code}`.toLowerCase().includes(query.toLowerCase())));
  const counts = filtered.reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {});

  return <PageShell title="Alertas" subtitle="Lembretes práticos para férias, retornos e revisões pendentes." error={fb.error}>
    <div className="summary-grid">
      <Summary label="Alertas" value={String(filtered.length)} />
      <Summary label="Tipos" value={String(Object.keys(counts).length)} />
      <Summary label="Alta prioridade" value={String(filtered.filter(item => item.severity === "Alta").length)} strong />
    </div>
    <div className="panel filters-panel">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por colaborador ou mensagem" />
      <select value={type} onChange={event => setType(event.target.value)}><option value="">Todos os tipos</option>{["Férias vencendo", "Retorno de afastamento", "Contrato próximo do vencimento", "Ajuste pendente"].map(item => <option key={item}>{item}</option>)}</select>
      <select value={severity} onChange={event => setSeverity(event.target.value)}><option value="">Todas as prioridades</option><option>Baixa</option><option>Média</option><option>Alta</option></select>
    </div>
    <p className="note">Empresa selecionada: <strong>{selectedCompany.name}</strong>. Os alertas servem para lembrar o usuário do que precisa de atenção.</p>
    <DataTable loading={loading} empty="Nenhum alerta encontrado.">
      <table><thead><tr><th>Empresa</th><th>CR</th><th>Colaborador</th><th>Tipo</th><th>Vencimento</th><th>Prioridade</th><th>Mensagem</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.id}><td>{item.company_name}</td><td>{item.result_center.code}</td><td>{item.employee_name}</td><td>{item.type}</td><td>{item.due_date}</td><td><span className={severityClass(item.severity)}>{item.severity}</span></td><td>{item.message}</td></tr>)}</tbody></table>
    </DataTable>
  </PageShell>;
}

export function AuditPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [items, setItems] = useState<DemoAuditEntry[]>([]);
  const [module, setModule] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const fb = useFeedback();

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      fb.setError("");
      try {
        const response = await api<DemoAuditEntry[]>("/demo/audit-logs", {}, token);
        if (active) setItems(response);
      } catch (err) {
        if (active) fb.fail(err instanceof Error ? err.message : "Erro ao carregar auditoria");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [token, selectedCompany.id]);

  const filtered = items.filter(item => (!module || item.module === module) && (!query || `${item.action} ${item.details} ${item.employee_name ?? ""} ${item.performed_by}`.toLowerCase().includes(query.toLowerCase())));

  return <PageShell title="Auditoria" subtitle="Registro do que foi alterado e por quem, para rastrear histórico e decisões." error={fb.error}>
    <div className="summary-grid">
      <Summary label="Registros" value={String(filtered.length)} />
      <Summary label="Módulos" value={String(new Set(filtered.map(item => item.module)).size)} />
      <Summary label="Usuários" value={String(new Set(filtered.map(item => item.performed_by)).size)} strong />
    </div>
    <div className="panel filters-panel">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por ação, detalhe ou usuário" />
      <select value={module} onChange={event => setModule(event.target.value)}><option value="">Todos os módulos</option>{["Colaboradores", "Movimentações", "Custos", "Configurações", "Backup", "Fechamento"].map(item => <option key={item}>{item}</option>)}</select>
    </div>
    <p className="note">Empresa selecionada: <strong>{selectedCompany.name}</strong>. Usuário logado: <strong>{user.full_name}</strong>.</p>
    <DataTable loading={loading} empty="Nenhum registro de auditoria encontrado.">
      <table><thead><tr><th>Data</th><th>Módulo</th><th>Ação</th><th>Empresa</th><th>Colaborador</th><th>Usuário</th><th>Detalhes</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.id}><td>{item.created_at}</td><td>{item.module}</td><td>{item.action}</td><td>{item.company_name}</td><td>{item.employee_name ?? "-"}</td><td>{item.performed_by}</td><td>{item.details}</td></tr>)}</tbody></table>
    </DataTable>
  </PageShell>;
}

function MovementDrawer({ item, token, user, onClose, onSaved }: { item: DemoMovement; token: string; user: User; onClose: () => void; onSaved: (movement: DemoMovement) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user.role !== "ADMIN") {
      setError("Seu perfil possui acesso somente para consulta.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api<DemoMovement>(`/demo/movements/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          competency: form.get("competency"),
          type: form.get("type"),
          start_date: form.get("start_date"),
          end_date: form.get("end_date") || null,
          days: Number(form.get("days")),
          hour_impact: Number(form.get("hour_impact")),
          observation: form.get("observation"),
          status: form.get("status"),
          password: form.get("password")
        })
      }, token);
      onSaved(updated);
      setSuccess("Movimentação atualizada com sucesso.");
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar movimentação");
    } finally {
      setSaving(false);
    }
  }

  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer wide" onClick={event => event.stopPropagation()}>
    <button className="ghost right" onClick={onClose}>Fechar</button>
    <span className="eyebrow">{item.competency}</span>
    <h2>{item.employee_name}</h2>
    <div className="detail-grid">
      <Summary label="Tipo" value={item.type} />
      <Summary label="Dias" value={String(item.days)} />
      <Summary label="Horas" value={String(item.hour_impact)} />
      <Summary label="CR" value={item.result_center.code} />
      <Summary label="Status" value={item.status} />
      <Summary label="Observação" value={item.observation} />
    </div>
    {user.role === "ADMIN" ? <form className="panel form-grid compact" onSubmit={submit}>
      <label>Competência<input name="competency" defaultValue={item.competency} required /></label>
      <label>Tipo<select name="type" defaultValue={item.type} required>{movementTypes.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
      <label>Início<input name="start_date" type="date" defaultValue={item.start_date} required /></label>
      <label>Fim<input name="end_date" type="date" defaultValue={item.end_date ?? ""} /></label>
      <label>Dias<input name="days" type="number" step="1" min="1" defaultValue={item.days} required /></label>
      <label>Horas<input name="hour_impact" type="number" step="0.1" min="0" defaultValue={item.hour_impact} required /></label>
      <label>Status<select name="status" defaultValue={item.status} required><option value="Pendente">Pendente</option><option value="Conferida">Conferida</option><option value="Aplicada">Aplicada</option></select></label>
      <label className="span-2">Observação<input name="observation" defaultValue={item.observation} required /></label>
      <label className="span-2">Senha de confirmação<input name="password" type="password" required /></label>
      <button className="primary" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
      {error && <p className="error-line span-2">{error}</p>}
      {success && <p className="success-line span-2">{success}</p>}
    </form> : <p className="note">Seu perfil possui acesso somente para consulta.</p>}
  </aside></div>;
}

export function IndicatorsPage({ token }: { token: string }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState("2026-06");
  const [summary, setSummary] = useState<IndicatorSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await api<IndicatorSummary>(`/demo/indicators?competency=${competency}`, {}, token);
        if (active) setSummary(response);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar indicadores");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [competency, token, selectedCompany.id]);
  const cards = summary ? [
    ["Efetivo inicial", summary.initial_headcount], ["Admissões", summary.admissions], ["Desligamentos", summary.terminations], ["Efetivo final", summary.final_headcount],
    ["Efetivo médio", summary.average_headcount.toFixed(1)], ["Absenteísmo", percent.format(summary.absenteeism)], ["Turnover", percent.format(summary.turnover)], ["Custo bruto", money.format(summary.gross_payroll)],
    ["Custo líquido", money.format(summary.net_payroll)], ["Salário per capita", money.format(summary.salary_per_capita)], ["Custo total", money.format(summary.total_cost)], ["Dias produtivos", summary.productive_days],
    ["Horas não produtivas", summary.non_productive_hours.toFixed(1)]
  ] : [];
  return <PageShell title="Indicadores" subtitle={`Leitura consolidada da competência na empresa ${selectedCompany.name}.`} error={error}>
    <div className="panel filters-panel"><select value={competency} onChange={e => setCompetency(e.target.value)}>{demoCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select><option>Todos os CRs</option></select><select><option>Todas modalidades</option></select></div>
    {loading && <div className="inline-loading">Carregando indicadores...</div>}
    <div className="summary-grid indicators">{cards.map(([label, value]) => <Summary key={label} label={String(label)} value={String(value)} />)}</div>
    <div className="panel formula-panel"><strong>Fórmulas</strong><p>Absenteísmo = horas não produtivas / horas programadas.</p><p>Turnover = ((admissões + desligamentos) / 2) / colaboradores do mês. Quando houver divisão por zero, o sistema exibe 0.</p></div>
  </PageShell>;
}

type ReportKey =
  | "consolidated"
  | "center"
  | "employees"
  | "movements"
  | "absenteeism"
  | "turnover"
  | "costs"
  | "salary"
  | "leaves"
  | "benefit-vt"
  | "benefit-al"
  | "benefit-ps"
  | "benefit-sv";

interface ReportColumn {
  key: string;
  label: string;
  display?: "currency" | "number" | "text" | "percent";
}

interface ReportPreview {
  title: string;
  description: string;
  kpis: { label: string; value: string }[];
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  footer?: string;
  exportLabel: string;
}

interface ReportCatalogItem {
  key: ReportKey;
  title: string;
  description: string;
  hint: string;
}

interface ReportFilters {
  center: string;
  state: string;
  employmentType: string;
  supervisor: string;
  query: string;
}

const reportCatalog: ReportCatalogItem[] = [
  { key: "consolidated", title: "Consolidado mensal", description: "Visão geral por Centro de Resultado com efetivo, custos e indicadores.", hint: "Resumo executivo" },
  { key: "center", title: "Por Centro de Resultado", description: "Detalha os quatro blocos ADM, IND, COM e DIR com comparação de custo.", hint: "Comparativo" },
  { key: "employees", title: "Colaboradores ativos", description: "Lista de colaboradores com cargo, modalidade, centro e benefícios.", hint: "Base cadastral" },
  { key: "movements", title: "Movimentações do mês", description: "Afastamentos, férias, faltas, desligamentos e impactos em dias.", hint: "Histórico mensal" },
  { key: "absenteeism", title: "Absenteísmo", description: "Horas não produtivas, jornada programada e percentual por centro.", hint: "Indicador" },
  { key: "turnover", title: "Turnover", description: "Admissões, desligamentos e taxa de rotatividade por centro.", hint: "Indicador" },
  { key: "costs", title: "Custos alocados", description: "Rateios lançados para cada Centro de Resultado com status.", hint: "Financeiro" },
  { key: "salary", title: "Histórico salarial", description: "Mudanças salariais e observações por colaborador.", hint: "Trajetória" },
  { key: "leaves", title: "Afastamentos financeiros", description: "Afastamentos, férias e atestados com dias e horas impactadas.", hint: "Operacional" },
  { key: "benefit-vt", title: "Benefício - Vale transporte", description: "Distribuições de vale transporte com dias, valor por dia e valor mensal.", hint: "Benefícios" },
  { key: "benefit-al", title: "Benefício - Alimentação", description: "Distribuições de alimentação em lote ou individual, por colaborador.", hint: "Benefícios" },
  { key: "benefit-ps", title: "Benefício - Plano de saúde", description: "Distribuições recorrentes com visão mensal por colaborador.", hint: "Benefícios" },
  { key: "benefit-sv", title: "Benefício - Seguro de vida", description: "Distribuições de seguro de vida com controle mensal e histórico.", hint: "Benefícios" }
];

export function ReportsPage({ token }: { token: string }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const fb = useFeedback();
  const [competency, setCompetency] = useState("2026-06");
  const [selectedKey, setSelectedKey] = useState<ReportKey>("consolidated");
  const [filters, setFilters] = useState<ReportFilters>({
    center: "",
    state: "",
    employmentType: "",
    supervisor: "",
    query: ""
  });
  const [companyPreview, setCompanyPreview] = useState<{ company: string; company_logo: string; cards: { code: string; name: string; color: string; active_employees: number; gross_payroll: number; total_cost: number; absenteeism?: number; turnover?: number }[] } | null>(null);
  const [employees, setEmployees] = useState<DemoEmployee[]>([]);
  const [movements, setMovements] = useState<DemoMovement[]>([]);
  const [benefits, setBenefits] = useState<DemoBenefitDistribution[]>([]);
  const [allocations, setAllocations] = useState<DemoCostAllocation[]>([]);
  const [indicators, setIndicators] = useState<IndicatorSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    fb.setError("");
    try {
      const [preview, employeeList, movementList, benefitList, allocationList, indicatorSummary] = await Promise.all([
        api<{ company: string; company_logo: string; cards: { code: string; name: string; color: string; active_employees: number; gross_payroll: number; total_cost: number; absenteeism?: number; turnover?: number }[] }>(`/demo/report-preview?competency=${competency}`, {}, token),
        api<DemoEmployee[]>("/employees", {}, token),
        api<DemoMovement[]>(`/demo/movements?competency=${competency}`, {}, token),
        api<DemoBenefitDistribution[]>(`/demo/benefit-distributions?competency=${competency}`, {}, token),
        api<DemoCostAllocation[]>(`/demo/cost-allocations?competency=${competency}`, {}, token),
        api<IndicatorSummary>(`/demo/indicators?competency=${competency}`, {}, token)
      ]);
      setCompanyPreview(preview);
      setEmployees(employeeList);
      setMovements(movementList);
      setBenefits(benefitList);
      setAllocations(allocationList);
      setIndicators(indicatorSummary);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao carregar relatórios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competency, token, selectedCompany.id]);

  const previews: Record<ReportKey, ReportPreview> = useMemo(() => buildReportPreviews({
    competency,
    companyPreview,
    employees,
    movements,
    benefits,
    allocations,
    indicators,
    companyName: selectedCompany.name,
    filters
  }), [allocations, benefits, companyPreview, competency, employees, filters, indicators, movements, selectedCompany.name]);

  const selectedReport = previews[selectedKey];
  const supervisorOptions = useMemo(() => Array.from(new Set(employees.map(item => item.supervisor_name))).sort((a, b) => a.localeCompare(b, "pt-BR")), [employees]);
  const stateOptions = useMemo(() => Array.from(new Set(employees.map(item => item.state))).sort(), [employees]);
  const employmentTypeOptions = useMemo(() => Array.from(new Set(employees.map(item => item.employment_type.name))).sort((a, b) => a.localeCompare(b, "pt-BR")), [employees]);

  return (
    <PageShell title="Relatórios" subtitle={`Pacote de saídas gerenciais para acompanhamento mensal da empresa ${selectedCompany.name}.`} error={fb.error} success={fb.success}>
      <div className="panel filters-panel report-maker-filters">
        <select value={competency} onChange={event => setCompetency(event.target.value)}>
          {demoCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select value={filters.center} onChange={event => setFilters(current => ({ ...current, center: event.target.value }))}>
          <option value="">Todos os CRs</option>
          {demoResultCenters.map(item => <option key={item.id} value={item.code}>{item.code}</option>)}
        </select>
        <select value={filters.state} onChange={event => setFilters(current => ({ ...current, state: event.target.value }))}>
          <option value="">Todos os UF</option>
          {stateOptions.map(state => <option key={state} value={state}>{state}</option>)}
        </select>
        <select value={filters.employmentType} onChange={event => setFilters(current => ({ ...current, employmentType: event.target.value }))}>
          <option value="">Todas modalidades</option>
          {employmentTypeOptions.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
        <select value={filters.supervisor} onChange={event => setFilters(current => ({ ...current, supervisor: event.target.value }))}>
          <option value="">Todos os supervisores</option>
          {supervisorOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <input value={filters.query} onChange={event => setFilters(current => ({ ...current, query: event.target.value }))} placeholder="Buscar colaborador ou benefício" />
        <button className="secondary" type="button" onClick={() => setFilters({ center: "", state: "", employmentType: "", supervisor: "", query: "" })}>Limpar filtros</button>
      </div>
      <p className="note">Filtros básicos aplicados em todos os relatórios: competência, Centro de Resultado, UF, modalidade, supervisor e busca.</p>

      <div className="report-grid">
        {reportCatalog.map(item => (
          <article className={`report-card ${selectedKey === item.key ? "active" : ""}`} key={item.key}>
            <div className="report-card-top">
              <div>
                <span className="eyebrow">{item.hint}</span>
                <h3>{item.title}</h3>
              </div>
              <button className="secondary" type="button" onClick={() => setSelectedKey(item.key)}>Ver prévia</button>
            </div>
            <p>{item.description}</p>
          </article>
        ))}
      </div>

      <div className="panel report-preview">
        <div className="report-header">
          {companyPreview?.company_logo ? <img className="report-logo" src={companyPreview.company_logo} alt={`Logo de ${companyPreview.company}`} /> : <div className="report-logo-placeholder">Logo</div>}
          <div>
            <h2>{selectedReport.title}</h2>
            <p>{selectedReport.description}</p>
          </div>
        </div>
        <div className="summary-grid report-summary">
          {selectedReport.kpis.map(kpi => <Summary key={kpi.label} label={kpi.label} value={kpi.value} strong />)}
        </div>
        <div className="actions report-actions">
          <button className="secondary" type="button" onClick={() => downloadReportExcel(selectedReport, selectedReport.exportLabel, companyPreview?.company ?? selectedCompany.name, competency)}>Baixar Excel</button>
          <button className="secondary" type="button" onClick={() => fb.notify("PDF de relatório gerado em modo demonstração.")}>Gerar PDF</button>
          <button className="secondary" type="button" onClick={() => fb.notify("Relatório preparado para impressão em modo demonstração.")}>Imprimir</button>
        </div>
        {loading && <div className="inline-loading">Carregando prévias...</div>}
        <div className="table-wrap report-preview-shell">
          <table>
            <thead>
              <tr>
                {selectedReport.columns.map(column => <th key={column.key}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {selectedReport.rows.map((row, index) => (
                <tr key={`${selectedKey}-${index}`}>
                  {selectedReport.columns.map(column => (
                    <td key={column.key}>{formatReportCell(row[column.key], column.display)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!selectedReport.rows.length && !loading && <Empty>Nenhum dado disponível para essa prévia.</Empty>}
        </div>
        {selectedReport.footer && <p className="note">{selectedReport.footer}</p>}
      </div>
    </PageShell>
  );
}

function normalizeReportText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchesReportQuery(parts: Array<string | number | undefined | null>, query: string) {
  if (!query) return true;
  const normalized = normalizeReportText(query);
  return parts.some(part => normalizeReportText(String(part ?? "")).includes(normalized));
}

function buildReportPreviews(input: {
  competency: string;
  companyPreview: { company: string; company_logo: string; cards: { code: string; name: string; color: string; active_employees: number; gross_payroll: number; total_cost: number; absenteeism?: number; turnover?: number }[] } | null;
  employees: DemoEmployee[];
  movements: DemoMovement[];
  benefits: DemoBenefitDistribution[];
  allocations: DemoCostAllocation[];
  indicators: IndicatorSummary | null;
  companyName: string;
  filters: ReportFilters;
}): Record<ReportKey, ReportPreview> {
  const cards = (input.companyPreview?.cards ?? demoResultCenters.map(center => ({
    code: center.code,
    name: center.name,
    color: center.color,
    active_employees: 0,
    gross_payroll: 0,
    total_cost: 0,
    absenteeism: 0,
    turnover: 0
  }))).filter(card => !input.filters.center || card.code === input.filters.center);
  const employeeLookup = new Map(input.employees.map(employee => [employee.id, employee]));
  const activeEmployees = input.employees.filter(item => item.status !== "INACTIVE" && (!input.filters.center || item.result_center.code === input.filters.center) && (!input.filters.state || item.state === input.filters.state) && (!input.filters.employmentType || item.employment_type.name === input.filters.employmentType) && (!input.filters.supervisor || item.supervisor_name === input.filters.supervisor) && matchesReportQuery([item.employee.full_name, item.employee.cpf, item.employee_code, item.job_title, item.department, item.notes, item.supervisor_name, item.state, item.result_center.code], input.filters.query));
  const employeeRows = activeEmployees.slice(0, 12).map(employee => ({
    employee: employee.employee.full_name,
    center: employee.result_center.code,
    type: employee.employment_type.name,
    salary: employee.salary_base,
    benefits: employee.benefits.join(", ") || "-"
  }));
  const movementRows = input.movements.filter(item => {
    const employee = employeeLookup.get(item.employee_id);
    return (!input.filters.center || item.result_center.code === input.filters.center)
      && (!input.filters.state || employee?.state === input.filters.state)
      && (!input.filters.employmentType || employee?.employment_type.name === input.filters.employmentType)
      && (!input.filters.supervisor || employee?.supervisor_name === input.filters.supervisor)
      && matchesReportQuery([item.employee_name, item.type, item.result_center.code, item.observation, employee?.employee.cpf, employee?.job_title], input.filters.query);
  }).slice(0, 12).map(movement => ({
    employee: movement.employee_name,
    type: movement.type,
    center: movement.result_center.code,
    days: movement.days,
    hours: movement.hour_impact,
    status: movement.status,
    observation: movement.observation
  }));
  const allocationRows = input.allocations.filter(item => (!input.filters.center || item.result_center.code === input.filters.center) && matchesReportQuery([item.result_center.code, item.category, item.description, item.status], input.filters.query)).slice(0, 12).map(item => ({
    center: item.result_center.code,
    category: item.category,
    description: item.description,
    amount: item.amount,
    status: item.status
  }));
  const salaryRows = input.employees
    .filter(employee => employee.status !== "INACTIVE" && (!input.filters.center || employee.result_center.code === input.filters.center) && (!input.filters.state || employee.state === input.filters.state) && (!input.filters.employmentType || employee.employment_type.name === input.filters.employmentType) && (!input.filters.supervisor || employee.supervisor_name === input.filters.supervisor) && matchesReportQuery([employee.employee.full_name, employee.employee.cpf, employee.job_title, employee.department], input.filters.query))
    .flatMap(employee => (employee.salary_history ?? []).slice(0, 3).map((item: { date: string; amount: number; family_allowance: number; reason: string }) => ({
      employee: employee.employee.full_name,
      date: item.date,
      amount: item.amount,
      family_allowance: item.family_allowance,
      reason: item.reason
    })))
    .slice(0, 15);
  const leaveRows = input.movements.filter(item => {
    const employee = employeeLookup.get(item.employee_id);
    return ["afastamento", "atestado", "férias"].includes(item.type)
      && (!input.filters.center || item.result_center.code === input.filters.center)
      && (!input.filters.state || employee?.state === input.filters.state)
      && (!input.filters.employmentType || employee?.employment_type.name === input.filters.employmentType)
      && (!input.filters.supervisor || employee?.supervisor_name === input.filters.supervisor)
      && matchesReportQuery([item.employee_name, item.type, item.observation, employee?.job_title], input.filters.query);
  }).slice(0, 15).map(item => ({
    employee: item.employee_name,
    type: item.type,
    center: item.result_center.code,
    days: item.days,
    hours: item.hour_impact,
    observation: item.observation
  }));
  const movementStatsByCenter = demoResultCenters.map(center => {
    const scoped = input.movements.filter(item => item.result_center.code === center.code);
    return {
      code: center.code,
      name: center.name,
      color: center.color,
      admissions: scoped.filter(item => item.type === "admissão").length,
      terminations: scoped.filter(item => item.type === "desligamento").length,
      turnover: input.indicators ? input.indicators.turnover : 0
    };
  });
  const turnoverRows = cards.map(card => {
    const stats = movementStatsByCenter.find(item => item.code === card.code);
    return {
      code: card.code,
      name: card.name,
      admissions: stats?.admissions ?? 0,
      terminations: stats?.terminations ?? 0,
      turnover: card.turnover ?? stats?.turnover ?? 0
    };
  });
  const benefitCards = demoBenefitDefinitions.filter(item => item.active).map(definition => {
    const scoped = input.benefits.filter(item => item.benefit_code === definition.code && (!input.filters.center || item.result_center.code === input.filters.center) && (!input.filters.state || item.state === input.filters.state) && (!input.filters.employmentType || item.employment_type === input.filters.employmentType) && (!input.filters.supervisor || item.supervisor_name === input.filters.supervisor) && matchesReportQuery([item.employee_name, item.description, item.source, item.result_center.code], input.filters.query));
    return {
      definition,
      rows: scoped.slice(0, 15).map(item => ({
        employee: item.employee_name,
        center: item.result_center.code,
        supervisor: item.supervisor_name,
        modality: item.employment_type,
        days: item.days_worked,
        value_per_day: item.value_per_day || item.monthly_value,
        amount: item.amount,
        source: item.source,
        description: item.description
      })),
      total: scoped.reduce((acc, item) => acc + item.amount, 0),
      count: scoped.length
    };
  });

  return {
    consolidated: {
      title: "Relatório mensal consolidado",
      description: "Visão geral por Centro de Resultado com efetivo, custos e indicadores.",
      exportLabel: "relatorio-mensal-consolidado",
      kpis: [
        { label: "Centros", value: String(cards.length) },
        { label: "Efetivo", value: String(cards.reduce((acc, card) => acc + Number(card.active_employees ?? 0), 0)) },
        { label: "Custo bruto", value: money.format(cards.reduce((acc, card) => acc + Number(card.gross_payroll ?? 0), 0)) },
        { label: "Custo total", value: money.format(cards.reduce((acc, card) => acc + Number(card.total_cost ?? 0), 0)) }
      ],
      columns: [
        { key: "code", label: "Centro" },
        { key: "name", label: "Nome" },
        { key: "active_employees", label: "Efetivo", display: "number" },
        { key: "gross_payroll", label: "Custo bruto", display: "currency" },
        { key: "total_cost", label: "Custo total", display: "currency" }
      ],
      rows: cards
    },
    center: {
      title: "Por Centro de Resultado",
      description: "Comparativo dos quatro blocos ADM, IND, COM e DIR com efetivo e custo.",
      exportLabel: "relatorio-por-centro",
      kpis: cards.map(card => ({ label: card.code, value: `${card.active_employees} pessoas` })).slice(0, 4),
      columns: [
        { key: "code", label: "Centro" },
        { key: "name", label: "Nome" },
        { key: "active_employees", label: "Efetivo", display: "number" },
        { key: "gross_payroll", label: "Custo bruto", display: "currency" },
        { key: "total_cost", label: "Custo total", display: "currency" }
      ],
      rows: cards,
      footer: "Os valores acima refletem a empresa selecionada na competência atual."
    },
    employees: {
      title: "Colaboradores ativos",
      description: "Base de colaboradores com modalidade, centro, salário e benefícios cadastrados.",
      exportLabel: "relatorio-colaboradores-ativos",
      kpis: [
        { label: "Ativos", value: String(activeEmployees.length) },
        { label: "Com benefícios", value: String(activeEmployees.filter(item => item.benefits.length).length) },
        { label: "CLT", value: String(activeEmployees.filter(item => item.employment_type.name === "CLT").length) },
        { label: "Outros", value: String(activeEmployees.filter(item => item.employment_type.name !== "CLT").length) }
      ],
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "center", label: "Centro" },
        { key: "type", label: "Modalidade" },
        { key: "salary", label: "Salário base", display: "currency" },
        { key: "benefits", label: "Benefícios" }
      ],
      rows: employeeRows
    },
    movements: {
      title: "Movimentações do mês",
      description: "Faltas, atestados, férias, admissões e desligamentos registrados na competência.",
      exportLabel: "relatorio-movimentacoes-mes",
      kpis: [
        { label: "Linhas", value: String(input.movements.length) },
        { label: "Afastamentos", value: String(input.movements.filter(item => ["afastamento", "atestado", "férias"].includes(item.type)).length) },
        { label: "Pendente", value: String(input.movements.filter(item => item.status === "Pendente").length) },
        { label: "Aplicada", value: String(input.movements.filter(item => item.status === "Aplicada").length) }
      ],
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "type", label: "Tipo" },
        { key: "center", label: "Centro" },
        { key: "days", label: "Dias", display: "number" },
        { key: "hours", label: "Horas", display: "number" },
        { key: "status", label: "Status" },
        { key: "observation", label: "Observação" }
      ],
      rows: movementRows
    },
    absenteeism: {
      title: "Absenteísmo",
      description: "Horas não produtivas e comparação por Centro de Resultado.",
      exportLabel: "relatorio-absenteismo",
      kpis: [
        { label: "Absenteísmo", value: percent.format(input.indicators?.absenteeism ?? 0) },
        { label: "Horas não produtivas", value: String((input.indicators?.non_productive_hours ?? 0).toFixed(1)) },
        { label: "Dias produtivos", value: String(input.indicators?.productive_days ?? 0) },
        { label: "Efetivo médio", value: String((input.indicators?.average_headcount ?? 0).toFixed(1)) }
      ],
      columns: [
        { key: "code", label: "Centro" },
        { key: "name", label: "Nome" },
        { key: "absenteeism", label: "Absenteísmo", display: "percent" },
        { key: "turnover", label: "Turnover", display: "percent" },
        { key: "active_employees", label: "Efetivo", display: "number" }
      ],
      rows: cards,
      footer: "O percentual é consolidado em modo demo com base em férias, afastamentos e atestados."
    },
    turnover: {
      title: "Turnover",
      description: "Admissões e desligamentos da competência com taxa de rotatividade por centro.",
      exportLabel: "relatorio-turnover",
      kpis: [
        { label: "Turnover", value: percent.format(input.indicators?.turnover ?? 0) },
        { label: "Admissões", value: String(input.indicators?.admissions ?? 0) },
        { label: "Desligamentos", value: String(input.indicators?.terminations ?? 0) },
        { label: "Efetivo final", value: String(input.indicators?.final_headcount ?? 0) }
      ],
      columns: [
        { key: "code", label: "Centro" },
        { key: "name", label: "Nome" },
        { key: "admissions", label: "Admissões", display: "number" },
        { key: "terminations", label: "Desligamentos", display: "number" },
        { key: "turnover", label: "Turnover", display: "percent" }
      ],
      rows: turnoverRows
    },
    costs: {
      title: "Custos alocados",
      description: "Rateios manuais lançados para os centros com status de conferência.",
      exportLabel: "relatorio-custos-alocados",
      kpis: [
        { label: "Rateios", value: String(allocationRows.length) },
        { label: "Lançado", value: String(input.allocations.filter(item => item.status === "Lançado").length) },
        { label: "Revisado", value: String(input.allocations.filter(item => item.status === "Revisado").length) },
        { label: "Aprovado", value: String(input.allocations.filter(item => item.status === "Aprovado").length) }
      ],
      columns: [
        { key: "center", label: "Centro" },
        { key: "category", label: "Categoria" },
        { key: "description", label: "Descrição" },
        { key: "amount", label: "Valor", display: "currency" },
        { key: "status", label: "Status" }
      ],
      rows: allocationRows
    },
    salary: {
      title: "Histórico salarial",
      description: "Linha do tempo de salários com observações e salário-família quando houver.",
      exportLabel: "relatorio-historico-salarial",
      kpis: [
        { label: "Colaboradores", value: String(activeEmployees.length) },
        { label: "Registros", value: String(salaryRows.length) },
        { label: "Com salário-família", value: String(salaryRows.filter(item => Number(item.family_allowance) > 0).length) },
        { label: "Última revisão", value: "2026-01" }
      ],
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "date", label: "Data" },
        { key: "amount", label: "Salário", display: "currency" },
        { key: "family_allowance", label: "Salário-família", display: "currency" },
        { key: "reason", label: "Motivo" }
      ],
      rows: salaryRows
    },
    leaves: {
      title: "Afastamentos financeiros",
      description: "Afastamentos, férias e atestados que impactam dias e horas da competência.",
      exportLabel: "relatorio-afastamentos-financeiros",
      kpis: [
        { label: "Eventos", value: String(leaveRows.length) },
        { label: "Férias", value: String(leaveRows.filter(item => item.type === "férias").length) },
        { label: "Atestados", value: String(leaveRows.filter(item => item.type === "atestado").length) },
        { label: "Afastamentos", value: String(leaveRows.filter(item => item.type === "afastamento").length) }
      ],
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "type", label: "Tipo" },
        { key: "center", label: "Centro" },
        { key: "days", label: "Dias", display: "number" },
        { key: "hours", label: "Horas", display: "number" },
        { key: "observation", label: "Observação" }
      ],
      rows: leaveRows
    },
    "benefit-vt": {
      title: "Benefício - Vale transporte",
      description: "Lançamentos de vale transporte com base nos colaboradores que recebem esse benefício.",
      exportLabel: "relatorio-beneficio-vale-transporte",
      kpis: (() => {
        const benefit = benefitCards.find(item => item.definition.code === "VT");
        return [
          { label: "Lançamentos", value: String(benefit?.count ?? 0) },
          { label: "Valor total", value: money.format(benefit?.total ?? 0) },
          { label: "Dias", value: String(benefit?.rows.reduce((acc, item) => acc + Number(item.days ?? 0), 0) ?? 0) },
          { label: "Colaboradores", value: String(new Set(benefit?.rows.map(item => item.employee)).size ?? 0) }
        ];
      })(),
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "center", label: "Centro" },
        { key: "supervisor", label: "Supervisor" },
        { key: "modality", label: "Modalidade" },
        { key: "days", label: "Dias", display: "number" },
        { key: "value_per_day", label: "Valor por dia", display: "currency" },
        { key: "amount", label: "Valor", display: "currency" },
        { key: "source", label: "Origem" },
        { key: "description", label: "Descrição" }
      ],
      rows: benefitCards.find(item => item.definition.code === "VT")?.rows ?? []
    },
    "benefit-al": {
      title: "Benefício - Alimentação",
      description: "Lançamentos de alimentação com distribuição em lote ou individual.",
      exportLabel: "relatorio-beneficio-alimentacao",
      kpis: (() => {
        const benefit = benefitCards.find(item => item.definition.code === "AL");
        return [
          { label: "Lançamentos", value: String(benefit?.count ?? 0) },
          { label: "Valor total", value: money.format(benefit?.total ?? 0) },
          { label: "Dias", value: String(benefit?.rows.reduce((acc, item) => acc + Number(item.days ?? 0), 0) ?? 0) },
          { label: "Colaboradores", value: String(new Set(benefit?.rows.map(item => item.employee)).size ?? 0) }
        ];
      })(),
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "center", label: "Centro" },
        { key: "supervisor", label: "Supervisor" },
        { key: "modality", label: "Modalidade" },
        { key: "days", label: "Dias", display: "number" },
        { key: "value_per_day", label: "Valor por dia", display: "currency" },
        { key: "amount", label: "Valor", display: "currency" },
        { key: "source", label: "Origem" },
        { key: "description", label: "Descrição" }
      ],
      rows: benefitCards.find(item => item.definition.code === "AL")?.rows ?? []
    },
    "benefit-ps": {
      title: "Benefício - Plano de saúde",
      description: "Lançamentos recorrentes de plano de saúde por colaborador.",
      exportLabel: "relatorio-beneficio-plano-saude",
      kpis: (() => {
        const benefit = benefitCards.find(item => item.definition.code === "PS");
        return [
          { label: "Lançamentos", value: String(benefit?.count ?? 0) },
          { label: "Valor total", value: money.format(benefit?.total ?? 0) },
          { label: "Colaboradores", value: String(new Set(benefit?.rows.map(item => item.employee)).size ?? 0) },
          { label: "Competência", value: input.competency.replace("-", "/") }
        ];
      })(),
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "center", label: "Centro" },
        { key: "supervisor", label: "Supervisor" },
        { key: "modality", label: "Modalidade" },
        { key: "amount", label: "Valor", display: "currency" },
        { key: "source", label: "Origem" },
        { key: "description", label: "Descrição" }
      ],
      rows: benefitCards.find(item => item.definition.code === "PS")?.rows ?? []
    },
    "benefit-sv": {
      title: "Benefício - Seguro de vida",
      description: "Lançamentos recorrentes de seguro de vida por colaborador.",
      exportLabel: "relatorio-beneficio-seguro-vida",
      kpis: (() => {
        const benefit = benefitCards.find(item => item.definition.code === "SV");
        return [
          { label: "Lançamentos", value: String(benefit?.count ?? 0) },
          { label: "Valor total", value: money.format(benefit?.total ?? 0) },
          { label: "Colaboradores", value: String(new Set(benefit?.rows.map(item => item.employee)).size ?? 0) },
          { label: "Competência", value: input.competency.replace("-", "/") }
        ];
      })(),
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "center", label: "Centro" },
        { key: "supervisor", label: "Supervisor" },
        { key: "modality", label: "Modalidade" },
        { key: "amount", label: "Valor", display: "currency" },
        { key: "source", label: "Origem" },
        { key: "description", label: "Descrição" }
      ],
      rows: benefitCards.find(item => item.definition.code === "SV")?.rows ?? []
    }
  } satisfies Record<ReportKey, ReportPreview>;
}

function downloadReportExcel(preview: ReportPreview, fileName: string, company: string, competency: string) {
  const workbook = XLSX.utils.book_new();
  const rows = preview.rows.map(row => Object.fromEntries(
    preview.columns.map(column => [column.label, row[column.key] ?? ""])
  ));
  const sheet = XLSX.utils.json_to_sheet([
    { Relatorio: preview.title, Empresa: company, Competencia: competency },
    {},
    ...rows
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Relatorio");
  XLSX.writeFile(workbook, `${fileName}-${slugify(competency)}.xlsx`, { compression: true });
}

function formatReportCell(value: unknown, display?: ReportColumn["display"]) {
  if (display === "currency") return money.format(Number(value ?? 0));
  if (display === "number") return plainNumber.format(Number(value ?? 0));
  if (display === "percent") return percent.format(Number(value ?? 0));
  return String(value ?? "-");
}

type SystemSection = "general" | "centers" | "types" | "backup" | "import";

export function SettingsPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  const [companyLogo, setCompanyLogo] = useState("");
  const fb = useFeedback();
  const [loading, setLoading] = useState(false);
  const lockedCompany = selectedCompany.id === 0;
  const [section, setSection] = useState<SystemSection>("general");
  useEffect(() => {
    if (lockedCompany) return;
    let active = true;
    async function load() {
      setLoading(true);
      fb.setError("");
      try {
        const response = await api<DemoSettings>("/demo/settings", {}, token);
        if (active) {
          setSettings(response);
          setCompanyLogo(response.company_logo ?? "");
        }
      } catch (err) {
        if (active) fb.fail(err instanceof Error ? err.message : "Erro ao carregar configurações");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [token, selectedCompany.id]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (restricted(user, fb.fail)) return;
    const form = new FormData(event.currentTarget);
    try {
      const updated = await api<DemoSettings>("/demo/settings", { method: "POST", body: JSON.stringify({ company_name: form.get("company_name"), default_daily_hours: Number(form.get("default_daily_hours")), company_logo: companyLogo }) }, token);
      setSettings(updated);
      setCompanyLogo(updated.company_logo ?? companyLogo);
      fb.notify("Configurações salvas em modo demonstração.");
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao salvar configurações");
    }
  }
  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCompanyLogo(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }
  if (lockedCompany) {
    return <PageShell title="Ajustes do sistema" subtitle="As configurações são feitas por empresa. Selecione uma empresa específica para editar jornada, backup e encargos." error={fb.error} success={fb.success}>
      <div className="panel"><p>Escolha uma empresa no seletor do topo para continuar.</p></div>
    </PageShell>;
  }
  if (loading && !settings) return <div className="inline-loading">Carregando configurações...</div>;
  return <PageShell title="Ajustes do sistema" subtitle={`Área administrativa da empresa ${selectedCompany.name}. Cadastros, backup e importação ficam reunidos aqui.`} error={fb.error} success={fb.success}>
    <div className="segment-tabs">
      <button className={section === "general" ? "active" : ""} onClick={() => setSection("general")}>Geral</button>
      <button className={section === "centers" ? "active" : ""} onClick={() => setSection("centers")}>Centros de Resultado</button>
      <button className={section === "types" ? "active" : ""} onClick={() => setSection("types")}>Modalidades</button>
      <button className={section === "backup" ? "active" : ""} onClick={() => setSection("backup")}>Backup</button>
      <button className={section === "import" ? "active" : ""} onClick={() => setSection("import")}>Importação</button>
    </div>
    {section === "general" && <form onSubmit={save} className="settings-grid">
      <SectionCard title="Empresa"><label>Nome<input name="company_name" defaultValue={settings?.company_name ?? selectedCompany.name} disabled={user.role !== "ADMIN"} /></label><InfoLine label="CNPJ" value={settings?.cnpj ?? "-"} /><InfoLine label="Mês inicial" value={settings?.initial_month ?? "-"} /><div className="logo-upload"><label>Logo da empresa<input type="file" accept="image/*" onChange={handleLogoUpload} disabled={user.role !== "ADMIN"} /></label>{companyLogo ? <img className="company-logo-preview" src={companyLogo} alt={`Logo de ${settings?.company_name ?? selectedCompany.name}`} /> : <div className="company-logo-placeholder">Nenhum logo enviado</div>}</div></SectionCard>
      <SectionCard title="Jornada"><label>Jornada padrão<input name="default_daily_hours" type="number" step="0.1" defaultValue={settings?.default_daily_hours ?? 8.8} disabled={user.role !== "ADMIN"} /></label><InfoLine label="Considerar sábado" value={settings?.include_saturdays ? "Sim" : "Não"} /><InfoLine label="Feriados" value={settings?.holidays.join(", ") ?? ""} /></SectionCard>
      <SectionCard title="Encargos">{settings?.charges.map(item => <InfoLine key={item.name} label={item.name} value={`${item.rate}%`} />)}</SectionCard>
      <SectionCard title="Usuários e permissões"><InfoLine label="Administrador" value="Controle total" /><InfoLine label="Consultor" value="Consulta e exportação" /></SectionCard>
      {user.role === "ADMIN" && <button className="primary">Salvar configurações</button>}
    </form>}
    {section === "centers" && <CentersPage token={token} user={user} embedded />}
    {section === "types" && <TypesPage token={token} user={user} embedded />}
    {section === "backup" && <BackupPage token={token} user={user} embedded />}
    {section === "import" && <ImportPage token={token} user={user} embedded />}
  </PageShell>;
}

export function BackupPage({ token, user, embedded = false }: { token: string; user: User; embedded?: boolean }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [items, setItems] = useState<DemoBackup[]>([]);
  const fb = useFeedback();
  const companySettings = selectedCompany.settings ?? demoSettings;
  const [loading, setLoading] = useState(false);
  const lockedCompany = selectedCompany.id === 0;
  const load = async () => {
    setLoading(true);
    try {
      setItems(await api<DemoBackup[]>("/demo/backups", {}, token));
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao carregar backups");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (!lockedCompany) void load(); }, [token, selectedCompany.id]);
  async function backup() {
    if (restricted(user, fb.fail)) return;
    try {
      const result = await api<{ message: string }>("/demo/backups", { method: "POST" }, token);
      fb.notify(result.message);
      void load();
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao gerar backup");
    }
  }
  if (lockedCompany) {
    return <PageShell title="Backup" subtitle="Os backups são administrados por empresa. Selecione uma empresa específica para continuar." error={fb.error} success={fb.success}>
      <div className="panel"><p>Escolha uma empresa no seletor do topo para ver cópias, retenção e restauração.</p></div>
    </PageShell>;
  }
  if (loading && !items.length) return <div className="inline-loading">Carregando backups...</div>;
  const content = <>
    <ErrorMessage message={fb.error} />
    <SuccessMessage message={fb.success} />
    <div className="summary-grid"><Summary label="Último backup" value={items[0]?.date ?? "-"} /><Summary label="Pasta" value={companySettings.backup_directory} /><Summary label="Retenção" value={`${companySettings.backup_retention} backups`} strong /></div>
    <div className="panel list">{items.map(item => <div className="list-row backup-row" key={item.id}><strong>{item.file}</strong><span>{item.date}</span><span>{item.size}</span><span className="status-pill status-active">{item.status}</span></div>)}</div>
  </>;
  if (embedded) return content;
  return <PageShell title="Backup" subtitle={`Rotina demonstrativa de cópia e restauração da empresa ${selectedCompany.name}.`} error={fb.error} success={fb.success}
    actions={<><button className="primary" onClick={backup}>Gerar backup agora</button><button className="secondary" onClick={() => user.role === "ADMIN" ? fb.notify("Pasta alterada em modo demonstração.") : fb.fail("Seu perfil possui acesso somente para consulta.")}>Alterar pasta</button><button className="secondary" onClick={() => user.role === "ADMIN" ? fb.notify("Restauração simulada. Nenhum dado real foi alterado.") : fb.fail("Seu perfil possui acesso somente para consulta.")}>Restaurar backup</button></>}>
    <div className="summary-grid"><Summary label="Último backup" value={items[0]?.date ?? "-"} /><Summary label="Pasta" value={companySettings.backup_directory} /><Summary label="Retenção" value={`${companySettings.backup_retention} backups`} strong /></div>
    {loading && <div className="inline-loading">Carregando backups...</div>}
    <div className="panel list">{items.map(item => <div className="list-row backup-row" key={item.id}><strong>{item.file}</strong><span>{item.date}</span><span>{item.size}</span><span className="status-pill status-active">{item.status}</span></div>)}</div>
  </PageShell>;
}

export function ClosingPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [closing, setClosing] = useState<DemoClosing | null>(null);
  const [justification, setJustification] = useState("");
  const fb = useFeedback();
  const [loading, setLoading] = useState(false);
  const lockedCompany = selectedCompany.id === 0;
  const load = async () => {
    setLoading(true);
    try {
      setClosing(await api<DemoClosing>("/demo/closing", {}, token));
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao carregar fechamento");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (!lockedCompany) void load(); }, [token, selectedCompany.id]);
  async function change(status: "OPEN" | "CLOSED", includeJustification = false) {
    if (restricted(user, fb.fail)) return;
    try {
      setClosing(await api<DemoClosing>("/demo/closing", { method: "POST", body: JSON.stringify({ status, justification: includeJustification ? justification : "" }) }, token));
      fb.notify(status === "CLOSED" ? "Competência fechada em modo demonstração." : "Competência reaberta em modo demonstração.");
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao atualizar fechamento");
    }
  }
  if (lockedCompany) {
    return <PageShell title="Fechamento mensal" subtitle="O fechamento é por empresa. Selecione uma empresa específica para conferir o checklist." error={fb.error} success={fb.success}>
      <div className="panel"><p>Escolha uma empresa no seletor do topo para abrir o fechamento mensal.</p></div>
    </PageShell>;
  }
  if (loading && !closing) return <div className="inline-loading">Carregando fechamento...</div>;
  return <PageShell title="Fechamento mensal" subtitle={`Checklist de conferência antes do encerramento da competência na empresa ${selectedCompany.name}.`} error={fb.error} success={fb.success}
    actions={<><button className="primary" onClick={() => change("CLOSED")}>Fechar competência</button><button className="secondary" onClick={() => change("CLOSED", true)}>Fechar com justificativa</button><button className="secondary" onClick={() => change("OPEN")}>Reabrir competência</button><button className="secondary" onClick={() => fb.notify("Relatório de fechamento gerado em modo demonstração.")}>Gerar relatório</button></>}>
    <div className="summary-grid"><Summary label="Competência" value={closing?.competency ?? "-"} /><Summary label="Status" value={closing?.status === "OPEN" ? "Aberta" : "Fechada"} strong /></div>
    {closing?.warnings?.length ? <div className="panel"><strong>Benefícios pendentes</strong><ul className="validation-list">{closing.warnings.map(item => <li key={item}>{item}</li>)}</ul><label>Justificativa para liberar o fechamento<textarea rows={3} value={justification} onChange={event => setJustification(event.target.value)} placeholder="Explique por que o lançamento ficará pendente para registro na movimentação" /></label></div> : null}
    <div className="panel checklist">{Object.entries(closing?.checklist ?? {}).map(([label, done]) => <label key={label} className="check"><input type="checkbox" checked={done} readOnly /> {label}</label>)}</div>
  </PageShell>;
}

export function ImportPage({ token, user, embedded = false }: { token: string; user: User; embedded?: boolean }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const [preview, setPreview] = useState<any>(null);
  const fb = useFeedback();
  async function simulate() { if (restricted(user, fb.fail)) return; setPreview(await api("/demo/import-preview", { method: "POST" }, token)); fb.notify("Prévia de importação gerada em modo demonstração."); }
  const content = <>
    <ErrorMessage message={fb.error} />
    <SuccessMessage message={fb.success} />
    <div className="panel import-panel"><select><option>Colaboradores</option><option>Custos alocados</option><option>Movimentações</option><option>Planilha legado</option></select><button className="secondary" onClick={() => fb.notify("Template baixado em modo demonstração.")}>Baixar template</button><div className="upload-box">Arraste uma planilha aqui ou clique para selecionar</div><button className="primary" onClick={simulate}>Confirmar importação</button></div>
    {preview && <div className="panel"><h2>Prévia dos dados</h2><div className="summary-grid"><Summary label="Linhas" value={preview.rows} /><Summary label="Válidas" value={preview.valid} /><Summary label="Inconsistências" value={preview.errors.length} strong /></div><ul className="validation-list">{preview.errors.map((item: string) => <li key={item}>{item}</li>)}</ul></div>}
  </>;
  if (embedded) return content;
  return <PageShell title="Importação" subtitle="Fluxo visual para validar planilhas antes de confirmar dados." error={fb.error} success={fb.success}>{content}</PageShell>;
}

const movementTypes = ["admissão", "desligamento", "falta", "atestado", "afastamento", "férias", "transferência de Centro de Resultado", "alteração salarial"];

function PageShell({ title, subtitle, error = "", success = "", actions, children }: { title: string; subtitle: string; error?: string; success?: string; actions?: ReactNode; children: ReactNode }) {
  return <><div className="page-title"><div><span className="eyebrow">Demo</span><h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className="actions">{actions}</div>}</div><ErrorMessage message={error} /><SuccessMessage message={success} />{children}</>;
}

function DataTable({ loading, empty, children, className = "" }: { loading: boolean; empty: string; children: ReactNode; className?: string }) {
  return <div className={`panel table-wrap ${className}`.trim()}>{loading && <div className="inline-loading">Carregando...</div>}{children}{!loading && !children && <Empty>{empty}</Empty>}</div>;
}

function Summary({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return <div className={`summary-card ${strong ? "strong" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function EditablePayrollCell({ value, editing, onChange, className }: { value: number; editing: boolean; onChange: (value: number) => void; className: string }) {
  return (
    <td className={className}>
      {editing ? (
        <input
          className="payroll-inline-input"
          type="number"
          step="0.01"
          min="0"
          value={Number.isFinite(value) ? value : 0}
          onChange={event => onChange(Number(event.target.value))}
        />
      ) : (
        money.format(value)
      )}
    </td>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel settings-section"><h2>{title}</h2>{children}</section>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="info-line"><span>{label}</span><strong>{value}</strong></div>;
}

function downloadPayrollCsv(rows: PayrollRow[], company: { id: number; name: string }, competency: string) {
  const headers = [
    "Colaborador", "Centro", "Salario", "Prolabore", "DistribuicaoLucro", "AjudaCusto", "ValeTransporte", "Alimentacao", "Hospedagem", "Seguro", "PlanoSaude",
    "Subtotal", "INSS", "RAT", "Terceiros", "FGTS", "TotalEncargos", "Ferias", "1_3Ferias", "FGTSFerias", "13Salario", "FGTS13",
    "AvisoPrevio", "FGTSAviso", "MultaFGTS", "Patronal", "TotalProvisoes", "TotalGeral"
  ];
  const totals = rows.reduce((acc, row) => ({
    salary: acc.salary + row.salary,
    pro_labore: acc.pro_labore + row.pro_labore,
    profit_distribution: acc.profit_distribution + row.profit_distribution,
    cost_aid: acc.cost_aid + row.cost_aid,
    transport: acc.transport + row.transport,
    meal: acc.meal + row.meal,
    lodging: acc.lodging + row.lodging,
    insurance: acc.insurance + row.insurance,
    health_plan: acc.health_plan + row.health_plan,
    subtotal_earnings: acc.subtotal_earnings + row.subtotal_earnings,
    inss: acc.inss + row.inss,
    rat: acc.rat + row.rat,
    terceiros: acc.terceiros + row.terceiros,
    fgts: acc.fgts + row.fgts,
    charges: acc.charges + row.charges,
    vacation: acc.vacation + row.vacation,
    vacation_third: acc.vacation_third + row.vacation_third,
    fgts_vacation: acc.fgts_vacation + row.fgts_vacation,
    thirteenth_salary: acc.thirteenth_salary + row.thirteenth_salary,
    fgts_thirteenth_salary: acc.fgts_thirteenth_salary + row.fgts_thirteenth_salary,
    notice_indemnity: acc.notice_indemnity + row.notice_indemnity,
    fgts_notice: acc.fgts_notice + row.fgts_notice,
    fgts_fine: acc.fgts_fine + row.fgts_fine,
    employer_contribution: acc.employer_contribution + row.employer_contribution,
    total_provisions: acc.total_provisions + row.total_provisions,
    grand_total: acc.grand_total + row.grand_total
  }), {
    salary: 0, pro_labore: 0, profit_distribution: 0, cost_aid: 0, transport: 0, meal: 0, lodging: 0, insurance: 0, health_plan: 0,
    subtotal_earnings: 0, inss: 0, rat: 0, terceiros: 0, fgts: 0, charges: 0, vacation: 0, vacation_third: 0,
    fgts_vacation: 0, thirteenth_salary: 0, fgts_thirteenth_salary: 0, notice_indemnity: 0, fgts_notice: 0, fgts_fine: 0,
    employer_contribution: 0, total_provisions: 0, grand_total: 0
  });
  const lines = [
    ["Empresa", company.id === 0 ? "Todas as empresas" : company.name],
    ["Competencia", competency],
    [],
    headers,
    ...rows.map(row => [
      row.employee_name,
      row.result_center.code,
      row.salary, row.pro_labore, row.profit_distribution, row.cost_aid, row.transport, row.meal, row.lodging, row.insurance, row.health_plan,
      row.subtotal_earnings, row.inss, row.rat, row.terceiros, row.fgts, row.charges, row.vacation, row.vacation_third, row.fgts_vacation,
      row.thirteenth_salary, row.fgts_thirteenth_salary, row.notice_indemnity, row.fgts_notice, row.fgts_fine, row.employer_contribution,
      row.total_provisions, row.grand_total
    ]),
    [],
    ["Totais", "", totals.salary, totals.pro_labore, totals.profit_distribution, totals.cost_aid, totals.transport, totals.meal, totals.lodging, totals.insurance, totals.health_plan, totals.subtotal_earnings, totals.inss, totals.rat, totals.terceiros, totals.fgts, totals.charges, totals.vacation, totals.vacation_third, totals.fgts_vacation, totals.thirteenth_salary, totals.fgts_thirteenth_salary, totals.notice_indemnity, totals.fgts_notice, totals.fgts_fine, totals.employer_contribution, totals.total_provisions, totals.grand_total]
  ];
  downloadCsv(`custo-folha-${slugify(competency)}.csv`, lines);
}

function downloadCsv(fileName: string, rows: any[][]) {
  const csv = rows.map(row => row.map(cell => {
    const value = cell === null || cell === undefined ? "" : String(cell);
    return `"${value.replace(/"/g, '""')}"`;
  }).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function AllocationDrawer({ item, onClose }: { item: DemoCostAllocation; onClose: () => void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={e => e.stopPropagation()}><button className="ghost right" onClick={onClose}>Fechar</button><span className="eyebrow">Rateio detalhado</span><h2>{item.result_center.code}</h2><div className="detail-grid"><Summary label="Competência" value={item.competency} /><Summary label="Valor" value={money.format(item.amount)} /><Summary label="Categoria" value={item.category} /><Summary label="Status" value={item.status} /><Summary label="Origem" value={item.source} /><Summary label="Descrição" value={item.description} strong /></div></aside></div>;
}

export const PayrollPage = CostDistributionPage;

function date(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function severityClass(severity: DemoAlert["severity"]) {
  return {
    Baixa: "severity-pill severity-low",
    Média: "severity-pill severity-medium",
    Alta: "severity-pill severity-high"
  }[severity];
}
