// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { demoApi } from "./demoApi";
import { readFirstExcelSheet } from "./excel";
import { Company } from "./types";
import { DemoEmployee, IndicatorSummary } from "./mocks/demoTypes";
import { EmploymentType, ResultCenter } from "./types";

const adminToken = "local-admin";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("nexo-local-mode", "true");
});

describe("modo local multiempresa", () => {
  it("responde a todos os contratos usados pelas telas principais", async () => {
    const endpoints = [
      "/companies",
      "/dashboard?company_id=1&competency=2026-07",
      "/employees?company_id=1",
      "/result-centers?company_id=1",
      "/employment-types?company_id=1",
      "/demo/movements?company_id=1&competency=2026-07",
      "/demo/mei-contracts?company_id=1",
      "/demo/benefits/catalog?company_id=1",
      "/demo/benefit-distributions?company_id=1&competency=2026-07",
      "/demo/payroll?company_id=1&competency=2026-07",
      "/demo/indicators?company_id=1&competency=2026-07",
      "/demo/indicators/sheets?company_id=1&competency=2026-07",
      "/demo/report-preview?company_id=1&competency=2026-07",
      "/demo/cost-allocations?company_id=1&competency=2026-07",
      "/demo/alerts?company_id=1",
      "/demo/audit-logs?company_id=1",
      "/demo/settings?company_id=1",
      "/demo/report-templates?company_id=1",
      "/demo/indicator-revenue?company_id=1",
      "/users?company_id=1",
      "/backups?company_id=1",
      "/demo/closing?company_id=1&competency=2026-07"
    ];
    for (const endpoint of endpoints) {
      await expect(demoApi(endpoint, {}, adminToken), endpoint).resolves.toBeDefined();
    }
  }, 10_000);

  it("isola colaboradores pela empresa e consolida somente em Todas", async () => {
    const company = await demoApi<Company>("/companies", {
      method: "POST",
      body: JSON.stringify({
        code: "TELE",
        cnpj: "10173440000285",
        name: "TELEMASSAS COMERCIO LTDA",
        kind: "FILIAL",
        group_name: "TELEMASSAS",
        active: true
      })
    }, adminToken);

    const centers = await demoApi<ResultCenter[]>(`/result-centers?company_id=${company.id}`, {}, adminToken);
    const types = await demoApi<EmploymentType[]>(`/employment-types?company_id=${company.id}`, {}, adminToken);
    const center = centers.find(item => item.code === "ADM")!;
    const type = types.find(item => item.name === "CLT")!;

    const employee = await demoApi<DemoEmployee>(`/employees?company_id=${company.id}`, {
      method: "POST",
      body: JSON.stringify({
        full_name: "PESSOA TESTE MULTIEMPRESA",
        cpf: "52998224725",
        employee_code: "ADM-001",
        admission_date: "2026-01-10",
        job_title: "ANALISTA",
        employment_type_id: type.id,
        result_center_id: center.id,
        salary_base: 3500,
        bank_name: "BANCO DO BRASIL",
        bank_agency: "0001",
        bank_account: "12345",
        bank_account_digit: "0",
        pix_key_type: "CPF",
        pix_key: "52998224725",
        benefits: ["Vale transporte"]
      })
    }, adminToken);

    expect(employee.company_id).toBe(company.id);
    expect(await demoApi<DemoEmployee[]>("/employees?company_id=1", {}, adminToken)).toHaveLength(0);
    expect(await demoApi<DemoEmployee[]>(`/employees?company_id=${company.id}`, {}, adminToken)).toHaveLength(1);
    expect(await demoApi<DemoEmployee[]>("/employees?company_id=0", {}, adminToken)).toHaveLength(1);

    const companyOneCenter = (await demoApi<ResultCenter[]>("/result-centers?company_id=1", {}, adminToken)).find(item => item.code === "ADM")!;
    const companyOneType = (await demoApi<EmploymentType[]>("/employment-types?company_id=1", {}, adminToken)).find(item => item.name === "CLT")!;
    const transferred = await demoApi<DemoEmployee>(`/employees/${employee.id}?company_id=${company.id}`, {
      method: "PATCH",
      body: JSON.stringify({ company_id: 1, result_center_id: companyOneCenter.id, employment_type_id: companyOneType.id })
    }, adminToken);
    expect(transferred.company_id).toBe(1);
    expect(transferred.employee_code).toMatch(/^ADM-\d{3}$/);
    expect(await demoApi<DemoEmployee[]>(`/employees?company_id=${company.id}`, {}, adminToken)).toHaveLength(0);
    expect(await demoApi<DemoEmployee[]>("/employees?company_id=1", {}, adminToken)).toHaveLength(1);

    const inactive = await demoApi<DemoEmployee>(`/employees/${employee.id}?company_id=1`, {
      method: "PATCH",
      body: JSON.stringify({ status: "INACTIVE" })
    }, adminToken);
    expect(inactive.status).toBe("INACTIVE");
    await expect(demoApi(`/employees?company_id=${company.id}`, {
      method: "POST",
      body: JSON.stringify({
        full_name: "PESSOA DUPLICADA",
        cpf: "52998224725",
        employee_code: "ADM-999",
        admission_date: "2026-01-10",
        job_title: "ANALISTA",
        employment_type_id: type.id,
        result_center_id: center.id,
        salary_base: 3500,
        bank_name: "BANCO DO BRASIL",
        bank_agency: "0001",
        bank_account: "12345",
        bank_account_digit: "0",
        pix_key_type: "CPF",
        pix_key: "52998224725"
      })
    }, adminToken)).rejects.toThrow("Reative ou transfira");
  });

  it("mantém Centros de Resultado, modalidades e cargos globais", async () => {
    const company = await demoApi<Company>("/companies", {
      method: "POST",
      body: JSON.stringify({
        code: "GLOBAL",
        cnpj: "11222333000181",
        name: "EMPRESA CATÁLOGO GLOBAL",
        kind: "OUTRA",
        group_name: "GRUPO GLOBAL",
        active: true
      })
    }, adminToken);
    const created = await demoApi<ResultCenter>("/result-centers?company_id=1", {
      method: "POST",
      body: JSON.stringify({ code: "LOG", name: "LOGÍSTICA", color: "#123456" })
    }, adminToken);
    expect(created.company_id).toBe(1);
    const companyCenter = (await demoApi<ResultCenter[]>(`/result-centers?company_id=${company.id}`, {}, adminToken))
      .find(item => item.code === "LOG")!;
    expect(companyCenter.name).toBe("LOGÍSTICA");
    const edited = await demoApi<ResultCenter>(`/result-centers/${companyCenter.id}?company_id=${company.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "LOGÍSTICA INTERNA", active: false })
    }, adminToken);
    expect(edited.name).toBe("LOGÍSTICA INTERNA");
    expect(edited.active).toBe(false);
    const primaryCenter = (await demoApi<ResultCenter[]>("/result-centers?company_id=1", {}, adminToken))
      .find(item => item.code === "LOG")!;
    expect(primaryCenter.name).toBe("LOGÍSTICA INTERNA");
    expect(primaryCenter.active).toBe(false);

    const type = await demoApi<EmploymentType>(`/employment-types?company_id=${company.id}`, {
      method: "POST",
      body: JSON.stringify({ name: "ESTAGIÁRIO", has_charges: false, active: true })
    }, adminToken);
    expect((await demoApi<EmploymentType[]>("/employment-types?company_id=1", {}, adminToken))
      .some(item => item.name === type.name)).toBe(true);

    await demoApi(`/demo/settings?company_id=${company.id}`, {
      method: "POST",
      body: JSON.stringify({ job_titles: ["ANALISTA", "SUPERVISOR GLOBAL"] })
    }, adminToken);
    const primarySettings = await demoApi<{ job_titles: string[] }>("/demo/settings?company_id=1", {}, adminToken);
    expect(primarySettings.job_titles).toEqual(["ANALISTA", "SUPERVISOR GLOBAL"]);
    await expect(demoApi(`/result-centers/${created.id}?company_id=999`, {
      method: "PATCH",
      body: JSON.stringify({ active: true })
    }, adminToken)).rejects.toThrow("Empresa não encontrada");
  });

  it("usa apenas competências fechadas nos indicadores e bloqueia benefícios fechados", async () => {
    const employee = await demoApi<DemoEmployee>("/employees?company_id=1", {
      method: "POST",
      body: JSON.stringify({
        full_name: "COLABORADOR INDICADORES",
        cpf: "52998224725",
        employee_code: "ADM-001",
        admission_date: "2026-01-10",
        job_title: "ANALISTA",
        employment_type_id: 1,
        result_center_id: 1,
        salary_base: 3500,
        bank_name: "BANCO DO BRASIL",
        bank_agency: "0001",
        bank_account: "12345",
        bank_account_digit: "0",
        pix_key_type: "CPF",
        pix_key: "52998224725",
        benefits: ["Vale transporte"]
      })
    }, adminToken);

    const openIndicators = await demoApi<IndicatorSummary>("/demo/indicators?company_id=1&competency=2026-07", {}, adminToken);
    expect(openIndicators.final_headcount).toBe(0);

    await demoApi("/demo/benefit-distributions?company_id=1", {
      method: "POST",
      body: JSON.stringify({
        competency: "2026-07",
        benefit_code: "VT",
        employee_ids: [employee.id],
        days_worked: 22,
        value_per_day: 10,
        description: "VALE TRANSPORTE JULHO"
      })
    }, adminToken);
    await demoApi("/demo/closing?company_id=1", {
      method: "POST",
      body: JSON.stringify({ competency: "2026-07", status: "CLOSED" })
    }, adminToken);

    const closedIndicators = await demoApi<IndicatorSummary>("/demo/indicators?company_id=1&competency=2026-07", {}, adminToken);
    expect(closedIndicators.final_headcount).toBe(1);
    await expect(demoApi("/demo/benefit-distributions?company_id=1", {
      method: "POST",
      body: JSON.stringify({
        competency: "2026-07",
        benefit_code: "VT",
        employee_ids: [employee.id],
        days_worked: 1,
        value_per_day: 10,
        description: "LANÇAMENTO APÓS FECHAMENTO"
      })
    }, adminToken)).rejects.toThrow("Competência fechada");
  });

  it("mantém benefícios fora da base de encargos e dentro do total geral", async () => {
    const employee = await demoApi<DemoEmployee>("/employees?company_id=1", {
      method: "POST",
      body: JSON.stringify({
        full_name: "COLABORADOR CÁLCULO",
        cpf: "52998224725",
        employee_code: "ADM-001",
        admission_date: "2026-07-01",
        job_title: "ANALISTA",
        employment_type_id: 1,
        result_center_id: 1,
        salary_base: 4213.45,
        cost_aid: 0,
        bank_name: "BANCO DO BRASIL",
        bank_agency: "0001",
        bank_account: "12345",
        bank_account_digit: "0",
        pix_key_type: "CPF",
        pix_key: "52998224725",
        benefits: ["Vale transporte"]
      })
    }, adminToken);
    const before = (await demoApi<any[]>("/demo/payroll?company_id=1&competency=2026-07", {}, adminToken))[0];
    await demoApi("/demo/benefit-distributions?company_id=1", {
      method: "POST",
      body: JSON.stringify({
        competency: "2026-07",
        benefit_code: "VT",
        employee_ids: [employee.id],
        days_worked: 20,
        value_per_day: 16,
        description: "VALE TRANSPORTE JULHO"
      })
    }, adminToken);
    const after = (await demoApi<any[]>("/demo/payroll?company_id=1&competency=2026-07", {}, adminToken))[0];
    expect(after.transport).toBe(320);
    expect(after.cost_aid).toBe(0);
    expect(after.inss).toBe(before.inss);
    expect(after.grand_total - before.grand_total).toBeCloseTo(320, 2);
    expect(Number.isFinite(after.grand_total)).toBe(true);
  });

  it("persiste ajustes de custo por competência", async () => {
    const employee = await demoApi<DemoEmployee>("/employees?company_id=1", {
      method: "POST",
      body: JSON.stringify({
        full_name: "COLABORADOR AJUSTE CUSTO",
        cpf: "52998224725",
        employee_code: "ADM-001",
        admission_date: "2026-08-01",
        job_title: "ANALISTA",
        employment_type_id: 1,
        result_center_id: 1,
        salary_base: 3000,
        bank_name: "BANCO DO BRASIL",
        bank_agency: "0001",
        bank_account: "12345",
        bank_account_digit: "0",
        pix_key_type: "CPF",
        pix_key: "52998224725",
        benefits: []
      })
    }, adminToken);
    await demoApi(`/demo/payroll/${employee.id}?company_id=1&competency=2026-08`, {
      method: "PATCH",
      body: JSON.stringify({ salary: 3000, cost_aid: 175 })
    }, adminToken);
    const rows = await demoApi<any[]>("/demo/payroll?company_id=1&competency=2026-08", {}, adminToken);
    expect(rows.find(row => row.employee_id === employee.id)?.cost_aid).toBe(175);
  });

  it("exclui somente colaboradores e empresas sem registros vinculados", async () => {
    const employee = await demoApi<DemoEmployee>("/employees?company_id=1", {
      method: "POST",
      body: JSON.stringify({
        full_name: "CADASTRO TEMPORÁRIO",
        cpf: "52998224725",
        employee_code: "ADM-001",
        admission_date: "2026-08-01",
        job_title: "ANALISTA",
        employment_type_id: 1,
        result_center_id: 1,
        salary_base: 3000,
        pix_key_type: "CPF",
        pix_key: "52998224725"
      })
    }, adminToken);
    await expect(demoApi(`/employees/${employee.id}?company_id=1`, {
      method: "DELETE",
      body: JSON.stringify({ password: "senha-errada" })
    }, adminToken)).rejects.toThrow("Senha de confirmação inválida");
    await expect(demoApi(`/employees/${employee.id}?company_id=1`, {
      method: "DELETE",
      body: JSON.stringify({ password: "admin" })
    }, adminToken)).resolves.toEqual({ deleted: true });

    const protectedEmployee = await demoApi<DemoEmployee>("/employees?company_id=1", {
      method: "POST",
      body: JSON.stringify({
        full_name: "CADASTRO COM MOVIMENTO",
        cpf: "11144477735",
        employee_code: "ADM-002",
        admission_date: "2026-08-01",
        job_title: "ANALISTA",
        employment_type_id: 1,
        result_center_id: 1,
        salary_base: 3000,
        pix_key_type: "CPF",
        pix_key: "11144477735"
      })
    }, adminToken);
    await demoApi("/demo/movements?company_id=1", {
      method: "POST",
      body: JSON.stringify({ employee_id: protectedEmployee.id, type: "falta", start_date: "2026-08-05" })
    }, adminToken);
    await expect(demoApi(`/employees/${protectedEmployee.id}?company_id=1`, {
      method: "DELETE",
      body: JSON.stringify({ password: "admin" })
    }, adminToken)).rejects.toThrow("movimentações");

    const company = await demoApi<Company>("/companies", {
      method: "POST",
      body: JSON.stringify({ code: "TEMP", name: "EMPRESA TEMPORÁRIA", active: true })
    }, adminToken);
    await expect(demoApi(`/companies/${company.id}`, {
      method: "DELETE",
      body: JSON.stringify({ password: "admin" })
    }, adminToken)).resolves.toEqual({ deleted: true });
    await expect(demoApi("/companies/1", {
      method: "DELETE",
      body: JSON.stringify({ password: "admin" })
    }, adminToken)).rejects.toThrow("empresa principal");
  });

  it("lê planilhas XLSX de importação sem perder documento e valores", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Colaboradores");
    sheet.addRow(["NOME", "CPF/CNPJ", "SALÁRIO", "CR"]);
    sheet.addRow(["MARIA TESTE", "52998224725", 3500.5, "ADM"]);
    const buffer = await workbook.xlsx.writeBuffer();
    const rows = await readFirstExcelSheet(new Uint8Array(buffer).buffer);
    expect(rows).toEqual([{ NOME: "MARIA TESTE", "CPF/CNPJ": "52998224725", "SALÁRIO": 3500.5, CR: "ADM" }]);
  });
});
