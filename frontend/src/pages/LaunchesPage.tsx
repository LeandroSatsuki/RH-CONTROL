import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { ErrorMessage, SuccessMessage } from "../components/Feedback";
import { useDemoScope } from "../context/DemoScope";
import { User } from "../types";

type LaunchKind = "MEI" | "BASIC_BASKET" | "BONUS";
type LaunchEmployee = {
  employment_id: number;
  employee_name: string;
  employee_code: string;
  supervisor_name: string;
  employment_type: string;
  result_center: { id: number; code: string; name: string; color: string };
  amount: number;
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
  MEI: { title: "MEI", detail: "Exibe somente MEIs com contrato assinado e vigente na competência." },
  BASIC_BASKET: { title: "Cesta básica", detail: "Exibe somente quem possui o benefício marcado." },
  BONUS: { title: "Premiação", detail: "Permite filtrar por supervisor, modalidade e Centro de Resultado." }
};
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const currentCompetency = new Date().toISOString().slice(0, 7);

export function LaunchesPage({ token, user }: { token: string; user: User }) {
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState(currentCompetency);
  const [batches, setBatches] = useState<LaunchBatch[]>([]);
  const [active, setActive] = useState<LaunchBatch | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dirty = useRef(false);

  async function loadBatches() {
    if (selectedCompany.id === 0) {
      setBatches([]);
      setActive(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api<LaunchBatch[]>(`/demo/launches?competency=${competency}`, {}, token);
      setBatches(response);
      setActive(current => current ? response.find(item => item.id === current.id) ?? null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os lançamentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadBatches(); }, [competency, selectedCompany.id, token]);

  async function openKind(kind: LaunchKind) {
    if (selectedCompany.id === 0) {
      setError("Selecione uma empresa específica para realizar lançamentos.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const existing = batches.find(item => item.kind === kind);
      const batch = existing
        ? await api<LaunchBatch>(`/demo/launches/${existing.id}`, {}, token)
        : await api<LaunchBatch>("/demo/launches", {
            method: "POST",
            body: JSON.stringify({ competency, kind })
          }, token);
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
    setActive(current => current ? {
      ...current,
      employees: current.employees.map(item => item.employment_id === employmentId ? { ...item, ...patch } : item)
    } : current);
  }

  function patchFilter(name: string, value: string) {
    dirty.current = true;
    setActive(current => current ? { ...current, filters: { ...current.filters, [name]: value } } : current);
  }

  async function saveDraft(showMessage = true) {
    if (!active || active.status !== "PENDING" || saving) return active;
    setSaving(true);
    setError("");
    try {
      const saved = await api<LaunchBatch>(`/demo/launches/${active.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          filters: active.filters,
          items: active.employees.map(item => ({ employment_id: item.employment_id, amount: item.amount, note: item.note }))
        })
      }, token);
      setActive(saved);
      setBatches(current => [saved, ...current.filter(item => item.id !== saved.id)]);
      dirty.current = false;
      if (showMessage) setSuccess("Rascunho salvo. Você pode continuar depois.");
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o rascunho.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function confirmLaunch() {
    if (!active) return;
    const saved = dirty.current ? await saveDraft(false) : active;
    if (!saved) return;
    setSaving(true);
    setError("");
    try {
      const confirmed = await api<LaunchBatch>(`/demo/launches/${saved.id}/confirm`, { method: "POST" }, token);
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

  return <section className="page launches-page">
    <div className="page-title">
      <div><span className="eyebrow">Operação mensal</span><h1>Lançamentos</h1><p>MEI, cesta básica e premiação em uma conferência única, integrada ao Custo/Folha.</p></div>
      <label className="launch-competency">Competência<input type="month" value={competency} onChange={event => { setCompetency(event.target.value); setActive(null); }} /></label>
    </div>
    <ErrorMessage message={error} /><SuccessMessage message={success} />
    {selectedCompany.id === 0 && <div className="feedback error">Selecione uma empresa específica no cabeçalho.</div>}

    <div className="launch-kind-grid">
      {(Object.keys(labels) as LaunchKind[]).map(kind => {
        const existing = batches.find(item => item.kind === kind);
        return <button className={`panel launch-kind-card ${active?.kind === kind ? "active" : ""}`} type="button" key={kind} onClick={() => void openKind(kind)} disabled={loading || selectedCompany.id === 0 || (user.role !== "ADMIN" && !existing)}>
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
        {active.kind === "BONUS" && <>
          <select value={active.filters.supervisor ?? ""} onChange={event => patchFilter("supervisor", event.target.value)}><option value="">Todos os supervisores</option>{options.supervisors.map(value => <option key={value}>{value}</option>)}</select>
          <select value={active.filters.modality ?? ""} onChange={event => patchFilter("modality", event.target.value)}><option value="">Todas as modalidades</option>{options.modalities.map(value => <option key={value}>{value}</option>)}</select>
          <select value={active.filters.center ?? ""} onChange={event => patchFilter("center", event.target.value)}><option value="">Todos os CRs</option>{options.centers.map(value => <option key={value.code} value={value.code}>{value.code} - {value.name}</option>)}</select>
        </>}
      </div>
      <div className="table-wrap launch-table"><table><thead><tr><th>Colaborador</th><th>Supervisor</th><th>Modalidade</th><th>CR</th><th>Valor</th><th>Observação</th></tr></thead><tbody>
        {visible.map(item => <tr key={item.employment_id}><td><strong>{item.employee_name}</strong><small>{item.employee_code}</small></td><td>{item.supervisor_name || "—"}</td><td>{item.employment_type}</td><td><span className="color-dot" style={{ background: item.result_center.color }} />{item.result_center.code}</td><td><input className="money-input" type="number" min="0" step="0.01" value={item.amount || ""} disabled={active.status === "CONFIRMED" || user.role !== "ADMIN"} onChange={event => patchEmployee(item.employment_id, { amount: Number(event.target.value) })} onBlur={() => { if (dirty.current) void saveDraft(false); }} placeholder="0,00" /></td><td><input value={item.note} disabled={active.status === "CONFIRMED" || user.role !== "ADMIN"} onChange={event => patchEmployee(item.employment_id, { note: event.target.value })} onBlur={() => { if (dirty.current) void saveDraft(false); }} placeholder="Opcional" /></td></tr>)}
        {!visible.length && <tr><td colSpan={6}>Nenhum colaborador corresponde aos filtros.</td></tr>}
      </tbody></table></div>
      {active.status === "PENDING" && user.role === "ADMIN" && <div className="launch-actions"><span>{saving ? "Salvando…" : "Os valores são salvos como rascunho ao sair do campo."}</span><button className="secondary" type="button" onClick={() => void saveDraft()} disabled={saving}>Salvar e continuar depois</button><button className="primary" type="button" onClick={() => setConfirmOpen(true)} disabled={saving || draftCount === 0}>Revisar e confirmar</button></div>}
      {active.status === "PENDING" && user.role !== "ADMIN" && <p className="note">Consulta do rascunho. Somente administradores podem alterar ou confirmar valores.</p>}
      {active.status === "CONFIRMED" && <p className="feedback success">Confirmado e enviado ao Custo/Folha. O registro está bloqueado para evitar duplicidade.</p>}
    </div>}

    {confirmOpen && active && <div className="modal-backdrop" onClick={() => setConfirmOpen(false)}><div className="modal-card" onClick={event => event.stopPropagation()}><span className="eyebrow">Conferência final</span><h2>Confirmar {labels[active.kind].title}?</h2><p>Serão enviados <strong>{draftCount} valores</strong>, totalizando <strong>{currency.format(draftTotal)}</strong>, para o Custo/Folha de {active.competency}.</p><p className="note">Após confirmar, este lote será bloqueado para impedir lançamento duplicado.</p><div className="modal-actions"><button className="secondary" type="button" onClick={() => setConfirmOpen(false)}>Voltar e revisar</button><button className="primary" type="button" onClick={() => void confirmLaunch()} disabled={saving}>Confirmar lançamento</button></div></div></div>}
  </section>;
}
