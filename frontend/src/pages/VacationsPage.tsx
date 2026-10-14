import { FormEvent, useEffect, useState } from "react";
import { api, isLocalDataMode } from "../api";
import { DateInput } from "../components/DateInput";
import { ErrorMessage, SuccessMessage } from "../components/Feedback";
import { useDemoScope } from "../context/DemoScope";
import { downloadExcel } from "../excel";
import { User } from "../types";
import "./vacations.css";

type Kind = "VACATION" | "LEAVE" | "COLLECTIVE" | "ABSENCE";
type Effect = "NONE" | "SUSPEND" | "RESTART" | "LOSE";
type Period = { start: string; end: string; concession_start: string; concession_end: string; reset_on: string | null;
  reset_reason: string; accrued_days: number; allocated_days: number; available_days: number; overdue_days: number; status: string };
type Warning = { event_id: number; code: string; message: string };
type Calculation = { as_of: string; periods: Period[]; warnings: Warning[] };
type EventForm = { kind: Kind; start_date: string; end_date: string; effect: Effect; leave_type: string; sold_days: number;
  period_start: string | null; notes: string };
type VacationEvent = EventForm & { id: number; cancelled_at: string | null };
type DossierForm = { name: string; reference: string; admission_date: string; notes: string };
type Dossier = DossierForm & Calculation & { id: number; company_id: number; revision: number; events?: VacationEvent[] };
type History = { id: number; action: string; performed_by: string; created_at: string; before: Dossier | null; after: Dossier };
const kinds: Record<Kind, string> = { VACATION: "Férias individuais", LEAVE: "Afastamento", COLLECTIVE: "Férias coletivas", ABSENCE: "Falta (sem impacto)" };
const effects: Record<Effect, string> = { NONE: "Sem efeito na aquisição", SUSPEND: "Suspender contagem", RESTART: "Reiniciar período", LOSE: "Perder período e reiniciar" };
const dateLabel = (value: string) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const today = () => new Date().toLocaleDateString("sv-SE");
const emptyDossier = (): DossierForm => ({ name: "", reference: "", admission_date: today(), notes: "" });
const emptyEvent = (period = ""): EventForm => ({ kind: "VACATION", start_date: today(), end_date: today(), effect: "NONE", leave_type: "", sold_days: 0, period_start: period || null, notes: "" });
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";

function Periods({ periods }: { periods: Period[] }) {
  return <div className="table-wrap"><table><thead><tr><th>Aquisitivo</th><th>Concessivo</th><th>Avos em dias</th><th>Lançados¹</th><th>Disponíveis¹</th><th>Situação</th></tr></thead>
    <tbody>{periods.map(p => <tr key={p.start}><td>{dateLabel(p.start)} a {dateLabel(p.end)}{p.reset_on && <small>Interrompido em {dateLabel(p.reset_on)} · {p.reset_reason}</small>}</td>
      <td>{dateLabel(p.concession_start)} a {dateLabel(p.concession_end)}</td><td>{p.accrued_days}</td><td>{p.allocated_days}</td><td>{p.available_days}</td><td>{p.status}{p.overdue_days > 0 && <small>{p.overdue_days} dia(s) vencido(s)</small>}</td></tr>)}</tbody></table></div>;
}

function Warnings({ warnings }: { warnings: Warning[] }) {
  return warnings.length ? <ul className="vacation-warnings" aria-label="Avisos consultivos">{warnings.map((w, i) => <li key={`${w.event_id}-${w.code}-${i}`}>{w.message}</li>)}</ul> : <p>Sem avisos nas regras consultivas verificadas.</p>;
}

export function VacationsPage({ token, user }: { token: string; user: User }) {
  const { selectedCompany, companies } = useDemoScope();
  const admin = user.role === "ADMIN";
  const local = isLocalDataMode();
  const [asOf, setAsOf] = useState(today);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Dossier[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dossierForm, setDossierForm] = useState<DossierForm | null>(null);
  const [eventForm, setEventForm] = useState<EventForm | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<Calculation | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [history, setHistory] = useState<History[] | null>(null);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [report, setReport] = useState("map");
  const [reportRows, setReportRows] = useState<Record<string, unknown>[] | null>(null);
  const [reportOffset, setReportOffset] = useState(0);
  const [reportTotal, setReportTotal] = useState(0);
  const scope = `company_id=${selectedCompany.id}`;

  useEffect(() => {
    if (local || !asOf) return;
    let active = true;
    setLoading(true); setError(""); setDetail(null); setHistory(null); setPreview(null); setItems([]); setTotal(0);
    const request = selectedId === null
      ? api<{ items: Dossier[]; total: number }>(`/vacations/dossiers?${scope}&as_of=${asOf}&offset=${offset}&search=${encodeURIComponent(filter)}`, {}, token)
      : api<Dossier>(`/vacations/dossiers/${selectedId}?${scope}&as_of=${asOf}`, {}, token);
    void request.then(result => {
      if (!active) return;
      if ("items" in result) { setItems(result.items); setTotal(result.total); }
      else setDetail(result);
    }).catch(e => { if (active) setError(message(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, scope, asOf, offset, filter, selectedId, reload, local]);

  function clearForms() { setDossierForm(null); setEventForm(null); setPreview(null); setCancelId(null); setHistory(null); }
  function openDossier(id: number | null) { clearForms(); setError(""); setSuccess(""); setSelectedId(id); }
  function changeEvent(patch: Partial<EventForm>) { setEventForm(value => value && { ...value, ...patch }); setPreview(null); }
  function startEvent(event?: VacationEvent) {
    if (!detail) return;
    setDossierForm(null); setCancelId(null); setPreview(null); setEditingId(event?.id ?? null);
    const period = detail.periods.find(p => p.available_days > 0 && !p.reset_on) ?? detail.periods.at(-1);
    setEventForm(event ? { kind: event.kind, start_date: event.start_date, end_date: event.end_date, effect: event.effect,
      leave_type: event.leave_type, sold_days: event.sold_days, period_start: event.period_start, notes: event.notes } : emptyEvent(period?.start));
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setSuccess("");
    try { await action(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  function saved(result: Dossier) {
    clearForms(); setSelectedId(result.id); setReload(value => value + 1); setReportRows(null);
    setSuccess("Salvo no módulo consultivo. Folha, custos e movimentações não foram alterados.");
  }
  async function saveDossier(event: FormEvent) {
    event.preventDefault(); if (!dossierForm) return;
    await run(async () => {
      const companyId = detail?.company_id ?? selectedCompany.id;
      saved(await api<Dossier>(`/vacations/dossiers${detail ? `/${detail.id}` : ""}?company_id=${companyId}`, {
        method: detail ? "PUT" : "POST", body: JSON.stringify({ ...dossierForm, ...(detail ? { revision: detail.revision } : {}) })
      }, token));
    });
  }
  async function submitEvent(event: FormEvent) {
    event.preventDefault(); if (!eventForm || !detail) return;
    await run(async () => {
      saved(await api<Dossier>(`/vacations/dossiers/${detail.id}/events${editingId ? `/${editingId}` : ""}?company_id=${detail.company_id}`, {
        method: editingId ? "PUT" : "POST", body: JSON.stringify({ ...eventForm, revision: detail.revision })
      }, token));
    });
  }
  async function simulate() {
    if (!detail || !eventForm) return;
    await run(async () => setPreview(await api<Calculation>(`/vacations/dossiers/${detail.id}/preview?company_id=${detail.company_id}${editingId ? `&event_id=${editingId}` : ""}`, {
      method: "POST", body: JSON.stringify({ ...eventForm, revision: detail.revision })
    }, token)));
  }
  async function loadHistory(more = false) {
    if (!detail) return;
    await run(async () => {
      const result = await api<{ items: History[]; next_before_id: number | null }>(`/vacations/dossiers/${detail.id}/history?company_id=${detail.company_id}${more && historyCursor ? `&before_id=${historyCursor}` : ""}`, {}, token);
      setHistory(value => more ? [...(value ?? []), ...result.items] : result.items); setHistoryCursor(result.next_before_id);
    });
  }
  async function loadReport(nextOffset = 0) {
    await run(async () => {
      const result = await api<{ items: Record<string, unknown>[]; total: number }>(`/vacations/reports?${scope}&as_of=${asOf}&kind=${report}&offset=${nextOffset}`, {}, token);
      setReportRows(result.items); setReportTotal(result.total); setReportOffset(nextOffset);
    });
  }

  return <div className="vacations-page">
    <div className="page-title"><div><span className="eyebrow">Planejamento manual</span><h1>Férias consultivas</h1><p>Períodos, saldo em dias e histórico. Sem integração com folha, custos, ponto ou notificações.</p></div></div>
    <details className="vacation-rules"><summary>Como esta consulta calcula os períodos</summary>
      <p>Dados preenchidos manualmente, sem importar o cadastro de colaboradores. Cada mês completo desde a admissão equivale a 2,5 dias; frações de mês não geram avos. Faltas são apenas registradas, sem redução do saldo.</p>
      <p>Suspensões adiam a aquisição pelos dias corridos informados, sem duplicar dias sobrepostos. Reinício e perda zeram o saldo anterior no dia seguinte ao fim do afastamento. Coletivas reiniciam apenas o primeiro período quando o saldo na data inicial é insuficiente.</p>
      <p>Datas de lançamentos incluem o primeiro e o último dia. Períodos terminam na véspera do aniversário. ¹ Lançados e disponíveis consideram também reservas futuras e dias vendidos; o saldo pode ficar negativo, apenas como aviso.</p>
      <p>Regras simplificadas do documento técnico, não uma validação trabalhista completa. O aviso de fracionamento usa a referência do <a href="https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm" target="_blank" rel="noreferrer">art. 134 da CLT</a>. Confira o enquadramento antes de decidir.</p>
    </details>
    {local ? <ErrorMessage message="Este módulo requer conexão com o servidor atualizado; não grava dados no modo local." /> : <>
      <ErrorMessage message={error} /><SuccessMessage message={success} />
      <div className="vacation-toolbar">
        {selectedId !== null && <button disabled={busy} onClick={() => openDossier(null)}>← Voltar às fichas</button>}
        <label>Data de referência<DateInput value={asOf} min="1900-01-01" max="2100-12-31" required disabled={busy} onChange={e => { if (e.target.value) { clearForms(); setAsOf(e.target.value); setReportRows(null); } }} /></label>
        <button disabled={busy || loading} onClick={() => { clearForms(); setReload(n => n + 1); }}>Recarregar</button>
        {admin && selectedId === null && <button className="primary" disabled={busy || loading || selectedCompany.id === 0} onClick={() => setDossierForm(emptyDossier())}>Nova ficha manual</button>}
        {selectedId === null && selectedCompany.id === 0 && <small>Selecione uma empresa no cabeçalho para criar uma ficha.</small>}
      </div>
      {loading && <p role="status">Carregando dados do servidor…</p>}
      {!loading && selectedId === null && <>
        <form className="vacation-toolbar" onSubmit={e => { e.preventDefault(); setFilter(search); setOffset(0); }}><label>Nome ou matrícula/referência<input value={search} onChange={e => setSearch(e.target.value)} maxLength={180} /></label><button>Buscar</button></form>
        <section className="panel"><h2>Fichas manuais <small>({total})</small></h2>
          <div className="table-wrap"><table><thead><tr><th>Nome / referência</th><th>Empresa</th><th>Admissão</th><th>Avos em dias²</th><th>Avisos</th><th>Ação</th></tr></thead><tbody>{items.map(item => <tr key={item.id}>
            <td>{item.name}<small>{item.reference}</small></td><td>{companies.find(c => c.id === item.company_id)?.name ?? item.company_id}</td><td>{dateLabel(item.admission_date)}</td><td>{item.periods.filter(p => p.start <= asOf && (!p.reset_on || p.reset_on > asOf)).reduce((sum, p) => sum + p.accrued_days, 0)}</td><td>{item.warnings.length}</td><td><button disabled={busy} onClick={() => openDossier(item.id)}>Consultar</button></td>
          </tr>)}</tbody></table></div>{!items.length && <p>Nenhuma ficha encontrada. Os registros deste módulo são manuais.</p>}
          <small>² Soma dos períodos não perdidos/reiniciados; consulte a ficha para saldo após lançamentos.</small>
          <div className="vacation-actions"><button disabled={busy || offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))}>Anterior</button><span>{total ? offset + 1 : 0}–{Math.min(offset + 50, total)} de {total}</span><button disabled={busy || offset + 50 >= total} onClick={() => setOffset(n => n + 50)}>Próxima</button></div>
        </section>
      </>}
      {dossierForm && !loading && <section className="panel"><h2>{detail ? "Editar ficha manual" : "Nova ficha manual"}</h2><form onSubmit={saveDossier}><fieldset disabled={busy}><div className="vacation-form">
        <label>Nome completo<input required maxLength={180} value={dossierForm.name} onChange={e => setDossierForm({ ...dossierForm, name: e.target.value })} /></label>
        <label>Matrícula / referência (opcional)<input maxLength={80} value={dossierForm.reference} onChange={e => setDossierForm({ ...dossierForm, reference: e.target.value })} /></label>
        <label>Admissão informada<DateInput required min="1900-01-01" max="2100-12-31" value={dossierForm.admission_date} onChange={e => setDossierForm({ ...dossierForm, admission_date: e.target.value })} /></label>
        <label>Observações<textarea maxLength={4000} value={dossierForm.notes} onChange={e => setDossierForm({ ...dossierForm, notes: e.target.value })} /></label>
      </div><p>Editar a admissão recalcula os períodos. Lançamentos antigos permanecem no histórico e podem exigir revisão da vinculação.</p><div className="vacation-actions"><button className="primary">Salvar ficha</button><button type="button" onClick={() => setDossierForm(null)}>Cancelar</button></div></fieldset></form></section>}
      {!loading && detail && <>
        <section className="panel"><div className="vacation-toolbar"><div><h2>{detail.name}</h2><p>{detail.reference || "Sem referência"} · Admissão {dateLabel(detail.admission_date)} · Revisão {detail.revision}</p></div>
          {admin && <><button disabled={busy} onClick={() => { setEventForm(null); setDossierForm({ name: detail.name, reference: detail.reference, admission_date: detail.admission_date, notes: detail.notes }); }}>Editar ficha</button><button className="primary" disabled={busy} onClick={() => startEvent()}>Novo lançamento</button></>}
        </div>{detail.notes && <p>{detail.notes}</p>}<Periods periods={detail.periods} /></section>
        {eventForm && <section className="panel"><h2>{editingId ? "Editar lançamento" : "Novo lançamento manual"}</h2><form onSubmit={submitEvent}><fieldset disabled={busy}><div className="vacation-form">
          <label>Tipo<select value={eventForm.kind} onChange={e => changeEvent({ kind: e.target.value as Kind, effect: "NONE", sold_days: 0, leave_type: "", period_start: e.target.value === "VACATION" ? detail.periods.at(-1)?.start ?? null : null })}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Data inicial<DateInput required min="1900-01-01" max="2100-12-31" value={eventForm.start_date} onChange={e => changeEvent({ start_date: e.target.value })} /></label>
          <label>Data final (inclusive)<DateInput required min={eventForm.start_date || "1900-01-01"} max="2100-12-31" value={eventForm.end_date} onChange={e => changeEvent({ end_date: e.target.value })} /></label>
          {eventForm.kind === "VACATION" && <><label>Período aquisitivo<select required value={eventForm.period_start ?? ""} onChange={e => changeEvent({ period_start: e.target.value })}>
            <option value="">Selecione</option>{eventForm.period_start && !detail.periods.some(p => p.start === eventForm.period_start) && <option value={eventForm.period_start}>Referência antiga: {dateLabel(eventForm.period_start)}</option>}{detail.periods.map(p => <option key={p.start} value={p.start}>{dateLabel(p.start)} a {dateLabel(p.end)}</option>)}</select></label>
            <label>Dias vendidos<input type="number" min={0} max={365} step={1} required value={eventForm.sold_days} onChange={e => changeEvent({ sold_days: Number(e.target.value) })} /></label></>}
          {eventForm.kind === "LEAVE" && <><label>Tipo de afastamento<input maxLength={120} value={eventForm.leave_type} onChange={e => changeEvent({ leave_type: e.target.value })} placeholder="Informe o motivo" /></label><label>Efeito informado pelo operador<select value={eventForm.effect} onChange={e => changeEvent({ effect: e.target.value as Effect })}>{Object.entries(effects).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></>}
          <label>Observações<textarea maxLength={4000} value={eventForm.notes} onChange={e => changeEvent({ notes: e.target.value })} /></label>
        </div><p>{eventForm.kind === "ABSENCE" ? "Faltas não alteram os avos ou dias disponíveis." : "Os avisos são consultivos e não impedem salvar. Confira a simulação antes de confirmar."}</p>
          <div className="vacation-actions"><button type="button" onClick={() => void simulate()}>Simular períodos e avisos</button><button className="primary">Salvar lançamento</button><button type="button" onClick={() => { setEventForm(null); setPreview(null); }}>Cancelar edição</button></div>
        </fieldset></form>{preview && <div aria-live="polite"><h3>Simulação na data inicial: {dateLabel(preview.as_of)}</h3><Periods periods={preview.periods} /><Warnings warnings={preview.warnings} /></div>}</section>}
        <section className="panel"><h2>Lançamentos</h2><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Datas</th><th>Efeito / venda</th><th>Ações</th></tr></thead><tbody>{detail.events?.map(event => <tr key={event.id} className={event.cancelled_at ? "vacation-cancelled" : ""}>
          <td>{kinds[event.kind]}{event.cancelled_at && <small>Cancelado — preservado no histórico</small>}<small>{event.leave_type} {event.notes}</small></td><td>{dateLabel(event.start_date)} a {dateLabel(event.end_date)}</td><td>{event.kind === "LEAVE" ? effects[event.effect] : `${event.sold_days} dia(s) vendido(s)`}</td><td>{admin && !event.cancelled_at && <div className="vacation-actions"><button disabled={busy} onClick={() => startEvent(event)}>Editar</button><button disabled={busy} onClick={() => setCancelId(event.id)}>Cancelar lançamento</button></div>}</td>
        </tr>)}</tbody></table></div>{!detail.events?.length && <p>Ainda não há lançamentos nesta ficha.</p>}
          {cancelId !== null && <div role="alert"><p>Cancelar o lançamento #{cancelId}? O saldo será recalculado e o registro continuará no histórico.</p><div className="vacation-actions"><button disabled={busy} onClick={() => void run(async () => saved(await api<Dossier>(`/vacations/dossiers/${detail.id}/events/${cancelId}?company_id=${detail.company_id}&revision=${detail.revision}`, { method: "DELETE" }, token)))}>Confirmar cancelamento</button><button disabled={busy} onClick={() => setCancelId(null)}>Manter lançamento</button></div></div>}
        </section><section className="panel"><h2>Avisos da ficha</h2><Warnings warnings={detail.warnings} /></section>
        <section className="panel"><div className="vacation-toolbar"><h2>Histórico auditável</h2><button disabled={busy} onClick={() => void loadHistory()}>Consultar histórico</button></div><p>Carregado sob demanda. Cada alteração preserva os dados anteriores, períodos e avisos daquela revisão.</p>
          {history?.map(entry => <details key={entry.id}><summary>{new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.action} · {entry.performed_by}</summary><h3>Depois — revisão {entry.after.revision}</h3><p>{entry.after.name} · Admissão {dateLabel(entry.after.admission_date)}</p><Periods periods={entry.after.periods} /><Warnings warnings={entry.after.warnings} /><details><summary>Dados completos da alteração (antes/depois)</summary><pre>{JSON.stringify({ antes: entry.before, depois: entry.after }, null, 2)}</pre></details></details>)}
          {historyCursor && <button disabled={busy} onClick={() => void loadHistory(true)}>Carregar registros anteriores</button>}
        </section>
      </>}
      {selectedId === null && !loading && <section className="panel"><h2>Relatórios consultivos</h2><p>Consideram todas as fichas da empresa selecionada (independente da busca por nome). Sem valores financeiros. O histórico individual está disponível em Consultar.</p><div className="vacation-toolbar"><label>Relatório<select disabled={busy} value={report} onChange={e => { setReport(e.target.value); setReportRows(null); }}><option value="map">Mapa de férias</option><option value="acquisition">Períodos aquisitivos</option><option value="concession">Períodos concessivos</option><option value="overdue">Férias vencidas</option><option value="insufficient">Avos / saldo insuficientes</option></select></label><button disabled={busy} onClick={() => void loadReport()}>Executar relatório</button>{reportRows?.length ? <button disabled={busy} onClick={() => void run(() => downloadExcel(reportRows, "Férias consultivas", `ferias-${report}-${asOf}-pagina-${reportOffset / 100 + 1}.xlsx`))}>Exportar esta página</button> : null}</div>
        {reportRows && <><p>{reportTotal} linha(s). Página {reportOffset / 100 + 1}, até 100 linhas por página.</p><div className="table-wrap"><table><thead><tr>{Object.keys(reportRows[0] ?? {}).map(key => <th key={key}>{key}</th>)}</tr></thead><tbody>{reportRows.map((row, i) => <tr key={i}>{Object.entries(row).map(([key, value]) => <td key={key}>{String(value ?? "")}</td>)}</tr>)}</tbody></table></div>{!reportRows.length && <p>Nenhum registro para este relatório e data de referência.</p>}<div className="vacation-actions"><button disabled={busy || reportOffset === 0} onClick={() => void loadReport(reportOffset - 100)}>Anterior</button><button disabled={busy || reportOffset + 100 >= reportTotal} onClick={() => void loadReport(reportOffset + 100)}>Próxima</button></div></>}
      </section>}
    </>}
  </div>;
}
