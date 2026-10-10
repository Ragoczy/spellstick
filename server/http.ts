import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import {
  callback,
  login,
  logout,
  me,
  type AuthDeps,
  type AuthRequest,
  type AuthResponse,
  type ResponseCookie,
} from './auth/auth.js';

/**
 * The whole server: the built game from dist/ plus the Discord login routes. Game logic stays
 * in the browser; this only serves files and signs people in.
 */

export interface ServerOptions {
  /** The built game (Vite's output). */
  distDir: string;
  deps: AuthDeps;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json)|image\/svg\+xml)/;
const COMPRESS_MIN_BYTES = 1024;

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
/** Vite puts a content hash in every file name under /assets/, so they never change. */
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

interface StaticFile {
  type: string;
  body: Buffer;
  /** Compressed copies, made on first request and kept (the files never change while running). */
  br?: Buffer;
  gzip?: Buffer;
}

/**
 * The origin the browser used. Container Apps' ingress keeps the browser's Host header and
 * says whether the browser used https in X-Forwarded-Proto. null if the host looks wrong.
 */
export function publicOrigin(req: IncomingMessage): string | null {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim();
  const host = first(req.headers.host);
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return null;
  const proto = first(req.headers['x-forwarded-proto']) === 'https' ? 'https' : 'http';
  return `${proto}://${host.toLowerCase()}`;
}

export function serializeCookie(c: ResponseCookie): string {
  const parts = [`${c.name}=${c.value}`];
  if (c.domain) parts.push(`Domain=${c.domain}`);
  if (c.path) parts.push(`Path=${c.path}`);
  if (c.maxAge !== undefined) parts.push(`Max-Age=${c.maxAge}`);
  if (c.expires) parts.push(`Expires=${c.expires.toUTCString()}`);
  if (c.secure) parts.push('Secure');
  if (c.httpOnly) parts.push('HttpOnly');
  if (c.sameSite) parts.push(`SameSite=${c.sameSite}`);
  return parts.join('; ');
}

/** br, gzip, or none, from Accept-Encoding (honoring q=0). */
export function pickEncoding(accept: string | undefined): 'br' | 'gzip' | null {
  const offered = new Map<string, number>();
  for (const part of (accept ?? '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    offered.set(name, q ? Number(q.slice(2)) : 1);
  }
  const ok = (name: string) => (offered.get(name) ?? offered.get('*') ?? 0) > 0;
  if (ok('br')) return 'br';
  if (ok('gzip')) return 'gzip';
  return null;
}

function send(
  res: ServerResponse,
  status: number,
  headers: OutgoingHttpHeaders,
  body?: string | Buffer,
): void {
  res.writeHead(status, { ...BASE_HEADERS, ...headers });
  res.end(body);
}

const sendText = (res: ServerResponse, status: number, text: string, extra: OutgoingHttpHeaders = {}) =>
  send(
    res,
    status,
    { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
    text,
  );

function writeAuth(res: ServerResponse, r: AuthResponse): void {
  const headers: OutgoingHttpHeaders = { ...r.headers };
  if (r.cookies?.length) headers['Set-Cookie'] = r.cookies.map(serializeCookie);
  let body: string | undefined;
  if (r.jsonBody !== undefined) {
    body = JSON.stringify(r.jsonBody);
    headers['Content-Type'] = 'application/json; charset=utf-8';
  }
  send(res, r.status, headers, body);
}

const AUTH_ROUTES: Record<
  string,
  { method: string; run: (req: AuthRequest, deps: AuthDeps) => AuthResponse | Promise<AuthResponse> }
> = {
  '/api/auth/login': { method: 'GET', run: login },
  '/api/auth/callback': { method: 'GET', run: callback },
  '/api/auth/me': { method: 'GET', run: me },
  '/api/auth/logout': { method: 'POST', run: (req) => logout(req) },
};

export function createHandler(opts: ServerOptions): Handler {
  const root = resolve(opts.distDir);
  const cache = new Map<string, Promise<StaticFile | null>>();

  const load = (file: string) => {
    let entry = cache.get(file);
    if (!entry) {
      entry = (async () => {
        try {
          if (!(await stat(file)).isFile()) return null;
          const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
          return { type, body: await readFile(file) };
        } catch {
          return null;
        }
      })();
      cache.set(file, entry);
    }
    return entry;
  };

  const serveFile = (req: IncomingMessage, res: ServerResponse, f: StaticFile, cacheControl: string) => {
    const headers: OutgoingHttpHeaders = { 'Content-Type': f.type, 'Cache-Control': cacheControl };
    let body = f.body;
    if (COMPRESSIBLE.test(f.type) && f.body.length >= COMPRESS_MIN_BYTES) {
      headers.Vary = 'Accept-Encoding';
      const enc = pickEncoding(req.headers['accept-encoding'] as string | undefined);
      if (enc === 'br') {
        f.br ??= brotliCompressSync(f.body, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9 } });
        body = f.br;
      } else if (enc === 'gzip') {
        f.gzip ??= gzipSync(f.body, { level: 9 });
        body = f.gzip;
      }
      if (enc) headers['Content-Encoding'] = enc;
    }
    headers['Content-Length'] = body.length;
    send(res, 200, headers, req.method === 'HEAD' ? undefined : body);
  };

  const handle: Handler = async (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://placeholder');
    const path = url.pathname;

    if (path === '/healthz') return sendText(res, 200, 'ok');

    const origin = publicOrigin(req);
    if (!origin) return sendText(res, 400, 'Bad host');
    // The shared sign-in contract: only this site's own pages may send anything but GET.
    if (method !== 'GET' && method !== 'HEAD' && req.headers.origin !== origin) {
      return sendText(res, 403, 'Forbidden');
    }

    if (path === '/api' || path.startsWith('/api/')) {
      const route = AUTH_ROUTES[path];
      if (!route)
        return send(
          res,
          404,
          { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
          '{"error":"not_found"}',
        );
      if (method !== route.method) return sendText(res, 405, 'Method not allowed', { Allow: route.method });
      const authReq: AuthRequest = {
        url: `${origin}${req.url ?? '/'}`,
        headers: {
          get: (name) => {
            const v = req.headers[name.toLowerCase()];
            return Array.isArray(v) ? v.join(', ') : (v ?? null);
          },
        },
      };
      return writeAuth(res, await route.run(authReq, opts.deps));
    }

    if (method !== 'GET' && method !== 'HEAD')
      return sendText(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });

    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return sendText(res, 400, 'Bad path');
    }
    // No dotfiles, no NUL, and nothing outside dist/.
    if (decoded.includes('\0') || decoded.split('/').some((seg) => seg.startsWith('.'))) {
      return sendText(res, 404, 'Not found');
    }
    const file = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
    if (file !== root && !file.startsWith(root + sep)) return sendText(res, 404, 'Not found');

    const found = await load(file);
    if (found) return serveFile(req, res, found, decoded.startsWith('/assets/') ? IMMUTABLE : REVALIDATE);

    // A missing file is a 404; any other path is a page in the game: send index.html.
    if (decoded.startsWith('/assets/') || extname(decoded) !== '') return sendText(res, 404, 'Not found');
    const index = await load(resolve(root, 'index.html'));
    if (!index) return sendText(res, 503, 'The game has not been built');
    return serveFile(req, res, index, REVALIDATE);
  };

  return async (req, res) => {
    try {
      await handle(req, res);
    } catch (e) {
      opts.deps.log(`server: request failed (${(e as Error).name})`);
      if (!res.headersSent) sendText(res, 500, 'Server error');
      else res.destroy();
    }
  };
}
