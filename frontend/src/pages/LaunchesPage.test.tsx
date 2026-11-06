// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyScopeProvider } from "../context/DemoScope";
import { LaunchesPage } from "./LaunchesPage";
import { api } from "../api";
vi.mock("../api", () => ({ api: vi.fn() }));

const person = (id: number) => ({ employment_id: id, employee_name: `Pessoa ${id}`, employee_code: `ADM-${id}`, supervisor_name: "", employment_type: "MEI", result_center: { id: 1, code: "ADM", name: "Admin", color: "#000" }, amount: 0, note: "" });
const newBatch = (kind = "MEI", status = "PENDING") => ({ id: 1, company_id: 1, competency: "2026-10", kind, status, filters: {}, total: 0, eligible_count: 2, filled_count: 0, updated_at: "initial", confirmed_at: null, employees: [person(1), person(2)] });
let element: HTMLDivElement;
let root: Root;

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function blur(input: HTMLInputElement) {
  await act(async () => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
}
async function mount(batch: ReturnType<typeof newBatch>) {
  await act(async () => root.render(<CompanyScopeProvider companies={[{ id: 1, name: "Empresa", code: "E1", kind: "MATRIZ", group: "", parent_company_id: null, active: true }]}><LaunchesPage token="token" user={{ id: 1, username: "admin", full_name: "Admin", role: "ADMIN", active: true }} /></CompanyScopeProvider>));
  const title = ({ BASIC_BASKET: "Cesta básica", FREELANCER: "Freelancer", BONUS: "Premiação", COST_AID: "Ajuda de custo", LODGING: "Hospedagem" } as Record<string, string>)[batch.kind] ?? "MEI";
  const button = [...element.querySelectorAll<HTMLButtonElement>(".launch-kind-card")].find(item => item.querySelector("strong")?.textContent === title)!;
  await act(async () => button.click());
}

describe("edição de lançamentos", () => {
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear(); vi.clearAllMocks();
    element = document.createElement("div"); document.body.append(element); root = createRoot(element);
  });
  afterEach(async () => { await act(async () => root.unmount()); element.remove(); });

  it("mantém a edição feita durante uma resposta atrasada e salva sem digitar duas vezes", async () => {
    const batch = newBatch();
    const resolves: Array<() => void> = [];
    const payloads: any[] = [];
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (options.method === "PATCH") {
        const payload = JSON.parse(String(options.body)); payloads.push(payload);
        const response = { ...batch, updated_at: String(payloads.length), employees: batch.employees.map(item => ({ ...item, ...payload.items.find((value: any) => value.employment_id === item.employment_id) })) };
        return new Promise(resolve => resolves.push(() => resolve(response as any)));
      }
      return (path.startsWith("/demo/launches?") ? [batch] : batch) as any;
    });
    await mount(batch);
    const input = element.querySelector<HTMLInputElement>('[aria-label="Valor de Pessoa 1"]')!;
    await type(input, "1250,55"); await blur(input);
    expect(payloads[0].items[0].amount).toBe(1250.55);
    expect(input.disabled).toBe(false);
    await type(input, "1800,75"); await blur(input);
    await act(async () => { resolves.shift()!(); });
    expect(input.value).toBe("1800,75");
    expect(payloads[1].items[0].amount).toBe(1800.75);
    expect(payloads[1].updated_at).toBe("1");
    await act(async () => { resolves.shift()!(); });
    expect(input.value).toBe("1800,75");
  });

  it("distribui o valor fixo integral para cada beneficiário", async () => {
    const batch = newBatch("BASIC_BASKET");
    let payload: any;
    vi.mocked(api).mockImplementation(async (path, options = {}) => {
      if (options.method === "PATCH") {
        payload = JSON.parse(String(options.body));
        return { ...batch, employees: batch.employees.map(item => ({ ...item, ...payload.items.find((value: any) => value.employment_id === item.employment_id) })) } as any;
      }
      return (path.startsWith("/demo/launches?") ? [batch] : batch) as any;
    });
    await mount(batch);
    await type(element.querySelector<HTMLInputElement>('[aria-label="Valor fixo da cesta básica"]')!, "250,00");
    await act(async () => { [...element.querySelectorAll("button")].find(item => item.textContent === "Aplicar valor fixo")!.click(); });
    expect(payload.items.map((item: any) => item.amount)).toEqual([250, 250]);
    expect(element.querySelector(".launch-totals")?.textContent).toContain("500,00");
  });

  it.each(["MEI", "FREELANCER", "BONUS", "BASIC_BASKET", "COST_AID", "LODGING"])("permite corrigir %s confirmado", async kind => {
    const batch = newBatch(kind, "CONFIRMED");
    vi.mocked(api).mockImplementation(async path => (path.startsWith("/demo/launches?") ? [batch] : batch) as any);
    await mount(batch);
    expect(element.querySelector<HTMLInputElement>('[aria-label="Valor de Pessoa 1"]')!.disabled).toBe(false);
    expect(element.textContent).toContain("Salvar correções");
  });

  it("bloqueia os campos quando o mês está fechado", async () => {
    const batch = { ...newBatch("FREELANCER", "CONFIRMED"), competency_closed: true };
    vi.mocked(api).mockImplementation(async path => (path.startsWith("/demo/launches?") ? [batch] : batch) as any);
    await mount(batch);
    expect(element.querySelector<HTMLInputElement>('[aria-label="Valor de Pessoa 1"]')!.disabled).toBe(true);
    expect(element.textContent).not.toContain("Salvar correções");
    expect(element.textContent).toContain("Reabra o mês em Fechamento");
  });
});
