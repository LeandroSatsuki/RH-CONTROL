import { demoApi } from "./demoApi";

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
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

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const url = `${API_URL}${path}`;
  const method = options.method ?? "GET";
  if (IS_DEMO_MODE) {
    devLog("demo-request", { method, path, tokenPresent: Boolean(token) });
    try {
      const result = await demoApi<T>(path, options, token);
      devLog("demo-response", { method, path, status: 200 });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado no modo demo.";
      devLog("demo-error", { method, path, status: 0, message });
      throw new ApiError(0, message);
    }
  }

  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const startedAt = performance.now();
  devLog("request", { method, url, tokenPresent: Boolean(token) });
  try {
    const response = await fetch(url, { ...options, headers, signal: controller.signal });
    devLog("response", {
      method,
      url,
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
      devLog("error", { method, url, status: error.status, message: error.message });
      throw error;
    }
    const message = describeNetworkError(error);
    devLog("error", { method, url, status: 0, message });
    throw new ApiError(0, message);
  } finally {
    window.clearTimeout(timeoutId);
  }
}
