import { QueryClient } from '@tanstack/react-query';

/**
 * 后端默认监听 127.0.0.1:3000，开发环境下 Vite 会把 /api 代理到该地址。
 * 生产构建可用 VITE_API_BASE_URL 覆盖。
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 1000 * 30,
    },
  },
});

/** 带稳定错误码的 API 错误，便于界面区分「后端没启动」与「参数不对」。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** 后端完全不可达（未启动 / 网络错误）。 */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      '无法连接后端服务。请确认已运行 pnpm dev:api（默认 http://127.0.0.1:3000）。'
    );
  }

  const text = await res.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }

  if (!res.ok) {
    const errorShape = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      res.status,
      errorShape?.code ?? 'HTTP_ERROR',
      errorShape?.message ?? `请求失败（HTTP ${res.status}）`,
      errorShape?.details
    );
  }

  return payload as T;
}

export const getJSON = <T>(path: string, signal?: AbortSignal) =>
  request<T>(path, { method: 'GET', signal });

export const postJSON = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body });

export const patchJSON = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PATCH', body });

export const deleteJSON = <T>(path: string) => request<T>(path, { method: 'DELETE' });
