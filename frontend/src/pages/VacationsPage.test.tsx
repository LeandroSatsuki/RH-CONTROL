// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, isLocalDataMode } from "../api";
import { CompanyScopeProvider } from "../context/DemoScope";
import { VacationsPage } from "./VacationsPage";
vi.mock("../api", () => ({ api: vi.fn(), isLocalDataMode: vi.fn(() => false) }));
vi.mock("../excel", () => ({ downloadExcel: vi.fn() }));

const period = { start: "2024-01-01", end: "2024-12-31", concession_start: "2025-01-01", concession_end: "2025-12-31", reset_on: null,
  reset_reason: "", accrued_days: 30, allocated_days: 0, available_days: 30, overdue_days: 30, status: "Vencido" };
const dossier = { id: 1, company_id: 1, name: "Pessoa de teste", reference: "ADM-1", admission_date: "2024-01-01", notes: "", revision: 1,
  as_of: "2026-10-14", periods: [period], warnings: [], events: [] };
let root: Root;
let container: HTMLDivElement;
function button(label: string) { return [...container.querySelectorAll("button")].find(b => b.textContent === label)!; }
async function click(label: string) { await act(async () => { button(label).click(); }); }
async function render(role: "ADMIN" | "CONSULTANT" = "ADMIN") {
  await act(async () => root.render(<CompanyScopeProvider companies={[{ id: 1, name: "Empresa teste", code: "TESTE", kind: "MATRIZ", group: "", parent_company_id: null, active: true }]}>
    <VacationsPage token="test-token" user={{ id: 1, username: "teste", full_name: "Teste", role, active: true }} />
  </CompanyScopeProvider>));
}

describe("Férias consultivas", () => {
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    vi.mocked(api).mockImplementation(async path => {
      if (path.includes("/dossiers?")) return { items: [dossier], total: 1 } as any;
      if (path.includes("/preview?")) return { ...dossier, warnings: [{ event_id: 2147483647, code: "INSUFFICIENT_DAYS", message: "Avos insuficientes (teste)." }] } as any;
      return dossier as any;
    });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.clearAllMocks(); vi.mocked(isLocalDataMode).mockReturnValue(false); });

  it("consulta ficha sem carregar histórico automaticamente, e mantém ações junto ao título", async () => {
    await render(); await click("Consultar");
    expect(container.textContent).toContain("Pessoa de teste");
    expect(container.textContent).toContain("Avos em dias");
    expect(button("Novo lançamento")).toBeTruthy();
    expect(vi.mocked(api).mock.calls.some(([path]) => path.includes("/history"))).toBe(false);
    expect(vi.mocked(api).mock.calls.every(([path]) => path.includes("company_id=1"))).toBe(true);
  });

  it("simula avisos sem gravar e permite salvar mesmo com avos insuficientes", async () => {
    await render(); await click("Consultar"); await click("Novo lançamento");
    await click("Simular períodos e avisos");
    expect(container.textContent).toContain("Avos insuficientes (teste).");
    expect(vi.mocked(api).mock.calls.some(([path]) => path.includes("/events"))).toBe(false);
    const form = button("Salvar lançamento").closest("form")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const saved = vi.mocked(api).mock.calls.find(([path, options]) => path.includes("/events?") && options?.method === "POST");
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved![1]!.body as string).revision).toBe(1);
    expect(container.textContent).toContain("Folha, custos e movimentações não foram alterados");
  });

  it("oferece consulta sem ações de edição para Consultor", async () => {
    await render("CONSULTANT");
    expect(button("Nova ficha manual")).toBeUndefined();
    await click("Consultar");
    expect(button("Novo lançamento")).toBeUndefined();
    expect(button("Editar ficha")).toBeUndefined();
    expect(button("Consultar histórico")).toBeTruthy();
  });

  it("informa necessidade do servidor no modo local, sem simular gravação", async () => {
    vi.mocked(isLocalDataMode).mockReturnValue(true);
    await render();
    expect(container.textContent).toContain("requer conexão com o servidor atualizado");
    expect(api).not.toHaveBeenCalled();
  });

  it("mantém edição e informa conflito de versão ao receber HTTP 409", async () => {
    await render(); await click("Consultar"); await click("Novo lançamento");
    vi.mocked(api).mockRejectedValueOnce(new Error("Esta ficha foi alterada em outra sessão. Recarregue antes de salvar."));
    const form = button("Salvar lançamento").closest("form")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(container.textContent).toContain("alterada em outra sessão");
    expect(button("Salvar lançamento")).toBeTruthy();
    expect(button("Salvar lançamento").disabled).toBe(false);
  });

  it("só executa relatórios ao solicitar", async () => {
    await render();
    expect(vi.mocked(api).mock.calls.some(([path]) => path.includes("/reports"))).toBe(false);
    vi.mocked(api).mockResolvedValueOnce({ items: [{ Nome: "Pessoa de teste", "Dias vencidos": 30 }], total: 1 });
    await click("Executar relatório");
    expect(container.textContent).toContain("Dias vencidos");
    expect(button("Exportar esta página")).toBeTruthy();
  });
});
