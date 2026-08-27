import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { downloadExcel, readFirstExcelSheet } from "../excel";
import { useDemoScope } from "../context/DemoScope";
import { Empty, ErrorMessage, SuccessMessage } from "../components/Feedback";
import { DeleteConfirmationModal } from "../components/DeleteConfirmationModal";
import { EmployeeImportReport } from "../components/EmployeeImportReport";
import { DemoEmployee, DemoSettings } from "../mocks/demoTypes";
import { demoSettings } from "../mocks/demoData";
import { Employment, EmploymentType, ResultCenter, User } from "../types";
import { buildEmployeeImportTemplateRow, createEmployeeImportApiIssue, EmployeeImportIssue, normalizeEmployeeText, validateEmployeeImportRows } from "../employeeImport";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface EmployeeDraft {
  company_id: string;
  full_name: string;
  cpf_cnpj: string;
  admission_date: string;
  email: string;
  phone: string;
  supervisor_name: string;
  job_title: string;
  result_center_id: string;
  employment_type_id: string;
  salary_base: string;
  gratification: string;
  cost_aid: string;
  benefits: string[];
  cep: string;
  street: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  bank_code: string;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  bank_account_digit: string;
  pix_key_type: string;
  pix_key: string;
  notes: string;
}

function createEmployeeDraft(settings: DemoSettings | null, centers: ResultCenter[], types: EmploymentType[], companyId: number): EmployeeDraft {
  const companyCenters = centers.filter(item => item.company_id === companyId && item.active);
  const companyTypes = types.filter(item => item.company_id === companyId && item.active);
  return {
    company_id: String(companyId || ""),
    full_name: "",
    cpf_cnpj: "",
    admission_date: new Date().toISOString().slice(0, 10),
    email: "",
    phone: "",
    supervisor_name: "",
    job_title: settings?.job_titles?.[0] ?? demoSettings.job_titles[0] ?? "",
    result_center_id: String(companyCenters[0]?.id ?? ""),
    employment_type_id: String(companyTypes[0]?.id ?? ""),
    salary_base: "0",
    gratification: "0",
    cost_aid: "0",
    benefits: [],
    cep: "",
    street: "",
    address_number: "",
    address_complement: "",
    neighborhood: "",
    city: "",
    state: "",
    bank_code: "",
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
  const { companies, selectedCompany } = useDemoScope();
  const selectableCompanies = useMemo(() => companies.filter(company => company.id !== 0 && company.active), [companies]);
  const defaultCompanyId = selectedCompany.id !== 0 ? selectedCompany.id : selectableCompanies[0]?.id ?? 0;
  const [items, setItems] = useState<DemoEmployee[]>([]);
  const [employeeDirectory, setEmployeeDirectory] = useState<DemoEmployee[]>([]);
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
  const [importIssues, setImportIssues] = useState<EmployeeImportIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<EmployeeDraft>(() => createEmployeeDraft(selectedCompany.settings ?? demoSettings, [], [], defaultCompanyId));
  const [addressLocked, setAddressLocked] = useState(false);
  const [cepStatus, setCepStatus] = useState("");
  const [quickJobOpen, setQuickJobOpen] = useState(false);
  const [quickJobTitle, setQuickJobTitle] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const [cnpjStatus, setCnpjStatus] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const employeeDraftKey = `nexo-employee-draft-v1:${user.username}`;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [employees, directory, resultCenters, employmentTypes, systemSettings] = await Promise.all([
        api<DemoEmployee[]>(`/employees?company_id=${selectedCompany.id}`, {}, token),
        api<DemoEmployee[]>("/employees?company_id=0", {}, token),
        api<ResultCenter[]>("/result-centers?company_id=0", {}, token),
        api<EmploymentType[]>("/employment-types?company_id=0", {}, token),
        api<DemoSettings>("/demo/settings", {}, token)
      ]);
      setItems(employees);
      setEmployeeDirectory(directory);
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
    if (!open) {
      setDraftLoaded(false);
      return;
    }
    if (draftLoaded || !centers.length || !types.length) return;
    const emptyDraft = createEmployeeDraft(settings ?? selectedCompany.settings ?? demoSettings, centers, types, defaultCompanyId);
    try {
      const saved = JSON.parse(window.localStorage.getItem(employeeDraftKey) ?? "null") as Partial<EmployeeDraft> | null;
      const savedCompanyId = Number(saved?.company_id);
      const companyId = selectableCompanies.some(company => company.id === savedCompanyId) ? savedCompanyId : defaultCompanyId;
      const companyCenters = centers.filter(item => item.company_id === companyId && item.active);
      const companyTypes = types.filter(item => item.company_id === companyId && item.active);
      const savedCenterId = Number(saved?.result_center_id);
      const savedTypeId = Number(saved?.employment_type_id);
      setDraft({
        ...emptyDraft,
        ...(saved ?? {}),
        company_id: String(companyId || ""),
        result_center_id: String(companyCenters.some(item => item.id === savedCenterId) ? savedCenterId : companyCenters[0]?.id ?? ""),
        employment_type_id: String(companyTypes.some(item => item.id === savedTypeId) ? savedTypeId : companyTypes[0]?.id ?? "")
      });
    } catch {
      window.localStorage.removeItem(employeeDraftKey);
      setDraft(emptyDraft);
    }
    setAddressLocked(false);
    setCepStatus("");
    setCnpjStatus("");
    setDraftLoaded(true);
  }, [centers, defaultCompanyId, draftLoaded, employeeDraftKey, open, selectableCompanies, selectedCompany.settings, settings, types]);

  useEffect(() => {
    if (!open || !draftLoaded) return;
    window.localStorage.setItem(employeeDraftKey, JSON.stringify(draft));
  }, [draft, draftLoaded, employeeDraftKey, open]);

  const filtered = useMemo(() => {
    const normalized = query.replace(/\D/g, "");
    return items.filter(item => {
      const textMatch = !query || item.employee.full_name.toLowerCase().includes(query.toLowerCase()) || item.employee_code.toLowerCase().includes(query.toLowerCase()) || Boolean(normalized && item.employee.cpf.includes(normalized));
      return textMatch
        && (!centerFilter || item.result_center.code === centerFilter)
        && (!typeFilter || item.employment_type.name === typeFilter)
        && (!statusFilter || item.status === statusFilter);
    });
  }, [centerFilter, items, query, selectedCompany.id, statusFilter, typeFilter]);

  const jobTitleOptions = useMemo(() => [...(settings?.job_titles?.length ? settings.job_titles : demoSettings.job_titles)]
    .map(title => title.trim().toUpperCase())
    .filter(Boolean)
    .filter((title, index, array) => array.indexOf(title) === index)
    .sort((a, b) => a.localeCompare(b, "pt-BR")), [settings?.job_titles]);
  const draftCompanyId = Number(draft.company_id);
  const companyCenters = useMemo(() => centers.filter(item => item.company_id === draftCompanyId && item.active), [centers, draftCompanyId]);
  const companyTypes = useMemo(() => types.filter(item => item.company_id === draftCompanyId && item.active), [types, draftCompanyId]);
  const filterCenters = useMemo(() => distinctCatalog(centers.filter(item => selectedCompany.id === 0 || item.company_id === selectedCompany.id), item => item.code), [centers, selectedCompany.id]);
  const filterTypes = useMemo(() => distinctCatalog(types.filter(item => selectedCompany.id === 0 || item.company_id === selectedCompany.id), item => item.name), [selectedCompany.id, types]);
  const draftSupervisorOptions = useMemo(() => items
    .filter(item => item.company_id === draftCompanyId && item.status !== "INACTIVE" && normalizeText(item.job_title).includes("supervisor"))
    .map(item => item.employee.full_name)
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, "pt-BR")), [draftCompanyId, items]);
  const selectedCenter = companyCenters.find(item => item.id === Number(draft.result_center_id)) ?? companyCenters[0] ?? null;
  const generatedEmployeeCode = useMemo(() => {
    if (!selectedCenter) return "";
    const prefix = selectedCenter.code;
    const lastNumber = items
      .filter(item => item.company_id === draftCompanyId && item.employee_code.startsWith(`${prefix}-`))
      .map(item => Number(item.employee_code.split("-")[1] ?? 0))
      .filter(value => Number.isFinite(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `${prefix}-${String(lastNumber + 1).padStart(3, "0")}`;
  }, [draftCompanyId, items, selectedCenter]);

  const cpfDigits = draft.cpf_cnpj.replace(/\D/g, "");
  const documentMessage = useMemo(() => validateCpfCnpj(cpfDigits, employeeDirectory, companies), [companies, cpfDigits, employeeDirectory]);
  const pixMessage = useMemo(() => validatePixKey(draft.pix_key_type, draft.pix_key), [draft.pix_key, draft.pix_key_type]);
  const textMessage = useMemo(() => validateEmployeeText(draft), [draft]);
  const cepMessage = cepStatus;
  const bankNameFromCode = bankNameByCode(draft.bank_code);
  const bankMessage = draft.bank_code && draft.bank_code.length === 3
    ? bankNameFromCode ? `Banco identificado: ${bankNameFromCode}.` : "Código bancário não mapeado. Informe o nome manualmente."
    : "";
  const canSubmit = Boolean(draft.full_name.trim())
    && Boolean(draftCompanyId)
    && Boolean(documentMessage === "")
    && Boolean(pixMessage === "")
    && Boolean(draft.job_title.trim())
    && Boolean(draft.result_center_id)
    && Boolean(draft.employment_type_id)
    && Boolean(draft.cep.replace(/\D/g, "").length === 8)
    && Boolean(draft.pix_key_type)
    && Boolean(generatedEmployeeCode)
    && Boolean(textMessage === "")
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
          street: normalizeEmployeeText(data.logradouro ?? current.street),
          neighborhood: normalizeEmployeeText(data.bairro ?? current.neighborhood),
          city: normalizeEmployeeText(data.localidade ?? current.city),
          state: upperText(data.uf ?? current.state)
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

  async function lookupCnpj() {
    if (cpfDigits.length !== 14 || !isValidCnpj(cpfDigits)) return;
    setCnpjStatus("Consultando CNPJ...");
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cpfDigits}`);
      if (!response.ok) throw new Error("CNPJ não encontrado");
      const data = await response.json() as {
        razao_social?: string; cep?: string; logradouro?: string; numero?: string;
        complemento?: string; bairro?: string; municipio?: string; uf?: string;
      };
      setDraft(current => ({
        ...current,
        full_name: normalizeEmployeeText(data.razao_social || current.full_name),
        cep: (data.cep || current.cep).replace(/\D/g, ""),
        street: normalizeEmployeeText(data.logradouro || current.street),
        address_number: data.numero || current.address_number,
        address_complement: normalizeEmployeeText(data.complemento || current.address_complement),
        neighborhood: normalizeEmployeeText(data.bairro || current.neighborhood),
        city: normalizeEmployeeText(data.municipio || current.city),
        state: (data.uf || current.state).toUpperCase().slice(0, 2)
      }));
      setAddressLocked(Boolean(data.logradouro || data.municipio));
      setCnpjStatus("Dados do CNPJ carregados. Revise os campos antes de concluir.");
    } catch {
      setCnpjStatus("Não foi possível consultar este CNPJ agora. Preencha os dados manualmente.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setError(documentMessage || pixMessage || textMessage || "Preencha os campos obrigatórios corretamente.");
      return;
    }
    try {
      await api(`/employees?company_id=${draftCompanyId}`, {
        method: "POST",
        body: JSON.stringify({
          company_id: draftCompanyId,
          full_name: draft.full_name,
          cpf: cpfDigits,
          employee_code: generatedEmployeeCode,
          admission_date: draft.admission_date,
          email: draft.email,
          phone: draft.phone,
          supervisor_name: draft.supervisor_name,
          job_title: draft.job_title,
          employment_type_id: draft.employment_type_id,
          result_center_id: draft.result_center_id,
          salary_base: Number(draft.salary_base || 0),
          gratification: Number(draft.gratification || 0),
          cost_aid: draft.benefits.includes("Ajuda de custo") ? Number(draft.cost_aid || 0) : 0,
          cep: draft.cep.replace(/\D/g, ""),
          street: draft.street,
          address_number: draft.address_number,
          address_complement: draft.address_complement,
          neighborhood: draft.neighborhood,
          city: draft.city,
          state: draft.state,
          bank_code: draft.bank_code,
          bank_name: draft.bank_name,
          bank_agency: draft.bank_agency,
          bank_account: draft.bank_account,
          bank_account_digit: draft.bank_account_digit,
          pix_key_type: draft.pix_key_type,
          pix_key: draft.pix_key,
          notes: draft.notes,
          benefits: draft.benefits
        })
      }, token);
      setOpen(false);
      window.localStorage.removeItem(employeeDraftKey);
      setSuccess("Colaborador cadastrado com sucesso.");
      setDraft(createEmployeeDraft(settings ?? selectedCompany.settings ?? demoSettings, centers, types, defaultCompanyId));
      setAddressLocked(false);
      setCepStatus("");
      setCnpjStatus("");
      setDraftLoaded(false);
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

  async function saveQuickJobTitle() {
    if (user.role !== "ADMIN") return restricted();
    const title = upperText(quickJobTitle).trim();
    if (!title) {
      setError("Informe o nome do cargo.");
      return;
    }
    if (!isAllowedCadastroText(title)) {
      setError("Cargo/função possui caractere especial. Corrija antes de salvar.");
      return;
    }
    const nextTitles = [...jobTitleOptions, title]
      .filter((item, index, array) => array.indexOf(item) === index)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    try {
      const updated = await api<DemoSettings>(`/demo/settings?company_id=${draftCompanyId}`, { method: "POST", body: JSON.stringify({ job_titles: nextTitles }) }, token);
      setSettings(updated);
      setDraft(current => ({ ...current, job_title: title }));
      setQuickJobOpen(false);
      setQuickJobTitle("");
      setSuccess("Cargo cadastrado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar cargo.");
    }
  }

  async function selectDraftCompany(rawCompanyId: string) {
    const companyId = Number(rawCompanyId);
    const nextCenters = centers.filter(item => item.company_id === companyId && item.active);
    const nextTypes = types.filter(item => item.company_id === companyId && item.active);
    setDraft(current => ({
      ...current,
      company_id: rawCompanyId,
      result_center_id: String(nextCenters[0]?.id ?? ""),
      employment_type_id: String(nextTypes[0]?.id ?? ""),
      supervisor_name: ""
    }));
    if (!companyId) return;
    try {
      const companySettings = await api<DemoSettings>(`/demo/settings?company_id=${companyId}`, {}, token);
      setSettings(companySettings);
      setDraft(current => ({
        ...current,
        job_title: companySettings.job_titles?.[0] ?? current.job_title
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar configurações da empresa.");
    }
  }

  async function exportEmployees() {
    try {
      const rows = filtered.map(item => ({
      "EMPRESA": item.company_id,
      "MATRICULA": item.employee_code,
      "NOME": item.employee.full_name,
      "CPF/CNPJ": formatDocument(item.employee.cpf),
      "EMAIL": item.email,
      "TELEFONE": formatPixKey("PHONE", item.phone),
      "CR": item.result_center.code,
      "CARGO": item.job_title,
      "SUPERVISOR": item.supervisor_name,
      "MODALIDADE": item.employment_type.name,
      "SALARIO": item.salary_base,
      "GRATIFICACAO": item.gratification,
      "ADMISSAO": item.admission_date,
      "CEP": item.cep,
      "RUA": item.street,
      "NUMERO": item.address_number,
      "COMPLEMENTO": item.address_complement,
      "BAIRRO": item.neighborhood,
      "CIDADE": item.city,
      "UF": item.state,
      "CODIGO BANCO": item.bank_code,
      "NOME BANCO": item.bank_name,
      "AGENCIA": item.bank_agency,
      "CONTA": item.bank_account,
      "DIGITO": item.bank_account_digit,
      "PIX TIPO": item.pix_key_type,
      "PIX": item.pix_key,
      "BENEFICIOS": (item.benefits ?? []).join(", "),
      "AJUDA DE CUSTO": item.cost_aid,
      "OBSERVACOES": item.notes
      }));
      await downloadExcel(rows, "Colaboradores", `colaboradores-${selectedCompany.id === 0 ? "todas" : selectedCompany.name.toLowerCase().replace(/\W+/g, "-")}.xlsx`);
      setSuccess("Exportação de colaboradores gerada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao exportar colaboradores.");
    }
  }

  async function downloadImportTemplate() {
    await downloadExcel([
      buildEmployeeImportTemplateRow({
        centerCode: companyCenters[0]?.code,
        jobTitle: jobTitleOptions[0],
        employmentType: companyTypes[0]?.name
      })
    ], "Colaboradores", `modelo-importacao-colaboradores-${selectedCompany.code.toLowerCase()}.xlsx`);
  }

  async function importEmployees(event: ChangeEvent<HTMLInputElement>) {
    if (user.role !== "ADMIN") return restricted();
    if (selectedCompany.id === 0) {
      setError("Selecione uma empresa específica para importar colaboradores.");
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLoading(true);
    setError("");
    setImportIssues([]);
    try {
      const rows = await readFirstExcelSheet(await file.arrayBuffer());
      if (!rows.length) throw new Error("A planilha não possui colaboradores para importar.");
      let imported = 0;
      const importCenters = centers.filter(item => !item.company_id || item.company_id === selectedCompany.id);
      const importTypes = types.filter(item => !item.company_id || item.company_id === selectedCompany.id);
      const validated = validateEmployeeImportRows(rows, {
        centers: importCenters,
        types: importTypes,
        existingDocuments: items.filter(item => item.company_id === selectedCompany.id).map(item => item.employee.cpf)
      });
      const issues = validated.flatMap(item => item.issues);
      const nextCodeByCenter = new Map(importCenters.map(center => {
        const last = items
          .filter(item => item.company_id === selectedCompany.id && item.employee_code.startsWith(`${center.code}-`))
          .map(item => Number(item.employee_code.split("-").pop() ?? 0))
          .reduce((max, value) => Math.max(max, Number.isFinite(value) ? value : 0), 0);
        return [center.code, last + 1] as const;
      }));
      for (const validatedRow of validated.filter(item => !item.issues.length)) {
        const normalized = validatedRow.data;
        const center = importCenters.find(item => normalizeText(item.code) === normalizeText(normalized.center));
        const type = importTypes.find(item => normalizeText(item.name) === normalizeText(normalized.type));
        if (!center || !type) continue;
        const sequence = nextCodeByCenter.get(center.code) ?? 1;
        try {
          await api("/employees", {
            method: "POST",
            body: JSON.stringify({
              full_name: normalized.name,
              company_id: selectedCompany.id,
              cpf: normalized.document,
              employee_code: `${center.code}-${String(sequence).padStart(3, "0")}`,
              admission_date: normalized.admission,
              email: normalized.email,
              phone: normalized.phone,
              supervisor_name: normalized.supervisor,
              job_title: normalized.jobTitle,
              employment_type_id: type.id,
              result_center_id: center.id,
              salary_base: normalized.salary,
              gratification: normalized.gratification,
              cost_aid: normalized.costAid,
              cep: normalized.cep,
              street: normalized.street,
              address_number: normalized.number,
              address_complement: normalized.complement,
              neighborhood: normalized.neighborhood,
              city: normalized.city,
              state: normalized.state,
              bank_code: normalized.bankCode,
              bank_name: normalized.bankName || bankNameByCode(normalized.bankCode),
              bank_agency: normalized.agency,
              bank_account: normalized.account,
              bank_account_digit: normalized.accountDigit,
              pix_key_type: normalized.pixType,
              pix_key: normalized.pix,
              benefits: normalized.benefits,
              notes: normalized.notes
            })
          }, token);
          nextCodeByCenter.set(center.code, sequence + 1);
          imported += 1;
        } catch (err) {
          issues.push(createEmployeeImportApiIssue(validatedRow.rowNumber, normalized, err instanceof Error ? err.message : "O servidor recusou esta linha."));
        }
      }
      setImportIssues(issues);
      const inconsistentRows = new Set(issues.map(issue => issue.rowNumber)).size;
      if (imported) {
        setSuccess(`${imported} colaborador(es) importado(s)${inconsistentRows ? `. ${inconsistentRows} linha(s) não importada(s), com orientação abaixo` : ""}.`);
        await load();
      } else {
        setError("A planilha foi carregada, mas nenhuma linha pôde ser importada. Consulte as correções sugeridas abaixo.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar colaboradores.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <div className="page-title">
      <div><span className="eyebrow">Pessoas</span><h1>Colaboradores</h1><p>Base completa de pessoas, vínculos e custos estimados.</p></div>
      <div className="actions">
        {user.role === "ADMIN" && <button className="primary" onClick={() => setOpen(!open)} disabled={!selectableCompanies.length}>{open ? "Cancelar" : "Novo colaborador"}</button>}
        {user.role === "ADMIN" && <button className="secondary" onClick={() => void downloadImportTemplate()}>Baixar modelo</button>}
        {user.role === "ADMIN" && <button className="secondary" onClick={() => importInputRef.current?.click()}>Importar Excel</button>}
        <button className="secondary" onClick={() => void exportEmployees()}>Exportar</button>
        <input ref={importInputRef} type="file" accept=".xlsx" hidden onChange={event => void importEmployees(event)} />
      </div>
    </div>
    <ErrorMessage message={error} />
    <SuccessMessage message={success} />
    <EmployeeImportReport issues={importIssues} />

    <div className="panel filters-panel">
      <input placeholder="Buscar por nome, CPF ou matrícula" value={query} onChange={event => setQuery(event.target.value)} />
      <select value={centerFilter} onChange={event => setCenterFilter(event.target.value)}><option value="">Todos os CRs</option>{filterCenters.map(item => <option key={item.code}>{item.code}</option>)}</select>
      <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">Todas as modalidades</option>{filterTypes.map(item => <option key={item.name}>{item.name}</option>)}</select>
      <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Todos os status</option><option value="ACTIVE">Ativo</option><option value="ON_LEAVE">Afastado</option><option value="INACTIVE">Inativo</option></select>
    </div>
    <p className="note">Visualização da empresa <strong>{selectedCompany.name}</strong>.</p>

    {open && <form className="panel form-grid" onSubmit={submit}>
      <h3 className="span-2 form-section-title">Identificação</h3>
      <label className="span-2">Empresa<select value={draft.company_id} onChange={event => void selectDraftCompany(event.target.value)} required><option value="">Selecione a empresa</option>{selectableCompanies.map(company => <option key={company.id} value={company.id}>{company.code} - {company.name}</option>)}</select></label>
      <label>Nome completo<input value={draft.full_name} onChange={event => setDraft(current => ({ ...current, full_name: upperText(event.target.value) }))} required /></label>
      <label>CPF/CNPJ<input
        className={documentMessage ? "input-invalid" : ""}
        value={formatDocument(draft.cpf_cnpj)}
        onChange={event => setDraft(current => ({ ...current, cpf_cnpj: event.target.value.replace(/\D/g, "").slice(0, 14) }))}
        onBlur={() => { void lookupCnpj(); }}
        placeholder="000.000.000-00 ou 00.000.000/0000-00"
        maxLength={18}
        inputMode="numeric"
        required
        aria-invalid={Boolean(documentMessage)}
      /></label>
      <label>Matrícula<input value={generatedEmployeeCode} readOnly /></label>
      <label>Data de admissão<input value={draft.admission_date} onChange={event => setDraft(current => ({ ...current, admission_date: event.target.value }))} type="date" required /></label>
      <label>E-mail<input value={draft.email} onChange={event => setDraft(current => ({ ...current, email: event.target.value.trim() }))} placeholder="nome@empresa.com.br" type="email" /></label>
      <label>Telefone<input value={formatPixKey("PHONE", draft.phone)} onChange={event => setDraft(current => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 11) }))} placeholder="(00) 00000-0000" inputMode="numeric" /></label>
      <label>Centro de Resultado<select value={draft.result_center_id} onChange={event => setDraft(current => ({ ...current, result_center_id: event.target.value }))} required><option value="">Selecione</option>{companyCenters.map(item => <option value={item.id} key={item.id}>{item.code} - {item.name}</option>)}</select></label>
      <label>Cargo / função<span className="field-with-action"><input list="employee-job-titles" value={draft.job_title} onChange={event => setDraft(current => ({ ...current, job_title: upperText(event.target.value) }))} placeholder="Digite para buscar" required /><datalist id="employee-job-titles">{jobTitleOptions.map(title => <option key={title} value={title} />)}</datalist><button className="icon-button inline-add-button" type="button" onClick={() => setQuickJobOpen(true)} title="Cadastrar cargo rápido">+</button></span><small>Cargos são cadastrados em Ajustes do sistema &gt; Cargos e funções.</small></label>
      <label>Supervisor<select value={draft.supervisor_name} onChange={event => setDraft(current => ({ ...current, supervisor_name: event.target.value }))}><option value="">Selecione</option>{draftSupervisorOptions.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <label>Modalidade<select value={draft.employment_type_id} onChange={event => setDraft(current => ({ ...current, employment_type_id: event.target.value }))} required><option value="">Selecione</option>{companyTypes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Salário base<input value={draft.salary_base} onChange={event => setDraft(current => ({ ...current, salary_base: event.target.value }))} type="number" step="100" required /></label>
      <label>Gratificação<input value={draft.gratification} onChange={event => setDraft(current => ({ ...current, gratification: event.target.value }))} type="number" min="0" step="0.01" /></label>
      <h3 className="span-2 form-section-title">Endereço</h3>
      <label className="span-2">CEP<input value={draft.cep} onChange={event => setDraft(current => ({ ...current, cep: event.target.value.replace(/\D/g, "") }))} placeholder="00000000" maxLength={8} inputMode="numeric" required /></label>
      <label className="span-2">Rua<input value={draft.street} onChange={event => setDraft(current => ({ ...current, street: upperText(event.target.value) }))} placeholder="Logradouro" readOnly={addressLocked} /></label>
      <label>Número<input value={draft.address_number} onChange={event => setDraft(current => ({ ...current, address_number: event.target.value }))} placeholder="123" /></label>
      <label>Complemento<input value={draft.address_complement} onChange={event => setDraft(current => ({ ...current, address_complement: upperText(event.target.value) }))} placeholder="Apto, sala, bloco ou referência" /></label>
      <label>Bairro<input value={draft.neighborhood} onChange={event => setDraft(current => ({ ...current, neighborhood: upperText(event.target.value) }))} placeholder="Centro" readOnly={addressLocked} /></label>
      <label>Cidade<input value={draft.city} onChange={event => setDraft(current => ({ ...current, city: upperText(event.target.value) }))} placeholder="São Paulo" readOnly={addressLocked} /></label>
      <label>UF<input value={draft.state} onChange={event => setDraft(current => ({ ...current, state: event.target.value.toUpperCase().slice(0, 2) }))} maxLength={2} placeholder="SP" readOnly={addressLocked} /></label>
      <h3 className="span-2 form-section-title">Dados bancários</h3>
      <label>Código do banco<input value={draft.bank_code} onChange={event => {
        const code = event.target.value.replace(/\D/g, "").slice(0, 3);
        const bank = bankNameByCode(code);
        setDraft(current => ({ ...current, bank_code: code, bank_name: bank ? upperText(bank) : (code.length === 3 ? "" : current.bank_name) }));
      }} placeholder="001" maxLength={3} inputMode="numeric" /></label>
      <label>Banco<input value={draft.bank_name} onChange={event => setDraft(current => ({ ...current, bank_name: upperText(event.target.value) }))} placeholder="Nome do banco" readOnly={Boolean(bankNameFromCode)} /></label>
      <label>Agência<input value={draft.bank_agency} onChange={event => setDraft(current => ({ ...current, bank_agency: event.target.value }))} placeholder="0001" /></label>
      <label>Conta<input value={draft.bank_account} onChange={event => setDraft(current => ({ ...current, bank_account: event.target.value }))} placeholder="12345" /></label>
      <label>Dígito da conta<input value={draft.bank_account_digit} onChange={event => setDraft(current => ({ ...current, bank_account_digit: event.target.value.replace(/\D/g, "").slice(0, 1) }))} placeholder="0" /></label>
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
      {(draft.pix_key_type === "CPF" || draft.pix_key_type === "CNPJ") && <label className="check span-2"><input type="checkbox" checked={draft.pix_key === cpfDigits && cpfDigits.length === (draft.pix_key_type === "CPF" ? 11 : 14)} onChange={event => setDraft(current => ({ ...current, pix_key: event.target.checked ? cpfDigits : "" }))} /> Meu CPF/CNPJ</label>}
      {draft.pix_key_type === "EMAIL" && <label className="check span-2"><input type="checkbox" checked={draft.pix_key === draft.email && Boolean(draft.email)} onChange={event => setDraft(current => ({ ...current, pix_key: event.target.checked ? current.email : "" }))} /> Meu e-mail</label>}
      {draft.pix_key_type === "PHONE" && <label className="check span-2"><input type="checkbox" checked={draft.pix_key === draft.phone && Boolean(draft.phone)} onChange={event => setDraft(current => ({ ...current, pix_key: event.target.checked ? current.phone : "" }))} /> Meu celular</label>}
      <fieldset className="span-2 benefits-fieldset">
        <legend>Benefícios</legend>
        {["Vale transporte", "Alimentação", "Cesta básica", "Plano de saúde", "Seguro de vida", "Ajuda de custo"].map(benefit => <label className="check" key={benefit}><input type="checkbox" checked={draft.benefits.includes(benefit)} onChange={event => setDraft(current => ({ ...current, benefits: event.target.checked ? [...current.benefits, benefit] : current.benefits.filter(item => item !== benefit) }))} /> {benefit}</label>)}
        {draft.benefits.includes("Ajuda de custo") && <label className="span-2">Valor da ajuda de custo<input value={draft.cost_aid} onChange={event => setDraft(current => ({ ...current, cost_aid: event.target.value }))} type="number" min="0" step="0.01" placeholder="0,00" /></label>}
      </fieldset>
      <label className="span-2">Observações<textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: upperText(event.target.value) }))} rows={2} /></label>
      <div className="span-2 field-feedback-group">
        <p className={`field-feedback ${documentMessage ? "error" : "success"}`}>{documentMessage || "Documento válido."}</p>
        {cepStatus && <p className={`field-feedback ${cepStatus.startsWith("CEP não") ? "error" : "success"}`}>{cepStatus}</p>}
        {cnpjStatus && <p className={`field-feedback ${cnpjStatus.startsWith("Não foi") ? "error" : "success"}`}>{cnpjStatus}</p>}
        {bankMessage && <p className={`field-feedback ${bankNameFromCode ? "success" : "error"}`}>{bankMessage}</p>}
        <p className={`field-feedback ${pixMessage ? "error" : "success"}`}>{pixMessage || "Chave PIX válida."}</p>
        {textMessage && <p className="field-feedback error">{textMessage}</p>}
      </div>
      <button className="primary" disabled={!canSubmit}>Cadastrar colaborador</button>
    </form>}

    {quickJobOpen && <QuickJobModal
      value={quickJobTitle}
      onChange={setQuickJobTitle}
      onClose={() => {
        setQuickJobOpen(false);
        setQuickJobTitle("");
      }}
      onSave={() => void saveQuickJobTitle()}
    />}

    <div className="panel table-wrap">
      {loading && <div className="inline-loading">Carregando colaboradores...</div>}
      <table><thead><tr>{selectedCompany.id === 0 && <th>Empresa</th>}<th>Matrícula</th><th>Colaborador</th><th>CPF/CNPJ</th><th>Cargo</th><th>CR</th><th>Modalidade</th><th>Salário</th><th>Gratificação</th><th>Admissão</th><th>Status</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.id} onClick={() => setSelected(item)} className="clickable">{selectedCompany.id === 0 && <td>{companies.find(company => company.id === item.company_id)?.code ?? item.company_id}</td>}<td>{item.employee_code}</td><td><strong>{item.employee.full_name}</strong></td><td>{formatDocument(item.employee.cpf)}</td><td>{item.job_title}</td><td><span className="color-dot" style={{ background: item.result_center.color }} />{item.result_center.code}</td><td>{item.employment_type.name}</td><td>{money.format(item.salary_base)}</td><td>{money.format(item.gratification ?? 0)}</td><td>{date(item.admission_date)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td></tr>)}</tbody></table>
      {!filtered.length && !loading && <Empty>Nenhum colaborador encontrado.</Empty>}
    </div>

    {selected && <EmployeeDrawer
      employee={selected}
      token={token}
      user={user}
      companies={selectableCompanies}
      centers={centers}
      types={types}
      jobTitleOptions={jobTitleOptions}
      supervisorOptions={items
        .filter(item => item.company_id === selected.company_id && item.status !== "INACTIVE" && normalizeText(item.job_title).includes("supervisor"))
        .map(item => item.employee.full_name)
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort((a, b) => a.localeCompare(b, "pt-BR"))}
      onClose={() => setSelected(null)}
      onAction={simulate}
      onSaved={updated => {
        setSelected(updated);
        void load();
      }}
      onDeleted={() => {
        setSelected(null);
        void load();
      }}
    />}
  </>;
}

function EmployeeDrawer({
  employee,
  token,
  user,
  companies,
  centers,
  types,
  jobTitleOptions,
  supervisorOptions,
  onClose,
  onAction,
  onSaved,
  onDeleted
}: {
  employee: DemoEmployee;
  token: string;
  user: User;
  companies: Array<{ id: number; code: string; name: string }>;
  centers: ResultCenter[];
  types: EmploymentType[];
  jobTitleOptions: string[];
  supervisorOptions: string[];
  onClose: () => void;
  onAction: (message: string, adminOnly?: boolean) => void;
  onSaved: (employee: DemoEmployee) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EmployeeDraft>(() => employeeToDraft(employee));
  const [salaryMode, setSalaryMode] = useState<"" | "history" | "correction">("");
  const [benefitDraft, setBenefitDraft] = useState<string[]>(employee.benefits ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const history = [...(employee.salary_history ?? [])].sort((a, b) => salaryHistoryDate(b).localeCompare(salaryHistoryDate(a)));
  const estimatedCost = (employee.salary_base + Number(employee.gratification ?? 0)) * (employee.employment_type.has_charges ? 1.72 : 1.18);
  const salaryChanged = Number(draft.salary_base || 0) !== Number(employee.salary_base || 0);
  const pixMessage = editing ? validatePixKey(draft.pix_key_type, draft.pix_key) : "";
  const textMessage = editing ? validateEmployeeText(draft) : "";
  const targetCompanyId = Number(draft.company_id);
  const targetCenters = centers.filter(item => item.company_id === targetCompanyId && (item.active || item.id === Number(draft.result_center_id)));
  const targetTypes = types.filter(item => item.company_id === targetCompanyId && (item.active || item.id === Number(draft.employment_type_id)));
  const editJobTitleOptions = jobTitleOptions.includes(draft.job_title)
    ? jobTitleOptions
    : [draft.job_title, ...jobTitleOptions].filter(Boolean);

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user.role !== "ADMIN") {
      onAction("Seu perfil possui acesso somente para consulta.");
      return;
    }
    if (pixMessage || textMessage) {
      setError(pixMessage || textMessage);
      return;
    }
    if (salaryChanged && !salaryMode) {
      setError("Escolha se a alteração salarial é ajuste salarial ou correção cadastral.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let updated = await api<DemoEmployee>(`/employees/${employee.id}?company_id=${employee.company_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: draft.full_name,
          company_id: targetCompanyId,
          admission_date: draft.admission_date,
          email: draft.email,
          phone: draft.phone,
          supervisor_name: draft.supervisor_name,
          job_title: draft.job_title,
          employment_type_id: draft.employment_type_id,
          result_center_id: draft.result_center_id,
          salary_base: salaryChanged && salaryMode === "history" ? employee.salary_base : Number(draft.salary_base || 0),
          gratification: Number(draft.gratification || 0),
          cost_aid: benefitDraft.includes("Ajuda de custo") ? Number(draft.cost_aid || 0) : 0,
          salary_mode: salaryMode === "correction" ? "correction" : undefined,
          cep: draft.cep.replace(/\D/g, ""),
          street: draft.street,
          address_number: draft.address_number,
          address_complement: draft.address_complement,
          neighborhood: draft.neighborhood,
          city: draft.city,
          state: draft.state,
          bank_code: draft.bank_code,
          bank_name: draft.bank_name,
          bank_agency: draft.bank_agency,
          bank_account: draft.bank_account,
          bank_account_digit: draft.bank_account_digit,
          pix_key_type: draft.pix_key_type,
          pix_key: draft.pix_key,
          notes: draft.notes,
          benefits: benefitDraft
        })
      }, token);
      if (salaryChanged && salaryMode === "history") {
        updated = await api<DemoEmployee>(`/employees/${employee.id}/salary-history?company_id=${employee.company_id}`, {
          method: "POST",
          body: JSON.stringify({
            effective_date: new Date().toISOString().slice(0, 10),
            amount: Number(draft.salary_base || 0),
            family_allowance: 0,
            reason: "AJUSTE SALARIAL"
          })
        }, token);
      }
      onSaved(updated);
      setDraft(employeeToDraft(updated));
      setBenefitDraft(updated.benefits ?? []);
      setSalaryMode("");
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar colaborador.");
    } finally {
      setSaving(false);
    }
  }

  async function inactivateEmployee() {
    if (user.role !== "ADMIN") return onAction("Seu perfil possui acesso somente para consulta.");
    setSaving(true);
    setError("");
    try {
      const updated = await api<DemoEmployee>(`/employees/${employee.id}?company_id=${employee.company_id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: employee.status === "INACTIVE" ? "ACTIVE" : "INACTIVE" })
      }, token);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar status do colaborador.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEmployee(password: string) {
    if (user.role !== "ADMIN") return onAction("Seu perfil possui acesso somente para consulta.");
    setSaving(true);
    setDeleteError("");
    try {
      await api(`/employees/${employee.id}?company_id=${employee.company_id}`, {
        method: "DELETE",
        body: JSON.stringify({ password })
      }, token);
      setDeleteOpen(false);
      onAction(`Colaborador ${employee.employee.full_name} excluído com sucesso.`);
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erro ao excluir colaborador.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer wide" onClick={event => event.stopPropagation()}>
    <button className="ghost right" onClick={onClose}>Fechar</button>
    <span className="eyebrow">{employee.employee_code}</span><h2>{employee.employee.full_name}</h2>
    <div className="drawer-actions">
      {user.role === "ADMIN" ? <>
        <button className={editing ? "primary" : "secondary"} onClick={() => {
          if (editing) {
            setDraft(employeeToDraft(employee));
            setBenefitDraft(employee.benefits ?? []);
            setSalaryMode("");
            setError("");
          }
          setEditing(value => !value);
        }}>{editing ? "Cancelar edição" : "Editar"}</button>
        <button className="secondary" onClick={() => void inactivateEmployee()} disabled={saving}>{employee.status === "INACTIVE" ? "Reativar" : "Inativar"}</button>
        <button className="secondary" onClick={() => setEditing(true)}>Transferir CR</button>
        <button className="danger" onClick={() => { setDeleteError(""); setDeleteOpen(true); }} disabled={saving}>Excluir</button>
      </> : <button className="secondary" onClick={() => onAction("Seu perfil possui acesso somente para consulta.")}>Solicitar alteração</button>}
    </div>
    {deleteOpen && <DeleteConfirmationModal
      title="Excluir colaborador"
      itemName={employee.employee.full_name}
      description="Esta ação é definitiva e só será concluída se não houver movimentações ou outros registros vinculados. Caso exista histórico, inative o colaborador."
      busy={saving}
      error={deleteError}
      onCancel={() => { setDeleteOpen(false); setDeleteError(""); }}
      onConfirm={deleteEmployee}
    />}
    {error && <ErrorMessage message={error} />}
    {editing && <form className="panel form-grid compact" onSubmit={saveEdit}>
      <h3 className="span-2 form-section-title">Editar cadastro</h3>
      <label className="span-2">Empresa<select value={draft.company_id} onChange={event => {
        const companyId = Number(event.target.value);
        const nextCenters = centers.filter(item => item.company_id === companyId && item.active);
        const nextTypes = types.filter(item => item.company_id === companyId && item.active);
        setDraft(current => ({ ...current, company_id: event.target.value, result_center_id: String(nextCenters[0]?.id ?? ""), employment_type_id: String(nextTypes[0]?.id ?? ""), supervisor_name: "" }));
      }} required>{companies.map(company => <option key={company.id} value={company.id}>{company.code} - {company.name}</option>)}</select></label>
      <label>Nome completo<input value={draft.full_name} onChange={event => setDraft(current => ({ ...current, full_name: upperText(event.target.value) }))} required /></label>
      <label>CPF/CNPJ<input value={formatDocument(draft.cpf_cnpj)} readOnly disabled /></label>
      <label>E-mail<input value={draft.email} onChange={event => setDraft(current => ({ ...current, email: event.target.value.trim() }))} type="email" /></label>
      <label>Telefone<input value={formatPixKey("PHONE", draft.phone)} onChange={event => setDraft(current => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 11) }))} inputMode="numeric" /></label>
      <label>Cargo / função<select value={draft.job_title} onChange={event => setDraft(current => ({ ...current, job_title: event.target.value }))} required><option value="">Selecione</option>{editJobTitleOptions.map(title => <option key={title} value={title}>{title}</option>)}</select></label>
      <label>Supervisor<select value={draft.supervisor_name} onChange={event => setDraft(current => ({ ...current, supervisor_name: event.target.value }))}><option value="">Selecione</option>{supervisorOptions.filter(name => name !== employee.employee.full_name).map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <label>Centro de Resultado<select value={draft.result_center_id} onChange={event => setDraft(current => ({ ...current, result_center_id: event.target.value }))} required>{targetCenters.map(item => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></label>
      <label>Modalidade<select value={draft.employment_type_id} onChange={event => setDraft(current => ({ ...current, employment_type_id: event.target.value }))} required>{targetTypes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Data de admissão<input value={draft.admission_date} onChange={event => setDraft(current => ({ ...current, admission_date: event.target.value }))} type="date" required /></label>
      <label>Salário base<input value={draft.salary_base} onChange={event => setDraft(current => ({ ...current, salary_base: event.target.value }))} type="number" step="0.01" required /></label>
      <label>Gratificação<input value={draft.gratification} onChange={event => setDraft(current => ({ ...current, gratification: event.target.value }))} type="number" min="0" step="0.01" /></label>
      {salaryChanged && <fieldset className="span-2 benefits-fieldset">
        <legend>Tipo da alteração salarial</legend>
        <label className="check"><input type="radio" name="salary_mode" checked={salaryMode === "history"} onChange={() => setSalaryMode("history")} /> Ajuste salarial: cria histórico e movimentação</label>
        <label className="check"><input type="radio" name="salary_mode" checked={salaryMode === "correction"} onChange={() => setSalaryMode("correction")} /> Correção cadastral: atualiza o último salário</label>
      </fieldset>}
      <label>CEP<input value={draft.cep} onChange={event => setDraft(current => ({ ...current, cep: event.target.value.replace(/\D/g, "").slice(0, 8) }))} inputMode="numeric" /></label>
      <div />
      <label className="span-2">Rua<input value={draft.street} onChange={event => setDraft(current => ({ ...current, street: upperText(event.target.value) }))} /></label>
      <label>Número<input value={draft.address_number} onChange={event => setDraft(current => ({ ...current, address_number: event.target.value }))} /></label>
      <label>Complemento<input value={draft.address_complement} onChange={event => setDraft(current => ({ ...current, address_complement: upperText(event.target.value) }))} /></label>
      <label>Bairro<input value={draft.neighborhood} onChange={event => setDraft(current => ({ ...current, neighborhood: upperText(event.target.value) }))} /></label>
      <label>Cidade<input value={draft.city} onChange={event => setDraft(current => ({ ...current, city: upperText(event.target.value) }))} /></label>
      <label>UF<input value={draft.state} onChange={event => setDraft(current => ({ ...current, state: upperText(event.target.value).slice(0, 2) }))} maxLength={2} /></label>
      <label>Banco<input value={draft.bank_name} onChange={event => setDraft(current => ({ ...current, bank_name: upperText(event.target.value) }))} /></label>
      <label>Agência<input value={draft.bank_agency} onChange={event => setDraft(current => ({ ...current, bank_agency: event.target.value }))} /></label>
      <label>Conta<input value={draft.bank_account} onChange={event => setDraft(current => ({ ...current, bank_account: event.target.value }))} /></label>
      <label>Dígito<input value={draft.bank_account_digit} onChange={event => setDraft(current => ({ ...current, bank_account_digit: event.target.value.replace(/\D/g, "").slice(0, 1) }))} /></label>
      <label>Tipo PIX<select value={draft.pix_key_type} onChange={event => setDraft(current => ({ ...current, pix_key_type: event.target.value, pix_key: "" }))} required><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Chave aleatória</option></select></label>
      <label>Chave PIX<input value={draft.pix_key} onChange={event => setDraft(current => ({ ...current, pix_key: sanitizePixKey(current.pix_key_type, event.target.value) }))} required /></label>
      {(draft.pix_key_type === "CPF" || draft.pix_key_type === "CNPJ") && <label className="check span-2"><input type="checkbox" checked={draft.pix_key === draft.cpf_cnpj} onChange={event => setDraft(current => ({ ...current, pix_key: event.target.checked ? current.cpf_cnpj : "" }))} /> Meu CPF/CNPJ</label>}
      {draft.pix_key_type === "EMAIL" && <label className="check span-2"><input type="checkbox" checked={draft.pix_key === draft.email && Boolean(draft.email)} onChange={event => setDraft(current => ({ ...current, pix_key: event.target.checked ? current.email : "" }))} /> Meu e-mail</label>}
      {draft.pix_key_type === "PHONE" && <label className="check span-2"><input type="checkbox" checked={draft.pix_key === draft.phone && Boolean(draft.phone)} onChange={event => setDraft(current => ({ ...current, pix_key: event.target.checked ? current.phone : "" }))} /> Meu celular</label>}
      <fieldset className="span-2 benefits-fieldset"><legend>Benefícios</legend>{["Vale transporte", "Alimentação", "Cesta básica", "Plano de saúde", "Seguro de vida", "Ajuda de custo"].map(benefit => <label className="check" key={benefit}><input type="checkbox" checked={benefitDraft.includes(benefit)} onChange={event => setBenefitDraft(current => event.target.checked ? [...current, benefit] : current.filter(item => item !== benefit))} /> {benefit}</label>)}{benefitDraft.includes("Ajuda de custo") && <label className="span-2">Valor da ajuda de custo<input value={draft.cost_aid} onChange={event => setDraft(current => ({ ...current, cost_aid: event.target.value }))} type="number" min="0" step="0.01" /></label>}</fieldset>
      <label className="span-2">Observações<textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: upperText(event.target.value) }))} rows={2} /></label>
      <div className="span-2 field-feedback-group">
        {pixMessage && <p className="field-feedback error">{pixMessage}</p>}
        {textMessage && <p className="field-feedback error">{textMessage}</p>}
      </div>
      <button className="primary" disabled={saving}>{saving ? "Salvando..." : "Salvar cadastro"}</button>
    </form>}
    <div className="detail-grid">
      <Info label="CPF/CNPJ" value={formatDocument(employee.employee.cpf)} />
      <Info label="E-mail" value={employee.email} />
      <Info label="Telefone" value={formatPixKey("PHONE", employee.phone)} />
      <Info label="Supervisor" value={employee.supervisor_name || "-"} />
      <Info label="Centro atual" value={`${employee.result_center.code} - ${employee.result_center.name}`} />
      <Info label="Modalidade" value={employee.employment_type.name} />
      <Info label="Salário base" value={money.format(employee.salary_base)} />
      <Info label="Gratificação" value={money.format(employee.gratification ?? 0)} />
      <Info label="Custo estimado do mês" value={money.format(estimatedCost)} />
      <Info label="Endereço" value={[employee.street, employee.address_number, employee.address_complement, employee.neighborhood, employee.city, employee.state].filter(Boolean).join(", ") || "-"} />
      <Info label="Banco" value={[employee.bank_code, employee.bank_name].filter(Boolean).join(" - ")} />
      <Info label="Agência / conta" value={`${employee.bank_agency} / ${employee.bank_account}-${employee.bank_account_digit}`} />
      <Info label="PIX" value={`${employee.pix_key_type}: ${employee.pix_key}`} />
      <Info label="Benefícios" value={(employee.benefits ?? []).length ? (employee.benefits ?? []).join(", ") : "Nenhum"} />
    </div>
    <Section title="Férias" items={(employee.vacations ?? []).length ? (employee.vacations ?? []).map(item => `${item.period} - ${item.status}`) : ["Nenhuma férias cadastrada"]} />
    <Section title="Afastamentos" items={(employee.leaves ?? []).length ? (employee.leaves ?? []).map(item => `${item.period} - ${item.reason} (${item.days} dias)`) : ["Nenhum afastamento ativo"]} />
    <Section title="Históricos Salariais" items={history.length ? history.map(item => `${date(salaryHistoryDate(item))} - ${money.format(item.amount)} (${item.reason})`) : ["Nenhum histórico salarial"]} />
    <Section title="Histórico de Movimentos" items={(employee.movement_history ?? []).length ? (employee.movement_history ?? []).map(item => `${date(item.date)} - ${item.description}`) : ["Consulte Movimentações para ver o histórico operacional"]} />
  </aside></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="summary-card"><span>{label}</span><strong>{value}</strong></div>;
}

function Section({ title, items }: { title: string; items: string[] }) {
  return <div className="drawer-section"><h3>{title}</h3>{items.map(item => <p key={item}>{item}</p>)}</div>;
}

function QuickJobModal({ value, onChange, onSave, onClose }: { value: string; onChange: (value: string) => void; onSave: () => void; onClose: () => void }) {
  return <div className="presentation-modal movement-modal-backdrop" onClick={onClose}>
    <section className="presentation-modal-panel movement-modal quick-modal" onClick={event => event.stopPropagation()}>
      <div className="presentation-modal-header movement-modal-header">
        <div>
          <span className="eyebrow">Cadastro rápido</span>
          <h2>Novo cargo</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose}>×</button>
      </div>
      <div className="presentation-modal-body movement-modal-body">
        <label>Cargo / função
          <input autoFocus value={value} onChange={event => onChange(upperText(event.target.value))} placeholder="SUPERVISOR ADMINISTRATIVO" />
        </label>
        <div className="actions movement-modal-actions">
          <button className="secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary" type="button" onClick={onSave}>Salvar</button>
        </div>
      </div>
    </section>
  </div>;
}

function employeeToDraft(employee: DemoEmployee): EmployeeDraft {
  return {
    company_id: String(employee.company_id),
    full_name: employee.employee.full_name,
    cpf_cnpj: employee.employee.cpf,
    admission_date: employee.admission_date,
    email: employee.email ?? "",
    phone: employee.phone?.replace(/\D/g, "") ?? "",
    supervisor_name: employee.supervisor_name ?? "",
    job_title: employee.job_title ?? "",
    result_center_id: String(employee.result_center.id),
    employment_type_id: String(employee.employment_type.id),
    salary_base: String(employee.salary_base ?? 0),
    gratification: String(employee.gratification ?? 0),
    cost_aid: String(employee.cost_aid ?? 0),
    benefits: employee.benefits ?? [],
    cep: employee.cep ?? "",
    street: employee.street ?? "",
    address_number: employee.address_number ?? "",
    address_complement: employee.address_complement ?? "",
    neighborhood: employee.neighborhood ?? "",
    city: employee.city ?? "",
    state: employee.state ?? "",
    bank_code: employee.bank_code ?? "",
    bank_name: employee.bank_name ?? "",
    bank_agency: employee.bank_agency ?? "",
    bank_account: employee.bank_account ?? "",
    bank_account_digit: employee.bank_account_digit ?? "",
    pix_key_type: employee.pix_key_type ?? "",
    pix_key: employee.pix_key ?? "",
    notes: employee.notes ?? ""
  };
}

function date(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function salaryHistoryDate(item: { date?: string; effective_date?: string }) {
  return item.date ?? item.effective_date ?? new Date().toISOString().slice(0, 10);
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

function distinctCatalog<T>(items: T[], key: (item: T) => string) {
  return items.filter((item, index) => items.findIndex(candidate => key(candidate) === key(item)) === index);
}

function upperText(value: string) {
  return value.toUpperCase();
}

function isAllowedCadastroText(value: string) {
  return /^[\p{L}\p{N} .,\/ºª&'()"-]*$/u.test(value);
}

function validateEmployeeText(draft: EmployeeDraft) {
  const checks: [string, string][] = [
    ["Nome completo", draft.full_name],
    ["Cargo / função", draft.job_title],
    ["Supervisor", draft.supervisor_name],
    ["Rua", draft.street],
    ["Complemento", draft.address_complement],
    ["Bairro", draft.neighborhood],
    ["Cidade", draft.city],
    ["Banco", draft.bank_name],
    ["Observações", draft.notes]
  ];
  const invalid = checks.find(([, value]) => value && !isAllowedCadastroText(value));
  return invalid ? `${invalid[0]} possui caractere especial. Corrija antes de salvar.` : "";
}

function validateCpfCnpj(value: string, employees: DemoEmployee[], companies: Array<{ id: number; name: string }>) {
  if (!value) return "Informe um CPF ou CNPJ.";
  if (value.length !== 11 && value.length !== 14) return "CPF/CNPJ deve ter 11 ou 14 dígitos.";
  if (!isValidCpfCnpj(value)) return value.length === 11 ? "CPF inválido." : "CNPJ inválido.";
  const duplicate = employees.find(item => item.employee.cpf.replace(/\D/g, "") === value);
  if (duplicate) {
    const company = companies.find(item => item.id === duplicate.company_id)?.name ?? `empresa ${duplicate.company_id}`;
    const status = duplicate.status === "INACTIVE" ? "inativo" : "ativo";
    return `Documento já cadastrado para ${duplicate.employee.full_name} (${status} em ${company}). Abra esse cadastro para reativar ou transferir a empresa.`;
  }
  return "";
}

function isValidCpfCnpj(value: string) {
  if (value.length === 11) return isValidCpf(value);
  if (value.length === 14) return isValidCnpj(value);
  return false;
}

function isValidCpf(value: string) {
  if (/^(\d)\1+$/.test(value)) return false;
  const calc = (length: number) => {
    const sum = value.slice(0, length).split("").reduce((acc, digit, index) => acc + Number(digit) * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(value[9]) && calc(10) === Number(value[10]);
}

function isValidCnpj(value: string) {
  if (/^(\d)\1+$/.test(value)) return false;
  const calc = (length: 12 | 13) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = value.slice(0, length).split("").reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(value[12]) && calc(13) === Number(value[13]);
}

function bankNameByCode(code: string) {
  const banks: Record<string, string> = {
    "001": "Banco do Brasil S.A.",
    "033": "Banco Santander (Brasil) S.A.",
    "077": "Banco Inter S.A.",
    "104": "Caixa Econômica Federal",
    "208": "Banco BTG Pactual S.A.",
    "212": "Banco Original S.A.",
    "237": "Banco Bradesco S.A.",
    "260": "Nu Pagamentos S.A.",
    "290": "PagSeguro Internet Instituição de Pagamento S.A.",
    "318": "Banco BMG S.A.",
    "323": "Mercado Pago Instituição de Pagamento Ltda.",
    "336": "Banco C6 S.A.",
    "341": "Itaú Unibanco S.A.",
    "380": "PicPay Serviços S.A.",
    "422": "Banco Safra S.A.",
    "623": "Banco Pan S.A.",
    "756": "Banco Cooperativo Sicoob S.A."
  };
  return banks[code];
}

function validatePixKey(type: string, value: string) {
  if (!type) return "Selecione o tipo de PIX.";
  if (!value) return "Informe a chave PIX.";
  if (type === "CPF") {
    const digits = value.replace(/\D/g, "");
    return digits.length === 11 && isValidCpf(digits) ? "" : "PIX CPF inválido.";
  }
  if (type === "CNPJ") {
    const digits = value.replace(/\D/g, "");
    return digits.length === 14 && isValidCnpj(digits) ? "" : "PIX CNPJ inválido.";
  }
  if (type === "EMAIL") return /.+@.+\..+/.test(value) ? "" : "PIX e-mail precisa conter @.";
  if (type === "PHONE") return value.replace(/\D/g, "").length >= 10 ? "" : "PIX telefone precisa ter DDD.";
  return value.trim().length ? "" : "Informe a chave aleatória.";
}

function sanitizePixKey(type: string, value: string) {
  if (type === "CPF") return value.replace(/\D/g, "").slice(0, 11);
  if (type === "CNPJ") return value.replace(/\D/g, "").slice(0, 14);
  if (type === "PHONE") return value.replace(/\D/g, "").slice(0, 11);
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

function formatPixKey(type: string, value: string) {
  if (type === "CPF" || type === "CNPJ") return formatDocument(value);
  if (type === "PHONE") {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return value;
}
