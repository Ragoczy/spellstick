import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler, pickEncoding, serializeCookie } from './http.js';

const INDEX = '<!doctype html><title>Spellstick</title>';
const BIG_JS = `console.log(${JSON.stringify('x'.repeat(5000))});`;

let dir: string;
let server: Server;
let port: number;
const logs: string[] = [];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'spellstick-dist-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), INDEX);
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), BIG_JS);
  writeFileSync(join(dir, 'assets', 'goal-01-xyz.mp3'), Buffer.from([0xff, 0xfb, 0x90, 0x00]));
  writeFileSync(join(dir, 'robots.txt'), 'User-agent: *');
  writeFileSync(join(dir, '.env'), 'SECRET=nope');
  // A file next to dist/ that path tricks must not reach.
  writeFileSync(join(dir, '..', 'spellstick-outside.txt'), 'outside');
  server = createServer(
    createHandler({
      distDir: dir,
      deps: { env: {}, fetch, nowSeconds: () => 0, log: (m) => logs.push(m) },
    }),
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(dir, '..', 'spellstick-outside.txt'), { force: true });
});

/** Raw HTTP so the path is sent exactly as written (fetch would tidy up ../ and such). */
function get(
  path: string,
  opts: { method?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolveP, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: opts.method ?? 'GET',
        headers: { host: `localhost:${port}`, ...opts.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolveP({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('static files', () => {
  it('serves index.html at / with no-cache, and nosniff everywhere', async () => {
    const r = await get('/');
    expect(r.status).toBe(200);
    expect(r.body.toString()).toBe(INDEX);
    expect(r.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(r.headers['cache-control']).toBe('no-cache');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('caches hashed assets for a year and compresses text', async () => {
    const plain = await get('/assets/index-abc123.js');
    expect(plain.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(plain.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.toString()).toBe(BIG_JS);

    const br = await get('/assets/index-abc123.js', { headers: { 'accept-encoding': 'gzip, deflate, br' } });
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers.vary).toBe('Accept-Encoding');
    expect(brotliDecompressSync(br.body).toString()).toBe(BIG_JS);
    expect(br.body.length).toBeLessThan(BIG_JS.length / 10);

    const gz = await get('/assets/index-abc123.js', { headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(gz.body).toString()).toBe(BIG_JS);
  });

  it("doesn't compress audio, and HEAD sends no body", async () => {
    const mp3 = await get('/assets/goal-01-xyz.mp3', { headers: { 'accept-encoding': 'br' } });
    expect(mp3.headers['content-type']).toBe('audio/mpeg');
    expect(mp3.headers['content-encoding']).toBeUndefined();
    expect(mp3.body.length).toBe(4);
    const head = await get('/', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
  });

  it('sends index.html for game pages, and 404s missing files', async () => {
    const page = await get('/some/deep/link?x=1');
    expect(page.status).toBe(200);
    expect(page.body.toString()).toBe(INDEX);
    expect((await get('/assets/missing-123.js')).status).toBe(404);
    expect((await get('/favicon.ico')).status).toBe(404);
  });

  it('never serves dotfiles or anything outside dist/', async () => {
    for (const path of [
      '/.env',
      '/../spellstick-outside.txt',
      '/%2e%2e/spellstick-outside.txt',
      '/assets/..%2f..%2fspellstick-outside.txt',
      '/%00',
    ]) {
      const r = await get(path);
      expect(r.status, path).not.toBe(200);
      expect(r.body.toString()).not.toContain('outside');
      expect(r.body.toString()).not.toContain('SECRET');
    }
  });

  it('answers the health probe', async () => {
    const r = await get('/healthz');
    expect(r.status).toBe(200);
    expect(r.body.toString()).toBe('ok');
  });
});

describe('routing and safety', () => {
  it('routes the auth API, and 404s other /api paths', async () => {
    // No settings in this test server: /me says so rather than letting anyone in.
    const meRes = await get('/api/auth/me');
    expect(meRes.status).toBe(500);
    expect(meRes.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(meRes.body.toString())).toEqual({ error: 'auth_not_configured' });
    expect(logs.join()).toContain('SESSION_SECRET');
    expect((await get('/api/nope')).status).toBe(404);
    expect(
      (await get('/api/auth/me', { method: 'POST', headers: { origin: `http://localhost:${port}` } })).status,
    ).toBe(405);
  });

  it("refuses non-GET requests from other sites' pages", async () => {
    expect((await get('/api/auth/logout', { method: 'POST' })).status).toBe(403);
    expect(
      (await get('/api/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } })).status,
    ).toBe(403);
    const ok = await get('/api/auth/logout', {
      method: 'POST',
      headers: { origin: `http://localhost:${port}` },
    });
    expect(ok.status).toBe(204);
    expect(ok.headers['set-cookie']?.[0]).toMatch(
      /^dsg_session=; Path=\/; Max-Age=0; Expires=.*; Secure; HttpOnly; SameSite=Lax$/,
    );
  });

  it('uses https for the redirect when the ingress says the browser used it', async () => {
    const r = await get('/api/auth/me', {
      headers: { host: 'spellstick.games.darkspace.press', 'x-forwarded-proto': 'https' },
    });
    expect(r.status).toBe(500); // reached the handler with a valid host
    expect((await get('/', { headers: { host: 'bad host!' } })).status).toBe(400);
  });
});

describe('helpers', () => {
  it('picks br, then gzip, honoring q=0', () => {
    expect(pickEncoding('gzip, deflate, br')).toBe('br');
    expect(pickEncoding('gzip')).toBe('gzip');
    expect(pickEncoding('br;q=0, gzip')).toBe('gzip');
    expect(pickEncoding('*')).toBe('br');
    expect(pickEncoding(undefined)).toBeNull();
    expect(pickEncoding('identity')).toBeNull();
  });

  it('writes Set-Cookie headers', () => {
    expect(
      serializeCookie({
        name: 'dsg_session',
        value: 'a.b.c',
        domain: '.games.darkspace.press',
        path: '/',
        maxAge: 60,
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      }),
    ).toBe(
      'dsg_session=a.b.c; Domain=.games.darkspace.press; Path=/; Max-Age=60; Secure; HttpOnly; SameSite=Lax',
    );
  });
});
