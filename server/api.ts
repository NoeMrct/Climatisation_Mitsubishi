import { readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { attempt } from '../src/lib/attempt';
import { REMOTE_ACTIONS, type AppApi, type RemoteAction } from '../src/store/api';

const MAX_BODY_LENGTH = 200_000;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const TEXT = 'text/plain; charset=utf-8';
const NOT_BUILT = 'Appli non construite : lance « npm run build » puis redémarre le serveur.';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

export type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

export interface RequestHandlerOptions {
  controller: AppApi;
  staticDir: string;
}

interface ActionCall {
  name: RemoteAction;
  args: unknown[];
}

const isFile = (path: string): boolean => attempt(() => statSync(path).isFile()) ?? false;

const isRemoteAction = (name: unknown): name is RemoteAction =>
  typeof name === 'string' && (REMOTE_ACTIONS as readonly string[]).includes(name);

function parseAction(body: string): ActionCall | null {
  const payload = attempt(() => JSON.parse(body) as { name?: unknown; args?: unknown } | null);
  if (!payload || !isRemoteAction(payload.name) || !Array.isArray(payload.args)) return null;
  return { name: payload.name, args: payload.args as unknown[] };
}

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolveBody, reject) => {
    let body = '';
    let tooLong = false;
    request.on('data', (chunk: Buffer) => {
      if (tooLong) return;
      body += chunk.toString('utf8');
      tooLong = body.length > MAX_BODY_LENGTH;
    });
    request.on('end', () => resolveBody(tooLong ? null : body));
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function sendText(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { 'Content-Type': TEXT, 'Cache-Control': 'no-store' });
  response.end(text);
}

export function createRequestHandler({ controller, staticDir }: RequestHandlerOptions): RequestHandler {
  const root = resolve(staticDir);
  const index = join(root, 'index.html');
  const assets = join(root, 'assets') + sep;
  const streams = new Set<ServerResponse>();
  const event = (): string => `data: ${JSON.stringify(controller.getSnapshot())}\n\n`;

  controller.subscribe(() => {
    if (streams.size === 0) return;
    const message = event();
    for (const stream of streams) stream.write(message);
  });

  const openStream = (request: IncomingMessage, response: ServerResponse): void => {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    response.write(event());
    streams.add(response);
    request.on('close', () => streams.delete(response));
  };

  const runAction = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readBody(request);
    if (body === null) return sendJson(response, 413, { error: 'requête trop volumineuse' });
    const action = parseAction(body);
    if (!action) return sendJson(response, 400, { error: 'action inconnue' });
    const method = controller[action.name] as (...args: unknown[]) => void;
    method.apply(controller, action.args);
    sendJson(response, 200, { ok: true });
  };

  const handleApi = async (request: IncomingMessage, response: ServerResponse, path: string): Promise<void> => {
    const route = `${request.method} ${path}`;
    if (route === 'GET /api/snapshot') return sendJson(response, 200, controller.getSnapshot());
    if (route === 'GET /api/events') return openStream(request, response);
    if (route === 'POST /api/action') return runAction(request, response);
    sendJson(response, 404, { error: 'introuvable' });
  };

  const serveFile = (response: ServerResponse, path: string): void => {
    if (!isFile(index)) return sendText(response, 503, NOT_BUILT);
    const wanted = resolve(root, `.${normalize(path)}`);
    const file = extname(wanted) === '' ? index : wanted;
    if (!file.startsWith(root + sep) || !isFile(file)) return sendText(response, 404, 'Introuvable');
    response.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': file.startsWith(assets) ? IMMUTABLE : 'no-cache',
    });
    response.end(readFileSync(file));
  };

  return (request, response) => {
    const path = attempt(() => decodeURIComponent((request.url ?? '/').split('?')[0]));
    if (path === undefined) return sendJson(response, 400, { error: 'adresse invalide' });
    if (path.startsWith('/api/')) {
      handleApi(request, response, path).catch(() => sendJson(response, 500, { error: 'erreur du serveur' }));
      return;
    }
    serveFile(response, path);
  };
}
