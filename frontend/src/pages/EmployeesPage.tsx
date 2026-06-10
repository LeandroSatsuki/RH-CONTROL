import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useDemoScope } from "../context/DemoScope";
import { Empty, ErrorMessage, SuccessMessage } from "../components/Feedback";
import { DemoEmployee } from "../mocks/demoTypes";
import { Employment, EmploymentType, ResultCenter, User } from "../types";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function EmployeesPage({ token, user }: { token: string; user: User }) {
  const { selectedCompany } = useDemoScope();
  const [items, setItems] = useState<DemoEmployee[]>([]);
  const [centers, setCenters] = useState<ResultCenter[]>([]);
  const [types, setTypes] = useState<EmploymentType[]>([]);
  const [selected, setSelected] = useState<DemoEmployee | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [centerFilter, setCenterFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [employees, resultCenters, employmentTypes] = await Promise.all([
        api<DemoEmployee[]>("/employees", {}, token),
        api<ResultCenter[]>("/result-centers", {}, token),
        api<EmploymentType[]>("/employment-types", {}, token)
      ]);
      setItems(employees);
      setCenters(resultCenters);
      setTypes(employmentTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar colaboradores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [token, selectedCompany.id]);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().replace(/\D/g, "");
    return items.filter(item => {
      const textMatch = !query || item.employee.full_name.toLowerCase().includes(query.toLowerCase()) || item.employee_code.toLowerCase().includes(query.toLowerCase()) || item.employee.cpf.includes(normalized);
      return textMatch
        && (!centerFilter || item.result_center.code === centerFilter)
        && (!typeFilter || item.employment_type.name === typeFilter)
        && (!statusFilter || item.status === statusFilter);
    });
  }, [centerFilter, items, query, statusFilter, typeFilter]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/employees", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }, token);
      setOpen(false);
      setSuccess("Colaborador cadastrado com sucesso.");
      void load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao cadastrar"); }
  }

  function restricted() {
    setError("Seu perfil possui acesso somente para consulta.");
  }

  function simulate(message: string, adminOnly = false) {
    if (adminOnly && user.role !== "ADMIN") return restricted();
    setSuccess(message);
  }

  return <>
    <div className="page-title">
      <div><span className="eyebrow">Pessoas</span><h1>Colaboradores</h1><p>Base completa de pessoas, vínculos e custos estimados.</p></div>
      <div className="actions">
        {user.role === "ADMIN" && <button className="primary" onClick={() => selectedCompany.id === 0 ? setError("Selecione uma empresa específica para cadastrar.") : setOpen(!open)}>{open ? "Cancelar" : "Novo colaborador"}</button>}
        {user.role === "ADMIN" && <button className="secondary" onClick={() => simulate("Importação simulada. Prévia disponível no módulo Importação.", true)}>Importar Excel</button>}
        <button className="secondary" onClick={() => simulate("Exportação gerada em modo demonstração.")}>Exportar</button>
      </div>
    </div>
    <ErrorMessage message={error} />
    <SuccessMessage message={success} />

    <div className="panel filters-panel">
      <input placeholder="Buscar por nome, CPF ou matrícula" value={query} onChange={event => setQuery(event.target.value)} />
      <select value={centerFilter} onChange={event => setCenterFilter(event.target.value)}><option value="">Todos os CRs</option>{centers.map(item => <option key={item.id}>{item.code}</option>)}</select>
      <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">Todas as modalidades</option>{types.map(item => <option key={item.id}>{item.name}</option>)}</select>
      <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Todos os status</option><option value="ACTIVE">Ativo</option><option value="ON_LEAVE">Afastado</option><option value="INACTIVE">Inativo</option></select>
    </div>
    <p className="note">Visualização da empresa <strong>{selectedCompany.name}</strong>.</p>

    {open && <form className="panel form-grid" onSubmit={submit}>
      <label>Nome completo<input name="full_name" required /></label>
      <label>CPF<input name="cpf" placeholder="000.000.000-00" required /></label>
      <label>Matrícula<input name="employee_code" required /></label>
      <label>Cargo / função<input name="job_title" required /></label>
      <label>Departamento<input name="department" /></label>
      <label>Data de admissão<input name="admission_date" type="date" required /></label>
      <label>Modalidade<select name="employment_type_id" required><option value="">Selecione</option>{types.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Centro de Resultado<select name="result_center_id" required><option value="">Selecione</option>{centers.map(item => <option value={item.id} key={item.id}>{item.code} - {item.name}</option>)}</select></label>
      <label>Salário base<input name="salary_base" type="number" step="100" defaultValue="4500" required /></label>
      <label>Banco<input name="bank_name" placeholder="Nome do banco" required /></label>
      <label>Agência<input name="bank_agency" placeholder="0001" required /></label>
      <label>Conta<input name="bank_account" placeholder="12345" required /></label>
      <label>Dígito da conta<input name="bank_account_digit" placeholder="0" required /></label>
      <label>Tipo PIX<select name="pix_key_type" required><option value="">Selecione</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Chave aleatória</option></select></label>
      <label className="span-2">Chave PIX<input name="pix_key" placeholder="Obrigatória" required /></label>
      <input name="status" type="hidden" value="ACTIVE" />
      <label className="span-2">Observações<textarea name="notes" rows={2} /></label>
      <button className="primary">Cadastrar colaborador</button>
    </form>}

    <div className="panel table-wrap">
      {loading && <div className="inline-loading">Carregando colaboradores...</div>}
      <table><thead><tr><th>Matrícula</th><th>Colaborador</th><th>CPF</th><th>Cargo</th><th>CR</th><th>Modalidade</th><th>Salário</th><th>Admissão</th><th>Status</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.id} onClick={() => setSelected(item)} className="clickable"><td>{item.employee_code}</td><td><strong>{item.employee.full_name}</strong></td><td>{formatCpf(item.employee.cpf)}</td><td>{item.job_title}</td><td><span className="color-dot" style={{ background: item.result_center.color }} />{item.result_center.code}</td><td>{item.employment_type.name}</td><td>{money.format(item.salary_base)}</td><td>{date(item.admission_date)}</td><td><span className="status">{statusLabel(item.status)}</span></td></tr>)}</tbody></table>
      {!filtered.length && !loading && <Empty>Nenhum colaborador encontrado.</Empty>}
    </div>

    {selected && <EmployeeDrawer
      employee={selected}
      token={token}
      user={user}
      onClose={() => setSelected(null)}
      onAction={simulate}
      onSaved={updated => {
        setSelected(updated);
        void load();
      }}
    />}
  </>;
}

function EmployeeDrawer({ employee, token, user, onClose, onAction, onSaved }: { employee: DemoEmployee; token: string; user: User; onClose: () => void; onAction: (message: string, adminOnly?: boolean) => void; onSaved: (employee: DemoEmployee) => void }) {
  const history = [...employee.salary_history].sort((a, b) => b.date.localeCompare(a.date));
  const currentFamilyAllowance = history[0]?.family_allowance ?? 0;
  const estimatedCost = (employee.salary_base + currentFamilyAllowance) * (employee.employment_type.has_charges ? 1.72 : 1.18);
  const [saving, setSaving] = useState(false);
  const [adjustError, setAdjustError] = useState("");
  const [adjustSuccess, setAdjustSuccess] = useState("");

  async function submitHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user.role !== "ADMIN") {
      onAction("Seu perfil possui acesso somente para consulta.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setAdjustError("");
    setAdjustSuccess("");
    try {
      const updated = await api<DemoEmployee>(`/employees/${employee.id}/salary-history`, {
        method: "POST",
        body: JSON.stringify({
          effective_date: form.get("effective_date"),
          amount: Number(form.get("amount")),
          family_allowance: Number(form.get("family_allowance") || 0),
          reason: form.get("reason")
        })
      }, token);
      onSaved(updated);
      setAdjustSuccess("Ajuste histórico registrado.");
      event.currentTarget.reset();
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : "Erro ao registrar ajuste");
    } finally {
      setSaving(false);
    }
  }
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer wide" onClick={event => event.stopPropagation()}>
    <button className="ghost right" onClick={onClose}>Fechar</button>
    <span className="eyebrow">{employee.employee_code}</span><h2>{employee.employee.full_name}</h2>
    <div className="drawer-actions">
      {user.role === "ADMIN" ? <>
        <button className="secondary" onClick={() => onAction("Edição simulada em modo demonstração.", true)}>Editar</button>
        <button className="secondary" onClick={() => onAction("Colaborador inativado em simulação.", true)}>Inativar</button>
        <button className="secondary" onClick={() => onAction("Transferência de CR simulada.", true)}>Transferir CR</button>
        <button className="secondary" onClick={() => onAction("Salário atualizado no histórico em modo demo.", true)}>Atualizar salário</button>
      </> : <button className="secondary" onClick={() => onAction("Seu perfil possui acesso somente para consulta.")}>Solicitar alteração</button>}
    </div>
    <div className="detail-grid">
      <Info label="CPF" value={formatCpf(employee.employee.cpf)} />
      <Info label="E-mail" value={employee.email} />
      <Info label="Telefone" value={employee.phone} />
      <Info label="Centro atual" value={`${employee.result_center.code} - ${employee.result_center.name}`} />
      <Info label="Modalidade" value={employee.employment_type.name} />
      <Info label="Custo estimado do mês" value={money.format(estimatedCost)} />
      <Info label="Salário-família atual" value={money.format(currentFamilyAllowance)} />
      <Info label="Banco" value={employee.bank_name} />
      <Info label="Agência / conta" value={`${employee.bank_agency} / ${employee.bank_account}-${employee.bank_account_digit}`} />
      <Info label="PIX" value={`${employee.pix_key_type}: ${employee.pix_key}`} />
    </div>
    {user.role === "ADMIN" && <form className="panel form-grid compact" onSubmit={submitHistory}>
      <label>Data de vigência<input name="effective_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      <label>Atualizar salário<input name="amount" type="number" step="0.01" min="0" required defaultValue={employee.salary_base} /></label>
      <label>Salário-família<input name="family_allowance" type="number" step="0.01" min="0" defaultValue={currentFamilyAllowance} /></label>
      <label className="span-2">Motivo<input name="reason" defaultValue="Ajuste histórico" required /></label>
      <button className="primary" disabled={saving}>{saving ? "Salvando..." : "Atualizar salário"}</button>
      {adjustError && <p className="error-line span-2">{adjustError}</p>}
      {adjustSuccess && <p className="success-line span-2">{adjustSuccess}</p>}
    </form>}
    <Section title="Férias" items={employee.vacations.map(item => `${item.period} - ${item.status}`)} />
    <Section title="Afastamentos" items={employee.leaves.length ? employee.leaves.map(item => `${item.period} - ${item.reason} (${item.days} dias)`) : ["Nenhum afastamento ativo"]} />
    <Section title="Históricos Salariais" items={history.map(item => `${date(item.date)} - ${money.format(item.amount)} + família ${money.format(item.family_allowance)} (${item.reason})`)} />
    <Section title="Histórico de Movimentos" items={employee.movement_history.map(item => `${date(item.date)} - ${item.description}`)} />
  </aside></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="summary-card"><span>{label}</span><strong>{value}</strong></div>;
}

function Section({ title, items }: { title: string; items: string[] }) {
  return <div className="drawer-section"><h3>{title}</h3>{items.map(item => <p key={item}>{item}</p>)}</div>;
}

function formatCpf(cpf: string) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function date(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function statusLabel(status: Employment["status"]) {
  return { ACTIVE: "Ativo", INACTIVE: "Inativo", ON_LEAVE: "Afastado" }[status];
}
