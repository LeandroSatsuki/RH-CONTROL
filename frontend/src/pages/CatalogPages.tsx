import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useDemoScope } from "../context/DemoScope";
import { Empty, ErrorMessage } from "../components/Feedback";
import { EmploymentType, ResultCenter, User } from "../types";

export function CentersPage({ token, user, embedded = false }: { token: string; user: User; embedded?: boolean }) {
  const { selectedCompany } = useDemoScope();
  const [items, setItems] = useState<ResultCenter[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ code: "", name: "", color: "#2563eb" });
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api<ResultCenter[]>("/result-centers", {}, token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar Centros de Resultado");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [token, selectedCompany.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = draft.code.trim().toUpperCase();
    const name = draft.name.trim().toUpperCase();
    if (!isAllowedCatalogText(code) || !isAllowedCatalogText(name)) {
      setError("Código ou nome possui caractere especial. Corrija antes de salvar.");
      return;
    }
    try {
      await api(editingId ? `/result-centers/${editingId}` : "/result-centers", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ code, name, color: draft.color, ...(editingId ? {} : { active: true }) })
      }, token);
      setDraft({ code: "", name: "", color: "#2563eb" });
      setEditingId(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao cadastrar"); }
  }

  async function toggle(item: ResultCenter) {
    try {
      await api(`/result-centers/${item.id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) }, token);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao alterar Centro de Resultado"); }
  }

  return <Catalog embedded={embedded} title="Centros de Resultado" subtitle="Áreas usadas para segmentar pessoas e custos." error={error} form={user.role === "ADMIN" && selectedCompany.id !== 0 &&
    <form className="catalog-toolbar centers-toolbar" onSubmit={submit}><label className="catalog-code">Código<input value={draft.code} onChange={event => setDraft(current => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Ex.: ADM" required /></label><label className="catalog-name">Nome do centro<input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value.toUpperCase() }))} placeholder="Ex.: Administrativo" required /></label><label className="catalog-color">Cor<input value={draft.color} onChange={event => setDraft(current => ({ ...current, color: event.target.value }))} type="color" aria-label="Cor do centro" /></label><button className="primary compact-button">{editingId ? "Salvar" : "+ Adicionar"}</button>{editingId && <button type="button" className="secondary compact-button" onClick={() => { setEditingId(null); setDraft({ code: "", name: "", color: "#2563eb" }); }}>Cancelar</button>}</form>}>
    {loading && <div className="inline-loading">Carregando...</div>}
    <p className="note">Empresa selecionada: <strong>{selectedCompany.name}</strong>.</p>
    {selectedCompany.id === 0 && <p className="note">Selecione uma empresa específica para cadastrar um Centro de Resultado.</p>}
    {items.map(item => <div className="list-row" key={item.id}><span className="color-dot" style={{ background: item.color }} /><strong>{item.code}</strong><span>{item.name}</span><span className={item.active ? "status-pill status-active" : "status-pill status-inactive"}>{item.active ? "Ativo" : "Inativo"}</span>{user.role === "ADMIN" && selectedCompany.id !== 0 && <div className="actions"><button type="button" className="secondary" onClick={() => { setEditingId(item.id); setDraft({ code: item.code, name: item.name, color: item.color }); }}>Editar</button><button type="button" className="secondary" onClick={() => void toggle(item)}>{item.active ? "Inativar" : "Ativar"}</button></div>}</div>)}
    {!items.length && !loading && <Empty>Nenhum Centro de Resultado cadastrado.</Empty>}
  </Catalog>;
}

export function TypesPage({ token, user, embedded = false }: { token: string; user: User; embedded?: boolean }) {
  const { selectedCompany } = useDemoScope();
  const [items, setItems] = useState<EmploymentType[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", hasCharges: false });
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api<EmploymentType[]>("/employment-types", {}, token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar modalidades");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [token, selectedCompany.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim().toUpperCase();
    if (!isAllowedCatalogText(name)) {
      setError("Nome da modalidade possui caractere especial. Corrija antes de salvar.");
      return;
    }
    try {
      await api(editingId ? `/employment-types/${editingId}` : "/employment-types", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ name, has_charges: draft.hasCharges, ...(editingId ? {} : { active: true }) })
      }, token);
      setDraft({ name: "", hasCharges: false });
      setEditingId(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao cadastrar"); }
  }

  async function toggle(item: EmploymentType) {
    try {
      await api(`/employment-types/${item.id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) }, token);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao alterar modalidade"); }
  }

  return <Catalog embedded={embedded} title="Modalidades de contratação" subtitle="Defina quais vínculos possuem encargos." error={error} form={user.role === "ADMIN" && selectedCompany.id !== 0 &&
    <form className="catalog-toolbar types-toolbar" onSubmit={submit}><label className="catalog-name">Nome da modalidade<input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value.toUpperCase() }))} placeholder="Ex.: CLT" required /></label><label className="check catalog-check"><input checked={draft.hasCharges} onChange={event => setDraft(current => ({ ...current, hasCharges: event.target.checked }))} type="checkbox" /> Possui encargos</label><button className="primary compact-button">{editingId ? "Salvar" : "+ Adicionar"}</button>{editingId && <button type="button" className="secondary compact-button" onClick={() => { setEditingId(null); setDraft({ name: "", hasCharges: false }); }}>Cancelar</button>}</form>}>
    {loading && <div className="inline-loading">Carregando...</div>}
    <p className="note">Empresa selecionada: <strong>{selectedCompany.name}</strong>.</p>
    {selectedCompany.id === 0 && <p className="note">Selecione uma empresa específica para cadastrar uma modalidade.</p>}
    {items.map(item => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.has_charges ? "Com encargos" : "Sem encargos"}</span><span className={item.active ? "status-pill status-active" : "status-pill status-inactive"}>{item.active ? "Ativa" : "Inativa"}</span>{user.role === "ADMIN" && selectedCompany.id !== 0 && <div className="actions"><button type="button" className="secondary" onClick={() => { setEditingId(item.id); setDraft({ name: item.name, hasCharges: item.has_charges }); }}>Editar</button><button type="button" className="secondary" onClick={() => void toggle(item)}>{item.active ? "Inativar" : "Ativar"}</button></div>}</div>)}
  </Catalog>;
}

function Catalog({ title, subtitle, error, form, children, embedded = false }: { title: string; subtitle: string; error: string; form: React.ReactNode; children: React.ReactNode; embedded?: boolean }) {
  return <>{!embedded && <div className="page-title compact-title"><div><span className="eyebrow">Cadastros</span><h1>{title}</h1><p>{subtitle}</p></div></div>}<ErrorMessage message={error} />{form && <div className="panel catalog-form-panel">{form}</div>}<div className="panel list catalog-list">{children}</div></>;
}

function isAllowedCatalogText(value: string) {
  return /^[0-9A-ZÀ-ÖØ-ÞÇÃÕÁÉÍÓÚÂÊÔÜ .,\/ºª-]+$/u.test(value);
}
