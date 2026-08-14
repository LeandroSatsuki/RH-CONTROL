import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { api, downloadApiFile, isLocalDataMode } from "../api";
import { downloadExcel, readFirstExcelSheet } from "../excel";
import { useDemoScope } from "../context/DemoScope";
import { Empty, ErrorMessage, SuccessMessage } from "../components/Feedback";
import { demoBenefitDefinitions, demoResultCenters, demoSettings } from "../mocks/demoData";
import { currentCompetency, operationalCompetencies } from "../competencies";
import { DemoAlert, DemoAppUser, DemoAuditEntry, DemoBackup, DemoBenefitDistribution, DemoClosing, DemoCostAllocation, DemoEmployee, DemoMeiContract, DemoMovement, DemoSettings, IndicatorSummary, PayrollRow } from "../mocks/demoTypes";
import { recalculatePayrollRow } from "../mocks/demoCalculations";
import { CentersPage, TypesPage } from "./CatalogPages";
import { Company, EmploymentType, ResultCenter, User } from "../types";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const plainNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function useFeedback() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const notify = (message: string) => { setError(""); setSuccess(message); };
  const fail = (message: string) => { setSuccess(""); setError(message); };
  return { error, success, notify, fail, setError, setSuccess };
}

function distinctBy<T>(items: T[], key: (item: T) => string) {
  return items.filter((item, index) => items.findIndex(candidate => key(candidate) === key(item)) === index);
}

function restricted(user: User, fail: (message: string) => void) {
  if (user.role !== "ADMIN") {
    fail("Seu perfil possui acesso somente para consulta.");
    return true;
  }
  return false;
}

export function MovementsPage({ token, user }: { token: string; user: User }) {
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState(currentCompetency());
  const [type, setType] = useState("");
  const [center, setCenter] = useState("");
  const [items, setItems] = useState<DemoMovement[]>([]);
  const [employees, setEmployees] = useState<DemoEmployee[]>([]);
  const [centers, setCenters] = useState<ResultCenter[]>([]);
  const [types, setTypes] = useState<EmploymentType[]>([]);
  const [selected, setSelected] = useState<DemoMovement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const fb = useFeedback();

  async function load() {
    setLoading(true);
    try {
      const [movementList, employeeList, resultCenters, employmentTypes] = await Promise.all([
        api<DemoMovement[]>(`/demo/movements?competency=${competency}`, {}, token),
        api<DemoEmployee[]>("/employees", {}, token),
        api<ResultCenter[]>("/result-centers", {}, token),
        api<EmploymentType[]>("/employment-types", {}, token)
      ]);
      setItems(movementList);
      setEmployees(employeeList);
      setCenters(resultCenters);
      setTypes(employmentTypes);
    }
    catch (err) { fb.fail(err instanceof Error ? err.message : "Erro ao carregar movimentações"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [competency, token, selectedCompany.id]);

  const filtered = items.filter(item => (!type || item.type === type) && (!center || item.result_center.code === center));
  const absences = filtered.filter(item => ["falta", "atestado", "afastamento"].includes(item.type)).reduce((acc, item) => acc + item.days, 0);

  function createMovement() {
    if (selectedCompany.id === 0) return fb.fail("Selecione uma empresa específica para lançar movimentações.");
    if (restricted(user, fb.fail)) return;
    setCreateOpen(true);
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
      <select value={competency} onChange={e => setCompetency(e.target.value)}>{operationalCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
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
    }} onDeleted={() => {
      setSelected(null);
      fb.notify("Movimentação excluída e registrada na auditoria.");
      void load();
    }} />}
    {createOpen && (
      <MovementCreateModal
        token={token}
        companyId={selectedCompany.id}
        competency={competency}
        employees={employees}
        centers={centers}
        types={types}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          fb.notify("Movimentação criada com sucesso.");
          void load();
        }}
      />
    )}
  </PageShell>;
}

export function MeiContractsPage({ token, user }: { token: string; user: User }) {
  const { selectedCompany } = useDemoScope();
  const [employees, setEmployees] = useState<DemoEmployee[]>([]);
  const [contracts, setContracts] = useState<DemoMeiContract[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(contractYearEnd(new Date().toISOString().slice(0, 10)));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<DemoMeiContract | null>(null);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentDataUrl, setAttachmentDataUrl] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedStartDate, setSelectedStartDate] = useState("");
  const [selectedEndDate, setSelectedEndDate] = useState("");
  const [renewStartDate, setRenewStartDate] = useState("");
  const [renewEndDate, setRenewEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingContract, setSavingContract] = useState(false);
  const fb = useFeedback();

  async function load() {
    setLoading(true);
    fb.setError("");
    try {
      const [employeeList, contractList] = await Promise.all([
        api<DemoEmployee[]>("/employees", {}, token),
        api<DemoMeiContract[]>("/demo/mei-contracts", {}, token)
      ]);
      setEmployees(employeeList);
      setContracts(contractList);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao carregar contratos MEI");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, selectedCompany.id]);
  useEffect(() => {
    const targetId = Number(localStorage.getItem("nexo:mei-contract-target-id"));
    if (!targetId || !contracts.length) return;
    const target = contracts.find(contract => contract.id === targetId);
    if (target) setSelected(target);
    localStorage.removeItem("nexo:mei-contract-target-id");
  }, [contracts]);
  useEffect(() => {
    if (!selected) return;
    setSelectedEmployeeId(String(selected.employee_id));
    setSelectedStartDate(selected.start_date);
    setSelectedEndDate(selected.end_date);
    const renewalStart = addCalendarDays(selected.end_date, 1);
    setRenewStartDate(renewalStart);
    setRenewEndDate(contractYearEnd(renewalStart));
    setAttachmentName("");
    setAttachmentDataUrl("");
  }, [selected?.id]);

  const meis = useMemo(() => employees.filter(item => item.status === "ACTIVE" && item.employment_type.name === "MEI"), [employees]);
  const filtered = useMemo(() => contracts.filter(contract => (!status || contract.status === status) && (!query || `${contract.employee_name} ${contract.employee_code} ${contract.result_center.code} ${contract.end_date}`.toLowerCase().includes(query.toLowerCase()))), [contracts, query, status]);
  const summary = useMemo(() => ({
    pending: contracts.filter(item => item.status === "Pendente de assinatura").length,
    active: contracts.filter(item => item.status === "Ativo").length,
    due5: contracts.filter(item => item.status === "Ativo" && meiDaysLeft(item.end_date) <= 5).length
  }), [contracts]);

  async function createContract() {
    if (restricted(user, fb.fail)) return;
    if (selectedCompany.id === 0) return fb.fail("Selecione uma empresa específica para lançar contratos MEI.");
    try {
      await api("/demo/mei-contracts", { method: "POST", body: JSON.stringify({ employee_id: Number(employeeId), start_date: startDate, end_date: endDate }) }, token);
      fb.notify("Contrato MEI lançado como pendente de assinatura.");
      setEmployeeId("");
      await load();
    } catch (err) { fb.fail(err instanceof Error ? err.message : "Erro ao lançar contrato MEI"); }
  }

  async function signContract() {
    if (restricted(user, fb.fail) || !selected) return;
    if (!attachmentName) return fb.fail("Anexe o contrato para concluir a assinatura.");
    setSavingContract(true);
    try {
      await api(`/demo/mei-contracts/${selected.id}/sign`, { method: "PATCH", body: JSON.stringify({ attachment_name: attachmentName, attachment_data_url: attachmentDataUrl }) }, token);
      fb.notify("Contrato assinado e ativado. O alerta foi resolvido.");
      setSelected(null);
      await load();
    } catch (err) { fb.fail(err instanceof Error ? err.message : "Erro ao assinar contrato"); }
    finally { setSavingContract(false); }
  }

  async function editContract() {
    if (restricted(user, fb.fail) || !selected) return;
    setSavingContract(true);
    try {
      const updated = await api<DemoMeiContract>(`/demo/mei-contracts/${selected.id}`, { method: "PATCH", body: JSON.stringify({ employee_id: Number(selectedEmployeeId), start_date: selectedStartDate, end_date: selectedEndDate }) }, token);
      setSelected(updated);
      fb.notify("Contrato pendente atualizado e registrado na Auditoria.");
      await load();
    } catch (err) { fb.fail(err instanceof Error ? err.message : "Erro ao editar contrato"); }
    finally { setSavingContract(false); }
  }

  async function renewContract() {
    if (restricted(user, fb.fail) || !selected) return;
    setSavingContract(true);
    try {
      const renewed = await api<DemoMeiContract>(`/demo/mei-contracts/${selected.id}/renew`, { method: "POST", body: JSON.stringify({ start_date: renewStartDate, end_date: renewEndDate }) }, token);
      setSelected(renewed);
      fb.notify("Renovação criada. Anexe o novo contrato assinado.");
      await load();
    } catch (err) { fb.fail(err instanceof Error ? err.message : "Erro ao renovar contrato"); }
    finally { setSavingContract(false); }
  }

  async function deleteContract() {
    if (restricted(user, fb.fail) || !selected) return;
    const password = window.prompt("Informe sua senha para excluir este contrato pendente.");
    if (!password || !window.confirm("Excluir este contrato pendente? A operação será registrada na Auditoria.")) return;
    setSavingContract(true);
    try {
      await api(`/demo/mei-contracts/${selected.id}`, { method: "DELETE", body: JSON.stringify({ password }) }, token);
      setSelected(null);
      fb.notify("Contrato pendente excluído e registrado na Auditoria.");
      await load();
    } catch (err) { fb.fail(err instanceof Error ? err.message : "Erro ao excluir contrato"); }
    finally { setSavingContract(false); }
  }

  function handleAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      event.target.value = "";
      fb.fail("O anexo deve ter no máximo 10 MB.");
      return;
    }
    setAttachmentName(file.name);
    const reader = new FileReader();
    reader.onload = () => setAttachmentDataUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function downloadAttachment(contract: DemoMeiContract) {
    if (!contract.attachment_data_url) return fb.fail("O arquivo deste contrato não está disponível para download.");
    const link = document.createElement("a");
    link.href = contract.attachment_data_url;
    link.download = contract.attachment_name || `contrato-mei-${contract.id}`;
    link.click();
  }

  return <PageShell title="Contratos MEI" subtitle="Acompanhe pendências, documentos assinados e renovações sem perder o histórico." error={fb.error} success={fb.success}>
    <div className="summary-grid mei-summary"><Summary label="Total" value={String(contracts.length)} /><Summary label="Ação necessária" value={String(summary.pending)} /><Summary label="Ativos" value={String(summary.active)} /><Summary label="Vencendo / vencidos" value={String(summary.due5)} strong /></div>
    <div className="panel mei-contract-form"><h2>Novo contrato</h2><div className="filters-panel mei-contract-filters"><select value={employeeId} onChange={event => setEmployeeId(event.target.value)} disabled={selectedCompany.id === 0}><option value="">Selecione um MEI</option>{meis.map(employee => <option key={employee.id} value={employee.id}>{employee.employee.full_name} • {employee.employee_code} • {employee.result_center.code}</option>)}</select><label>Vigência inicial<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label><label>Vigência final<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label><button className="primary" type="button" onClick={() => void createContract()} disabled={selectedCompany.id === 0 || !employeeId}>Lançar contrato</button></div><p className="note">O contrato será criado em “Ação necessária” até o documento assinado ser anexado.</p></div>
    <div className="panel filters-panel mei-contract-filters"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar colaborador, CR ou data" /><select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos os status</option><option value="Pendente de assinatura">Ação necessária</option><option value="Ativo">Ativo</option></select></div>
    <DataTable loading={loading} empty="Nenhum contrato MEI encontrado."><table><thead><tr><th>Colaborador</th><th>CR</th><th>Vigência</th><th>Status</th><th>Dias</th><th>Anexo</th><th>Ações</th></tr></thead><tbody>{filtered.map(contract => { const daysLeft = meiDaysLeft(contract.end_date); return <tr key={contract.id} className="clickable" onClick={() => setSelected(contract)}><td>{contract.employee_name}<small>{contract.employee_code}</small></td><td><span className="color-dot" style={{ background: contract.result_center.color }} />{contract.result_center.code}</td><td>{date(contract.start_date)} a {date(contract.end_date)}</td><td><span className={meiStatusClass(contract, daysLeft)}>{contract.status === "Pendente de assinatura" ? "Ação necessária" : daysLeft < 0 ? "Vencido" : contract.status}</span></td><td>{contract.status === "Ativo" ? daysLeft : "-"}</td><td>{contract.attachment_name ?? "-"}</td><td><div className="actions table-actions"><button type="button" className="secondary compact-button" onClick={event => { event.stopPropagation(); setSelected(contract); }}>Consultar</button>{contract.status === "Pendente de assinatura" && <button type="button" className="primary compact-button" onClick={event => { event.stopPropagation(); setSelected(contract); }}>Assinar</button>}{contract.status === "Ativo" && contract.attachment_data_url && <button type="button" className="secondary compact-button" onClick={event => { event.stopPropagation(); downloadAttachment(contract); }}>Baixar</button>}</div></td></tr>; })}</tbody></table>{!filtered.length && !loading && <Empty>Nenhum contrato MEI encontrado.</Empty>}</DataTable>
    {selected && <div className="panel mei-contract-drawer"><div className="selected-panel-head"><div><span className="eyebrow">Contrato selecionado</span><h2>{selected.employee_name}</h2></div><button className="ghost" type="button" onClick={() => setSelected(null)}>Fechar</button></div><div className="detail-grid"><Summary label="Status" value={selected.status === "Pendente de assinatura" ? "Ação necessária" : selected.status} /><Summary label="Vigência" value={`${date(selected.start_date)} a ${date(selected.end_date)}`} /><Summary label="Dias restantes" value={selected.status === "Ativo" ? String(meiDaysLeft(selected.end_date)) : "-"} /><Summary label="Anexo" value={selected.attachment_name ?? "Pendente"} /></div>
      {selected.status === "Pendente de assinatura" ? <div className="mei-contract-workflow"><section className="panel mei-action-panel"><span className="eyebrow">1. Conferir dados</span><h3>Editar contrato pendente</h3><div className="form-grid compact"><label className="span-2">MEI<select value={selectedEmployeeId} onChange={event => setSelectedEmployeeId(event.target.value)}>{meis.map(employee => <option key={employee.id} value={employee.id}>{employee.employee.full_name} • {employee.employee_code}</option>)}</select></label><label>Vigência inicial<input type="date" value={selectedStartDate} onChange={event => setSelectedStartDate(event.target.value)} /></label><label>Vigência final<input type="date" value={selectedEndDate} onChange={event => setSelectedEndDate(event.target.value)} /></label></div><div className="actions"><button className="secondary" type="button" onClick={() => void editContract()} disabled={savingContract}>Salvar alterações</button><button className="danger" type="button" onClick={() => void deleteContract()} disabled={savingContract}>Excluir pendente</button></div></section><section className="panel mei-action-panel mei-sign-panel"><span className="eyebrow">2. Concluir pendência</span><h3>Anexar e ativar</h3><p>O alerta desaparecerá quando o contrato assinado for anexado.</p><label>Contrato assinado<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleAttachment} /></label>{attachmentName && <p className="note">Arquivo: <strong>{attachmentName}</strong></p>}<button className="primary" type="button" onClick={() => void signContract()} disabled={savingContract || !attachmentName}>Assinar e ativar</button></section></div>
      : <div className="mei-contract-workflow"><section className="panel mei-action-panel"><span className="eyebrow">Documento vigente</span><h3>Contrato assinado</h3><p>Assinado por <strong>{selected.signed_by ?? "-"}</strong> em {selected.signed_at ? dateTime(selected.signed_at) : "-"}.</p><button className="secondary" type="button" onClick={() => downloadAttachment(selected)} disabled={!selected.attachment_data_url}>Baixar contrato</button></section><section className="panel mei-action-panel"><span className="eyebrow">Próxima vigência</span><h3>Renovar sem alterar o histórico</h3><div className="form-grid compact"><label>Início<input type="date" value={renewStartDate} onChange={event => setRenewStartDate(event.target.value)} /></label><label>Fim<input type="date" value={renewEndDate} onChange={event => setRenewEndDate(event.target.value)} /></label></div><p className="note">A renovação cria um novo contrato pendente e preserva este documento assinado.</p><button className="primary" type="button" onClick={() => void renewContract()} disabled={savingContract}>Criar renovação</button></section></div>}
    </div>}
  </PageShell>;
}

export function CostDistributionPage({ token, user }: { token: string; user: User }) {
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState(currentCompetency());
  const [center, setCenter] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [dirtyRows, setDirtyRows] = useState<Set<number>>(new Set());
  const [showCenterSummary, setShowCenterSummary] = useState(true);
  const [calculationRow, setCalculationRow] = useState<PayrollRow | null>(null);
  const [payrollRates, setPayrollRates] = useState(demoSettings.payroll_rates);
  const fb = useFeedback();

  async function load() {
    setLoading(true);
    fb.setError("");
    try {
      const [response, settings] = await Promise.all([
        api<PayrollRow[]>(`/demo/payroll?competency=${competency}`, {}, token),
        selectedCompany.id === 0
          ? Promise.resolve(demoSettings)
          : api<DemoSettings>(`/demo/settings?company_id=${selectedCompany.id}`, {}, token)
      ]);
      setRows(response.map(normalizePayrollRow));
      setDirtyRows(new Set());
      setPayrollRates(settings.payroll_rates);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao carregar custo/folha");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [competency, token, selectedCompany.id]);

  const filtered = rows.filter(item => (!center || item.result_center.code === center) && (!employmentType || item.employment_type.name === employmentType) && (!query || `${item.employee_name} ${item.result_center.code} ${item.employment_type.name}`.toLowerCase().includes(query.toLowerCase())));
  const totals = filtered.reduce((acc, item) => ({
    salary: acc.salary + item.salary,
    proLabore: acc.proLabore + item.pro_labore,
    profit: acc.profit + item.profit_distribution,
    costAid: acc.costAid + item.cost_aid,
    transport: acc.transport + item.transport,
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
    salary: 0, proLabore: 0, profit: 0, costAid: 0, transport: 0, meal: 0, lodging: 0, insurance: 0, healthPlan: 0,
    subtotal: 0, inss: 0, rat: 0, terceiros: 0, fgts: 0, charges: 0, vacation: 0, vacationThird: 0,
    fgtsVacation: 0, thirteenth: 0, fgtsThirteenth: 0, notice: 0, fgtsNotice: 0, fgtsFine: 0,
    employerContribution: 0, totalProvisions: 0, grandTotal: 0
  });
  const centerTotals = filtered.reduce<Record<string, number>>((acc, item) => {
    acc[item.result_center.code] = (acc[item.result_center.code] ?? 0) + item.grand_total;
    return acc;
  }, {});
  const benefitsTotal = totals.transport + totals.meal + totals.lodging + totals.insurance + totals.healthPlan;
  const payrollCenters = distinctBy(rows.map(item => item.result_center), item => item.code).sort((a, b) => a.code.localeCompare(b.code, "pt-BR"));
  function updateRowField(rowId: number, field: keyof Pick<PayrollRow, "salary" | "pro_labore" | "profit_distribution" | "cost_aid" | "transport" | "meal" | "lodging" | "insurance" | "health_plan">, value: number) {
    setDirtyRows(current => new Set(current).add(rowId));
    setRows(current => current.map(row => {
      if (row.employee_id !== rowId) return row;
      return recalculatePayrollRow({ ...row, [field]: value } as PayrollRow, payrollRates);
    }));
  }
  async function savePayrollChanges() {
    if (!dirtyRows.size) {
      fb.notify("Nenhuma alteração pendente.");
      return;
    }
    setLoading(true);
    fb.setError("");
    try {
      const changed = rows.filter(row => dirtyRows.has(row.employee_id));
      await Promise.all(changed.map(row => api(`/demo/payroll/${row.employee_id}?competency=${competency}`, {
        method: "PATCH",
        body: JSON.stringify({
          salary: row.salary,
          pro_labore: row.pro_labore,
          profit_distribution: row.profit_distribution,
          cost_aid: row.cost_aid,
          transport: row.transport,
          meal: row.meal,
          lodging: row.lodging,
          insurance: row.insurance,
          health_plan: row.health_plan
        })
      }, token)));
      setDirtyRows(new Set());
      setEditMode(false);
      fb.notify(`${changed.length} registro(s) salvo(s) na competência ${competency}.`);
      await load();
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Não foi possível salvar os ajustes da competência.");
    } finally {
      setLoading(false);
    }
  }

  return <PageShell
    title="Custo / Folha"
    subtitle="Leitura mensal por colaborador e Centro de Resultado, espelhando a estrutura da planilha ADM_Fopag."
    error={fb.error}
    success={fb.success}
    actions={
      <>
        <button
          className={editMode ? "primary" : "secondary"}
          onClick={() => {
            if (user.role !== "ADMIN") {
              fb.fail("Seu perfil possui acesso somente para consulta.");
              return;
            }
            if (selectedCompany.id === 0) {
              fb.fail("Selecione uma empresa específica para editar valores, pois os percentuais variam por empresa.");
              return;
            }
            setEditMode(value => !value);
          }}
        >
          {editMode ? "Sair do modo edição" : "Entrar em modo edição"}
        </button>
        {editMode && <button className="primary" onClick={() => void savePayrollChanges()} disabled={loading || !dirtyRows.size}>Salvar alterações</button>}
        <button className="secondary" onClick={() => void load()}>Atualizar visão</button>
      </>
    }
  >
    <div className="summary-grid payroll-summary">
      <Summary label="Colaboradores" value={String(filtered.length)} />
      <Summary label="Subtotal" value={money.format(totals.subtotal)} />
      <Summary label="Benefícios" value={money.format(benefitsTotal)} />
      <Summary label="Encargos" value={money.format(totals.charges)} />
      <Summary label="Provisões" value={money.format(totals.totalProvisions)} />
      <Summary label="Total geral" value={money.format(totals.grandTotal)} strong />
    </div>
    <div className="panel filters-panel payroll-filters">
      <select value={competency} onChange={e => setCompetency(e.target.value)}>{operationalCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select value={center} onChange={e => setCenter(e.target.value)}><option value="">Todos os CRs</option>{payrollCenters.map(item => <option key={item.code} value={item.code}>{item.code}</option>)}</select>
      <select value={employmentType} onChange={e => setEmploymentType(e.target.value)}>
        <option value="">Todas as modalidades</option>
        {Array.from(new Set(rows.map(item => item.employment_type.name))).sort((a, b) => a.localeCompare(b, "pt-BR")).map(type => <option key={type} value={type}>{type}</option>)}
      </select>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar colaborador ou modalidade" />
    </div>
    <p className="note">Empresa selecionada: <strong>{selectedCompany.id === 0 ? "Todas as empresas" : selectedCompany.name}</strong>. Na visão consolidada, os percentuais podem variar por empresa.</p>
    <div className="panel payroll-centers-shell">
      <div className="payroll-centers-head">
        <div>
          <span className="eyebrow">Resumo por Centro</span>
          <strong>Totais da competência</strong>
        </div>
        <button className="secondary" type="button" onClick={() => setShowCenterSummary(value => !value)}>
          {showCenterSummary ? "Recolher" : "Expandir"}
        </button>
      </div>
      {showCenterSummary && (
        <div className="list payroll-centers">
          {Object.entries(centerTotals).map(([code, amount]) => (
            <div className="list-row payroll-center" key={code}>
              <span className="color-dot" style={{ background: payrollCenters.find(item => item.code === code)?.color ?? "#999" }} />
              <strong>{code}</strong>
              <span>Total da competência</span>
              <span>{money.format(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
    <DataTable loading={loading} empty="Nenhum registro encontrado." className="payroll-table-shell">
      <table className="payroll-table">
        <thead>
          <tr>
            <th rowSpan={2}>Colaborador</th>
            <th rowSpan={2}>Centro de resultado</th>
            <th colSpan={5} className="group-head group-earnings">Composições</th>
            <th colSpan={5} className="group-head group-charges">Encargos</th>
            <th colSpan={10} className="group-head group-provisions">Provisões</th>
            <th colSpan={5} className="group-head group-earnings">Benefícios</th>
            <th rowSpan={2} className="group-head group-total">Total Geral</th>
            <th rowSpan={2}>Memória</th>
          </tr>
          <tr>
            <th className="group-earnings">Salário</th>
            <th className="group-earnings">Prolabore</th>
            <th className="group-earnings">Distribuição de Lucro</th>
            <th className="group-earnings">Ajuda de Custo</th>
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
            <th className="group-earnings">Vale transporte</th>
            <th className="group-earnings">Alimentação</th>
            <th className="group-earnings">Hospedagem</th>
            <th className="group-earnings">Seguro</th>
            <th className="group-earnings">Plano de Saúde</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(item => (
            <tr key={item.employee_id}>
              <td>{item.employee_name}<small>{item.employment_type.name}</small></td>
              <td><span className="color-dot" style={{ background: item.result_center.color }} />{item.result_center.code}</td>
              <EditablePayrollCell
                value={item.salary}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "salary", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.pro_labore}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "pro_labore", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.profit_distribution}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "profit_distribution", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.cost_aid}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "cost_aid", value)}
                className="group-earnings"
              />
              <td className="group-earnings strong subtotal-cell">{money.format(item.subtotal_earnings)}</td>
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
              <EditablePayrollCell
                value={item.transport}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "transport", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.meal}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "meal", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.lodging}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "lodging", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.insurance}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "insurance", value)}
                className="group-earnings"
              />
              <EditablePayrollCell
                value={item.health_plan}
                editing={editMode}
                onChange={value => updateRowField(item.employee_id, "health_plan", value)}
                className="group-earnings"
              />
              <td className="group-total strong">{money.format(item.grand_total)}</td>
              <td><button className="icon-button" type="button" onClick={() => setCalculationRow(item)} title="Ver memória de cálculo">i</button></td>
            </tr>
          ))}
          {filtered.length > 0 && (
            <tr className="totals-row">
              <td colSpan={2}><strong>Total da competência</strong></td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.salary)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.proLabore)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.profit)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.costAid)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.subtotal)}</td>
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
              <td className="group-earnings strong subtotal-cell">{money.format(totals.transport)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.meal)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.lodging)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.insurance)}</td>
              <td className="group-earnings strong subtotal-cell">{money.format(totals.healthPlan)}</td>
              <td className="group-total strong">{money.format(totals.grandTotal)}</td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>
      {!filtered.length && !loading && <Empty>Nenhum registro de custo/folha encontrado.</Empty>}
    </DataTable>
    <div className="payroll-footer">
      <button className="secondary" type="button" onClick={() => downloadPayrollCsv(filtered, selectedCompany, competency)}>Baixar Excel</button>
    </div>
    {calculationRow && <PayrollCalculationMemory row={calculationRow} rates={payrollRates} onClose={() => setCalculationRow(null)} />}
  </PageShell>;
}

export function AlertsPage({ token, onPage }: { token: string; user: User; onPage: (page: "employees" | "mei-contracts" | "movements") => void }) {
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

  function openCorrectiveAction(item: DemoAlert) {
    if (item.type.includes("Contrato") && item.target_id) localStorage.setItem("nexo:mei-contract-target-id", String(item.target_id));
    onPage(item.type === "Ajuste pendente" ? "movements" : item.type.includes("Contrato") ? "mei-contracts" : "employees");
  }

  return <PageShell title="Alertas" subtitle="Pendências abertas, atualizadas automaticamente após a ação corretiva." error={fb.error}>
    <div className="summary-grid">
      <Summary label="Alertas" value={String(filtered.length)} />
      <Summary label="Tipos" value={String(Object.keys(counts).length)} />
      <Summary label="Alta prioridade" value={String(filtered.filter(item => item.severity === "Alta").length)} strong />
    </div>
    <div className="panel filters-panel">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por colaborador ou mensagem" />
      <select value={type} onChange={event => setType(event.target.value)}><option value="">Todos os tipos</option>{["Férias vencendo", "Retorno de afastamento", "Contrato próximo do vencimento", "Contrato não assinado", "Ajuste pendente"].map(item => <option key={item}>{item}</option>)}</select>
      <select value={severity} onChange={event => setSeverity(event.target.value)}><option value="">Todas as prioridades</option><option>Baixa</option><option>Média</option><option>Alta</option></select>
    </div>
    <p className="note">Empresa selecionada: <strong>{selectedCompany.name}</strong>. Clique em um alerta para abrir a tela da ação corretiva; quando a pendência for resolvida, ele deixa de aparecer.</p>
    <DataTable loading={loading} empty="Nenhum alerta encontrado.">
      <table><thead><tr><th>Empresa</th><th>CR</th><th>Colaborador</th><th>Tipo</th><th>Vencimento</th><th>Prioridade</th><th>Mensagem</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.id} className="clickable" onClick={() => openCorrectiveAction(item)}><td>{item.company_name}</td><td>{item.result_center.code}</td><td>{item.employee_name}</td><td>{item.type}</td><td>{item.due_date}</td><td><span className={severityClass(item.severity)}>{item.severity}</span></td><td>{item.message}</td></tr>)}</tbody></table>
    </DataTable>
  </PageShell>;
}

export function AuditPage({ token, user }: { token: string; user: User }) {
  const { selectedCompany } = useDemoScope();
  const [items, setItems] = useState<DemoAuditEntry[]>([]);
  const [module, setModule] = useState("");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const fb = useFeedback();

  useEffect(() => { setItems([]); setSearched(false); }, [selectedCompany.id]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!module && !query.trim()) {
      fb.fail("Informe um módulo ou um termo para consultar a auditoria.");
      return;
    }
    setLoading(true);
    fb.setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (module) params.set("module", module);
      if (query.trim()) params.set("query", query.trim());
      const response = await api<DemoAuditEntry[]>(`/demo/audit-logs?${params.toString()}`, {}, token);
      setItems(response);
      setSearched(true);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao consultar auditoria");
    } finally {
      setLoading(false);
    }
  }

  return <PageShell title="Auditoria" subtitle="Registro do que foi alterado e por quem, para rastrear histórico e decisões." error={fb.error}>
    <div className="summary-grid">
      <Summary label="Registros" value={searched ? String(items.length) : "-"} />
      <Summary label="Módulos" value={searched ? String(new Set(items.map(item => item.module)).size) : "-"} />
      <Summary label="Usuários" value={searched ? String(new Set(items.map(item => item.performed_by)).size) : "-"} strong />
    </div>
    <form className="panel filters-panel" onSubmit={search}>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por ação, detalhe ou usuário" />
      <select value={module} onChange={event => setModule(event.target.value)}><option value="">Todos os módulos</option>{["Colaboradores", "Movimentações", "Contratos MEI", "Custos", "Configurações", "Backup", "Fechamento"].map(item => <option key={item}>{item}</option>)}</select>
      <button className="primary" type="submit" disabled={loading}>Consultar</button>
    </form>
    <p className="note">Empresa selecionada: <strong>{selectedCompany.name}</strong>. Usuário logado: <strong>{user.full_name}</strong>. Para manter a auditoria leve, nenhum histórico é carregado antes da consulta e o retorno é limitado a 100 registros.</p>
    {searched && <DataTable loading={loading} empty="Nenhum registro encontrado para os filtros informados.">
      <table><thead><tr><th>Data</th><th>Módulo</th><th>Ação</th><th>Empresa</th><th>Colaborador</th><th>Usuário</th><th>Detalhes</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.id}><td>{item.created_at}</td><td>{item.module}</td><td>{item.action}</td><td>{item.company_name}</td><td>{item.employee_name ?? "-"}</td><td>{item.performed_by}</td><td>{item.details}</td></tr>)}</tbody></table>
    </DataTable>}
  </PageShell>;
}

function MovementDrawer({ item, token, user, onClose, onSaved, onDeleted }: { item: DemoMovement; token: string; user: User; onClose: () => void; onSaved: (movement: DemoMovement) => void; onDeleted: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user.role !== "ADMIN") {
      setError("Seu perfil possui acesso somente para consulta.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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
      formElement.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar movimentação");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (user.role !== "ADMIN") return;
    const password = window.prompt("Informe sua senha para confirmar a exclusão desta movimentação.");
    if (!password) return;
    if (!window.confirm("Excluir esta movimentação? Esta ação não pode ser desfeita.")) return;
    setSaving(true);
    setError("");
    try {
      await api(`/demo/movements/${item.id}`, { method: "DELETE", body: JSON.stringify({ password }) }, token);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir movimentação");
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
      <div className="actions"><button className="primary" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button><button className="danger" type="button" onClick={() => void remove()} disabled={saving}>Excluir movimentação</button></div>
      {error && <p className="error-line span-2">{error}</p>}
      {success && <p className="success-line span-2">{success}</p>}
    </form> : <p className="note">Seu perfil possui acesso somente para consulta.</p>}
  </aside></div>;
}

function MovementCreateModal({
  token,
  companyId,
  competency,
  employees,
  centers,
  types,
  onClose,
  onCreated
}: {
  token: string;
  companyId: number;
  competency: string;
  employees: DemoEmployee[];
  centers: ResultCenter[];
  types: EmploymentType[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [employmentType, setEmploymentType] = useState("");
  const [center, setCenter] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [movementType, setMovementType] = useState("falta");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState(1);
  const [hours, setHours] = useState(8.8);
  const [observation, setObservation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);

  const basicsSelected = Boolean(employmentType && center);
  const eligibleEmployees = useMemo(() => {
    if (!basicsSelected) return [];
    return employees
      .filter(employee => employee.status === "ACTIVE")
      .filter(employee => employee.employment_type.name === employmentType)
      .filter(employee => employee.result_center.code === center)
      .sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name, "pt-BR"));
  }, [basicsSelected, center, employees, employmentType]);

  useEffect(() => {
    const key = movementDraftKey(companyId, competency);
    try {
      const saved = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<MovementDraft> | null;
      if (saved) {
        setEmploymentType(saved.employmentType ?? "");
        setCenter(saved.center ?? "");
        setEmployeeId(saved.employeeId ?? "");
        setMovementType(saved.movementType ?? "falta");
        setStartDate(saved.startDate ?? new Date().toISOString().slice(0, 10));
        setEndDate(saved.endDate ?? "");
        setDays(Math.max(Number(saved.days) || 1, 1));
        setHours(Number(saved.hours) || 0);
        setObservation(saved.observation ?? "");
      }
    } catch {
      window.localStorage.removeItem(key);
    } finally {
      setDraftLoaded(true);
    }
  }, [companyId, competency]);

  useEffect(() => {
    if (!draftLoaded) return;
    const draft: MovementDraft = { employmentType, center, employeeId, movementType, startDate, endDate, days, hours, observation };
    window.localStorage.setItem(movementDraftKey(companyId, competency), JSON.stringify(draft));
  }, [center, companyId, competency, days, draftLoaded, employeeId, employmentType, endDate, hours, movementType, observation, startDate]);

  const selectedEmployee = eligibleEmployees.find(employee => employee.id === Number(employeeId));
  const periodMovement = isPeriodMovement(movementType);
  const calculatedEndDate = periodMovement ? addCalendarDays(startDate, days - 1) : endDate;
  const calculatedHours = periodMovement ? Number((Number(selectedEmployee?.daily_hours ?? 0) * days).toFixed(2)) : hours;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!basicsSelected) {
      setError("Selecione modalidade e Centro de Resultado para liberar a ficha.");
      return;
    }
    if (!employeeId) {
      setError("Selecione um colaborador.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/demo/movements", {
        method: "POST",
        body: JSON.stringify({
          competency,
          employee_id: Number(employeeId),
          type: movementType,
          start_date: startDate,
          end_date: calculatedEndDate || null,
          days,
          hour_impact: calculatedHours,
          observation: observation.trim() || "Movimentação lançada manualmente."
        })
      }, token);
      window.localStorage.removeItem(movementDraftKey(companyId, competency));
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar movimentação");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="presentation-modal movement-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <form className="presentation-modal-panel movement-modal" onClick={event => event.stopPropagation()} onSubmit={submit}>
        <div className="presentation-modal-header movement-modal-header">
          <div>
            <span className="eyebrow">Nova movimentação</span>
            <h2>Ficha de lançamento</h2>
            <p>Selecione modalidade e Centro de Resultado para carregar somente os colaboradores elegíveis.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="presentation-modal-body movement-modal-body">
          <div className="movement-form-grid">
            <label>Modalidade<select value={employmentType} onChange={event => { setEmploymentType(event.target.value); setEmployeeId(""); }} required autoFocus>
              <option value="">Selecione</option>
              {types.filter(item => item.active).map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select></label>
            <label>Centro de Resultado<select value={center} onChange={event => { setCenter(event.target.value); setEmployeeId(""); }} required>
              <option value="">Selecione</option>
              {centers.filter(item => item.active).map(item => <option key={item.id} value={item.code}>{item.code} - {item.name}</option>)}
            </select></label>
            <label className="span-2">Colaborador<select value={employeeId} onChange={event => setEmployeeId(event.target.value)} disabled={!basicsSelected} required>
              <option value="">{basicsSelected ? "Selecione o colaborador" : "Selecione modalidade e CR primeiro"}</option>
              {eligibleEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.employee.full_name} • {employee.employee_code}</option>)}
            </select></label>
            {basicsSelected && !eligibleEmployees.length && <p className="note span-2">Nenhum colaborador ativo encontrado para esta modalidade e Centro de Resultado.</p>}
            <label>Tipo<select value={movementType} onChange={event => setMovementType(event.target.value)} disabled={!basicsSelected} required>
              {movementTypes.map(option => <option key={option} value={option}>{option}</option>)}
            </select></label>
            <label>Competência<input value={competency} readOnly disabled={!basicsSelected} /></label>
            <label>Início<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} disabled={!basicsSelected} required /></label>
            <label>Fim<input type="date" value={calculatedEndDate} onChange={event => setEndDate(event.target.value)} disabled={!basicsSelected} readOnly={periodMovement} /><small>{periodMovement ? "Calculado incluindo a data de inÃ­cio." : ""}</small></label>
            <label>Dias<input type="number" min="1" step="1" value={days} onChange={event => setDays(Number(event.target.value || 1))} disabled={!basicsSelected} required /></label>
            <label>Horas<input type="number" min="0" step="0.1" value={calculatedHours} onChange={event => setHours(Number(event.target.value || 0))} disabled={!basicsSelected} readOnly={periodMovement} required /><small>{periodMovement ? "Calculadas conforme a jornada diÃ¡ria do colaborador." : ""}</small></label>
            <label className="span-2">Observação<input value={observation} onChange={event => setObservation(event.target.value)} disabled={!basicsSelected} placeholder="Descreva o motivo ou contexto da movimentação" /></label>
          </div>
          {error && <p className="error-line">{error}</p>}
          <div className="actions movement-modal-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
            <button className="primary" disabled={saving || !basicsSelected || !employeeId}>{saving ? "Salvando..." : "Salvar movimentação"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function IndicatorsPage({ token }: { token: string }) {
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState(currentCompetency());
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
  return <PageShell title="Painel Nexo" subtitle={`Leitura consolidada da competência na empresa ${selectedCompany.name}.`} error={error}>
    <div className="panel filters-panel"><select value={competency} onChange={e => setCompetency(e.target.value)}>{operationalCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select><option>Todos os CRs</option></select><select><option>Todas modalidades</option></select></div>
    {loading && <div className="inline-loading">Carregando indicadores...</div>}
    <div className="summary-grid indicators">{cards.map(([label, value]) => <Summary key={label} label={String(label)} value={String(value)} />)}</div>
    <div className="panel formula-panel"><strong>Fórmulas</strong><p>Absenteísmo = horas não produtivas / horas programadas.</p><p>Turnover = ((admissões + desligamentos) / 2) / colaboradores do mês. Quando houver divisão por zero, o sistema exibe 0.</p></div>
  </PageShell>;
}

type ReportKey =
  | "consolidated"
  | "center"
  | "employees"
  | "movements"
  | "absenteeism"
  | "turnover"
  | "costs"
  | "salary"
  | "leaves"
  | "benefit-vt"
  | "benefit-al"
  | "benefit-ps"
  | "benefit-sv";

interface ReportColumn {
  key: string;
  label: string;
  display?: "currency" | "number" | "text" | "percent";
}

interface ReportPreview {
  title: string;
  description: string;
  kpis: { label: string; value: string }[];
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  footer?: string;
  exportLabel: string;
}

interface ReportCatalogItem {
  key: ReportKey;
  title: string;
  description: string;
  hint: string;
}

interface ReportFilters {
  center: string;
  state: string;
  employmentType: string;
  supervisor: string;
  query: string;
}

const reportCatalog: ReportCatalogItem[] = [
  { key: "consolidated", title: "Consolidado mensal", description: "Visão geral por Centro de Resultado com efetivo, custos e indicadores.", hint: "Resumo executivo" },
  { key: "center", title: "Por Centro de Resultado", description: "Detalha os quatro blocos ADM, IND, COM e DIR com comparação de custo.", hint: "Comparativo" },
  { key: "employees", title: "Colaboradores ativos", description: "Lista de colaboradores com cargo, modalidade, centro e benefícios.", hint: "Base cadastral" },
  { key: "movements", title: "Movimentações do mês", description: "Afastamentos, férias, faltas, desligamentos e impactos em dias.", hint: "Histórico mensal" },
  { key: "absenteeism", title: "Absenteísmo", description: "Horas não produtivas, jornada programada e percentual por centro.", hint: "Indicador" },
  { key: "turnover", title: "Turnover", description: "Admissões, desligamentos e taxa de rotatividade por centro.", hint: "Indicador" },
  { key: "costs", title: "Custos alocados", description: "Rateios lançados para cada Centro de Resultado com status.", hint: "Financeiro" },
  { key: "salary", title: "Histórico salarial", description: "Mudanças salariais e observações por colaborador.", hint: "Trajetória" },
  { key: "leaves", title: "Afastamentos financeiros", description: "Afastamentos, férias e atestados com dias e horas impactadas.", hint: "Operacional" },
  { key: "benefit-vt", title: "Benefício - Vale transporte", description: "Distribuições de vale transporte com dias, valor por dia e valor mensal.", hint: "Benefícios" },
  { key: "benefit-al", title: "Benefício - Alimentação", description: "Distribuições de alimentação em lote ou individual, por colaborador.", hint: "Benefícios" },
  { key: "benefit-ps", title: "Benefício - Plano de saúde", description: "Distribuições recorrentes com visão mensal por colaborador.", hint: "Benefícios" },
  { key: "benefit-sv", title: "Benefício - Seguro de vida", description: "Distribuições de seguro de vida com controle mensal e histórico.", hint: "Benefícios" }
];

export function ReportsPage({ token }: { token: string }) {
  const { selectedCompany } = useDemoScope();
  const fb = useFeedback();
  const [competency, setCompetency] = useState(currentCompetency());
  const [selectedKey, setSelectedKey] = useState<ReportKey>("consolidated");
  const [filters, setFilters] = useState<ReportFilters>({
    center: "",
    state: "",
    employmentType: "",
    supervisor: "",
    query: ""
  });
  const [companyPreview, setCompanyPreview] = useState<{ company: string; company_logo: string; cards: { code: string; name: string; color: string; active_employees: number; gross_payroll: number; total_cost: number; absenteeism?: number; turnover?: number }[] } | null>(null);
  const [employees, setEmployees] = useState<DemoEmployee[]>([]);
  const [movements, setMovements] = useState<DemoMovement[]>([]);
  const [benefits, setBenefits] = useState<DemoBenefitDistribution[]>([]);
  const [allocations, setAllocations] = useState<DemoCostAllocation[]>([]);
  const [indicators, setIndicators] = useState<IndicatorSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    fb.setError("");
    try {
      const [preview, employeeList, movementList, benefitList, allocationList, indicatorSummary] = await Promise.all([
        api<{ company: string; company_logo: string; cards: { code: string; name: string; color: string; active_employees: number; gross_payroll: number; total_cost: number; absenteeism?: number; turnover?: number }[] }>(`/demo/report-preview?competency=${competency}`, {}, token),
        api<DemoEmployee[]>("/employees", {}, token),
        api<DemoMovement[]>(`/demo/movements?competency=${competency}`, {}, token),
        api<DemoBenefitDistribution[]>(`/demo/benefit-distributions?competency=${competency}`, {}, token),
        api<DemoCostAllocation[]>(`/demo/cost-allocations?competency=${competency}`, {}, token),
        api<IndicatorSummary>(`/demo/indicators?competency=${competency}`, {}, token)
      ]);
      setCompanyPreview(preview);
      setEmployees(employeeList);
      setMovements(movementList);
      setBenefits(benefitList);
      setAllocations(allocationList);
      setIndicators(indicatorSummary);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao carregar relatórios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competency, token, selectedCompany.id]);

  const previews: Record<ReportKey, ReportPreview> = useMemo(() => buildReportPreviews({
    competency,
    companyPreview,
    employees,
    movements,
    benefits,
    allocations,
    indicators,
    companyName: selectedCompany.name,
    filters
  }), [allocations, benefits, companyPreview, competency, employees, filters, indicators, movements, selectedCompany.name]);

  const selectedReport = previews[selectedKey];
  const supervisorOptions = useMemo(() => Array.from(new Set(employees.map(item => item.supervisor_name))).sort((a, b) => a.localeCompare(b, "pt-BR")), [employees]);
  const stateOptions = useMemo(() => Array.from(new Set(employees.map(item => item.state))).sort(), [employees]);
  const employmentTypeOptions = useMemo(() => Array.from(new Set(employees.map(item => item.employment_type.name))).sort((a, b) => a.localeCompare(b, "pt-BR")), [employees]);

  return (
    <PageShell title="Relatórios" subtitle={`Pacote de saídas gerenciais para acompanhamento mensal da empresa ${selectedCompany.name}.`} error={fb.error} success={fb.success}>
      <div className="panel filters-panel report-maker-filters">
        <select value={competency} onChange={event => setCompetency(event.target.value)}>
          {operationalCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select value={filters.center} onChange={event => setFilters(current => ({ ...current, center: event.target.value }))}>
          <option value="">Todos os CRs</option>
          {(companyPreview?.cards?.length ? companyPreview.cards : demoResultCenters).map(item => <option key={item.code} value={item.code}>{item.code}</option>)}
        </select>
        <select value={filters.state} onChange={event => setFilters(current => ({ ...current, state: event.target.value }))}>
          <option value="">Todos os UF</option>
          {stateOptions.map(state => <option key={state} value={state}>{state}</option>)}
        </select>
        <select value={filters.employmentType} onChange={event => setFilters(current => ({ ...current, employmentType: event.target.value }))}>
          <option value="">Todas modalidades</option>
          {employmentTypeOptions.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
        <select value={filters.supervisor} onChange={event => setFilters(current => ({ ...current, supervisor: event.target.value }))}>
          <option value="">Todos os supervisores</option>
          {supervisorOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <input value={filters.query} onChange={event => setFilters(current => ({ ...current, query: event.target.value }))} placeholder="Buscar colaborador ou benefício" />
        <button className="secondary" type="button" onClick={() => setFilters({ center: "", state: "", employmentType: "", supervisor: "", query: "" })}>Limpar filtros</button>
      </div>
      <p className="note">Filtros básicos aplicados em todos os relatórios: competência, Centro de Resultado, UF, modalidade, supervisor e busca.</p>

      <div className="report-grid">
        {reportCatalog.map(item => (
          <article className={`report-card ${selectedKey === item.key ? "active" : ""}`} key={item.key}>
            <div className="report-card-top">
              <div>
                <span className="eyebrow">{item.hint}</span>
                <h3>{item.title}</h3>
              </div>
              <button className="secondary" type="button" onClick={() => setSelectedKey(item.key)}>Ver prévia</button>
            </div>
            <p>{item.description}</p>
          </article>
        ))}
      </div>

      <div className="panel report-preview">
        <div className="report-header">
          {companyPreview?.company_logo ? <img className="report-logo" src={companyPreview.company_logo} alt={`Logo de ${companyPreview.company}`} /> : <div className="report-logo-placeholder">Logo</div>}
          <div>
            <h2>{selectedReport.title}</h2>
            <p>{selectedReport.description}</p>
          </div>
        </div>
        <div className="summary-grid report-summary">
          {selectedReport.kpis.map(kpi => <Summary key={kpi.label} label={kpi.label} value={kpi.value} strong />)}
        </div>
        <div className="actions report-actions">
          <button className="secondary" type="button" onClick={() => void downloadReportExcel(selectedReport, selectedReport.exportLabel, companyPreview?.company ?? selectedCompany.name, competency)}>Baixar Excel</button>
          <button className="secondary" type="button" onClick={() => downloadReportPdf(selectedReport, selectedReport.exportLabel, companyPreview?.company ?? selectedCompany.name, competency)}>Gerar PDF</button>
          <button className="secondary" type="button" onClick={() => {
            try {
              printReport(selectedReport, companyPreview?.company ?? selectedCompany.name, competency, companyPreview?.company_logo);
            } catch (err) {
              fb.fail(err instanceof Error ? err.message : "Não foi possível abrir a impressão.");
            }
          }}>Imprimir</button>
        </div>
        {loading && <div className="inline-loading">Carregando prévias...</div>}
        <div className="table-wrap report-preview-shell">
          <table>
            <thead>
              <tr>
                {selectedReport.columns.map(column => <th key={column.key}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {selectedReport.rows.map((row, index) => (
                <tr key={`${selectedKey}-${index}`}>
                  {selectedReport.columns.map(column => (
                    <td key={column.key}>{formatReportCell(row[column.key], column.display)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!selectedReport.rows.length && !loading && <Empty>Nenhum dado disponível para essa prévia.</Empty>}
        </div>
        {selectedReport.footer && <p className="note">{selectedReport.footer}</p>}
      </div>
    </PageShell>
  );
}

function normalizeReportText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchesReportQuery(parts: Array<string | number | undefined | null>, query: string) {
  if (!query) return true;
  const normalized = normalizeReportText(query);
  return parts.some(part => normalizeReportText(String(part ?? "")).includes(normalized));
}

function buildReportPreviews(input: {
  competency: string;
  companyPreview: { company: string; company_logo: string; cards: { code: string; name: string; color: string; active_employees: number; gross_payroll: number; total_cost: number; absenteeism?: number; turnover?: number }[] } | null;
  employees: DemoEmployee[];
  movements: DemoMovement[];
  benefits: DemoBenefitDistribution[];
  allocations: DemoCostAllocation[];
  indicators: IndicatorSummary | null;
  companyName: string;
  filters: ReportFilters;
}): Record<ReportKey, ReportPreview> {
  const cards = (input.companyPreview?.cards ?? demoResultCenters.map(center => ({
    code: center.code,
    name: center.name,
    color: center.color,
    active_employees: 0,
    gross_payroll: 0,
    total_cost: 0,
    absenteeism: 0,
    turnover: 0
  }))).filter(card => !input.filters.center || card.code === input.filters.center);
  const employeeLookup = new Map(input.employees.map(employee => [employee.id, employee]));
  const activeEmployees = input.employees.filter(item => item.status !== "INACTIVE" && (!input.filters.center || item.result_center.code === input.filters.center) && (!input.filters.state || item.state === input.filters.state) && (!input.filters.employmentType || item.employment_type.name === input.filters.employmentType) && (!input.filters.supervisor || item.supervisor_name === input.filters.supervisor) && matchesReportQuery([item.employee.full_name, item.employee.cpf, item.employee_code, item.job_title, item.department, item.notes, item.supervisor_name, item.state, item.result_center.code], input.filters.query));
  const employeeRows = activeEmployees.slice(0, 12).map(employee => ({
    employee: employee.employee.full_name,
    center: employee.result_center.code,
    type: employee.employment_type.name,
    salary: employee.salary_base,
    benefits: employee.benefits.join(", ") || "-"
  }));
  const movementRows = input.movements.filter(item => {
    const employee = employeeLookup.get(item.employee_id);
    return (!input.filters.center || item.result_center.code === input.filters.center)
      && (!input.filters.state || employee?.state === input.filters.state)
      && (!input.filters.employmentType || employee?.employment_type.name === input.filters.employmentType)
      && (!input.filters.supervisor || employee?.supervisor_name === input.filters.supervisor)
      && matchesReportQuery([item.employee_name, item.type, item.result_center.code, item.observation, employee?.employee.cpf, employee?.job_title], input.filters.query);
  }).slice(0, 12).map(movement => ({
    employee: movement.employee_name,
    type: movement.type,
    center: movement.result_center.code,
    days: movement.days,
    hours: movement.hour_impact,
    status: movement.status,
    observation: movement.observation
  }));
  const allocationRows = input.allocations.filter(item => (!input.filters.center || item.result_center.code === input.filters.center) && matchesReportQuery([item.result_center.code, item.category, item.description, item.status], input.filters.query)).slice(0, 12).map(item => ({
    center: item.result_center.code,
    category: item.category,
    description: item.description,
    amount: item.amount,
    status: item.status
  }));
  const salaryRows = input.employees
    .filter(employee => employee.status !== "INACTIVE" && (!input.filters.center || employee.result_center.code === input.filters.center) && (!input.filters.state || employee.state === input.filters.state) && (!input.filters.employmentType || employee.employment_type.name === input.filters.employmentType) && (!input.filters.supervisor || employee.supervisor_name === input.filters.supervisor) && matchesReportQuery([employee.employee.full_name, employee.employee.cpf, employee.job_title, employee.department], input.filters.query))
    .flatMap(employee => (employee.salary_history ?? []).slice(0, 3).map((item: { date?: string; effective_date?: string; amount: number; family_allowance: number; reason: string }) => ({
      employee: employee.employee.full_name,
      date: item.date ?? item.effective_date ?? "",
      amount: item.amount,
      family_allowance: item.family_allowance,
      reason: item.reason
    })))
    .slice(0, 15);
  const leaveRows = input.movements.filter(item => {
    const employee = employeeLookup.get(item.employee_id);
    return ["afastamento", "atestado", "férias"].includes(item.type)
      && (!input.filters.center || item.result_center.code === input.filters.center)
      && (!input.filters.state || employee?.state === input.filters.state)
      && (!input.filters.employmentType || employee?.employment_type.name === input.filters.employmentType)
      && (!input.filters.supervisor || employee?.supervisor_name === input.filters.supervisor)
      && matchesReportQuery([item.employee_name, item.type, item.observation, employee?.job_title], input.filters.query);
  }).slice(0, 15).map(item => ({
    employee: item.employee_name,
    type: item.type,
    center: item.result_center.code,
    days: item.days,
    hours: item.hour_impact,
    observation: item.observation
  }));
  const movementStatsByCenter = cards.map(center => {
    const scoped = input.movements.filter(item => item.result_center.code === center.code);
    return {
      code: center.code,
      name: center.name,
      color: center.color,
      admissions: scoped.filter(item => item.type === "admissão").length,
      terminations: scoped.filter(item => item.type === "desligamento").length,
      turnover: input.indicators ? input.indicators.turnover : 0
    };
  });
  const turnoverRows = cards.map(card => {
    const stats = movementStatsByCenter.find(item => item.code === card.code);
    return {
      code: card.code,
      name: card.name,
      admissions: stats?.admissions ?? 0,
      terminations: stats?.terminations ?? 0,
      turnover: card.turnover ?? stats?.turnover ?? 0
    };
  });
  const benefitCards = demoBenefitDefinitions.filter(item => item.active).map(definition => {
    const scoped = input.benefits.filter(item => item.benefit_code === definition.code && (!input.filters.center || item.result_center.code === input.filters.center) && (!input.filters.state || item.state === input.filters.state) && (!input.filters.employmentType || item.employment_type === input.filters.employmentType) && (!input.filters.supervisor || item.supervisor_name === input.filters.supervisor) && matchesReportQuery([item.employee_name, item.description, item.source, item.result_center.code], input.filters.query));
    return {
      definition,
      rows: scoped.slice(0, 15).map(item => ({
        employee: item.employee_name,
        center: item.result_center.code,
        supervisor: item.supervisor_name,
        modality: item.employment_type,
        days: item.days_worked,
        value_per_day: item.value_per_day || item.monthly_value,
        amount: item.amount,
        source: item.source,
        description: item.description
      })),
      total: scoped.reduce((acc, item) => acc + item.amount, 0),
      count: scoped.length
    };
  });

  return {
    consolidated: {
      title: "Relatório mensal consolidado",
      description: "Visão geral por Centro de Resultado com efetivo, custos e indicadores.",
      exportLabel: "relatorio-mensal-consolidado",
      kpis: [
        { label: "Centros", value: String(cards.length) },
        { label: "Efetivo", value: String(cards.reduce((acc, card) => acc + Number(card.active_employees ?? 0), 0)) },
        { label: "Custo bruto", value: money.format(cards.reduce((acc, card) => acc + Number(card.gross_payroll ?? 0), 0)) },
        { label: "Custo total", value: money.format(cards.reduce((acc, card) => acc + Number(card.total_cost ?? 0), 0)) }
      ],
      columns: [
        { key: "code", label: "Centro" },
        { key: "name", label: "Nome" },
        { key: "active_employees", label: "Efetivo", display: "number" },
        { key: "gross_payroll", label: "Custo bruto", display: "currency" },
        { key: "total_cost", label: "Custo total", display: "currency" }
      ],
      rows: cards
    },
    center: {
      title: "Por Centro de Resultado",
      description: "Comparativo dos quatro blocos ADM, IND, COM e DIR com efetivo e custo.",
      exportLabel: "relatorio-por-centro",
      kpis: cards.map(card => ({ label: card.code, value: `${card.active_employees} pessoas` })).slice(0, 4),
      columns: [
        { key: "code", label: "Centro" },
        { key: "name", label: "Nome" },
        { key: "active_employees", label: "Efetivo", display: "number" },
        { key: "gross_payroll", label: "Custo bruto", display: "currency" },
        { key: "total_cost", label: "Custo total", display: "currency" }
      ],
      rows: cards,
      footer: "Os valores acima refletem a empresa selecionada na competência atual."
    },
    employees: {
      title: "Colaboradores ativos",
      description: "Base de colaboradores com modalidade, centro, salário e benefícios cadastrados.",
      exportLabel: "relatorio-colaboradores-ativos",
      kpis: [
        { label: "Ativos", value: String(activeEmployees.length) },
        { label: "Com benefícios", value: String(activeEmployees.filter(item => item.benefits.length).length) },
        { label: "CLT", value: String(activeEmployees.filter(item => item.employment_type.name === "CLT").length) },
        { label: "Outros", value: String(activeEmployees.filter(item => item.employment_type.name !== "CLT").length) }
      ],
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "center", label: "Centro" },
        { key: "type", label: "Modalidade" },
        { key: "salary", label: "Salário base", display: "currency" },
        { key: "benefits", label: "Benefícios" }
      ],
      rows: employeeRows
    },
    movements: {
      title: "Movimentações do mês",
      description: "Faltas, atestados, férias, admissões e desligamentos registrados na competência.",
      exportLabel: "relatorio-movimentacoes-mes",
      kpis: [
        { label: "Linhas", value: String(input.movements.length) },
        { label: "Afastamentos", value: String(input.movements.filter(item => ["afastamento", "atestado", "férias"].includes(item.type)).length) },
        { label: "Pendente", value: String(input.movements.filter(item => item.status === "Pendente").length) },
        { label: "Aplicada", value: String(input.movements.filter(item => item.status === "Aplicada").length) }
      ],
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "type", label: "Tipo" },
        { key: "center", label: "Centro" },
        { key: "days", label: "Dias", display: "number" },
        { key: "hours", label: "Horas", display: "number" },
        { key: "status", label: "Status" },
        { key: "observation", label: "Observação" }
      ],
      rows: movementRows
    },
    absenteeism: {
      title: "Absenteísmo",
      description: "Horas não produtivas e comparação por Centro de Resultado.",
      exportLabel: "relatorio-absenteismo",
      kpis: [
        { label: "Absenteísmo", value: percent.format(input.indicators?.absenteeism ?? 0) },
        { label: "Horas não produtivas", value: String((input.indicators?.non_productive_hours ?? 0).toFixed(1)) },
        { label: "Dias produtivos", value: String(input.indicators?.productive_days ?? 0) },
        { label: "Efetivo médio", value: String((input.indicators?.average_headcount ?? 0).toFixed(1)) }
      ],
      columns: [
        { key: "code", label: "Centro" },
        { key: "name", label: "Nome" },
        { key: "absenteeism", label: "Absenteísmo", display: "percent" },
        { key: "turnover", label: "Turnover", display: "percent" },
        { key: "active_employees", label: "Efetivo", display: "number" }
      ],
      rows: cards,
      footer: "O percentual é consolidado com base nas férias, afastamentos e atestados registrados na competência."
    },
    turnover: {
      title: "Turnover",
      description: "Admissões e desligamentos da competência com taxa de rotatividade por centro.",
      exportLabel: "relatorio-turnover",
      kpis: [
        { label: "Turnover", value: percent.format(input.indicators?.turnover ?? 0) },
        { label: "Admissões", value: String(input.indicators?.admissions ?? 0) },
        { label: "Desligamentos", value: String(input.indicators?.terminations ?? 0) },
        { label: "Efetivo final", value: String(input.indicators?.final_headcount ?? 0) }
      ],
      columns: [
        { key: "code", label: "Centro" },
        { key: "name", label: "Nome" },
        { key: "admissions", label: "Admissões", display: "number" },
        { key: "terminations", label: "Desligamentos", display: "number" },
        { key: "turnover", label: "Turnover", display: "percent" }
      ],
      rows: turnoverRows
    },
    costs: {
      title: "Custos alocados",
      description: "Rateios manuais lançados para os centros com status de conferência.",
      exportLabel: "relatorio-custos-alocados",
      kpis: [
        { label: "Rateios", value: String(allocationRows.length) },
        { label: "Lançado", value: String(input.allocations.filter(item => item.status === "Lançado").length) },
        { label: "Revisado", value: String(input.allocations.filter(item => item.status === "Revisado").length) },
        { label: "Aprovado", value: String(input.allocations.filter(item => item.status === "Aprovado").length) }
      ],
      columns: [
        { key: "center", label: "Centro" },
        { key: "category", label: "Categoria" },
        { key: "description", label: "Descrição" },
        { key: "amount", label: "Valor", display: "currency" },
        { key: "status", label: "Status" }
      ],
      rows: allocationRows
    },
    salary: {
      title: "Histórico salarial",
      description: "Linha do tempo de salários com observações e salário-família quando houver.",
      exportLabel: "relatorio-historico-salarial",
      kpis: [
        { label: "Colaboradores", value: String(activeEmployees.length) },
        { label: "Registros", value: String(salaryRows.length) },
        { label: "Com salário-família", value: String(salaryRows.filter(item => Number(item.family_allowance) > 0).length) },
        { label: "Última revisão", value: "2026-01" }
      ],
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "date", label: "Data" },
        { key: "amount", label: "Salário", display: "currency" },
        { key: "family_allowance", label: "Salário-família", display: "currency" },
        { key: "reason", label: "Motivo" }
      ],
      rows: salaryRows
    },
    leaves: {
      title: "Afastamentos financeiros",
      description: "Afastamentos, férias e atestados que impactam dias e horas da competência.",
      exportLabel: "relatorio-afastamentos-financeiros",
      kpis: [
        { label: "Eventos", value: String(leaveRows.length) },
        { label: "Férias", value: String(leaveRows.filter(item => item.type === "férias").length) },
        { label: "Atestados", value: String(leaveRows.filter(item => item.type === "atestado").length) },
        { label: "Afastamentos", value: String(leaveRows.filter(item => item.type === "afastamento").length) }
      ],
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "type", label: "Tipo" },
        { key: "center", label: "Centro" },
        { key: "days", label: "Dias", display: "number" },
        { key: "hours", label: "Horas", display: "number" },
        { key: "observation", label: "Observação" }
      ],
      rows: leaveRows
    },
    "benefit-vt": {
      title: "Benefício - Vale transporte",
      description: "Lançamentos de vale transporte com base nos colaboradores que recebem esse benefício.",
      exportLabel: "relatorio-beneficio-vale-transporte",
      kpis: (() => {
        const benefit = benefitCards.find(item => item.definition.code === "VT");
        return [
          { label: "Lançamentos", value: String(benefit?.count ?? 0) },
          { label: "Valor total", value: money.format(benefit?.total ?? 0) },
          { label: "Dias", value: String(benefit?.rows.reduce((acc, item) => acc + Number(item.days ?? 0), 0) ?? 0) },
          { label: "Colaboradores", value: String(new Set(benefit?.rows.map(item => item.employee)).size ?? 0) }
        ];
      })(),
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "center", label: "Centro" },
        { key: "supervisor", label: "Supervisor" },
        { key: "modality", label: "Modalidade" },
        { key: "days", label: "Dias", display: "number" },
        { key: "value_per_day", label: "Valor por dia", display: "currency" },
        { key: "amount", label: "Valor", display: "currency" },
        { key: "source", label: "Origem" },
        { key: "description", label: "Descrição" }
      ],
      rows: benefitCards.find(item => item.definition.code === "VT")?.rows ?? []
    },
    "benefit-al": {
      title: "Benefício - Alimentação",
      description: "Lançamentos de alimentação com distribuição em lote ou individual.",
      exportLabel: "relatorio-beneficio-alimentacao",
      kpis: (() => {
        const benefit = benefitCards.find(item => item.definition.code === "AL");
        return [
          { label: "Lançamentos", value: String(benefit?.count ?? 0) },
          { label: "Valor total", value: money.format(benefit?.total ?? 0) },
          { label: "Dias", value: String(benefit?.rows.reduce((acc, item) => acc + Number(item.days ?? 0), 0) ?? 0) },
          { label: "Colaboradores", value: String(new Set(benefit?.rows.map(item => item.employee)).size ?? 0) }
        ];
      })(),
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "center", label: "Centro" },
        { key: "supervisor", label: "Supervisor" },
        { key: "modality", label: "Modalidade" },
        { key: "days", label: "Dias", display: "number" },
        { key: "value_per_day", label: "Valor por dia", display: "currency" },
        { key: "amount", label: "Valor", display: "currency" },
        { key: "source", label: "Origem" },
        { key: "description", label: "Descrição" }
      ],
      rows: benefitCards.find(item => item.definition.code === "AL")?.rows ?? []
    },
    "benefit-ps": {
      title: "Benefício - Plano de saúde",
      description: "Lançamentos recorrentes de plano de saúde por colaborador.",
      exportLabel: "relatorio-beneficio-plano-saude",
      kpis: (() => {
        const benefit = benefitCards.find(item => item.definition.code === "PS");
        return [
          { label: "Lançamentos", value: String(benefit?.count ?? 0) },
          { label: "Valor total", value: money.format(benefit?.total ?? 0) },
          { label: "Colaboradores", value: String(new Set(benefit?.rows.map(item => item.employee)).size ?? 0) },
          { label: "Competência", value: input.competency.replace("-", "/") }
        ];
      })(),
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "center", label: "Centro" },
        { key: "supervisor", label: "Supervisor" },
        { key: "modality", label: "Modalidade" },
        { key: "amount", label: "Valor", display: "currency" },
        { key: "source", label: "Origem" },
        { key: "description", label: "Descrição" }
      ],
      rows: benefitCards.find(item => item.definition.code === "PS")?.rows ?? []
    },
    "benefit-sv": {
      title: "Benefício - Seguro de vida",
      description: "Lançamentos recorrentes de seguro de vida por colaborador.",
      exportLabel: "relatorio-beneficio-seguro-vida",
      kpis: (() => {
        const benefit = benefitCards.find(item => item.definition.code === "SV");
        return [
          { label: "Lançamentos", value: String(benefit?.count ?? 0) },
          { label: "Valor total", value: money.format(benefit?.total ?? 0) },
          { label: "Colaboradores", value: String(new Set(benefit?.rows.map(item => item.employee)).size ?? 0) },
          { label: "Competência", value: input.competency.replace("-", "/") }
        ];
      })(),
      columns: [
        { key: "employee", label: "Colaborador" },
        { key: "center", label: "Centro" },
        { key: "supervisor", label: "Supervisor" },
        { key: "modality", label: "Modalidade" },
        { key: "amount", label: "Valor", display: "currency" },
        { key: "source", label: "Origem" },
        { key: "description", label: "Descrição" }
      ],
      rows: benefitCards.find(item => item.definition.code === "SV")?.rows ?? []
    }
  } satisfies Record<ReportKey, ReportPreview>;
}

async function downloadReportExcel(preview: ReportPreview, fileName: string, company: string, competency: string) {
  const rows = preview.rows.map(row => Object.fromEntries(
    preview.columns.map(column => [column.label, row[column.key] ?? ""])
  ));
  await downloadExcel([
    { Relatorio: preview.title, Empresa: company, Competencia: competency },
    {},
    ...rows
  ], "Relatorio", `${fileName}-${slugify(competency)}.xlsx`);
}

function downloadReportPdf(preview: ReportPreview, fileName: string, company: string, competency: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 32;
  const pageWidth = doc.internal.pageSize.getWidth();
  const usableWidth = pageWidth - margin * 2;
  const columnWidth = usableWidth / Math.max(preview.columns.length, 1);
  let y = 38;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(preview.title, margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${company} | Competência ${competency}`, margin, y);
  y += 22;

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    preview.columns.forEach((column, index) => {
      doc.text(truncatePdfCell(column.label, columnWidth - 8, doc), margin + index * columnWidth, y);
    });
    y += 15;
    doc.setDrawColor(185, 195, 207);
    doc.line(margin, y - 5, pageWidth - margin, y - 5);
    doc.setFont("helvetica", "normal");
  };

  drawHeader();
  preview.rows.forEach(row => {
    if (y > doc.internal.pageSize.getHeight() - 35) {
      doc.addPage();
      y = 35;
      drawHeader();
    }
    preview.columns.forEach((column, index) => {
      const value = formatReportCell(row[column.key], column.display);
      doc.text(truncatePdfCell(value, columnWidth - 8, doc), margin + index * columnWidth, y);
    });
    y += 14;
  });

  if (!preview.rows.length) doc.text("Nenhum dado disponível para os filtros selecionados.", margin, y);
  doc.save(`${fileName}-${slugify(competency)}.pdf`);
}

function printReport(preview: ReportPreview, company: string, competency: string, logo?: string) {
  const popup = window.open("", "_blank", "width=1200,height=800");
  if (!popup) throw new Error("O navegador bloqueou a janela de impressão.");
  const headers = preview.columns.map(column => `<th>${escapeReportHtml(column.label)}</th>`).join("");
  const rows = preview.rows.map(row => `<tr>${preview.columns.map(column => `<td>${escapeReportHtml(formatReportCell(row[column.key], column.display))}</td>`).join("")}</tr>`).join("");
  const logoHtml = logo ? `<img src="${escapeReportHtml(logo)}" alt="Logo da empresa" />` : "";
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeReportHtml(preview.title)}</title><style>
    @page{size:landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#10233f;margin:0}header{display:flex;align-items:center;gap:16px;margin-bottom:18px}header img{max-width:120px;max-height:54px}h1{font-size:20px;margin:0 0 5px}p{font-size:11px;margin:0;color:#52647c}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}th{text-align:left;padding:7px 5px;border-bottom:1px solid #9aa8b8}td{padding:6px 5px;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}</style></head><body><header>${logoHtml}<div><h1>${escapeReportHtml(preview.title)}</h1><p>${escapeReportHtml(company)} | Competência ${escapeReportHtml(competency)}</p></div></header><table><thead><tr>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="${preview.columns.length}">Nenhum dado disponível para os filtros selecionados.</td></tr>`}</tbody></table></body></html>`);
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => popup.print(), 250);
}

function truncatePdfCell(value: string, maxWidth: number, doc: jsPDF) {
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let shortened = value;
  while (shortened.length > 1 && doc.getTextWidth(`${shortened}...`) > maxWidth) shortened = shortened.slice(0, -1);
  return `${shortened}...`;
}

function escapeReportHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] ?? character));
}

function formatReportCell(value: unknown, display?: ReportColumn["display"]) {
  if (display === "currency") return money.format(Number(value ?? 0));
  if (display === "number") return plainNumber.format(Number(value ?? 0));
  if (display === "percent") return percent.format(Number(value ?? 0));
  return String(value ?? "-");
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCnpj(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return value;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || cnpj === cnpj[0]?.repeat(14)) return false;
  const checks: [number, number[]][] = [
    [12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]],
    [13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]
  ];
  return checks.every(([size, weights]) => {
    const total = weights.reduce((acc, weight, index) => acc + Number(cnpj[index]) * weight, 0);
    const digit = total % 11 < 2 ? 0 : 11 - (total % 11);
    return digit === Number(cnpj[size]);
  });
}

function companyCodeFromName(value: string) {
  const parts = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (!parts.length) return "EMPRESA";
  return parts
    .slice(0, 3)
    .map(part => part.slice(0, 3).toUpperCase())
    .join("-")
    .slice(0, 20);
}

type SystemSection = "companies" | "general" | "jobs" | "users" | "centers" | "types" | "backup" | "import";

function sortCompaniesForDisplay(items: Company[]) {
  return [...items].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.code.localeCompare(b.code));
}

function sortTextList(items: string[]) {
  return [...items]
    .map(item => item.trim().toUpperCase())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function isAllowedSystemText(value: string) {
  return /^[0-9A-ZÀ-ÖØ-ÞÇÃÕÁÉÍÓÚÂÊÔÜ .,\/ºª-]+$/u.test(value);
}

export function SettingsPage({ token, user, initialSection = "general" }: { token: string; user: User; initialSection?: SystemSection }) {
  const { selectedCompany } = useDemoScope();
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  const [companyLogo, setCompanyLogo] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [companyDraft, setCompanyDraft] = useState({
    cnpj: "",
    code: "",
    name: "",
    trade_name: "",
    kind: "OUTRA" as Company["kind"],
    group_name: "",
    parent_company_id: "",
    active: true,
    is_primary: false,
    registration_status: "",
    opening_date: "",
    address: "",
    city: "",
    state: "",
    zip_code: ""
  });
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companyLookupLoading, setCompanyLookupLoading] = useState(false);
  const [jobTitles, setJobTitles] = useState<string[]>(demoSettings.job_titles);
  const [payrollRates, setPayrollRates] = useState<DemoSettings["payroll_rates"]>(demoSettings.payroll_rates);
  const [jobTitleDraft, setJobTitleDraft] = useState("");
  const [users, setUsers] = useState<DemoAppUser[]>([]);
  const [userDraft, setUserDraft] = useState({ username: "", full_name: "", password: "", role: "CONSULTANT" as DemoAppUser["role"] });
  const fb = useFeedback();
  const [loading, setLoading] = useState(false);
  const lockedCompany = selectedCompany.id === 0;
  const [section, setSection] = useState<SystemSection>(initialSection);
  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);
  useEffect(() => {
    let active = true;
    async function loadUsersAndCompanies() {
      setCompaniesLoading(true);
      try {
        const [companyList, systemUsers] = await Promise.all([
          api<Company[]>("/companies", {}, token),
          api<DemoAppUser[]>("/users", {}, token)
        ]);
        if (!active) return;
        setCompanies(sortCompaniesForDisplay(companyList));
        setUsers(systemUsers);
      } catch (err) {
        if (active) fb.fail(err instanceof Error ? err.message : "Erro ao carregar empresas e usuários");
      } finally {
        if (active) setCompaniesLoading(false);
      }
    }
    async function loadSettings() {
      setLoading(true);
      setSettings(null);
      setCompanyLogo("");
      fb.setError("");
      try {
        const response = await api<DemoSettings>("/demo/settings", {}, token);
        if (active) {
          setSettings(response);
          setCompanyLogo(response.company_logo ?? "");
          setJobTitles(sortTextList(response.job_titles?.length ? response.job_titles : demoSettings.job_titles));
          setPayrollRates({ ...demoSettings.payroll_rates, ...(response.payroll_rates ?? {}) });
        }
      } catch (err) {
        if (active) fb.fail(err instanceof Error ? err.message : "Erro ao carregar configurações");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadUsersAndCompanies();
    void loadSettings();
    return () => {
      active = false;
    };
  }, [token, selectedCompany.id]);

  async function lookupCompany() {
    if (restricted(user, fb.fail)) return;
    const digits = onlyDigits(companyDraft.cnpj);
    if (!isValidCnpj(digits)) {
      fb.fail("Informe um CNPJ válido.");
      return;
    }
    setCompanyLookupLoading(true);
    try {
      const data = await api<{ cnpj: string; code: string; name: string; trade_name: string; kind: Company["kind"]; group_name: string; parent_company_id: number | null; active: boolean; status: string; opening_date: string; address: string; city: string; state: string; zip_code: string; source: string }>(`/companies/lookup?cnpj=${digits}`, {}, token);
      const unavailable = data.source.toLowerCase().includes("indisponível");
      setCompanyDraft(current => ({
        ...current,
        cnpj: data.cnpj,
        code: current.code || data.code,
        name: unavailable ? current.name : data.name.toUpperCase(),
        trade_name: unavailable ? current.trade_name : data.trade_name.toUpperCase(),
        kind: unavailable ? current.kind : data.kind,
        group_name: unavailable ? current.group_name : (data.group_name || data.trade_name || data.name).toUpperCase(),
      active: unavailable ? current.active : data.active,
        registration_status: unavailable ? current.registration_status : data.status.toUpperCase(),
        opening_date: unavailable ? current.opening_date : data.opening_date,
        address: unavailable ? current.address : data.address.toUpperCase(),
        city: unavailable ? current.city : data.city.toUpperCase(),
        state: unavailable ? current.state : data.state.toUpperCase(),
      zip_code: unavailable ? current.zip_code : data.zip_code
      }));
      if (unavailable) {
        fb.fail("Consulta de CNPJ indisponível no momento. Tente novamente ou preencha a empresa manualmente.");
      } else {
        fb.notify(`CNPJ localizado em ${data.source}.`);
      }
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao consultar CNPJ");
    } finally {
      setCompanyLookupLoading(false);
    }
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (restricted(user, fb.fail)) return;
    const form = new FormData(event.currentTarget);
    const code = String(form.get("company_code") ?? companyDraft.code).trim().toUpperCase();
    const name = String(form.get("company_name") ?? companyDraft.name).trim().toUpperCase();
    const cnpjDigits = onlyDigits(String(form.get("company_cnpj") ?? companyDraft.cnpj));
    if (cnpjDigits && !isValidCnpj(cnpjDigits)) {
      fb.fail("CNPJ inválido. Confira o número antes de salvar.");
      return;
    }
    const payload = {
      code: code || companyCodeFromName(name),
      cnpj: cnpjDigits || null,
      name,
      trade_name: String(form.get("trade_name") ?? companyDraft.trade_name).trim().toUpperCase(),
      kind: String(form.get("company_kind") ?? companyDraft.kind),
      group_name: String(form.get("group_name") ?? companyDraft.group_name).trim().toUpperCase(),
      parent_company_id: String(form.get("parent_company_id") ?? "").trim() ? Number(form.get("parent_company_id")) : null,
      active: form.get("company_active") === "on",
      is_primary: form.get("company_primary") === "on",
      registration_status: String(form.get("registration_status") ?? companyDraft.registration_status).trim().toUpperCase(),
      opening_date: String(form.get("opening_date") ?? companyDraft.opening_date).trim(),
      address: String(form.get("address") ?? companyDraft.address).trim().toUpperCase(),
      city: String(form.get("city") ?? companyDraft.city).trim().toUpperCase(),
      state: String(form.get("state") ?? companyDraft.state).trim().toUpperCase(),
      zip_code: String(form.get("zip_code") ?? companyDraft.zip_code).trim()
    };
    try {
      const saved = editingCompanyId
        ? await api<Company>(`/companies/${editingCompanyId}`, { method: "PATCH", body: JSON.stringify(payload) }, token)
        : await api<Company>("/companies", { method: "POST", body: JSON.stringify(payload) }, token);
      setCompanies(current => {
        const normalized = current
          .filter(item => item.id !== saved.id)
          .map(item => saved.is_primary ? { ...item, is_primary: false } : item);
        return sortCompaniesForDisplay([saved, ...normalized]);
      });
      if (saved.is_primary) {
        localStorage.setItem("indicadores-selected-company-id", String(saved.id));
      }
      resetCompanyDraft();
      window.dispatchEvent(new Event("nexo:companies-changed"));
      fb.notify(`Empresa ${saved.name} ${editingCompanyId ? "atualizada" : "cadastrada"} com sucesso.`);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao salvar empresa");
    }
  }

  function resetCompanyDraft() {
    setEditingCompanyId(null);
    setCompanyDraft({
      cnpj: "",
      code: "",
      name: "",
      trade_name: "",
      kind: "OUTRA",
      group_name: "",
      parent_company_id: "",
      active: true,
      is_primary: false,
      registration_status: "",
      opening_date: "",
      address: "",
      city: "",
      state: "",
      zip_code: ""
    });
  }

  function editCompany(item: Company) {
    setEditingCompanyId(item.id);
    setCompanyDraft({
      cnpj: item.cnpj ? formatCnpj(item.cnpj) : "",
      code: item.code,
      name: item.name,
      trade_name: item.trade_name ?? "",
      kind: item.kind,
      group_name: item.group_name ?? "",
      parent_company_id: item.parent_company_id ? String(item.parent_company_id) : "",
      active: item.active,
      is_primary: item.is_primary,
      registration_status: item.registration_status ?? "",
      opening_date: item.opening_date ?? "",
      address: item.address ?? "",
      city: item.city ?? "",
      state: item.state ?? "",
      zip_code: item.zip_code ?? ""
    });
    setSection("companies");
  }

  async function toggleCompanyActive(item: Company) {
    if (restricted(user, fb.fail)) return;
    try {
      const updated = await api<Company>(`/companies/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active })
      }, token);
      setCompanies(current => sortCompaniesForDisplay(current.map(company => company.id === updated.id ? updated : company)));
      window.dispatchEvent(new Event("nexo:companies-changed"));
      fb.notify(`Empresa ${updated.name} ${updated.active ? "ativada" : "inativada"}. Históricos continuam disponíveis.`);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao atualizar empresa");
    }
  }

  async function deleteCompany(item: Company) {
    if (restricted(user, fb.fail)) return;
    const password = window.prompt("Informe sua senha para excluir esta empresa.");
    if (!password) return;
    if (!window.confirm(`Excluir definitivamente ${item.name}? A exclusão só será permitida se não houver colaboradores, movimentações ou outros registros vinculados.`)) return;
    try {
      await api(`/companies/${item.id}`, {
        method: "DELETE",
        body: JSON.stringify({ password })
      }, token);
      const remaining = companies.filter(company => company.id !== item.id);
      setCompanies(sortCompaniesForDisplay(remaining));
      if (editingCompanyId === item.id) resetCompanyDraft();
      const fallback = remaining.find(company => company.is_primary) ?? remaining[0];
      if (fallback) localStorage.setItem("indicadores-selected-company-id", String(fallback.id));
      window.dispatchEvent(new Event("nexo:companies-changed"));
      fb.notify(`Empresa ${item.name} excluída com sucesso.`);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao excluir empresa");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (restricted(user, fb.fail)) return;
    const form = new FormData(event.currentTarget);
    try {
      const payload: Partial<DemoSettings> = {
        default_daily_hours: Number(form.get("default_daily_hours")),
        job_titles: jobTitles,
        payroll_rates: payrollRates
      };
      if (!lockedCompany) payload.company_logo = companyLogo;
      const updated = await api<DemoSettings>("/demo/settings", {
        method: "POST",
        body: JSON.stringify(payload)
      }, token);
      setSettings(updated);
      setCompanyLogo(updated.company_logo ?? companyLogo);
      setJobTitles(sortTextList(updated.job_titles?.length ? updated.job_titles : jobTitles));
      setPayrollRates({ ...demoSettings.payroll_rates, ...(updated.payroll_rates ?? {}) });
      fb.notify(lockedCompany ? "Configurações aplicadas a todas as empresas." : "Configurações da empresa salvas com sucesso.");
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao salvar configurações");
    }
  }
  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (restricted(user, fb.fail)) return;
    try {
      const created = await api<DemoAppUser>("/users", {
        method: "POST",
        body: JSON.stringify(userDraft)
      }, token);
      setUsers(current => [created, ...current]);
      setUserDraft({ username: "", full_name: "", password: "", role: "CONSULTANT" });
      fb.notify(`Usuário ${created.username} cadastrado com sucesso.`);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao cadastrar usuário");
    }
  }
  async function saveJobTitles() {
    if (restricted(user, fb.fail)) return;
    try {
      const normalizedTitles = sortTextList(jobTitles);
      const updated = await api<DemoSettings>("/demo/settings", { method: "POST", body: JSON.stringify({ job_titles: normalizedTitles }) }, token);
      setSettings(updated);
      setJobTitles(sortTextList(updated.job_titles?.length ? updated.job_titles : normalizedTitles));
      fb.notify("Cargos e funções salvos com sucesso.");
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao salvar cargos e funções");
    }
  }
  async function toggleUserActive(item: DemoAppUser) {
    if (restricted(user, fb.fail)) return;
    try {
      const updated = await api<DemoAppUser>(`/users/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active })
      }, token);
      setUsers(current => current.map(currentUser => currentUser.id === updated.id ? { ...currentUser, active: updated.active } : currentUser));
      fb.notify(`Usuário ${updated.username} ${updated.active ? "ativado" : "inativado"}.`);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao atualizar usuário");
    }
  }
  function addJobTitle() {
    const value = jobTitleDraft.trim().toUpperCase();
    if (!value) return;
    if (!isAllowedSystemText(value)) {
      fb.fail("Cargo/função possui caractere especial. Corrija antes de adicionar.");
      return;
    }
    setJobTitles(current => sortTextList(current.some(item => item.toLowerCase() === value.toLowerCase()) ? current : [...current, value]));
    setJobTitleDraft("");
  }
  function removeJobTitle(value: string) {
    setJobTitles(current => current.filter(item => item !== value));
  }
  function updatePayrollRate(key: keyof DemoSettings["payroll_rates"], value: string) {
    setPayrollRates(current => ({
      ...current,
      [key]: Number(value.replace(",", ".")) || 0
    }));
  }
  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCompanyLogo(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }
  const generalDisabled = user.role !== "ADMIN";
  const scopedDisabled = lockedCompany || user.role !== "ADMIN";
  const scopedNotice = <div className="panel"><p>Selecione uma empresa específica para editar itens vinculados a uma empresa. A aba Geral pode ser usada como configuração global quando Todas as empresas estiver selecionado.</p></div>;
  const selectedParentOptions = companies.filter(item => item.id !== 0);
  const payrollRateLabels: [keyof DemoSettings["payroll_rates"], string][] = [
    ["inss", "INSS"],
    ["rat", "RAT"],
    ["terceiros", "Terceiros"],
    ["fgts", "FGTS"],
    ["fgts_vacation", "FGTS férias"],
    ["fgts_thirteenth", "FGTS 13º salário"],
    ["fgts_notice", "FGTS aviso"],
    ["multa_fgts", "Multa FGTS"],
    ["patronal", "Patronal"]
  ];

  if (loading && !settings && !companies.length && !users.length) return <div className="inline-loading">Carregando configurações...</div>;
  return <PageShell title="Ajustes do sistema" subtitle={`Área administrativa da empresa ${selectedCompany.name}. Cadastros, backup e importação ficam reunidos aqui.`} error={fb.error} success={fb.success}>
    <div className="segment-tabs">
      <button className={section === "companies" ? "active" : ""} onClick={() => setSection("companies")}>Empresas</button>
      <button className={section === "general" ? "active" : ""} onClick={() => setSection("general")}>Geral</button>
      <button className={section === "jobs" ? "active" : ""} onClick={() => setSection("jobs")}>Cargos e funções</button>
      <button className={section === "users" ? "active" : ""} onClick={() => setSection("users")}>Usuários</button>
      <button className={section === "centers" ? "active" : ""} onClick={() => setSection("centers")}>Centros de Resultado</button>
      <button className={section === "types" ? "active" : ""} onClick={() => setSection("types")}>Modalidades</button>
      <button className={section === "backup" ? "active" : ""} onClick={() => setSection("backup")}>Backup</button>
      <button className={section === "import" ? "active" : ""} onClick={() => setSection("import")}>Importação</button>
    </div>
    {section === "companies" && <section className="panel report-saved-panel">
      <div className="report-saved-head">
        <div>
          <span className="eyebrow">Cadastro de empresas</span>
          <h2>{editingCompanyId ? "Editar empresa" : "Registrar empresa"}</h2>
          <p>Busque o CNPJ para preencher a base automaticamente e mantenha matrizes, filiais e empresas independentes separadas.</p>
        </div>
        <span className="report-saved-count">{companies.length} empresa(s)</span>
      </div>
      <ErrorMessage message={fb.error} />
      <SuccessMessage message={fb.success} />
      <form className="panel form-grid compact" onSubmit={saveCompany}>
        <label>CNPJ<input name="company_cnpj" value={formatCnpj(companyDraft.cnpj)} onChange={event => setCompanyDraft(current => ({ ...current, cnpj: onlyDigits(event.target.value).slice(0, 14) }))} placeholder="00.000.000/0000-00" maxLength={18} inputMode="numeric" disabled={user.role !== "ADMIN"} /></label>
        <div className="inline-form" style={{ alignItems: "end" }}>
          <button className="secondary" type="button" onClick={() => void lookupCompany()} disabled={user.role !== "ADMIN" || companyLookupLoading || !isValidCnpj(companyDraft.cnpj)}>{companyLookupLoading ? "Consultando..." : "Buscar dados do CNPJ"}</button>
        </div>
        <label>Código<input name="company_code" value={companyDraft.code} onChange={event => setCompanyDraft(current => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="ALFA-MAT" disabled={user.role !== "ADMIN"} required /></label>
        <label>Nome<input name="company_name" value={companyDraft.name} onChange={event => setCompanyDraft(current => ({ ...current, name: event.target.value.toUpperCase(), code: current.code || companyCodeFromName(event.target.value), group_name: current.group_name || event.target.value.toUpperCase() }))} placeholder="EMPRESA PRINCIPAL LTDA." disabled={user.role !== "ADMIN"} required /></label>
        <label>Nome fantasia<input name="trade_name" value={companyDraft.trade_name} onChange={event => setCompanyDraft(current => ({ ...current, trade_name: event.target.value.toUpperCase() }))} placeholder="NOME FANTASIA" disabled={user.role !== "ADMIN"} /></label>
        <label>Grupo empresarial<input name="group_name" value={companyDraft.group_name} onChange={event => setCompanyDraft(current => ({ ...current, group_name: event.target.value.toUpperCase() }))} placeholder="GRUPO ALFA" disabled={user.role !== "ADMIN"} /></label>
        <label>Tipo<select name="company_kind" value={companyDraft.kind} onChange={event => setCompanyDraft(current => ({ ...current, kind: event.target.value as Company["kind"] }))} disabled={user.role !== "ADMIN"}><option value="MATRIZ">Matriz</option><option value="FILIAL">Filial</option><option value="OUTRA">Outra</option></select></label>
        <label>Matriz pai<select name="parent_company_id" value={companyDraft.parent_company_id} onChange={event => setCompanyDraft(current => ({ ...current, parent_company_id: event.target.value }))} disabled={user.role !== "ADMIN"}><option value="">Nenhuma</option>{selectedParentOptions.filter(item => item.id !== editingCompanyId).map(item => <option key={item.id} value={item.id}>{item.code} • {item.name}</option>)}</select></label>
        <label>Situação cadastral<input name="registration_status" value={companyDraft.registration_status} onChange={event => setCompanyDraft(current => ({ ...current, registration_status: event.target.value.toUpperCase() }))} placeholder="ATIVA" disabled={user.role !== "ADMIN"} /></label>
        <label>Abertura<input name="opening_date" value={companyDraft.opening_date} onChange={event => setCompanyDraft(current => ({ ...current, opening_date: event.target.value }))} placeholder="2020-01-15" disabled={user.role !== "ADMIN"} /></label>
        <label>CEP<input name="zip_code" value={companyDraft.zip_code} onChange={event => setCompanyDraft(current => ({ ...current, zip_code: event.target.value }))} placeholder="01000-000" disabled={user.role !== "ADMIN"} /></label>
        <label>Endereço<input name="address" value={companyDraft.address} onChange={event => setCompanyDraft(current => ({ ...current, address: event.target.value.toUpperCase() }))} placeholder="RUA, NÚMERO, COMPLEMENTO E BAIRRO" disabled={user.role !== "ADMIN"} /></label>
        <label>Cidade<input name="city" value={companyDraft.city} onChange={event => setCompanyDraft(current => ({ ...current, city: event.target.value.toUpperCase() }))} placeholder="CIDADE" disabled={user.role !== "ADMIN"} /></label>
        <label>UF<input name="state" value={companyDraft.state} onChange={event => setCompanyDraft(current => ({ ...current, state: event.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" disabled={user.role !== "ADMIN"} /></label>
        <label className="checkbox-field"><input name="company_active" type="checkbox" checked={companyDraft.active} onChange={event => setCompanyDraft(current => ({ ...current, active: event.target.checked }))} disabled={user.role !== "ADMIN"} />Ativa</label>
        <label className="checkbox-field"><input name="company_primary" type="checkbox" checked={companyDraft.is_primary} onChange={event => setCompanyDraft(current => ({ ...current, is_primary: event.target.checked, active: event.target.checked ? true : current.active }))} disabled={user.role !== "ADMIN"} />Empresa principal</label>
        {user.role === "ADMIN" && <button className="primary" type="submit">{editingCompanyId ? "Salvar alterações" : "Cadastrar empresa"}</button>}
        {user.role === "ADMIN" && editingCompanyId && <button className="secondary" type="button" onClick={resetCompanyDraft}>Cancelar edição</button>}
      </form>
      <div className="panel list">
        {companies.map(item => <div key={item.id} className="list-row company-list-row">
          <strong>{item.code}</strong>
          <span>{item.cnpj ? formatCnpj(item.cnpj) : "-"}</span>
          <span>{item.name}</span>
          <span>{item.kind}</span>
          <span>{item.group_name}</span>
          <span className={item.active ? "status-pill status-active" : "status-pill status-inactive"}>{item.is_primary ? "Principal" : item.active ? "Ativa" : "Inativa"}</span>
          {user.role === "ADMIN" && <button className="secondary compact-button" type="button" onClick={() => editCompany(item)}>Editar</button>}
          {user.role === "ADMIN" && <button className="secondary compact-button" type="button" onClick={() => void toggleCompanyActive(item)}>{item.active ? "Inativar" : "Ativar"}</button>}
          {user.role === "ADMIN" && <button className="danger compact-button" type="button" onClick={() => void deleteCompany(item)}>Excluir</button>}
        </div>)}
        {!companies.length && !companiesLoading && <Empty>Nenhuma empresa cadastrada.</Empty>}
        {companiesLoading && <div className="inline-loading">Carregando empresas...</div>}
      </div>
    </section>}
    {section === "general" && (generalDisabled ? scopedNotice : <form key={selectedCompany.id} onSubmit={save} className="settings-grid">
      {lockedCompany ? <SectionCard title="Escopo geral">
        <p>Jornada e encargos salvos aqui serão aplicados a todas as empresas. Nome, CNPJ e logo permanecem individuais.</p>
      </SectionCard> : <SectionCard title="Empresa">
        <label>Nome<input value={selectedCompany.name} readOnly disabled /></label>
        <InfoLine label="CNPJ" value={(settings?.cnpj ?? selectedCompany.cnpj) ? formatCnpj(settings?.cnpj ?? selectedCompany.cnpj ?? "") : "-"} />
        <InfoLine label="Mês inicial" value={settings?.initial_month ?? "-"} />
        <div className="logo-upload">
          <label>Logo da empresa<input type="file" accept="image/*" onChange={handleLogoUpload} disabled={user.role !== "ADMIN"} /></label>
          {companyLogo ? <img className="company-logo-preview" src={companyLogo} alt={`Logo de ${selectedCompany.name}`} /> : <div className="company-logo-placeholder">Nenhum logo enviado</div>}
        </div>
      </SectionCard>}
      <SectionCard title="Jornada"><label>Jornada padrão<input name="default_daily_hours" type="number" step="0.1" defaultValue={settings?.default_daily_hours ?? 8.8} disabled={user.role !== "ADMIN"} /></label><InfoLine label="Considerar sábado" value={settings?.include_saturdays ? "Sim" : "Não"} /><InfoLine label="Feriados" value={settings?.holidays.join(", ") ?? ""} /></SectionCard>
      <SectionCard title="Encargos">
        <div className="payroll-rates-grid">
          {payrollRateLabels.map(([key, label]) => (
            <label key={key}>{label}
              <input
                type="number"
                step="0.01"
                min="0"
                value={payrollRates[key]}
                onChange={event => updatePayrollRate(key, event.target.value)}
                disabled={user.role !== "ADMIN"}
              />
            </label>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Usuários e permissões"><InfoLine label="Administrador" value="Controle total" /><InfoLine label="Consultor" value="Consulta e exportação" /></SectionCard>
      {user.role === "ADMIN" && <button className="primary">Salvar configurações</button>}
    </form>)}
    {section === "jobs" && <section className="panel report-saved-panel">
      <div className="report-saved-head">
        <div>
          <span className="eyebrow">Cadastro operacional</span>
          <h2>Cargos e funções</h2>
          <p>Os cargos cadastrados aqui aparecem na lista suspensa do cadastro de colaboradores.</p>
        </div>
        <span className="report-saved-count">{jobTitles.length} cargo(s)</span>
      </div>
      <ErrorMessage message={fb.error} />
      <SuccessMessage message={fb.success} />
      <div className="panel">
        <div className="inline-form">
          <input value={jobTitleDraft} onChange={event => setJobTitleDraft(event.target.value.toUpperCase())} placeholder="Novo cargo ou função" disabled={user.role !== "ADMIN"} />
          <button className="secondary" type="button" onClick={addJobTitle} disabled={user.role !== "ADMIN"}>Adicionar</button>
          {user.role === "ADMIN" && <button className="primary" type="button" onClick={() => void saveJobTitles()}>Salvar cargos</button>}
        </div>
        <div className="chip-list">
          {sortTextList(jobTitles).map(title => <button key={title} type="button" className="chip-button" onClick={() => removeJobTitle(title)} disabled={user.role !== "ADMIN"}>{title} ×</button>)}
        </div>
      </div>
    </section>}
    {section === "users" && <section className="panel report-saved-panel">
      <div className="report-saved-head">
        <div>
          <span className="eyebrow">Cadastro de acesso</span>
          <h2>Usuários do sistema</h2>
          <p>Cadastre usuários que poderão acessar o sistema com perfil de administrador ou consultor.</p>
        </div>
        <span className="report-saved-count">{users.length} usuário(s)</span>
      </div>
      <ErrorMessage message={fb.error} />
      <SuccessMessage message={fb.success} />
      <form className="panel form-grid compact" onSubmit={saveUser}>
        <label>Usuário<input value={userDraft.username} onChange={event => setUserDraft(current => ({ ...current, username: event.target.value.replace(/\s+/g, "").toLowerCase() }))} placeholder="nome_login" disabled={user.role !== "ADMIN"} required /></label>
        <label>Nome completo<input value={userDraft.full_name} onChange={event => setUserDraft(current => ({ ...current, full_name: event.target.value }))} placeholder="Nome e sobrenome" disabled={user.role !== "ADMIN"} required /></label>
        <label>Senha<input value={userDraft.password} onChange={event => setUserDraft(current => ({ ...current, password: event.target.value }))} placeholder="Senha de acesso" disabled={user.role !== "ADMIN"} required /></label>
        <label>Perfil<select value={userDraft.role} onChange={event => setUserDraft(current => ({ ...current, role: event.target.value as DemoAppUser["role"] }))} disabled={user.role !== "ADMIN"}><option value="CONSULTANT">Consultor</option><option value="ADMIN">Administrador</option></select></label>
        {user.role === "ADMIN" && <button className="primary" type="submit">Cadastrar usuário</button>}
      </form>
      <div className="panel report-template-list">
        {users.map(item => <div key={item.id} className="report-template-item">
          <div>
            <strong>{item.full_name}</strong>
            <p>@{item.username} • {item.role === "ADMIN" ? "Administrador" : "Consultor"} • {item.active ? "Ativo" : "Inativo"}</p>
          </div>
          <div className="drawer-actions">
            <button className="secondary" type="button" onClick={() => toggleUserActive(item)} disabled={user.role !== "ADMIN"}>{item.active ? "Inativar" : "Ativar"}</button>
          </div>
        </div>)}
        {!users.length && <Empty>Nenhum usuário cadastrado.</Empty>}
      </div>
    </section>}
    {section === "centers" && (scopedDisabled ? scopedNotice : <CentersPage token={token} user={user} embedded />)}
    {section === "types" && (scopedDisabled ? scopedNotice : <TypesPage token={token} user={user} embedded />)}
    {section === "backup" && <BackupPage token={token} user={user} embedded />}
    {section === "import" && (scopedDisabled ? scopedNotice : <ImportPage token={token} user={user} embedded />)}
  </PageShell>;
}

export function CompaniesPage({ token, user }: { token: string; user: User }) {
  return <SettingsPage token={token} user={user} initialSection="companies" />;
}

export function BackupPage({ token, user, embedded = false }: { token: string; user: User; embedded?: boolean }) {
  const { selectedCompany } = useDemoScope();
  const [items, setItems] = useState<DemoBackup[]>([]);
  const fb = useFeedback();
  const companySettings = selectedCompany.settings ?? demoSettings;
  const [loading, setLoading] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const load = async () => {
    setLoading(true);
    try {
      setItems(await api<DemoBackup[]>("/backups", {}, token));
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao carregar backups");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [token, selectedCompany.id]);
  async function backup() {
    if (restricted(user, fb.fail)) return;
    try {
      if (isLocalDataMode()) downloadLocalBackup(selectedCompany.code);
      const result = await api<{ path: string }>("/backups", { method: "POST" }, token);
      fb.notify(`Backup gerado em ${result.path}.`);
      void load();
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao gerar backup");
    }
  }
  async function restoreLocalBackup(event: ChangeEvent<HTMLInputElement>) {
    if (restricted(user, fb.fail)) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { companies?: unknown[]; employees?: unknown[] };
      if (!Array.isArray(parsed.companies) || !Array.isArray(parsed.employees)) throw new Error("Arquivo de backup inválido.");
      localStorage.setItem("nexo-local-state-v1", JSON.stringify(parsed));
      window.location.reload();
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Não foi possível restaurar o backup.");
    }
  }
  async function verifyBackup(item: DemoBackup) {
    try {
      const result = await api<{ valid: boolean; entries: number; sha256: string }>(`/backups/${encodeURIComponent(item.file)}/verify`, {}, token);
      fb.notify(`Backup validado: ${result.entries} objetos restauráveis. SHA-256 ${result.sha256.slice(0, 12)}...`);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Não foi possível validar o backup.");
    }
  }
  async function downloadBackup(item: DemoBackup) {
    try {
      await downloadApiFile(`/backups/${encodeURIComponent(item.file)}/download`, token, item.file);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Não foi possível baixar o backup.");
    }
  }
  if (loading && !items.length) return <div className="inline-loading">Carregando backups...</div>;
  const content = <>
    <ErrorMessage message={fb.error} />
    <SuccessMessage message={fb.success} />
    <div className="panel actions">
      <button className="primary" type="button" onClick={() => void backup()} disabled={loading}>Gerar backup agora</button>
      {isLocalDataMode() && <button className="secondary" type="button" onClick={() => restoreInputRef.current?.click()}>Restaurar arquivo</button>}
      <input ref={restoreInputRef} type="file" accept=".json" hidden onChange={event => void restoreLocalBackup(event)} />
    </div>
    <div className="summary-grid"><Summary label="Último backup" value={items[0]?.date ?? "-"} /><Summary label="Escopo" value="Base completa do Nexo" /><Summary label="Retenção" value="90 dias" strong /></div>
    <div className="panel list">{items.map(item => <div className="list-row backup-row" key={item.id}><strong>{item.file}</strong><span>{item.date}</span><span>{item.size}</span><span className="status-pill status-active">{item.status}</span><div className="actions"><button className="secondary" type="button" onClick={() => void verifyBackup(item)}>Validar</button><button className="secondary" type="button" onClick={() => void downloadBackup(item)}>Baixar</button></div></div>)}</div>
    {!items.length && !loading && <Empty>Nenhum backup disponível.</Empty>}
  </>;
  if (embedded) return content;
  return <PageShell title="Backup" subtitle="Cópia integral do banco, incluindo todas as empresas, usuários, históricos, anexos e configurações." error={fb.error} success={fb.success}>
    <div className="summary-grid"><Summary label="Último backup" value={items[0]?.date ?? "-"} /><Summary label="Pasta" value={companySettings.backup_directory} /><Summary label="Retenção" value={`${companySettings.backup_retention} backups`} strong /></div>
    {loading && <div className="inline-loading">Carregando backups...</div>}
    <div className="panel list">{items.map(item => <div className="list-row backup-row" key={item.id}><strong>{item.file}</strong><span>{item.date}</span><span>{item.size}</span><span className="status-pill status-active">{item.status}</span></div>)}</div>
  </PageShell>;
}

function downloadLocalBackup(companyCode: string) {
  const raw = localStorage.getItem("nexo-local-state-v1");
  if (!raw) throw new Error("Não há dados locais para incluir no backup.");
  const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `nexo-backup-${slugify(companyCode)}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ClosingPage({ token, user }: { token: string; user: User }) {
  const { selectedCompany } = useDemoScope();
  const [competency, setCompetency] = useState(currentCompetency());
  const [closing, setClosing] = useState<DemoClosing | null>(null);
  const [justification, setJustification] = useState("");
  const fb = useFeedback();
  const [loading, setLoading] = useState(false);
  const lockedCompany = selectedCompany.id === 0;
  const closingCompetencies = operationalCompetencies;
  const load = async () => {
    setLoading(true);
    try {
      setClosing(await api<DemoClosing>(`/demo/closing?competency=${competency}`, {}, token));
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao carregar fechamento");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (!lockedCompany) void load(); }, [competency, token, selectedCompany.id]);
  async function change(status: "OPEN" | "CLOSED", includeJustification = false) {
    if (restricted(user, fb.fail)) return;
    setLoading(true);
    fb.setError("");
    try {
      setClosing(await api<DemoClosing>("/demo/closing", { method: "POST", body: JSON.stringify({ competency, status, justification: includeJustification ? justification : "" }) }, token));
      fb.notify(status === "CLOSED" ? "Competência fechada com sucesso." : "Competência reaberta com sucesso.");
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao atualizar fechamento");
    } finally {
      setLoading(false);
    }
  }
  if (lockedCompany) {
    return <PageShell title="Fechamento mensal" subtitle="O fechamento é por empresa. Selecione uma empresa específica para conferir o checklist." error={fb.error} success={fb.success}>
      <div className="panel"><p>Escolha uma empresa no seletor do topo para abrir o fechamento mensal.</p></div>
    </PageShell>;
  }
  if (loading && !closing) return <div className="inline-loading">Carregando fechamento...</div>;
  return <PageShell title="Fechamento mensal" subtitle={`Checklist de conferência antes do encerramento da competência na empresa ${selectedCompany.name}.`} error={fb.error} success={fb.success}
    actions={<><button className="primary" disabled={loading || closing?.status === "CLOSED" || Boolean(closing?.warnings?.length)} onClick={() => change("CLOSED")}>{loading ? "Processando..." : "Fechar competência"}</button><button className="secondary" disabled={loading || closing?.status === "CLOSED" || !closing?.warnings?.length || !justification.trim()} onClick={() => change("CLOSED", true)}>Fechar com justificativa</button><button className="secondary" disabled={loading || closing?.status !== "CLOSED"} onClick={() => change("OPEN")}>Reabrir competência</button><button className="secondary" disabled={!closing} onClick={() => void downloadClosingReport(selectedCompany.name, competency, closing)}>Gerar relatório</button></>}>
    <div className="panel filters-panel">
      <select value={competency} onChange={event => setCompetency(event.target.value)}>
        {closingCompetencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </div>
    <div className="summary-grid"><Summary label="Competência" value={closing?.competency ?? "-"} /><Summary label="Status" value={closing?.status === "OPEN" ? "Aberta" : "Fechada"} strong /></div>
    {closing?.warnings?.length ? <div className="panel"><strong>Benefícios pendentes</strong><ul className="validation-list">{closing.warnings.map(item => <li key={item}>{item}</li>)}</ul><label>Justificativa para liberar o fechamento<textarea rows={3} value={justification} onChange={event => setJustification(event.target.value)} placeholder="Explique por que o lançamento ficará pendente para registro na movimentação" /></label></div> : null}
    <div className="panel checklist">{Object.entries(closing?.checklist ?? {}).map(([label, done]) => <label key={label} className="check"><input type="checkbox" checked={done} readOnly /> {label}</label>)}</div>
  </PageShell>;
}

export function ImportPage({ token, user, embedded = false }: { token: string; user: User; embedded?: boolean }) {
  const { selectedCompany } = useDemoScope();
  const [preview, setPreview] = useState<{ rows: number; valid: number; errors: string[] } | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [employees, setEmployees] = useState<DemoEmployee[]>([]);
  const [centers, setCenters] = useState<ResultCenter[]>([]);
  const [types, setTypes] = useState<EmploymentType[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fb = useFeedback();
  useEffect(() => {
    let active = true;
    async function loadCatalogs() {
      try {
        const [employeeList, centerList, typeList] = await Promise.all([
          api<DemoEmployee[]>("/employees", {}, token),
          api<ResultCenter[]>("/result-centers", {}, token),
          api<EmploymentType[]>("/employment-types", {}, token)
        ]);
        if (!active) return;
        setEmployees(employeeList);
        setCenters(centerList);
        setTypes(typeList);
      } catch (err) {
        if (active) fb.fail(err instanceof Error ? err.message : "Erro ao preparar a importação.");
      }
    }
    void loadCatalogs();
    return () => { active = false; };
  }, [selectedCompany.id, token]);

  async function downloadTemplate() {
    await downloadExcel([{
      NOME: "NOME COMPLETO",
      "CPF/CNPJ": "52998224725",
      ADMISSAO: "2026-07-01",
      EMAIL: "NOME@EMPRESA.COM.BR",
      TELEFONE: "27999990000",
      CR: centers[0]?.code ?? "ADM",
      CARGO: "ANALISTA",
      SUPERVISOR: "",
      MODALIDADE: types[0]?.name ?? "CLT",
      SALARIO: 3000,
      CEP: "29000000",
      RUA: "RUA EXEMPLO",
      NUMERO: "100",
      COMPLEMENTO: "SALA 1",
      BAIRRO: "CENTRO",
      CIDADE: "VITORIA",
      UF: "ES",
      BANCO: "001",
      "NOME BANCO": "BANCO DO BRASIL",
      AGENCIA: "0001",
      CONTA: "12345",
      DIGITO: "0",
      "PIX TIPO": "CPF",
      PIX: "52998224725",
      BENEFICIOS: "VALE TRANSPORTE, ALIMENTAÇÃO"
    }], "Colaboradores", `modelo-colaboradores-${slugify(selectedCompany.code)}.xlsx`);
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLoading(true);
    fb.setError("");
    try {
      const parsedRows = await readFirstExcelSheet(await file.arrayBuffer());
      const errors = validateImportRows(parsedRows, centers, types, employees);
      setRows(parsedRows);
      setPreview({ rows: parsedRows.length, valid: parsedRows.length - errors.length, errors });
      if (errors.length) fb.fail("A planilha possui inconsistências. Corrija as linhas indicadas antes de importar.");
      else fb.notify("Planilha validada e pronta para importação.");
    } catch (err) {
      setRows([]);
      setPreview(null);
      fb.fail(err instanceof Error ? err.message : "Não foi possível ler a planilha.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    if (restricted(user, fb.fail)) return;
    if (!preview || !rows.length || preview.errors.length) return fb.fail("Selecione e valide uma planilha sem inconsistências.");
    setLoading(true);
    fb.setError("");
    try {
      const nextCodeByCenter = new Map<string, number>();
      for (const center of centers) {
        const last = employees
          .filter(item => item.result_center.code === center.code)
          .map(item => Number(item.employee_code.split("-").pop() ?? 0))
          .reduce((max, value) => Math.max(max, Number.isFinite(value) ? value : 0), 0);
        nextCodeByCenter.set(center.code, last + 1);
      }
      for (const raw of rows) {
        const row = normalizeSheetImportRow(raw);
        const center = centers.find(item => item.code.toUpperCase() === row.center);
        const type = types.find(item => item.name.toUpperCase() === row.type);
        if (!center || !type) throw new Error(`Centro ou modalidade não encontrado para ${row.name}.`);
        const sequence = nextCodeByCenter.get(center.code) ?? 1;
        nextCodeByCenter.set(center.code, sequence + 1);
        await api("/employees", {
          method: "POST",
          body: JSON.stringify({
            company_id: selectedCompany.id,
            full_name: row.name,
            cpf: row.document,
            employee_code: `${center.code}-${String(sequence).padStart(3, "0")}`,
            admission_date: row.admission,
            email: row.email,
            phone: row.phone,
            supervisor_name: row.supervisor,
            job_title: row.jobTitle,
            employment_type_id: type.id,
            result_center_id: center.id,
            salary_base: row.salary,
            cep: row.cep,
            street: row.street,
            address_number: row.number,
            address_complement: row.complement,
            neighborhood: row.neighborhood,
            city: row.city,
            state: row.state,
            bank_code: row.bankCode,
            bank_name: row.bankName,
            bank_agency: row.agency,
            bank_account: row.account,
            bank_account_digit: row.accountDigit,
            pix_key_type: row.pixType,
            pix_key: row.pix,
            benefits: row.benefits
          })
        }, token);
      }
      fb.notify(`${rows.length} colaborador(es) importado(s) para ${selectedCompany.name}.`);
      setRows([]);
      setPreview(null);
    } catch (err) {
      fb.fail(err instanceof Error ? err.message : "Erro ao importar colaboradores.");
    } finally {
      setLoading(false);
    }
  }
  const content = <>
    <ErrorMessage message={fb.error} />
    <SuccessMessage message={fb.success} />
    <div className="panel import-panel"><strong>Cadastro de colaboradores</strong><button className="secondary" type="button" onClick={() => void downloadTemplate()}>Baixar modelo</button><button className="upload-box" type="button" onClick={() => fileInputRef.current?.click()}>Selecionar planilha XLSX</button><input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={event => void selectFile(event)} /><button className="primary" type="button" onClick={() => void confirmImport()} disabled={loading || !preview || Boolean(preview.errors.length)}>{loading ? "Processando..." : "Confirmar importação"}</button></div>
    {preview && <div className="panel"><h2>Prévia dos dados</h2><div className="summary-grid"><Summary label="Linhas" value={preview.rows} /><Summary label="Válidas" value={preview.valid} /><Summary label="Inconsistências" value={preview.errors.length} strong /></div><ul className="validation-list">{preview.errors.map((item: string) => <li key={item}>{item}</li>)}</ul></div>}
  </>;
  if (embedded) return content;
  return <PageShell title="Importação" subtitle="Fluxo visual para validar planilhas antes de confirmar dados." error={fb.error} success={fb.success}>{content}</PageShell>;
}

function normalizeSheetImportRow(row: Record<string, unknown>) {
  const read = (...names: string[]) => {
    const entry = Object.entries(row).find(([key]) => names.some(name => normalizeReportText(key) === normalizeReportText(name)));
    return String(entry?.[1] ?? "").trim();
  };
  const salaryText = read("SALARIO", "SALÁRIO").replace(/\./g, "").replace(",", ".");
  return {
    name: read("NOME", "NOME COMPLETO").toUpperCase(),
    document: onlyDigits(read("CPF/CNPJ", "CPF", "CNPJ")),
    admission: read("ADMISSAO", "ADMISSÃO", "DATA DE ADMISSÃO") || new Date().toISOString().slice(0, 10),
    email: read("EMAIL", "E-MAIL"),
    phone: onlyDigits(read("TELEFONE", "CELULAR")),
    center: read("CR", "CENTRO DE RESULTADO").toUpperCase(),
    jobTitle: read("CARGO", "FUNÇÃO", "CARGO/FUNÇÃO").toUpperCase(),
    supervisor: read("SUPERVISOR").toUpperCase(),
    type: read("MODALIDADE", "TIPO DE CONTRATO").toUpperCase(),
    salary: Number(salaryText) || 0,
    cep: onlyDigits(read("CEP")),
    street: read("RUA", "LOGRADOURO").toUpperCase(),
    number: read("NUMERO", "NÚMERO"),
    complement: read("COMPLEMENTO").toUpperCase(),
    neighborhood: read("BAIRRO").toUpperCase(),
    city: read("CIDADE").toUpperCase(),
    state: read("UF", "ESTADO").toUpperCase(),
    bankCode: onlyDigits(read("BANCO", "CODIGO BANCO", "CÓDIGO BANCO")).slice(0, 3),
    bankName: read("NOME BANCO", "BANCO NOME").toUpperCase(),
    agency: read("AGENCIA", "AGÊNCIA"),
    account: read("CONTA"),
    accountDigit: read("DIGITO", "DÍGITO"),
    pixType: (read("PIX TIPO", "TIPO PIX") || "CPF").toUpperCase(),
    pix: read("PIX", "CHAVE PIX"),
    benefits: read("BENEFICIOS", "BENEFÍCIOS").split(",").map(item => item.trim()).filter(Boolean)
  };
}

function validateImportRows(rows: Record<string, unknown>[], centers: ResultCenter[], types: EmploymentType[], employees: DemoEmployee[]) {
  const errors: string[] = [];
  const documentsInFile = new Set<string>();
  rows.forEach((raw, index) => {
    const row = normalizeSheetImportRow(raw);
    const missing: string[] = [];
    if (!row.name) missing.push("nome");
    if (!isValidCpfCnpjImport(row.document)) missing.push("CPF/CNPJ válido");
    if (employees.some(item => onlyDigits(item.employee.cpf) === row.document) || documentsInFile.has(row.document)) missing.push("CPF/CNPJ não duplicado");
    if (row.document) documentsInFile.add(row.document);
    if (!centers.some(item => item.code.toUpperCase() === row.center)) missing.push("CR válido");
    if (!types.some(item => item.name.toUpperCase() === row.type)) missing.push("modalidade válida");
    if (!row.jobTitle) missing.push("cargo");
    if (row.salary <= 0) missing.push("salário");
    if (!row.bankName || !row.agency || !row.account || !row.accountDigit) missing.push("dados bancários");
    if (!row.pixType || !row.pix) missing.push("PIX");
    if (missing.length) errors.push(`Linha ${index + 2}: corrigir ${missing.join(", ")}.`);
  });
  return errors;
}

function isValidCpfCnpjImport(value: string) {
  if (value.length === 14) return isValidCnpj(value);
  if (value.length !== 11 || /^(\d)\1+$/.test(value)) return false;
  const digit = (size: number) => {
    const sum = value.slice(0, size).split("").reduce((total, item, index) => total + Number(item) * (size + 1 - index), 0);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(9) === Number(value[9]) && digit(10) === Number(value[10]);
}

const movementTypes = ["admissão", "desligamento", "falta", "atestado", "afastamento", "férias", "transferência de Centro de Resultado", "alteração salarial", "contrato não assinado", "contrato MEI a vencer"];
const periodMovementTypes = new Set(["atestado", "afastamento", "férias"]);

interface MovementDraft {
  employmentType: string;
  center: string;
  employeeId: string;
  movementType: string;
  startDate: string;
  endDate: string;
  days: number;
  hours: number;
  observation: string;
}

function movementDraftKey(companyId: number, competency: string) {
  return `nexo:movement-draft:${companyId}:${competency}`;
}

function isPeriodMovement(movementType: string) {
  return periodMovementTypes.has(movementType.toLowerCase());
}

function addCalendarDays(value: string, days: number) {
  if (!value) return "";
  const result = new Date(`${value}T12:00:00`);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

function contractYearEnd(startDate: string) {
  if (!startDate) return "";
  const result = new Date(`${startDate}T12:00:00`);
  result.setFullYear(result.getFullYear() + 1);
  result.setDate(result.getDate() - 1);
  return result.toISOString().slice(0, 10);
}

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR");
}

function buildYearCompetencies(year: number) {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return labels.map((label, index) => {
    const id = `${year}-${String(index + 1).padStart(2, "0")}`;
    return { id, label: `${label}/${year}` };
  });
}

async function downloadClosingReport(companyName: string, competency: string, closing: DemoClosing | null) {
  if (!closing) return;
  const rows = Object.entries(closing.checklist).map(([item, done]) => ({ Item: item, Status: done ? "Conferido" : "Pendente" }));
  await downloadExcel([
    { Empresa: companyName, Competencia: competency, Status: closing.status === "CLOSED" ? "Fechada" : "Aberta" },
    {},
    ...rows,
    ...(closing.warnings ?? []).map(warning => ({ Item: "Alerta", Status: warning }))
  ], "Fechamento", `fechamento-${slugify(companyName)}-${competency}.xlsx`);
}

function meiDaysLeft(endDate: string) {
  const target = new Date(`${endDate}T00:00:00`);
  const today = new Date();
  return Math.ceil((target.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
}

function meiStatusClass(contract: DemoMeiContract, daysLeft: number) {
  if (contract.status === "Pendente de assinatura") return "status-inactive";
  if (daysLeft <= 5) return "severity-pill severity-high";
  if (daysLeft <= 10) return "severity-pill severity-medium";
  if (daysLeft <= 15) return "severity-pill severity-low";
  return "status-active";
}

function PageShell({ title, subtitle, error = "", success = "", actions, children }: { title: string; subtitle: string; error?: string; success?: string; actions?: ReactNode; children: ReactNode }) {
  return <><div className="page-title"><div><span className="eyebrow">Sistema</span><h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className="actions">{actions}</div>}</div><ErrorMessage message={error} /><SuccessMessage message={success} />{children}</>;
}

function DataTable({ loading, empty, children, className = "" }: { loading: boolean; empty: string; children: ReactNode; className?: string }) {
  return <div className={`panel table-wrap ${className}`.trim()}>{loading && <div className="inline-loading">Carregando...</div>}{children}{!loading && !children && <Empty>{empty}</Empty>}</div>;
}

function Summary({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return <div className={`summary-card ${strong ? "strong" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function EditablePayrollCell({ value, editing, onChange, className }: { value: number; editing: boolean; onChange: (value: number) => void; className: string }) {
  return (
    <td className={className}>
      {editing ? (
        <input
          className="payroll-inline-input"
          type="number"
          step="0.01"
          min="0"
          value={Number.isFinite(value) ? value : 0}
          onChange={event => onChange(Number(event.target.value))}
        />
      ) : (
        money.format(value)
      )}
    </td>
  );
}

const payrollNumericFields = [
  "salary", "pro_labore", "profit_distribution", "cost_aid", "transport", "meal", "lodging", "insurance", "health_plan",
  "subtotal_earnings", "inss", "rat", "terceiros", "fgts", "charges", "vacation", "vacation_third", "fgts_vacation",
  "thirteenth_salary", "fgts_thirteenth_salary", "notice_indemnity", "fgts_notice", "fgts_fine", "employer_contribution",
  "total_provisions", "gross_payroll", "net_payroll", "total_cost", "grand_total"
] as const;

function normalizePayrollRow(row: PayrollRow) {
  const numericValues = Object.fromEntries(payrollNumericFields.map(field => {
    const value = Number(row[field] ?? 0);
    return [field, Number.isFinite(value) ? Math.round(value * 100) / 100 : 0];
  }));
  return { ...row, ...numericValues } as PayrollRow;
}

function PayrollCalculationMemory({ row, rates, onClose }: { row: PayrollRow; rates: DemoSettings["payroll_rates"]; onClose: () => void }) {
  const benefits = row.transport + row.meal + row.lodging + row.insurance + row.health_plan;
  const lines = [
    ["Base dos encargos", "Salário + pró-labore + distribuição de lucro + ajuda de custo", row.subtotal_earnings],
    ["INSS", `${money.format(row.subtotal_earnings)} x ${rates.inss}%`, row.inss],
    ["RAT", `${money.format(row.subtotal_earnings)} x ${rates.rat}%`, row.rat],
    ["Terceiros", `${money.format(row.subtotal_earnings)} x ${rates.terceiros}%`, row.terceiros],
    ["FGTS", `${money.format(row.subtotal_earnings)} x ${rates.fgts}%`, row.fgts],
    ["Total de encargos", "INSS + RAT + Terceiros + FGTS", row.charges],
    ["Total de provisões", "Férias + 1/3 + FGTS férias + 13º + aviso + FGTS + multa + patronal", row.total_provisions],
    ["Total de benefícios", "VT + alimentação + hospedagem + seguro + plano de saúde (fora da base de encargos)", benefits],
    ["Total geral", "Composições + encargos + provisões + benefícios", row.grand_total]
  ] as const;
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer wide" onClick={event => event.stopPropagation()}>
    <button className="ghost right" type="button" onClick={onClose}>Fechar</button>
    <span className="eyebrow">Memória de cálculo</span>
    <h2>{row.employee_name}</h2>
    <p className="note">Os benefícios são somados ao custo final, mas não compõem a base de INSS, RAT, Terceiros e FGTS.</p>
    <div className="panel table-wrap"><table><thead><tr><th>Item</th><th>Fórmula</th><th>Resultado</th></tr></thead><tbody>{lines.map(([label, formula, value]) => <tr key={label}><td><strong>{label}</strong></td><td>{formula}</td><td>{money.format(value)}</td></tr>)}</tbody></table></div>
  </aside></div>;
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel settings-section"><h2>{title}</h2>{children}</section>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="info-line"><span>{label}</span><strong>{value}</strong></div>;
}

function downloadPayrollCsv(rows: PayrollRow[], company: { id: number; name: string }, competency: string) {
  const headers = [
    "Colaborador", "Centro", "Salario", "Prolabore", "DistribuicaoLucro", "AjudaCusto",
    "Subtotal", "INSS", "RAT", "Terceiros", "FGTS", "TotalEncargos", "Ferias", "1_3Ferias", "FGTSFerias", "13Salario", "FGTS13",
    "AvisoPrevio", "FGTSAviso", "MultaFGTS", "Patronal", "TotalProvisoes", "ValeTransporte", "Alimentacao", "Hospedagem", "Seguro", "PlanoSaude", "TotalGeral"
  ];
  const totals = rows.reduce((acc, row) => ({
    salary: acc.salary + row.salary,
    pro_labore: acc.pro_labore + row.pro_labore,
    profit_distribution: acc.profit_distribution + row.profit_distribution,
    cost_aid: acc.cost_aid + row.cost_aid,
    transport: acc.transport + row.transport,
    meal: acc.meal + row.meal,
    lodging: acc.lodging + row.lodging,
    insurance: acc.insurance + row.insurance,
    health_plan: acc.health_plan + row.health_plan,
    subtotal_earnings: acc.subtotal_earnings + row.subtotal_earnings,
    inss: acc.inss + row.inss,
    rat: acc.rat + row.rat,
    terceiros: acc.terceiros + row.terceiros,
    fgts: acc.fgts + row.fgts,
    charges: acc.charges + row.charges,
    vacation: acc.vacation + row.vacation,
    vacation_third: acc.vacation_third + row.vacation_third,
    fgts_vacation: acc.fgts_vacation + row.fgts_vacation,
    thirteenth_salary: acc.thirteenth_salary + row.thirteenth_salary,
    fgts_thirteenth_salary: acc.fgts_thirteenth_salary + row.fgts_thirteenth_salary,
    notice_indemnity: acc.notice_indemnity + row.notice_indemnity,
    fgts_notice: acc.fgts_notice + row.fgts_notice,
    fgts_fine: acc.fgts_fine + row.fgts_fine,
    employer_contribution: acc.employer_contribution + row.employer_contribution,
    total_provisions: acc.total_provisions + row.total_provisions,
    grand_total: acc.grand_total + row.grand_total
  }), {
    salary: 0, pro_labore: 0, profit_distribution: 0, cost_aid: 0, transport: 0, meal: 0, lodging: 0, insurance: 0, health_plan: 0,
    subtotal_earnings: 0, inss: 0, rat: 0, terceiros: 0, fgts: 0, charges: 0, vacation: 0, vacation_third: 0,
    fgts_vacation: 0, thirteenth_salary: 0, fgts_thirteenth_salary: 0, notice_indemnity: 0, fgts_notice: 0, fgts_fine: 0,
    employer_contribution: 0, total_provisions: 0, grand_total: 0
  });
  const lines = [
    ["Empresa", company.id === 0 ? "Todas as empresas" : company.name],
    ["Competencia", competency],
    [],
    headers,
    ...rows.map(row => [
      row.employee_name,
      row.result_center.code,
      row.salary, row.pro_labore, row.profit_distribution, row.cost_aid,
      row.subtotal_earnings, row.inss, row.rat, row.terceiros, row.fgts, row.charges, row.vacation, row.vacation_third, row.fgts_vacation,
      row.thirteenth_salary, row.fgts_thirteenth_salary, row.notice_indemnity, row.fgts_notice, row.fgts_fine, row.employer_contribution,
      row.total_provisions, row.transport, row.meal, row.lodging, row.insurance, row.health_plan, row.grand_total
    ]),
    [],
    ["Totais", "", totals.salary, totals.pro_labore, totals.profit_distribution, totals.cost_aid, totals.subtotal_earnings, totals.inss, totals.rat, totals.terceiros, totals.fgts, totals.charges, totals.vacation, totals.vacation_third, totals.fgts_vacation, totals.thirteenth_salary, totals.fgts_thirteenth_salary, totals.notice_indemnity, totals.fgts_notice, totals.fgts_fine, totals.employer_contribution, totals.total_provisions, totals.transport, totals.meal, totals.lodging, totals.insurance, totals.health_plan, totals.grand_total]
  ];
  downloadCsv(`custo-folha-${slugify(competency)}.csv`, lines);
}

function downloadCsv(fileName: string, rows: any[][]) {
  const csv = rows.map(row => row.map(cell => {
    const value = cell === null || cell === undefined ? "" : String(cell);
    return `"${value.replace(/"/g, '""')}"`;
  }).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
