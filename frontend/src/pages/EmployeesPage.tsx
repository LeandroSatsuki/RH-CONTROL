import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useDemoScope } from "../context/DemoScope";
import { Empty, ErrorMessage, SuccessMessage } from "../components/Feedback";
import { DemoEmployee, DemoSettings } from "../mocks/demoTypes";
import { demoSettings } from "../mocks/demoData";
import { Employment, EmploymentType, ResultCenter, User } from "../types";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface EmployeeDraft {
  full_name: string;
  cpf_cnpj: string;
  admission_date: string;
  supervisor_name: string;
  job_title: string;
  result_center_id: string;
  employment_type_id: string;
  salary_base: string;
  cep: string;
  street: string;
  address_number: string;
  neighborhood: string;
  city: string;
  state: string;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  bank_account_digit: string;
  pix_key_type: string;
  pix_key: string;
  notes: string;
}

function createEmployeeDraft(settings: DemoSettings | null, centers: ResultCenter[], types: EmploymentType[]): EmployeeDraft {
  return {
    full_name: "",
    cpf_cnpj: "",
    admission_date: new Date().toISOString().slice(0, 10),
    supervisor_name: "",
    job_title: settings?.job_titles?.[0] ?? demoSettings.job_titles[0] ?? "",
    result_center_id: String(centers[0]?.id ?? ""),
    employment_type_id: String(types[0]?.id ?? ""),
    salary_base: "4500",
    cep: "",
    street: "",
    address_number: "",
    neighborhood: "",
    city: "",
    state: "",
    bank_name: "",
    bank_agency: "",
    bank_account: "",
    bank_account_digit: "",
    pix_key_type: "",
    pix_key: "",
    notes: ""
  };
}

export function EmployeesPage({ token, user }: { token: string; user: User }) {
  const { selectedCompany } = useDemoScope();
  const [items, setItems] = useState<DemoEmployee[]>([]);
  const [centers, setCenters] = useState<ResultCenter[]>([]);
  const [types, setTypes] = useState<EmploymentType[]>([]);
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  const [selected, setSelected] = useState<DemoEmployee | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [centerFilter, setCenterFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<EmployeeDraft>(() => createEmployeeDraft(selectedCompany.settings ?? demoSettings, [], []));
  const [addressLocked, setAddressLocked] = useState(false);
  const [cepStatus, setCepStatus] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [employees, resultCenters, employmentTypes, systemSettings] = await Promise.all([
        api<DemoEmployee[]>("/employees", {}, token),
        api<ResultCenter[]>("/result-centers", {}, token),
        api<EmploymentType[]>("/employment-types", {}, token),
        api<DemoSettings>("/demo/settings", {}, token)
      ]);
      setItems(employees);
      setCenters(resultCenters);
      setTypes(employmentTypes);
      setSettings(systemSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar colaboradores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [token, selectedCompany.id]);
  useEffect(() => {
    if (!open || !centers.length || !types.length) return;
    setDraft(createEmployeeDraft(settings ?? selectedCompany.settings ?? demoSettings, centers, types));
    setAddressLocked(false);
    setCepStatus("");
  }, [open, centers, types, settings, selectedCompany.settings]);

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

  const jobTitleOptions = settings?.job_titles?.length ? settings.job_titles : demoSettings.job_titles;
  const supervisorOptions = useMemo(() => items
    .filter(item => item.status !== "INACTIVE" && normalizeText(item.job_title).includes("supervisor"))
    .map(item => item.employee.full_name)
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, "pt-BR")), [items]);
  const selectedCenter = centers.find(item => item.id === Number(draft.result_center_id)) ?? centers[0] ?? null;
  const generatedEmployeeCode = useMemo(() => {
    if (!selectedCenter) return "";
    const prefix = selectedCenter.code;
    const lastNumber = items
      .filter(item => item.company_id === selectedCompany.id && item.employee_code.startsWith(`${prefix}-`))
      .map(item => Number(item.employee_code.split("-")[1] ?? 0))
      .filter(value => Number.isFinite(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `${prefix}-${String(lastNumber + 1).padStart(3, "0")}`;
  }, [items, selectedCenter, selectedCompany.id]);

  const cpfDigits = draft.cpf_cnpj.replace(/\D/g, "");
  const documentMessage = useMemo(() => validateCpfCnpj(cpfDigits, items), [cpfDigits, items]);
  const pixMessage = useMemo(() => validatePixKey(draft.pix_key_type, draft.pix_key), [draft.pix_key, draft.pix_key_type]);
  const cepMessage = cepStatus;
  const canSubmit = Boolean(draft.full_name.trim())
    && Boolean(documentMessage === "")
    && Boolean(pixMessage === "")
    && Boolean(draft.job_title.trim())
    && Boolean(draft.result_center_id)
    && Boolean(draft.employment_type_id)
    && Boolean(draft.cep.replace(/\D/g, "").length === 8)
    && Boolean(draft.pix_key_type)
    && Boolean(generatedEmployeeCode)
    && cepStatus !== "Buscando endereço...";

  useEffect(() => {
    if (!open) return;
    const cepDigits = draft.cep.replace(/\D/g, "");
    if (cepDigits.length !== 8) {
      setCepStatus("");
      setAddressLocked(false);
      return;
    }
    let active = true;
    setCepStatus("Buscando endereço...");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const data = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
        if (!active) return;
        if (data.erro) {
          setCepStatus("CEP não encontrado.");
          setAddressLocked(false);
          return;
        }
        setDraft(current => ({
          ...current,
          cep: cepDigits,
          street: data.logradouro ?? current.street,
          neighborhood: data.bairro ?? current.neighborhood,
          city: data.localidade ?? current.city,
          state: data.uf ?? current.state
        }));
        setAddressLocked(true);
        setCepStatus(`Endereço carregado automaticamente para ${data.localidade}/${data.uf}.`);
      } catch {
        if (!active) return;
        setCepStatus("Não foi possível consultar o CEP agora.");
        setAddressLocked(false);
      }
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draft.cep, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setError(documentMessage || pixMessage || "Preencha os campos obrigatórios corretamente.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const benefits = form.getAll("benefits").map(String);
    try {
      await api("/employees", {
        method: "POST",
        body: JSON.stringify({
          full_name: draft.full_name,
          cpf: cpfDigits,
          employee_code: generatedEmployeeCode,
          admission_date: draft.admission_date,
          supervisor_name: draft.supervisor_name,
          job_title: draft.job_title,
          employment_type_id: draft.employment_type_id,
          result_center_id: draft.result_center_id,
          salary_base: Number(draft.salary_base || 0),
          cep: draft.cep.replace(/\D/g, ""),
          street: draft.street,
          address_number: draft.address_number,
          neighborhood: draft.neighborhood,
          city: draft.city,
          state: draft.state,
          bank_name: draft.bank_name,
          bank_agency: draft.bank_agency,
          bank_account: draft.bank_account,
          bank_account_digit: draft.bank_account_digit,
          pix_key_type: draft.pix_key_type,
          pix_key: draft.pix_key,
          notes: draft.notes,
          benefits
        })
      }, token);
      setOpen(false);
      setSuccess("Colaborador cadastrado com sucesso.");
      setDraft(createEmployeeDraft(settings ?? selectedCompany.settings ?? demoSettings, centers, types));
      setAddressLocked(false);
      setCepStatus("");
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
      <h3 className="span-2 form-section-title">Identificação</h3>
      <label>Nome completo<input value={draft.full_name} onChange={event => setDraft(current => ({ ...current, full_name: event.target.value }))} required /></label>
      <label>CPF/CNPJ<input
        className={documentMessage ? "input-invalid" : ""}
        value={draft.cpf_cnpj}
        onChange={event => setDraft(current => ({ ...current, cpf_cnpj: event.target.value.replace(/\D/g, "") }))}
        placeholder="00000000000 ou 00000000000000"
        maxLength={14}
        inputMode="numeric"
        required
        aria-invalid={Boolean(documentMessage)}
      /></label>
      <label>Matrícula<input value={generatedEmployeeCode} readOnly /></label>
      <label>Data de admissão<input value={draft.admission_date} onChange={event => setDraft(current => ({ ...current, admission_date: event.target.value }))} type="date" required /></label>
      <label>Centro de Resultado<select value={draft.result_center_id} onChange={event => setDraft(current => ({ ...current, result_center_id: event.target.value }))} required><option value="">Selecione</option>{centers.map(item => <option value={item.id} key={item.id}>{item.code} - {item.name}</option>)}</select></label>
      <label>Cargo / função<select value={draft.job_title} onChange={event => setDraft(current => ({ ...current, job_title: event.target.value }))} required><option value="">Selecione</option>{jobTitleOptions.map(title => <option key={title} value={title}>{title}</option>)}</select></label>
      <label>Supervisor<select value={draft.supervisor_name} onChange={event => setDraft(current => ({ ...current, supervisor_name: event.target.value }))}><option value="">Selecione</option>{supervisorOptions.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <label>Modalidade<select value={draft.employment_type_id} onChange={event => setDraft(current => ({ ...current, employment_type_id: event.target.value }))} required><option value="">Selecione</option>{types.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Salário base<input value={draft.salary_base} onChange={event => setDraft(current => ({ ...current, salary_base: event.target.value }))} type="number" step="100" required /></label>
      <h3 className="span-2 form-section-title">Endereço</h3>
      <label className="span-2">CEP<input value={draft.cep} onChange={event => setDraft(current => ({ ...current, cep: event.target.value.replace(/\D/g, "") }))} placeholder="00000000" maxLength={8} inputMode="numeric" required /></label>
      <label className="span-2">Rua<input value={draft.street} onChange={event => setDraft(current => ({ ...current, street: event.target.value }))} placeholder="Logradouro" readOnly={addressLocked} /></label>
      <label>Número<input value={draft.address_number} onChange={event => setDraft(current => ({ ...current, address_number: event.target.value }))} placeholder="123" /></label>
      <label>Bairro<input value={draft.neighborhood} onChange={event => setDraft(current => ({ ...current, neighborhood: event.target.value }))} placeholder="Centro" readOnly={addressLocked} /></label>
      <label>Cidade<input value={draft.city} onChange={event => setDraft(current => ({ ...current, city: event.target.value }))} placeholder="São Paulo" readOnly={addressLocked} /></label>
      <label>UF<input value={draft.state} onChange={event => setDraft(current => ({ ...current, state: event.target.value.toUpperCase().slice(0, 2) }))} maxLength={2} placeholder="SP" readOnly={addressLocked} /></label>
      <h3 className="span-2 form-section-title">Dados bancários</h3>
      <label>Banco<input value={draft.bank_name} onChange={event => setDraft(current => ({ ...current, bank_name: event.target.value }))} placeholder="Nome do banco" required /></label>
      <label>Agência<input value={draft.bank_agency} onChange={event => setDraft(current => ({ ...current, bank_agency: event.target.value }))} placeholder="0001" required /></label>
      <label>Conta<input value={draft.bank_account} onChange={event => setDraft(current => ({ ...current, bank_account: event.target.value }))} placeholder="12345" required /></label>
      <label>Dígito da conta<input value={draft.bank_account_digit} onChange={event => setDraft(current => ({ ...current, bank_account_digit: event.target.value.replace(/\D/g, "").slice(0, 1) }))} placeholder="0" required /></label>
      <label>Tipo PIX<select value={draft.pix_key_type} onChange={event => setDraft(current => ({ ...current, pix_key_type: event.target.value, pix_key: "" }))} required><option value="">Selecione</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Chave aleatória</option></select></label>
      <label className="span-2">Chave PIX<input
        className={pixMessage ? "input-invalid" : ""}
        value={draft.pix_key}
        onChange={event => setDraft(current => {
          const nextValue = sanitizePixKey(current.pix_key_type, event.target.value);
          return { ...current, pix_key: nextValue };
        })}
        placeholder={pixPlaceholder(draft.pix_key_type)}
        inputMode={draft.pix_key_type === "EMAIL" || draft.pix_key_type === "RANDOM" ? "text" : "numeric"}
        maxLength={pixMaxLength(draft.pix_key_type)}
        required
        aria-invalid={Boolean(pixMessage)}
      /></label>
      <fieldset className="span-2 benefits-fieldset">
        <legend>Benefícios</legend>
        <label className="check"><input name="benefits" type="checkbox" value="Vale transporte" /> Vale transporte</label>
        <label className="check"><input name="benefits" type="checkbox" value="Alimentação" /> Alimentação</label>
        <label className="check"><input name="benefits" type="checkbox" value="Plano de saúde" /> Plano de saúde</label>
        <label className="check"><input name="benefits" type="checkbox" value="Seguro de vida" /> Seguro de vida</label>
      </fieldset>
      <label className="span-2">Observações<textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} rows={2} /></label>
      <div className="span-2 field-feedback-group">
        <p className={`field-feedback ${documentMessage ? "error" : "success"}`}>{documentMessage || "Documento válido."}</p>
        {cepStatus && <p className={`field-feedback ${cepStatus.startsWith("CEP não") ? "error" : "success"}`}>{cepStatus}</p>}
        <p className={`field-feedback ${pixMessage ? "error" : "success"}`}>{pixMessage || "Chave PIX válida."}</p>
      </div>
      <button className="primary" disabled={!canSubmit}>Cadastrar colaborador</button>
    </form>}

    <div className="panel table-wrap">
      {loading && <div className="inline-loading">Carregando colaboradores...</div>}
      <table><thead><tr><th>Matrícula</th><th>Colaborador</th><th>CPF/CNPJ</th><th>Cargo</th><th>CR</th><th>Modalidade</th><th>Salário</th><th>Admissão</th><th>Status</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.id} onClick={() => setSelected(item)} className="clickable"><td>{item.employee_code}</td><td><strong>{item.employee.full_name}</strong></td><td>{formatDocument(item.employee.cpf)}</td><td>{item.job_title}</td><td><span className="color-dot" style={{ background: item.result_center.color }} />{item.result_center.code}</td><td>{item.employment_type.name}</td><td>{money.format(item.salary_base)}</td><td>{date(item.admission_date)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td></tr>)}</tbody></table>
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
  const estimatedCost = employee.salary_base * (employee.employment_type.has_charges ? 1.72 : 1.18);
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
      <Info label="CPF/CNPJ" value={formatDocument(employee.employee.cpf)} />
      <Info label="E-mail" value={employee.email} />
      <Info label="Telefone" value={employee.phone} />
      <Info label="Supervisor" value={employee.supervisor_name || "-"} />
      <Info label="Centro atual" value={`${employee.result_center.code} - ${employee.result_center.name}`} />
      <Info label="Modalidade" value={employee.employment_type.name} />
      <Info label="Custo estimado do mês" value={money.format(estimatedCost)} />
      <Info label="Endereço" value={[employee.street, employee.address_number, employee.neighborhood, employee.city, employee.state].filter(Boolean).join(", ") || "-"} />
      <Info label="Banco" value={employee.bank_name} />
      <Info label="Agência / conta" value={`${employee.bank_agency} / ${employee.bank_account}-${employee.bank_account_digit}`} />
      <Info label="PIX" value={`${employee.pix_key_type}: ${employee.pix_key}`} />
      <Info label="Benefícios" value={(employee.benefits ?? []).length ? (employee.benefits ?? []).join(", ") : "Nenhum"} />
    </div>
    <Section title="Férias" items={employee.vacations.map(item => `${item.period} - ${item.status}`)} />
    <Section title="Afastamentos" items={employee.leaves.length ? employee.leaves.map(item => `${item.period} - ${item.reason} (${item.days} dias)`) : ["Nenhum afastamento ativo"]} />
    <Section title="Históricos Salariais" items={history.map(item => `${date(item.date)} - ${money.format(item.amount)} (${item.reason})`)} />
    <Section title="Histórico de Movimentos" items={employee.movement_history.map(item => `${date(item.date)} - ${item.description}`)} />
  </aside></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="summary-card"><span>{label}</span><strong>{value}</strong></div>;
}

function Section({ title, items }: { title: string; items: string[] }) {
  return <div className="drawer-section"><h3>{title}</h3>{items.map(item => <p key={item}>{item}</p>)}</div>;
}

function date(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function statusLabel(status: Employment["status"]) {
  return { ACTIVE: "Ativo", INACTIVE: "Inativo", ON_LEAVE: "Afastado" }[status];
}

function statusClass(status: Employment["status"]) {
  return {
    ACTIVE: "status-pill status-active",
    INACTIVE: "status-pill status-inactive",
    ON_LEAVE: "status-pill status-leave"
  }[status];
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function validateCpfCnpj(value: string, employees: DemoEmployee[]) {
  if (!value) return "Informe um CPF ou CNPJ.";
  if (value.length !== 11 && value.length !== 14) return "CPF/CNPJ deve ter 11 ou 14 dígitos.";
  const duplicate = employees.find(item => item.employee.cpf.replace(/\D/g, "") === value);
  if (duplicate) return `Documento já cadastrado para ${duplicate.employee.full_name}.`;
  return "";
}

function validatePixKey(type: string, value: string) {
  if (!type) return "Selecione o tipo de PIX.";
  if (!value) return "Informe a chave PIX.";
  if (type === "CPF") return value.replace(/\D/g, "").length === 11 ? "" : "PIX CPF deve ter 11 dígitos.";
  if (type === "CNPJ") return value.replace(/\D/g, "").length === 14 ? "" : "PIX CNPJ deve ter 14 dígitos.";
  if (type === "EMAIL") return /.+@.+\..+/.test(value) ? "" : "PIX e-mail precisa conter @.";
  if (type === "PHONE") return value.replace(/\D/g, "").length >= 10 ? "" : "PIX telefone precisa ter DDD.";
  return value.trim().length ? "" : "Informe a chave aleatória.";
}

function sanitizePixKey(type: string, value: string) {
  if (type === "CPF" || type === "CNPJ" || type === "PHONE") return value.replace(/\D/g, "");
  return value;
}

function pixPlaceholder(type: string) {
  return {
    CPF: "00000000000",
    CNPJ: "00000000000000",
    EMAIL: "nome@dominio.com",
    PHONE: "11999999999",
    RANDOM: "Chave aleatória"
  }[type] ?? "Obrigatória";
}

function pixMaxLength(type: string) {
  return {
    CPF: 11,
    CNPJ: 14,
    EMAIL: 80,
    PHONE: 11,
    RANDOM: 80
  }[type] ?? 80;
}

function formatDocument(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return value;
}
