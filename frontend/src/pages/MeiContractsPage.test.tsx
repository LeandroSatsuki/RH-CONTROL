// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyScopeProvider } from "../context/DemoScope";
import { MeiContractsPage } from "./DemoPages";
import { api } from "../api";
vi.mock("../api", () => ({ api: vi.fn(), downloadApiFile: vi.fn(), isLocalDataMode: () => false }));

describe("consulta de contrato", () => {
  afterEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  it("abre consulta em modal e mantém Renovado verde mesmo depois do vencimento original", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const contract = { id: 10, company_id: 1, employee_id: 1, employee_name: "Pessoa MEI", employee_code: "ADM-1", employment_type: "MEI",
      result_center: { id: 1, code: "ADM", name: "Administrativo", color: "#2563eb" }, status: "Renovado", start_date: "2025-01-01", end_date: "2025-12-31",
      attachment_name: "contrato.pdf", attachment_data_url: "data:application/pdf;base64,AA==", signed_by: "Admin", signed_at: "2025-01-01T00:00:00" };
    vi.mocked(api).mockImplementation(async path => path === "/demo/mei-contracts" ? [contract] : [] as any);
    const element = document.createElement("div"); document.body.append(element);
    const root = createRoot(element);
    try {
      await act(async () => { root.render(<CompanyScopeProvider companies={[{ id: 1, name: "Empresa", code: "E1", kind: "MATRIZ", group: "", parent_company_id: null, active: true }]}><MeiContractsPage token="token" user={{ id: 1, username: "admin", full_name: "Admin", role: "ADMIN", active: true }} /></CompanyScopeProvider>); });
      const renewed = [...element.querySelectorAll("span")].find(item => item.textContent === "Renovado");
      expect(renewed?.className).toBe("status-active");
      expect(element.querySelector('[role="dialog"]')).toBeNull();
      const consult = [...element.querySelectorAll("button")].find(item => item.textContent === "Consultar")!;
      await act(async () => { consult.click(); });
      const dialog = element.querySelector('[role="dialog"]');
      expect(dialog?.textContent).toContain("Pessoa MEI");
      expect(dialog?.textContent).toContain("Excluir contrato");
      const close = [...dialog!.querySelectorAll("button")].find(item => item.textContent === "Fechar")!;
      await act(async () => { close.click(); });
      expect(element.querySelector('[role="dialog"]')).toBeNull();
    } finally { await act(async () => root.unmount()); element.remove(); }
  });
});
