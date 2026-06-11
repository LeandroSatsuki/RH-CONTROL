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
    const form = new FormData(event.currentTarget);
    try {
      await api("/result-centers", { method: "POST", body: JSON.stringify({ code: form.get("code"), name: form.get("name"), color: form.get("color"), active: true }) }, token);
      event.currentTarget.reset();
      void load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao cadastrar"); }
  }

  return <Catalog embedded={embedded} title="Centros de Resultado" subtitle="Áreas usadas para segmentar pessoas e custos." error={error} form={user.role === "ADMIN" &&
    <form className="inline-form" onSubmit={submit}><input name="code" placeholder="Código" required /><input name="name" placeholder="Nome" required /><input name="color" type="color" defaultValue="#2563eb" /><button className="primary">Adicionar</button></form>}>
    {loading && <div className="inline-loading">Carregando...</div>}
    <p className="note">Empresa selecionada: <strong>{selectedCompany.name}</strong>.</p>
    {items.map(item => <div className="list-row" key={item.id}><span className="color-dot" style={{ background: item.color }} /><strong>{item.code}</strong><span>{item.name}</span><span className="status-pill status-active">Ativo</span></div>)}
    {!items.length && !loading && <Empty>Nenhum Centro de Resultado cadastrado.</Empty>}
  </Catalog>;
}

export function TypesPage({ token, user, embedded = false }: { token: string; user: User; embedded?: boolean }) {
  const { selectedCompany } = useDemoScope();
  const [items, setItems] = useState<EmploymentType[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
    const form = new FormData(event.currentTarget);
    try {
      await api("/employment-types", { method: "POST", body: JSON.stringify({ name: form.get("name"), has_charges: form.get("has_charges") === "on", active: true }) }, token);
      event.currentTarget.reset();
      void load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao cadastrar"); }
  }

  return <Catalog embedded={embedded} title="Modalidades de contratação" subtitle="Defina quais vínculos possuem encargos." error={error} form={user.role === "ADMIN" &&
    <form className="inline-form" onSubmit={submit}><input name="name" placeholder="Nome da modalidade" required /><label className="check"><input name="has_charges" type="checkbox" /> Possui encargos</label><button className="primary">Adicionar</button></form>}>
    {loading && <div className="inline-loading">Carregando...</div>}
    <p className="note">Empresa selecionada: <strong>{selectedCompany.name}</strong>.</p>
    {items.map(item => <div className="list-row" key={item.id}><strong>{item.name}</strong><span>{item.has_charges ? "Com encargos" : "Sem encargos"}</span><span className="status-pill status-active">Ativa</span></div>)}
  </Catalog>;
}

function Catalog({ title, subtitle, error, form, children, embedded = false }: { title: string; subtitle: string; error: string; form: React.ReactNode; children: React.ReactNode; embedded?: boolean }) {
  return <>{!embedded && <div className="page-title"><div><span className="eyebrow">Cadastros</span><h1>{title}</h1><p>{subtitle}</p></div></div>}<ErrorMessage message={error} />{form && <div className="panel">{form}</div>}<div className="panel list">{children}</div></>;
}
