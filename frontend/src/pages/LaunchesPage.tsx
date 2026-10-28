import { SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { ErrorMessage, SuccessMessage } from "../components/Feedback";
import { useDemoScope } from "../context/DemoScope";
import { User } from "../types";
import { downloadExcel, readFirstExcelSheet } from "../excel";
import { LaunchImportPreview, previewLaunchImport } from "../launchImport";
import { parseLaunchAmount } from "../launchAmounts";

type LaunchKind = "MEI" | "FREELANCER" | "BASIC_BASKET" | "BONUS" | "COST_AID" | "LODGING";
type LaunchEmployee = {
  employment_id: number;
  employee_name: string;
  employee_code: string;
  supervisor_name: string;
  employment_type: string;
  result_center: { id: number; code: string; name: string; color: string };
  amount: number;
  amount_text?: string;
  amount_error?: boolean;
  note: string;
};
type LaunchBatch = {
  id: number;
  company_id: number;
  competency: string;
  kind: LaunchKind;
  status: "PENDING" | "CONFIRMED";
  filters: Record<string, string>;
  total: number;
  filled_count: number;
  eligible_count: number;
  updated_at: string;
  confirmed_at: string | null;
  employees: LaunchEmployee[];
};

const labels: Record<LaunchKind, { title: string; detail: string }> = {
  MEI: { title: "MEI", detail: "Exibe somente MEIs com contrato assinado e vigente, com filtro opcional de supervisor." },
  FREELANCER: { title: "Freelancer", detail: "Extra sem encargos para colaboradores de qualquer modalidade, inclusive CLT. Soma ao custo sem substituir o salário." },
  COST_AID: { title: "Ajuda de custo", detail: "Lançamento avulso com conferência por colaborador." },
  LODGING: { title: "Hospedagem", detail: "Despesas de hospedagem integradas ao Custo/Folha." },
  BASIC_BASKET: { title: "Cesta básica", detail: "Exibe somente quem possui o benefício marcado." },
  BONUS: { title: "Premiação", detail: "Permite filtrar por supervisor, modalidade e Centro de Resultado." }
};
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const currentCompetency = new Date().toISOString().slice(0, 7);

export function LaunchesPage({ token, user }: { token: string; user: User }) {
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState(currentCompetency);
  const [batches, setBatches] = useState<LaunchBatch[]>([]);
  const [active, setActiveState] = useState<LaunchBatch | null>(null);
  const activeRef = useRef<LaunchBatch | null>(null);
  function setActive(value: SetStateAction<LaunchBatch | null>) {
    const next = typeof value === "function" ? value(activeRef.current) : value;
    activeRef.current = next;
    setActiveState(next);
  }
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dirty = useRef(false);
  const editVersion = useRef(0);
  const saveInFlight = useRef<Promise<LaunchBatch | null> | null>(null);
  const [fixedBasket, setFixedBasket] = useState("");
  const [importPreview, setImportPreview] = useState<LaunchImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const scopeRef = useRef("");
  scopeRef.current = `${selectedCompany.id}:${competency}`;
  useEffect(() => { setImportPreview(null); }, [active?.id, selectedCompany.id, competency]);

  async function loadBatches() {
    const scope = scopeRef.current;
    if (selectedCompany.id === 0) {
      setBatches([]);
      setActive(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api<LaunchBatch[]>(`/demo/launches?company_id=${selectedCompany.id}&competency=${competency}`, {}, token);
      if (scopeRef.current !== scope) return;
      setBatches(response);
      if (!dirty.current && !saveInFlight.current) setActive(current => current ? response.find(item => item.id === current.id) ?? null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os lançamentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setActive(null);
    dirty.current = false;
    setConfirmOpen(false);
    setFixedBasket("");
    void loadBatches();
  }, [competency, selectedCompany.id, token]);

  async function openKind(kind: LaunchKind) {
    if (dirty.current && !await saveDraft(false)) return;
    if (selectedCompany.id === 0) {
      setError("Selecione uma empresa específica para realizar lançamentos.");
      return;
    }
    setLoading(true);
    setError("");
    const scope = scopeRef.current;
    try {
      const existing = batches.find(item => item.kind === kind);
      const batch = existing
        ? await api<LaunchBatch>(`/demo/launches/${existing.id}?company_id=${selectedCompany.id}`, {}, token)
        : await api<LaunchBatch>(`/demo/launches?company_id=${selectedCompany.id}`, {
            method: "POST",
            body: JSON.stringify({ competency, kind })
          }, token);
      if (scopeRef.current !== scope) return;
      setActive(batch);
      setBatches(current => [batch, ...current.filter(item => item.id !== batch.id)]);
      setQuery("");
      dirty.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o lançamento.");
    } finally {
      setLoading(false);
    }
  }

  function patchEmployee(employmentId: number, patch: Partial<LaunchEmployee>) {
    dirty.current = true;
    editVersion.current += 1;
    setActive(current => current ? {
      ...current,
      employees: current.employees.map(item => item.employment_id === employmentId ? { ...item, ...patch } : item)
    } : current);
  }

  async function importFile(file?: File) {
    if (!file || !active) return;
    const scope = scopeRef.current;
    if (file.size > 5 * 1024 * 1024) { setError("A planilha deve ter até 5 MB."); return; }
    setImporting(true);
    setError("");
    try {
      const rows = await readFirstExcelSheet(await file.arrayBuffer());
      if (!rows.length) throw new Error("A planilha não contém lançamentos.");
      if (scopeRef.current === scope) setImportPreview(previewLaunchImport(rows, active.employees, active.competency, active.kind));
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível ler a planilha."); }
    finally { setImporting(false); }
  }

  async function applyImport() {
    if (!active || !importPreview) return;
    const scope = scopeRef.current;
    const imported = new Map(importPreview.items.map(item => [item.employment_id, item]));
    const merged = active.employees.map(item => imported.has(item.employment_id)
      ? { ...item, ...imported.get(item.employment_id), amount_text: undefined, amount_error: false } : item);
    if (merged.some(item => item.amount_error)) { setError("Corrija os valores inválidos antes de importar."); return; }
    setSaving(true);
    setImporting(true);
    setError("");
    try {
      const saved = await api<LaunchBatch>(`/demo/launches/${active.id}?company_id=${active.company_id}`, { method: "PATCH", body: JSON.stringify({ updated_at: active.updated_at, filters: active.filters, items: merged.map(item => ({ employment_id: item.employment_id, amount: item.amount, note: item.note })) }) }, token);
      if (scopeRef.current !== scope) return;
      setActive(saved);
      setBatches(current => [saved, ...current.filter(item => item.id !== saved.id)]);
      dirty.current = false;
      setImportPreview(null);
      setSuccess("Linhas válidas importadas e salvas como rascunho. Confira antes de confirmar.");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar a importação."); }
    finally { setSaving(false); setImporting(false); }
  }

  function patchFilter(name: string, value: string) {
    dirty.current = true;
    editVersion.current += 1;
    setActive(current => current ? { ...current, filters: { ...current.filters, [name]: value } } : current);
  }

  async function saveDraft(showMessage = true): Promise<LaunchBatch | null> {
    if (saveInFlight.current) {
      const result = await saveInFlight.current;
      if (!result) return null;
      return dirty.current ? saveDraft(showMessage) : activeRef.current;
    }
    const snapshot = activeRef.current;
    if (!snapshot || (snapshot.status !== "PENDING" && snapshot.kind !== "MEI")) return snapshot;
    if (snapshot.employees.some(item => item.amount_error)) {
      setError("Corrija os valores destacados. Use reais com até duas casas decimais, por exemplo 1.250,50.");
      return null;
    }
    const scope = scopeRef.current;
    const version = editVersion.current;
    setSaving(true);
    setError("");
    const request = (async () => { try {
      const saved = await api<LaunchBatch>(`/demo/launches/${snapshot.id}?company_id=${snapshot.company_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          updated_at: snapshot.updated_at,
          filters: snapshot.filters,
          items: snapshot.employees.map(item => ({ employment_id: item.employment_id, amount: item.amount, note: item.note }))
        })
      }, token);
      if (scopeRef.current !== scope || activeRef.current?.id !== snapshot.id) return null;
      if (editVersion.current === version) {
        setActive(saved);
        dirty.current = false;
      } else {
        // Keep edits typed during the request, but carry forward the new server revision.
        setActive(current => current ? { ...current, updated_at: saved.updated_at } : null);
      }
      setBatches(current => [saved, ...current.filter(item => item.id !== saved.id)]);
      if (showMessage) setSuccess(saved.status === "CONFIRMED" ? "Correção salva e atualizada no Custo/Folha e na Auditoria." : "Rascunho salvo. Você pode continuar depois.");
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o rascunho.");
      return null;
    } finally {
      setSaving(false);
      saveInFlight.current = null;
    } })();
    saveInFlight.current = request;
    try { return await request; }
    finally { if (saveInFlight.current === request) saveInFlight.current = null; }
  }

  async function confirmLaunch() {
    if (!active) return;
    const scope = scopeRef.current;
    const saved = dirty.current || saveInFlight.current ? await saveDraft(false) : activeRef.current;
    if (!saved) return;
    setSaving(true);
    setError("");
    try {
      const confirmed = await api<LaunchBatch>(`/demo/launches/${saved.id}/confirm?company_id=${saved.company_id}`, { method: "POST" }, token);
      if (scopeRef.current !== scope || activeRef.current?.id !== saved.id) return;
      setActive(confirmed);
      setBatches(current => [confirmed, ...current.filter(item => item.id !== confirmed.id)]);
      setConfirmOpen(false);
      setSuccess(`Lançamento confirmado: ${confirmed.filled_count} colaborador(es), total de ${currency.format(confirmed.total)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar o lançamento.");
    } finally {
      setSaving(false);
    }
  }

  const options = useMemo(() => {
    const employees = active?.employees ?? [];
    return {
      supervisors: [...new Set(employees.map(item => item.supervisor_name).filter(Boolean))].sort(),
      modalities: [...new Set(employees.map(item => item.employment_type).filter(Boolean))].sort(),
      centers: [...new Map(employees.map(item => [item.result_center.code, item.result_center])).values()].sort((a, b) => a.code.localeCompare(b.code))
    };
  }, [active?.employees]);
  const visible = (active?.employees ?? []).filter(item => {
    const text = `${item.employee_name} ${item.employee_code}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase()))
      && (!active?.filters.supervisor || item.supervisor_name === active.filters.supervisor)
      && (!active?.filters.modality || item.employment_type === active.filters.modality)
      && (!active?.filters.center || item.result_center.code === active.filters.center);
  });
  const draftTotal = (active?.employees ?? []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const draftCount = (active?.employees ?? []).filter(item => Number(item.amount) > 0).length;
  const editable = user.role === "ADMIN" && (active?.status === "PENDING" || active?.kind === "MEI");

  function distributeBasket() {
    const amount = parseLaunchAmount(fixedBasket);
    if (amount === null || !visible.length) return;
    const ids = new Set(visible.map(item => item.employment_id));
    dirty.current = true;
    editVersion.current += 1;
    setActive(current => current ? { ...current, employees: current.employees.map(item => ids.has(item.employment_id)
      ? { ...item, amount, amount_text: undefined, amount_error: false } : item) } : null);
    void saveDraft();
  }

  return <section className="page launches-page">
    <div className="page-title">
      <div><span className="eyebrow">Operação mensal</span><h1>Lançamentos</h1><p>Serviços, benefícios e valores avulsos em uma conferência única, integrada ao Custo/Folha.</p></div>
      <label className="launch-competency">Competência<input type="month" disabled={saving || importing} value={competency} onChange={event => { setCompetency(event.target.value); setActive(null); }} /></label>
    </div>
    <ErrorMessage message={error} /><SuccessMessage message={success} />
    {selectedCompany.id === 0 && <div className="feedback error">Selecione uma empresa específica no cabeçalho.</div>}

    <div className="launch-kind-grid">
      {(Object.keys(labels) as LaunchKind[]).map(kind => {
        const existing = batches.find(item => item.kind === kind);
        return <button className={`panel launch-kind-card ${active?.kind === kind ? "active" : ""}`} type="button" key={kind} onClick={() => void openKind(kind)} disabled={loading || saving || importing || selectedCompany.id === 0 || (user.role !== "ADMIN" && !existing)}>
          <span className="eyebrow">{existing ? (existing.status === "PENDING" ? "Rascunho em andamento" : "Confirmado") : "Novo lançamento"}</span>
          <strong>{labels[kind].title}</strong><small>{labels[kind].detail}</small>
          {existing && <span>{existing.filled_count}/{existing.eligible_count} preenchidos · {currency.format(existing.total)}</span>}
        </button>;
      })}
    </div>

    {active && <div className="panel launch-workspace">
      <div className="launch-workspace-head">
        <div><span className="eyebrow">{active.status === "PENDING" ? "Rascunho recuperável" : "Lançamento confirmado"}</span><h2>{labels[active.kind].title} · {active.competency}</h2><p>{active.eligible_count} colaborador(es) elegível(is) identificados automaticamente.</p></div>
        <div className="launch-totals"><span>{draftCount} preenchidos</span><strong>{currency.format(draftTotal)}</strong></div>
      </div>
      <div className="launch-filters">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nome ou matrícula" />
        {active.kind !== "BASIC_BASKET" &&
          <select value={active.filters.supervisor ?? ""} onChange={event => patchFilter("supervisor", event.target.value)}><option value="">Todos os supervisores</option>{options.supervisors.map(value => <option key={value}>{value}</option>)}</select>
        }
        {["BONUS", "COST_AID", "LODGING", "FREELANCER"].includes(active.kind) && <>
          <select value={active.filters.modality ?? ""} onChange={event => patchFilter("modality", event.target.value)}><option value="">Todas as modalidades</option>{options.modalities.map(value => <option key={value}>{value}</option>)}</select>
          <select value={active.filters.center ?? ""} onChange={event => patchFilter("center", event.target.value)}><option value="">Todos os CRs</option>{options.centers.map(value => <option key={value.code} value={value.code}>{value.code} - {value.name}</option>)}</select>
        </>}
      </div>
      {["MEI", "FREELANCER"].includes(active.kind) && active.status === "PENDING" && user.role === "ADMIN" && <section className="panel">
        <h3>Importar valores</h3><p className="note">Use o modelo desta empresa e competência. Aplique apenas após conferir; valores das matrículas importadas substituirão os valores do rascunho.</p>
        <div className="actions"><button className="secondary" disabled={saving || importing} onClick={() => void downloadExcel(active.employees.map(item => ({ Matrícula: item.employee_code, Colaborador: item.employee_name, Competência: active.competency, Tipo: active.kind, Valor: item.amount || "", Observação: item.note })), "Lançamentos", `lancamentos-${active.company_id}-${active.kind}-${active.competency}.xlsx`)}>Baixar modelo com elegíveis</button><label>Selecionar planilha<input type="file" accept=".xlsx" disabled={saving || importing} onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
        {importing && <p>Lendo planilha…</p>}
        {importPreview && <><p>{importPreview.items.length} linha(s) válida(s), total {currency.format(importPreview.items.reduce((sum, item) => sum + item.amount, 0))}. {importPreview.issues.length} inconsistência(s).</p><div className="table-wrap"><table><thead><tr><th>Colaborador</th><th>Valor importado</th></tr></thead><tbody>{importPreview.items.map(item => <tr key={item.employment_id}><td>{item.employee_name}</td><td>{currency.format(item.amount)}</td></tr>)}</tbody></table></div>{importPreview.issues.length > 0 && <ul>{importPreview.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}<button className="primary" disabled={saving || !importPreview.items.length} onClick={() => void applyImport()}>Salvar linhas válidas no rascunho</button><button className="secondary" onClick={() => setImportPreview(null)}>Descartar conferência</button></>}
      </section>}
      {active.kind === "BASIC_BASKET" && editable && <div className="launch-actions">
        <label>Valor fixo por colaborador<input aria-label="Valor fixo da cesta básica" type="text" inputMode="decimal" value={fixedBasket} onChange={event => setFixedBasket(event.target.value)} placeholder="Ex.: 250,00" disabled={saving || importing} /></label>
        <span>O mesmo valor será aplicado a cada um dos {visible.length} colaboradores exibidos, substituindo os valores do rascunho. Não haverá rateio.</span>
        <button type="button" className="secondary" disabled={saving || importing || !fixedBasket || parseLaunchAmount(fixedBasket) === null || !visible.length} onClick={distributeBasket}>Aplicar valor fixo</button>
      </div>}
      <div className="table-wrap launch-table"><table><thead><tr><th>Colaborador</th><th>Supervisor</th><th>Modalidade</th><th>CR</th><th>Valor</th><th>Observação</th></tr></thead><tbody>
        {visible.map(item => <tr key={item.employment_id}><td><strong>{item.employee_name}</strong><small>{item.employee_code}</small></td><td>{item.supervisor_name || "—"}</td><td>{item.employment_type}</td><td><span className="color-dot" style={{ background: item.result_center.color }} />{item.result_center.code}</td><td><input className="money-input" type="text" inputMode="decimal" aria-label={`Valor de ${item.employee_name}`} aria-invalid={Boolean(item.amount_error)} value={item.amount_text ?? (item.amount ? item.amount.toFixed(2).replace(".", ",") : "")} disabled={importing || loading || confirmOpen || !editable} onChange={event => { const amount = parseLaunchAmount(event.target.value); patchEmployee(item.employment_id, { amount: amount ?? item.amount, amount_text: event.target.value, amount_error: amount === null }); }} onBlur={() => { if (dirty.current) void saveDraft(false); }} placeholder="0,00" /></td><td><input value={item.note} disabled={importing || loading || confirmOpen || !editable} onChange={event => patchEmployee(item.employment_id, { note: event.target.value })} onBlur={() => { if (dirty.current) void saveDraft(false); }} placeholder="Opcional" /></td></tr>)}
        {!visible.length && <tr><td colSpan={6}>Nenhum colaborador corresponde aos filtros.</td></tr>}
      </tbody></table></div>
      {active.status === "PENDING" && user.role === "ADMIN" && <div className="launch-actions"><span>{saving ? "Salvando…" : "Os valores são salvos como rascunho ao sair do campo."}</span><button className="secondary" type="button" onClick={() => void saveDraft()} disabled={saving}>Salvar e continuar depois</button><button className="primary" type="button" onClick={() => setConfirmOpen(true)} disabled={saving || draftCount === 0}>Revisar e confirmar</button></div>}
      {active.status === "PENDING" && user.role !== "ADMIN" && <p className="note">Consulta do rascunho. Somente administradores podem alterar ou confirmar valores.</p>}
      {active.status === "CONFIRMED" && active.kind === "MEI" && user.role === "ADMIN" && <div className="launch-actions"><span>{saving ? "Salvando correção…" : "Correções são salvas ao sair do campo."}</span><button className="secondary" type="button" onClick={() => void saveDraft()} disabled={saving || importing}>Salvar correções</button></div>}
      {active.status === "CONFIRMED" && <p className="feedback success">{active.kind === "MEI" ? "Confirmado no Custo/Folha. As correções substituem os valores anteriores e ficam registradas na Auditoria; a competência precisa estar aberta." : "Confirmado e enviado ao Custo/Folha. O registro está bloqueado para evitar duplicidade."}</p>}
    </div>}

    {confirmOpen && active && <div className="modal-backdrop" onClick={() => setConfirmOpen(false)}><div className="modal-card" onClick={event => event.stopPropagation()}><span className="eyebrow">Conferência final</span><h2>Confirmar {labels[active.kind].title}?</h2><p>Serão enviados <strong>{draftCount} valores</strong>, totalizando <strong>{currency.format(draftTotal)}</strong>, para o Custo/Folha de {active.competency}.</p><p className="note">{active.kind === "MEI" ? "Após confirmar, será possível corrigir os valores sem duplicá-los, enquanto a competência estiver aberta." : "Após confirmar, este lote será bloqueado para impedir lançamento duplicado."}</p><div className="modal-actions"><button className="secondary" type="button" onClick={() => setConfirmOpen(false)}>Voltar e revisar</button><button className="primary" type="button" onClick={() => void confirmLaunch()} disabled={saving}>Confirmar lançamento</button></div></div></div>}
  </section>;
}
