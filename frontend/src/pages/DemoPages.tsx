import { FormEvent, ReactNode, useEffect, useState } from "react";
import { IS_DEMO_MODE, api } from "../api";
import { Empty, ErrorMessage, SuccessMessage } from "../components/Feedback";
import { demoCompetencies, demoEmploymentTypes, demoResultCenters } from "../mocks/demoData";
import { centerSummary } from "../mocks/demoCalculations";
import { DemoBackup, DemoClosing, DemoMovement, DemoSettings, IndicatorSummary, PayrollRow } from "../mocks/demoTypes";
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
  const [competency, setCompetency] = useState("2026-06");
  const [type, setType] = useState("");
  const [center, setCenter] = useState("");
  const [items, setItems] = useState<DemoMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const fb = useFeedback();

  async function load() {
    setLoading(true);
    try { setItems(await api<DemoMovement[]>(`/demo/movements?competency=${competency}`, {}, token)); }
    catch (err) { fb.fail(err instanceof Error ? err.message : "Erro ao carregar movimentações"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [competency, token]);

  const filtered = items.filter(item => (!type || item.type === type) && (!center || item.result_center.code === center));
  const absences = filtered.filter(item => ["falta", "atestado", "afastamento"].includes(item.type)).reduce((acc, item) => acc + item.days, 0);

  async function createMovement() {
    if (restricted(user, fb.fail)) return;
    await api("/demo/movements", { method: "POST", body: JSON.stringify({ competency, type: "falta", days: 1, observation: "Movimentação criada pela apresentação." }) }, token);
    fb.notify("Movimentação criada em modo demonstração.");
    void load();
  }

  return <PageShell title="Movimentações" subtitle="Eventos mensais que impactam folha, indicadores e histórico." error={fb.error} success={fb.success}
    actions={user.role === "ADMIN" && <button className="primary" onClick={createMovement}>Nova movimentação</button>}>
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
    <DataTable loading={loading} empty="Nenhuma movimentação encontrada.">
      <table><thead><tr><th>Colaborador</th><th>Tipo</th><th>Início</th><th>Fim</th><th>Dias</th><th>Horas</th><th>CR</th><th>Status</th><th>Observação</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.id}><td>{item.employee_name}</td><td>{item.type}</td><td>{date(item.start_date)}</td><td>{item.end_date ? date(item.end_date) : "-"}</td><td>{item.days}</td><td>{item.hour_impact}</td><td><span className="color-dot" style={{ background: item.result_center.color }} />{item.result_center.code}</td><td><span className="status">{item.status}</span></td><td>{item.observation}</td></tr>)}</tbody></table>
      {!filtered.length && !loading && <Empty>Nenhuma movimentação encontrada.</Empty>}
    </DataTable>
  </PageShell>;
}

export function PayrollPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const [competency, setCompetency] = useState("2026-06");
  const [center, setCenter] = useState("");
  const [type, setType] = useState("");
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [detail, setDetail] = useState<PayrollRow | null>(null);
  const [loading, setLoading] = useState(false);
  const fb = useFeedback();
  useEffect(() => {
    setLoading(true);
    api<PayrollRow[]>(`/demo/payroll?competency=${competency}`, {}, token).then(setRows).catch(err => fb.fail(err.message)).finally(() => setLoading(false));
  }, [competency, token]);
  const filtered = rows.filter(row => (!center || row.result_center.code === center) && (!type || row.employment_type.name === type));
  const centers = centerSummary(rows);
  return <PageShell title="Folha de pagamento" subtitle="Resumo financeiro por colaborador, modalidade e Centro de Resultado." error={fb.error} success={fb.success}
    actions={<><button className="secondary" onClick={() => user.role === "ADMIN" ? fb.notify("Importação de folha simulada.") : fb.fail("Seu perfil possui acesso somente para consulta.")}>Importar folha</button><button className="secondary" onClick={() => fb.notify("Excel gerado em modo demonstração.")}>Exportar Excel</button><button className="secondary" onClick={() => fb.notify("PDF gerado em modo demonstração.")}>Gerar PDF</button></>}>
    <div className="summary-grid"><Summary label="Folha bruta" value={money.format(sum(filtered, "gross_payroll"))} /><Summary label="Folha líquida" value={money.format(sum(filtered, "net_payroll"))} /><Summary label="Encargos" value={money.format(sum(filtered, "charges"))} /><Summary label="Custo total" value={money.format(sum(filtered, "total_cost"))} strong /></div>
    <div className="panel list">{centers.map(item => <div className="list-row payroll-center" key={item.center.id}><span className="color-dot" style={{ background: item.center.color }} /><strong>{item.center.code}</strong><span>{item.employees} colaboradores</span><span>{money.format(item.total)}</span></div>)}</div>
    <div className="panel filters-panel"><select value={competency} onChange={e => setCompetency(e.target.value)}>{demoCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select value={center} onChange={e => setCenter(e.target.value)}><option value="">Todos os CRs</option>{demoResultCenters.map(item => <option key={item.id}>{item.code}</option>)}</select><select value={type} onChange={e => setType(e.target.value)}><option value="">Todas modalidades</option>{demoEmploymentTypes.map(item => <option key={item.id}>{item.name}</option>)}</select></div>
    <DataTable loading={loading} empty="Nenhum lançamento de folha.">
      <table><thead><tr><th>Colaborador</th><th>CR</th><th>Modalidade</th><th>Salário</th><th>Pró-labore</th><th>Lucro</th><th>Ajuda</th><th>Alimentação</th><th>Saúde</th><th>Seguro</th><th>Odonto</th><th>Encargos</th><th>Provisões</th><th>Bruta</th><th>Líquida</th><th>Total</th></tr></thead>
      <tbody>{filtered.map(row => <tr key={row.employee_id} onClick={() => setDetail(row)} className="clickable"><td>{row.employee_name}</td><td>{row.result_center.code}</td><td>{row.employment_type.name}</td><td>{money.format(row.salary)}</td><td>{money.format(row.pro_labore)}</td><td>{money.format(row.profit_distribution)}</td><td>{money.format(row.cost_aid)}</td><td>{money.format(row.meal)}</td><td>{money.format(row.health)}</td><td>{money.format(row.insurance)}</td><td>{money.format(row.dental)}</td><td>{money.format(row.charges)}</td><td>{money.format(row.provisions)}</td><td>{money.format(row.gross_payroll)}</td><td>{money.format(row.net_payroll)}</td><td><strong>{money.format(row.total_cost)}</strong></td></tr>)}</tbody></table>
    </DataTable>
    {detail && <CostDrawer row={detail} onClose={() => setDetail(null)} />}
  </PageShell>;
}

export function IndicatorsPage({ token }: { token: string }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const [competency, setCompetency] = useState("2026-06");
  const [summary, setSummary] = useState<IndicatorSummary | null>(null);
  useEffect(() => { api<IndicatorSummary>(`/demo/indicators?competency=${competency}`, {}, token).then(setSummary); }, [competency, token]);
  const cards = summary ? [
    ["Efetivo inicial", summary.initial_headcount], ["Admissões", summary.admissions], ["Desligamentos", summary.terminations], ["Efetivo final", summary.final_headcount],
    ["Efetivo médio", summary.average_headcount.toFixed(1)], ["Absenteísmo", percent.format(summary.absenteeism)], ["Turnover", percent.format(summary.turnover)], ["Folha bruta", money.format(summary.gross_payroll)],
    ["Folha líquida", money.format(summary.net_payroll)], ["Salário per capita", money.format(summary.salary_per_capita)], ["Custo total", money.format(summary.total_cost)], ["Dias produtivos", summary.productive_days],
    ["Horas não produtivas", summary.non_productive_hours.toFixed(1)]
  ] : [];
  return <PageShell title="Indicadores" subtitle="Leitura consolidada da competência.">
    <div className="panel filters-panel"><select value={competency} onChange={e => setCompetency(e.target.value)}>{demoCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select><option>Todos os CRs</option></select><select><option>Todas modalidades</option></select></div>
    <div className="summary-grid indicators">{cards.map(([label, value]) => <Summary key={label} label={String(label)} value={String(value)} />)}</div>
    <div className="panel formula-panel"><strong>Fórmulas</strong><p>Absenteísmo = horas não produtivas / horas programadas.</p><p>Turnover = ((admissões + desligamentos) / 2) / efetivo médio. Quando houver divisão por zero, o sistema exibe 0.</p></div>
  </PageShell>;
}

export function ReportsPage({ token }: { token: string }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const fb = useFeedback();
  const reports = ["Relatório mensal consolidado", "Relatório por Centro de Resultado", "Relatório de colaboradores", "Relatório de movimentações", "Relatório de absenteísmo", "Relatório de turnover", "Relatório de custo de folha", "Relatório de histórico salarial"];
  const [preview, setPreview] = useState<any>(null);
  async function action() {
    setPreview(await api("/demo/report-preview?competency=2026-06", {}, token));
    fb.notify("Relatório gerado em modo demonstração.");
  }
  return <PageShell title="Relatórios" subtitle="Pacote de saídas gerenciais para acompanhamento mensal." error={fb.error} success={fb.success}>
    <div className="report-grid">{reports.map(report => <article className="report-card" key={report}><h3>{report}</h3><p>Filtros por competência, Centro de Resultado, modalidade e status.</p><div className="actions"><button className="secondary" onClick={action}>Visualizar</button><button className="secondary" onClick={action}>Exportar Excel</button><button className="secondary" onClick={action}>Gerar PDF</button><button className="secondary" onClick={action}>Imprimir</button></div></article>)}</div>
    {preview && <div className="panel report-preview"><span className="eyebrow">Prévia</span><h2>{preview.company}</h2><p>Competência {preview.competency}</p><div className="summary-grid"><Summary label="ADM" value="Resumo gerado" /><Summary label="IND" value="Resumo gerado" /><Summary label="COM" value="Resumo gerado" /><Summary label="DIR" value="Resumo gerado" /></div></div>}
  </PageShell>;
}

export function SettingsPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  const fb = useFeedback();
  useEffect(() => { api<DemoSettings>("/demo/settings", {}, token).then(setSettings); }, [token]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (restricted(user, fb.fail)) return;
    const form = new FormData(event.currentTarget);
    const updated = await api<DemoSettings>("/demo/settings", { method: "POST", body: JSON.stringify({ company_name: form.get("company_name"), default_daily_hours: Number(form.get("default_daily_hours")) }) }, token);
    setSettings(updated);
    fb.notify("Configurações salvas em modo demonstração.");
  }
  if (!settings) return <div className="inline-loading">Carregando configurações...</div>;
  return <PageShell title="Configurações" subtitle="Parâmetros demonstrativos da empresa, jornada, encargos e permissões." error={fb.error} success={fb.success}>
    <form onSubmit={save} className="settings-grid">
      <SectionCard title="Empresa"><label>Nome<input name="company_name" defaultValue={settings.company_name} disabled={user.role !== "ADMIN"} /></label><InfoLine label="CNPJ" value={settings.cnpj} /><InfoLine label="Mês inicial" value={settings.initial_month} /></SectionCard>
      <SectionCard title="Jornada"><label>Jornada padrão<input name="default_daily_hours" type="number" step="0.1" defaultValue={settings.default_daily_hours} disabled={user.role !== "ADMIN"} /></label><InfoLine label="Considerar sábado" value={settings.include_saturdays ? "Sim" : "Não"} /><InfoLine label="Feriados" value={settings.holidays.join(", ")} /></SectionCard>
      <SectionCard title="Encargos">{settings.charges.map(item => <InfoLine key={item.name} label={item.name} value={`${item.rate}%`} />)}</SectionCard>
      <SectionCard title="Modalidades">{demoEmploymentTypes.map(item => <InfoLine key={item.name} label={item.name} value={item.has_charges ? "Com encargos" : "Sem encargos"} />)}</SectionCard>
      <SectionCard title="Usuários e permissões"><InfoLine label="Administrador" value="Controle total" /><InfoLine label="Consultor" value="Consulta e exportação" /></SectionCard>
      <SectionCard title="Backup"><InfoLine label="Pasta" value={settings.backup_directory} /><InfoLine label="Ao abrir" value={settings.auto_backup_on_start ? "Ativo" : "Inativo"} /><InfoLine label="Retenção" value={`${settings.backup_retention} backups`} /></SectionCard>
      {user.role === "ADMIN" && <button className="primary">Salvar configurações</button>}
    </form>
  </PageShell>;
}

export function BackupPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const [items, setItems] = useState<DemoBackup[]>([]);
  const fb = useFeedback();
  const load = () => api<DemoBackup[]>("/demo/backups", {}, token).then(setItems);
  useEffect(() => { void load(); }, [token]);
  async function backup() { if (restricted(user, fb.fail)) return; const result = await api<{ message: string }>("/demo/backups", { method: "POST" }, token); fb.notify(result.message); void load(); }
  return <PageShell title="Backup" subtitle="Rotina demonstrativa de cópia e restauração." error={fb.error} success={fb.success}
    actions={<><button className="primary" onClick={backup}>Gerar backup agora</button><button className="secondary" onClick={() => user.role === "ADMIN" ? fb.notify("Pasta alterada em modo demonstração.") : fb.fail("Seu perfil possui acesso somente para consulta.")}>Alterar pasta</button><button className="secondary" onClick={() => user.role === "ADMIN" ? fb.notify("Restauração simulada. Nenhum dado real foi alterado.") : fb.fail("Seu perfil possui acesso somente para consulta.")}>Restaurar backup</button></>}>
    <div className="summary-grid"><Summary label="Último backup" value={items[0]?.date ?? "-"} /><Summary label="Pasta" value="C:\\SistemaIndicadoresFolha\\backups" /><Summary label="Retenção" value="90 backups" strong /></div>
    <div className="panel list">{items.map(item => <div className="list-row backup-row" key={item.id}><strong>{item.file}</strong><span>{item.date}</span><span>{item.size}</span><span className="status">{item.status}</span></div>)}</div>
  </PageShell>;
}

export function ClosingPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const [closing, setClosing] = useState<DemoClosing | null>(null);
  const fb = useFeedback();
  const load = () => api<DemoClosing>("/demo/closing", {}, token).then(setClosing);
  useEffect(() => { void load(); }, [token]);
  async function change(status: "OPEN" | "CLOSED") { if (restricted(user, fb.fail)) return; setClosing(await api<DemoClosing>("/demo/closing", { method: "POST", body: JSON.stringify({ status }) }, token)); fb.notify(status === "CLOSED" ? "Competência fechada em modo demonstração." : "Competência reaberta em modo demonstração."); }
  if (!closing) return <div className="inline-loading">Carregando fechamento...</div>;
  return <PageShell title="Fechamento mensal" subtitle="Checklist de conferência antes do encerramento da competência." error={fb.error} success={fb.success}
    actions={<><button className="primary" onClick={() => change("CLOSED")}>Fechar competência</button><button className="secondary" onClick={() => change("OPEN")}>Reabrir competência</button><button className="secondary" onClick={() => fb.notify("Relatório de fechamento gerado em modo demonstração.")}>Gerar relatório</button></>}>
    <div className="summary-grid"><Summary label="Competência" value={closing.competency} /><Summary label="Status" value={closing.status === "OPEN" ? "Aberta" : "Fechada"} strong /></div>
    <div className="panel checklist">{Object.entries(closing.checklist).map(([label, done]) => <label key={label} className="check"><input type="checkbox" checked={done} readOnly /> {label}</label>)}</div>
  </PageShell>;
}

export function ImportPage({ token, user }: { token: string; user: User }) {
  if (!IS_DEMO_MODE) return <DemoOnly />;
  const [preview, setPreview] = useState<any>(null);
  const fb = useFeedback();
  async function simulate() { if (restricted(user, fb.fail)) return; setPreview(await api("/demo/import-preview", { method: "POST" }, token)); fb.notify("Prévia de importação gerada em modo demonstração."); }
  return <PageShell title="Importação" subtitle="Fluxo visual para validar planilhas antes de confirmar dados." error={fb.error} success={fb.success}>
    <div className="panel import-panel"><select><option>Colaboradores</option><option>Folha</option><option>Movimentações</option><option>Planilha legado</option></select><button className="secondary" onClick={() => fb.notify("Template baixado em modo demonstração.")}>Baixar template</button><div className="upload-box">Arraste uma planilha aqui ou clique para selecionar</div><button className="primary" onClick={simulate}>Confirmar importação</button></div>
    {preview && <div className="panel"><h2>Prévia dos dados</h2><div className="summary-grid"><Summary label="Linhas" value={preview.rows} /><Summary label="Válidas" value={preview.valid} /><Summary label="Inconsistências" value={preview.errors.length} strong /></div><ul className="validation-list">{preview.errors.map((item: string) => <li key={item}>{item}</li>)}</ul></div>}
  </PageShell>;
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

function CostDrawer({ row, onClose }: { row: PayrollRow; onClose: () => void }) {
  const benefits = row.meal + row.health + row.insurance + row.dental + row.cost_aid;
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={e => e.stopPropagation()}><button className="ghost right" onClick={onClose}>Fechar</button><span className="eyebrow">Detalhar custo</span><h2>{row.employee_name}</h2><div className="detail-grid"><Summary label="Salário" value={money.format(row.salary + row.pro_labore)} /><Summary label="Benefícios" value={money.format(benefits)} /><Summary label="Encargos" value={money.format(row.charges)} /><Summary label="Provisões" value={money.format(row.provisions)} /><Summary label="Custo total" value={money.format(row.total_cost)} strong /></div></aside></div>;
}

function date(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function sum<T>(items: T[], key: keyof T) {
  return items.reduce((acc, item) => acc + Number(item[key] ?? 0), 0);
}
