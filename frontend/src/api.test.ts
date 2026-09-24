// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("corpo das requisições multiempresa", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("indicadores-selected-company-id", "7");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("preserva a lista de modelos e envia a empresa na URL", async () => {
    const templates = [{ id: "modelo", name: "Folha", fields: ["salary"] }];
    await api("/demo/report-templates", { method: "PUT", body: JSON.stringify(templates) }, "token");
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("company_id=7");
    expect(JSON.parse(String(options?.body))).toEqual(templates);
  });

  it("preserva a lista vazia ao excluir o último modelo", async () => {
    await api("/demo/report-templates", { method: "PUT", body: "[]" }, "token");
    expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBe("[]");
  });

  it("mantém a empresa em cadastros com corpo objeto", async () => {
    await api("/employees", { method: "POST", body: JSON.stringify({ full_name: "Pessoa" }) }, "token");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ full_name: "Pessoa", company_id: 7 });
  });
});
