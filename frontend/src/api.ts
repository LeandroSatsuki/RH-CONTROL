import { demoApi } from "./demoApi";

const API_STORAGE_KEY = "nexo-api-url";
const LOCAL_MODE_STORAGE_KEY = "nexo-local-mode";
const storedApiUrl = localStorage.getItem(API_STORAGE_KEY)?.trim();
const runtimeApiUrl = window.NEXO_CONFIG?.API_URL?.trim();
const desktopApiUrl = window.location.protocol === "file:" ? "http://127.0.0.1:8000/api" : "/api";

function normalizeApiUrl(value: string) {
  let normalized = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized) && normalized !== "/api") normalized = `http://${normalized}`;
  if (normalized !== "/api" && !/\/api$/i.test(normalized)) normalized = `${normalized}/api`;
  return normalized;
}

export function stripApiSuffix(value: string) {
  return value.replace(/\/api\/?$/i, "");
}

const resolvedApiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL ?? (storedApiUrl || runtimeApiUrl || desktopApiUrl));
if (storedApiUrl && storedApiUrl !== resolvedApiUrl) {
  localStorage.setItem(API_STORAGE_KEY, resolvedApiUrl);
}

export const API_URL = resolvedApiUrl;
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
export const ALLOW_LOCAL_MODE = import.meta.env.VITE_ALLOW_LOCAL_MODE === "true";
const COMPANY_KEY = "indicadores-selected-company-id";
const REQUEST_TIMEOUT_MS = 8000;
const isDev = import.meta.env.DEV;

export function isLocalDataMode() {
  return IS_DEMO_MODE || (ALLOW_LOCAL_MODE && localStorage.getItem(LOCAL_MODE_STORAGE_KEY) === "true");
}

export function enableLocalDataMode() {
  if (!ALLOW_LOCAL_MODE) return;
  localStorage.setItem(LOCAL_MODE_STORAGE_KEY, "true");
}

export function disableLocalDataMode() {
  localStorage.removeItem(LOCAL_MODE_STORAGE_KEY);
}

export function saveApiUrl(value: string): string {
  const normalized = normalizeApiUrl(value);
  const parsed = new URL(normalized);
  if (!parsed.hostname) throw new Error("Informe um endereço de servidor válido.");
  disableLocalDataMode();
  localStorage.setItem(API_STORAGE_KEY, normalized);
  return normalized;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function describeNetworkError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "O servidor não respondeu no tempo esperado. Confirme o endereço e peça ao administrador para verificar o servidor Nexo.";
  }
  if (error instanceof TypeError) {
    return "Não foi possível conectar ao servidor Nexo. Verifique o endereço e a conexão com a rede da empresa.";
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
  if (new URLSearchParams(path.split("?")[1] ?? "").has("company_id")) return { path, body: options.body };
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
  if (isLocalDataMode()) {
    devLog(IS_DEMO_MODE ? "demo-request" : "local-request", { method, path: scopedPath, tokenPresent: Boolean(token), companyId });
    try {
      const result = await demoApi<T>(scopedPath, scopedOptions, token);
      devLog(IS_DEMO_MODE ? "demo-response" : "local-response", { method, path: scopedPath, status: 200 });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado no modo local.";
      devLog(IS_DEMO_MODE ? "demo-error" : "local-error", { method, path: scopedPath, status: 0, message });
      throw new ApiError(0, message);
    }
  }

  const url = new URL(`${API_URL}${scopedPath}`, window.location.origin);
  if (companyId !== null && !path.startsWith("/auth") && !path.startsWith("/setup") && !url.searchParams.has("company_id")) {
    url.searchParams.set("company_id", String(companyId));
  }
  if (method.toUpperCase() === "GET") url.searchParams.set("_nexo_ts", String(Date.now()));

  const headers = new Headers(options.headers);
  if (scopedOptions.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (method.toUpperCase() === "GET") {
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Pragma", "no-cache");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const startedAt = performance.now();
  devLog("request", { method, url: url.toString(), tokenPresent: Boolean(token), companyId });
  try {
    const response = await fetch(url, { ...scopedOptions, headers, signal: controller.signal, cache: "no-store" });
    devLog("response", {
      method,
      url: url.toString(),
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt)
    });
    if (!response.ok) {
      const fallback = response.status >= 500
        ? "O servidor Nexo encontrou uma indisponibilidade temporária. Tente novamente ou acione o administrador."
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

export async function downloadApiFile(path: string, token: string, filename: string): Promise<void> {
  const url = new URL(`${API_URL}${path}`, window.location.origin);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Não foi possível baixar o arquivo." }));
    throw new ApiError(response.status, body.detail ?? "Não foi possível baixar o arquivo.");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
