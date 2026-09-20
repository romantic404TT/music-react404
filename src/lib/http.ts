/**
 * 后端契约层。原版所有请求都打向本地 node:http 服务（默认 :3000），
 * 响应统一带 Access-Control-Allow-Origin: * 与 Cache-Control: no-store。
 *
 * 本工程把这些路径原样交给 MSW 拦截（见 src/mocks/handlers），
 * 所以业务代码里的 URL 与真实后端完全一致——换成真后端只需关掉 mock 并设 VITE_API_BASE。
 */

export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function buildUrl(path: string, query?: Query): string {
  const url = API_BASE + path;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
}

async function request<T>(path: string, init: RequestInit, query?: Query): Promise<T> {
  const res = await fetch(buildUrl(path, query), {
    ...init,
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(init.headers ?? {}) },
  });

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const hint =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : res.statusText;
    throw new ApiError(`${res.status} ${hint}`, res.status, payload);
  }

  return payload as T;
}

export function apiGet<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'GET', signal }, query);
}

export function apiPost<T>(path: string, body?: unknown, query?: Query): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, query);
}
