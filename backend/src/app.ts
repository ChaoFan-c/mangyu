import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { Router, readJsonBody, sendError, sendJson } from './http/router.ts';
import { registerRoutes } from './routes/index.ts';

export interface AppOptions {
  db: DatabaseSync;
  /** 允许跨域的来源；开发期前端在 5173。 */
  corsOrigin?: string;
  /** 生产环境的前端构建目录；未提供时只启动 API。 */
  staticDir?: string;
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function sendStaticFile(res: ServerResponse, file: string): void {
  const stat = statSync(file);
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(file).pipe(res);
}

function tryServeFrontend(res: ServerResponse, pathname: string, staticDir: string): boolean {
  const root = resolve(staticDir);
  const requested = resolve(root, `.${decodeURIComponent(pathname)}`);
  const withinRoot = requested === root || requested.startsWith(`${root}${sep}`);
  if (!withinRoot) return false;

  const asset = existsSync(requested) && statSync(requested).isFile() ? requested : undefined;
  const file = asset ?? resolve(root, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) return false;
  sendStaticFile(res, file);
  return true;
}

export function createApp({ db, corsOrigin, staticDir }: AppOptions): {
  server: Server;
  router: Router;
} {
  const router = new Router();
  registerRoutes(router, db);

  const server = createServer(async (req, res) => {
    if (corsOrigin) {
      res.setHeader('access-control-allow-origin', corsOrigin);
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');
    }
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('x-frame-options', 'DENY');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    try {
      if (!url.pathname.startsWith('/api/') && staticDir && req.method === 'GET') {
        if (tryServeFrontend(res, url.pathname, staticDir)) return;
      }
      const body =
        req.method === 'POST' || req.method === 'PATCH' ? await readJsonBody(req) : undefined;
      const { status, payload } = await router.handle(
        req.method ?? 'GET',
        url.pathname,
        url.searchParams,
        body,
        req
      );
      sendJson(res, status, payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  return { server, router };
}
