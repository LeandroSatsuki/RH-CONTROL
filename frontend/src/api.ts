import { demoApi } from "./demoApi";

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const COMPANY_KEY = "indicadores-selected-company-id";
const REQUEST_TIMEOUT_MS = 8000;
const isDev = import.meta.env.DEV;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function describeNetworkError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Banco de dados indisponível ou API sem resposta. Rode .\\scripts\\dev-db.ps1 ou configure o PostgreSQL antes de continuar.";
  }
  if (error instanceof TypeError) {
    return "Não foi possível conectar com a API. Verifique se o backend está ligado.";
  }
  return error instanceof Error ? error.message : "Erro inesperado ao chamar a API.";
}

function devLog(message: string, details: Record<string, unknown>) {
  if (isDev) console.debug(`[api] ${message}`, details);
}

function readSelectedCompanyId() {
  const raw = localStorage.getItem(COMPANY_KEY);
  if (!raw) return null;
  const stored = Number(raw);
  return Number.isFinite(stored) ? stored : null;
}

function shouldScopePath(path: string) {
  return !path.startsWith("/auth")
    && !path.startsWith("/setup")
    && !path.startsWith("/companies")
    && !path.startsWith("/health");
}

function injectCompanyId(path: string, options: RequestInit, companyId: number | null) {
  if (companyId === null || !shouldScopePath(path)) return { path, body: options.body };
  const scopedPath = `${path}${path.includes("?") ? "&" : "?"}company_id=${companyId}`;
  if (!options.body) return { path: scopedPath, body: options.body };
  if (typeof options.body !== "string") return { path: scopedPath, body: options.body };
  try {
    const parsed = JSON.parse(options.body) as Record<string, unknown>;
    return {
      path: scopedPath,
      body: JSON.stringify({ ...parsed, company_id: companyId })
    };
  } catch {
    return { path: scopedPath, body: options.body };
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const method = options.method ?? "GET";
  const companyId = readSelectedCompanyId();
  const scoped = injectCompanyId(path, options, companyId);
  const scopedPath = scoped.path;
  const scopedOptions = { ...options, body: scoped.body };
  if (IS_DEMO_MODE) {
    devLog("demo-request", { method, path: scopedPath, tokenPresent: Boolean(token), companyId });
    try {
      const result = await demoApi<T>(scopedPath, scopedOptions, token);
      devLog("demo-response", { method, path: scopedPath, status: 200 });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado no modo demo.";
      devLog("demo-error", { method, path: scopedPath, status: 0, message });
      throw new ApiError(0, message);
    }
  }

  const url = new URL(`${API_URL}${scopedPath}`, window.location.origin);
  if (companyId !== null && !path.startsWith("/auth") && !path.startsWith("/setup")) {
    url.searchParams.set("company_id", String(companyId));
  }

  const headers = new Headers(options.headers);
  if (scopedOptions.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const startedAt = performance.now();
  devLog("request", { method, url: url.toString(), tokenPresent: Boolean(token), companyId });
  try {
    const response = await fetch(url, { ...scopedOptions, headers, signal: controller.signal });
    devLog("response", {
      method,
      url: url.toString(),
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt)
    });
    if (!response.ok) {
      const fallback = response.status >= 500
        ? "API indisponível. Verifique se o backend está ligado."
        : "Erro inesperado";
      const body = await response.json().catch(() => ({ detail: fallback }));
      const detail = Array.isArray(body.detail)
        ? body.detail.map((item: { msg: string }) => item.msg).join(", ")
        : body.detail;
      throw new ApiError(response.status, detail ?? "Erro inesperado");
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) {
      devLog("error", { method, url: url.toString(), status: error.status, message: error.message });
      throw error;
    }
    const message = describeNetworkError(error);
    devLog("error", { method, url: url.toString(), status: 0, message });
    throw new ApiError(0, message);
  } finally {
    window.clearTimeout(timeoutId);
  }
}
