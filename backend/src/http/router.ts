import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RequestContext {
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  body: unknown;
  raw: IncomingMessage;
}

export type Handler = (ctx: RequestContext) => Promise<unknown> | unknown;

export interface RouteResult {
  status: number;
  payload: unknown;
}

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

/** 业务错误：带 HTTP 状态码与稳定的错误码，便于前端区分处理。 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', message, details);
export const notFound = (message: string) => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message: string) => new HttpError(409, 'CONFLICT', message);

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): void {
    this.routes.push({
      method: method.toUpperCase(),
      segments: pattern.split('/').filter(Boolean),
      handler,
    });
  }

  get(pattern: string, handler: Handler): void {
    this.add('GET', pattern, handler);
  }

  post(pattern: string, handler: Handler): void {
    this.add('POST', pattern, handler);
  }

  patch(pattern: string, handler: Handler): void {
    this.add('PATCH', pattern, handler);
  }

  delete(pattern: string, handler: Handler): void {
    this.add('DELETE', pattern, handler);
  }

  private match(method: string, path: string) {
    const actual = path.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      if (route.segments.length !== actual.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i++) {
        const segment = route.segments[i];
        if (segment.startsWith(':')) {
          params[segment.slice(1)] = decodeURIComponent(actual[i]);
        } else if (segment !== actual[i]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return { route, params };
      }
    }
    return undefined;
  }

  /** 判断路径是否存在但方法不匹配，用于返回 405 而不是误报 404。 */
  private pathExists(path: string): boolean {
    const actual = path.split('/').filter(Boolean);
    return this.routes.some((route) => {
      if (route.segments.length !== actual.length) return false;
      return route.segments.every(
        (segment, index) => segment.startsWith(':') || segment === actual[index]
      );
    });
  }

  async handle(
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
    raw: IncomingMessage
  ): Promise<RouteResult> {
    const found = this.match(method, path);
    if (!found) {
      if (this.pathExists(path)) {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${method} 不支持该路径`);
      }
      throw notFound(`接口不存在：${method} ${path}`);
    }
    const payload = await found.route.handler({
      method,
      path,
      query,
      params: found.params,
      body,
      raw,
    });
    return { status: method === 'POST' ? 201 : 200, payload };
  }
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

export function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(res, error.status, {
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  const message = error instanceof Error ? error.message : '未知错误';
  sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message } });
}

export async function readJsonBody(req: IncomingMessage, limitBytes = 2_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > limitBytes) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '请求体过大');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest('请求体不是合法的 JSON');
  }
}
