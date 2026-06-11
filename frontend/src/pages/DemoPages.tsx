import { FormEvent, ReactNode, useEffect, useState } from "react";
import { IS_DEMO_MODE, api } from "../api";
import { useDemoScope } from "../context/DemoScope";
import { Empty, ErrorMessage, SuccessMessage } from "../components/Feedback";
import { demoCompetencies, demoResultCenters, demoSettings } from "../mocks/demoData";
import { DemoAlert, DemoAuditEntry, DemoBackup, DemoClosing, DemoCostAllocation, DemoMovement, DemoSettings, IndicatorSummary, PayrollRow } from "../mocks/demoTypes";
import { CentersPage, TypesPage } from "./CatalogPages";
import { User } from "../types";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

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
  const fb = useFeedback();

  async function load() {
    setLoading(true);
    fb.setError("");
    try {
      const response = await api<PayrollRow[]>(`/demo/payroll?competency=${competency}`, {}, token);
      setRows(response);
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
    salary: 0, proLabore: 0, profit: 0, costAid: 0, meal: 0, lodging: 0, insurance: 0, healthPlan: 0,
    subtotal: 0, inss: 0, rat: 0, terceiros: 0, fgts: 0, charges: 0, vacation: 0, vacationThird: 0,
    fgtsVacation: 0, thirteenth: 0, fgtsThirteenth: 0, notice: 0, fgtsNotice: 0, fgtsFine: 0,
    employerContribution: 0, totalProvisions: 0, grandTotal: 0
  });
  const centerTotals = filtered.reduce<Record<string, number>>((acc, item) => {
    acc[item.result_center.code] = (acc[item.result_center.code] ?? 0) + item.grand_total;
    return acc;
  }, {});
  const payrollRates = selectedCompany.settings?.payroll_rates ?? demoSettings.payroll_rates;

  return <PageShell
    title="Custo / Folha"
    subtitle="Leitura mensal por colaborador e Centro de Resultado, espelhando a estrutura da planilha ADM_Fopag."
    error={fb.error}
    success={fb.success}
    actions={<button className="secondary" onClick={() => void load()}>Atualizar visão</button>}
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
    <DataTable loading={loading} empty="Nenhum registro encontrado.">
      <table className="payroll-table">
        <thead>
          <tr>
            <th rowSpan={2}>Colaborador</th>
            <th rowSpan={2}>Centro de resultado</th>
            <th colSpan={9} className="group-head group-earnings">Composições</th>
            <th colSpan={5} className="group-head group-charges">Encargos</th>
            <th colSpan={10} className="group-head group-provisions">Provisões</th>
            <th rowSpan={2} className="group-head group-total">Total Geral</th>
          </tr>
          <tr>
            <th className="group-earnings">Salário</th>
            <th className="group-earnings">Prolabore</th>
            <th className="group-earnings">Distribuição de Lucro</th>
            <th className="group-earnings">Ajuda de Custo</th>
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
              <td className="group-earnings">{money.format(item.salary)}</td>
              <td className="group-earnings">{money.format(item.pro_labore)}</td>
              <td className="group-earnings">{money.format(item.profit_distribution)}</td>
              <td className="group-earnings">{money.format(item.cost_aid)}</td>
              <td className="group-earnings">{money.format(item.meal)}</td>
              <td className="group-earnings">{money.format(item.lodging)}</td>
              <td className="group-earnings">{money.format(item.insurance)}</td>
              <td className="group-earnings">{money.format(item.health_plan)}</td>
              <td className="group-earnings">{money.format(item.subtotal_earnings)}</td>
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
              <td className="group-earnings strong">{money.format(totals.salary)}</td>
              <td className="group-earnings strong">{money.format(totals.proLabore)}</td>
              <td className="group-earnings strong">{money.format(totals.profit)}</td>
              <td className="group-earnings strong">{money.format(totals.costAid)}</td>
              <td className="group-earnings strong">{money.format(totals.meal)}</td>
              <td className="group-earnings strong">{money.format(totals.lodging)}</td>
              <td className="group-earnings strong">{money.format(totals.insurance)}</td>
              <td className="group-earnings strong">{money.format(totals.healthPlan)}</td>
              <td className="group-earnings strong">{money.format(totals.subtotal)}</td>
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
    {selectedCompany.id !== 0 ? (
      <div className="panel formula-panel">
        <strong>Percentuais configurados</strong>
        <p>INSS {percent.format(payrollRates.inss / 100)} | RAT {percent.format(payrollRates.rat / 100)} | Terceiros {percent.format(payrollRates.terceiros / 100)} | FGTS {percent.format(payrollRates.fgts / 100)}.</p>
        <p>Provisões: FGTS férias {percent.format(payrollRates.fgts_vacation / 100)}, FGTS 13° {percent.format(payrollRates.fgts_thirteenth / 100)}, FGTS aviso {percent.format(payrollRates.fgts_notice / 100)}, multa FGTS {percent.format(payrollRates.multa_fgts / 100)} e patronal {percent.format(payrollRates.patronal / 100)}.</p>
      </div>
    ) : (
      <div className="panel formula-panel">
        <strong>Percentuais configurados</strong>
        <p>Na visão consolidada, cada empresa usa seus próprios percentuais. Selecione uma empresa específica para conferir a configuração aplicada.</p>
      </div>
    )}
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

export function ReportsPage({ token }: { token: string }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const fb = useFeedback();
  const reports = ["Relatório mensal consolidado", "Relatório por Centro de Resultado", "Relatório de colaboradores", "Relatório de movimentações", "Relatório de absenteísmo", "Relatório de turnover", "Relatório de custos alocados", "Relatório de histórico salarial"];
  const [preview, setPreview] = useState<any>(null);
  async function action() {
    try {
      setPreview(await api(`/demo/report-preview?competency=2026-06`, {}, token));
      fb.notify("Relatório gerado em modo demonstração.");
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao gerar relatório");
    }
  }
  return <PageShell title="Relatórios" subtitle={`Pacote de saídas gerenciais para acompanhamento mensal da empresa ${selectedCompany.name}.`} error={fb.error} success={fb.success}>
    <div className="report-grid">{reports.map(report => <article className="report-card" key={report}><h3>{report}</h3><p>Filtros por competência, Centro de Resultado, modalidade e status.</p><div className="actions"><button className="secondary" onClick={action}>Visualizar</button><button className="secondary" onClick={action}>Exportar Excel</button><button className="secondary" onClick={action}>Gerar PDF</button><button className="secondary" onClick={action}>Imprimir</button></div></article>)}</div>
    {preview && <div className="panel report-preview"><span className="eyebrow">Prévia</span><h2>{preview.company}</h2><p>Competência {preview.competency}</p><div className="summary-grid"><Summary label="ADM" value="Resumo gerado" /><Summary label="IND" value="Resumo gerado" /><Summary label="COM" value="Resumo gerado" /><Summary label="DIR" value="Resumo gerado" /></div></div>}
  </PageShell>;
}

type SystemSection = "general" | "centers" | "types" | "backup" | "import";

export function SettingsPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const { selectedCompany } = useDemoScope();
  const [settings, setSettings] = useState<DemoSettings | null>(null);
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
        if (active) setSettings(response);
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
      const updated = await api<DemoSettings>("/demo/settings", { method: "POST", body: JSON.stringify({ company_name: form.get("company_name"), default_daily_hours: Number(form.get("default_daily_hours")) }) }, token);
      setSettings(updated);
      fb.notify("Configurações salvas em modo demonstração.");
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao salvar configurações");
    }
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
      <SectionCard title="Empresa"><label>Nome<input name="company_name" defaultValue={settings?.company_name ?? selectedCompany.name} disabled={user.role !== "ADMIN"} /></label><InfoLine label="CNPJ" value={settings?.cnpj ?? "-"} /><InfoLine label="Mês inicial" value={settings?.initial_month ?? "-"} /></SectionCard>
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
  async function change(status: "OPEN" | "CLOSED") {
    if (restricted(user, fb.fail)) return;
    try {
      setClosing(await api<DemoClosing>("/demo/closing", { method: "POST", body: JSON.stringify({ status }) }, token));
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
    actions={<><button className="primary" onClick={() => change("CLOSED")}>Fechar competência</button><button className="secondary" onClick={() => change("OPEN")}>Reabrir competência</button><button className="secondary" onClick={() => fb.notify("Relatório de fechamento gerado em modo demonstração.")}>Gerar relatório</button></>}>
    <div className="summary-grid"><Summary label="Competência" value={closing?.competency ?? "-"} /><Summary label="Status" value={closing?.status === "OPEN" ? "Aberta" : "Fechada"} strong /></div>
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

function DataTable({ loading, empty, children }: { loading: boolean; empty: string; children: ReactNode }) {
  return <div className="panel table-wrap">{loading && <div className="inline-loading">Carregando...</div>}{children}{!loading && !children && <Empty>{empty}</Empty>}</div>;
}

function Summary({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return <div className={`summary-card ${strong ? "strong" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel settings-section"><h2>{title}</h2>{children}</section>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="info-line"><span>{label}</span><strong>{value}</strong></div>;
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
