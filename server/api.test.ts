import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../src/store/controller';
import { memoryStore } from '../src/store/storage';
import { makeController } from '../src/test/fixtures';
import { createRequestHandler } from './api';
import { PushHub } from './push';
import type { PushRequest } from './webPush';

const SUBSCRIBER = {
  endpoint: 'https://push.exemple.fr/telephone',
  keys: {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  },
  device: 'phone',
};

let folder: string;
let server: Server;
let origin: string;
let app: ReturnType<typeof makeController>;
let push: PushHub;

const pushed = vi.fn<(request: PushRequest) => Promise<number>>(() => Promise.resolve(201));

async function serve(staticDir: string): Promise<void> {
  app = makeController();
  push = new PushHub({ store: memoryStore(), contact: 'https://exemple.fr/clim', send: pushed });
  server = createServer(createRequestHandler({ controller: app.controller, staticDir, push }));
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function stop(): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

const send = (method: string, path: string, body: string): Promise<Response> =>
  fetch(`${origin}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body });

const post = (body: string): Promise<Response> => send('POST', '/api/action', body);

const pushedTo = (): string[] => pushed.mock.calls.map(([request]) => request.target.endpoint);

const isOn = (): boolean => app.controller.getSnapshot().clim.settings.power;

function rawGet(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(origin);
    httpRequest({ hostname, port, path }, (response) => {
      let body = '';
      response.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    })
      .on('error', reject)
      .end();
  });
}

function eventReader(response: Response): () => Promise<Snapshot> {
  if (!response.body) throw new Error('flux absent');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return async () => {
    while (!buffer.includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) throw new Error('flux fermé');
      buffer += decoder.decode(value, { stream: true });
    }
    const end = buffer.indexOf('\n\n');
    const event = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    return JSON.parse(event.replace(/^data: /, '')) as Snapshot;
  };
}

beforeEach(async () => {
  pushed.mockClear();
  folder = mkdtempSync(join(tmpdir(), 'clim-api-'));
  mkdirSync(join(folder, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(folder, 'dist', 'index.html'), '<!doctype html><title>Clim</title>');
  writeFileSync(join(folder, 'dist', 'assets', 'app.js'), 'export {};');
  writeFileSync(join(folder, 'secret.txt'), 'secret');
  await serve(join(folder, 'dist'));
});

afterEach(async () => {
  await stop();
  rmSync(folder, { recursive: true, force: true });
});

describe('API du serveur', () => {
  it('renvoie l’instantané de l’état, sans cache', async () => {
    const response = await fetch(`${origin}/api/snapshot`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const snapshot = (await response.json()) as Snapshot;
    expect(snapshot.clim.settings.power).toBe(true);
    expect(snapshot.device.kind).toBe('simulator');
  });

  it('applique une action autorisée', async () => {
    const response = await post(JSON.stringify({ name: 'command', args: [{ type: 'power', on: false }] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(isOn()).toBe(false);
  });

  it('refuse une action hors liste, incomplète ou illisible', async () => {
    const bodies = [
      JSON.stringify({ name: 'resetSimulator', args: [] }),
      JSON.stringify({ name: 'stop', args: [] }),
      JSON.stringify({ name: 'constructor', args: [] }),
      JSON.stringify({ name: 'command' }),
      JSON.stringify({ args: [{ type: 'power', on: false }] }),
      'null',
      'pas du json',
    ];
    for (const body of bodies) {
      const response = await post(body);
      expect(response.status).toBe(400);
    }
    expect(isOn()).toBe(true);
  });

  it('refuse un corps trop volumineux', async () => {
    const response = await post(JSON.stringify({ name: 'command', args: ['x'.repeat(200_001)] }));
    expect(response.status).toBe(413);
    expect(isOn()).toBe(true);
  });

  it('répond 404 aux routes et aux méthodes inconnues', async () => {
    expect((await fetch(`${origin}/api/inconnu`)).status).toBe(404);
    expect((await fetch(`${origin}/api/snapshot`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${origin}/api/action`)).status).toBe(404);
  });

  it('diffuse l’état en continu aux appareils connectés', async () => {
    const response = await fetch(`${origin}/api/events`);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const next = eventReader(response);
    expect((await next()).clim.settings.power).toBe(true);

    app.controller.command({ type: 'power', on: false });
    expect((await next()).clim.settings.power).toBe(false);
    await response.body?.cancel().catch(() => undefined);
  });
});

describe('abonnement aux notifications push', () => {
  const subscription = '/api/push/subscription';

  it('donne la clé publique du serveur', async () => {
    const response = await fetch(`${origin}/api/push/key`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ key: push.publicKey });
  });

  it('enregistre un appareil et lui envoie une notification de bienvenue', async () => {
    const response = await send('POST', subscription, JSON.stringify(SUBSCRIBER));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(pushedTo()).toEqual([SUBSCRIBER.endpoint]);
    expect(pushed.mock.calls[0][0].topic).toBe('clim-ready');

    await send('POST', subscription, JSON.stringify(SUBSCRIBER));
    expect(pushed).toHaveBeenCalledTimes(1);
  });

  it('refuse un abonnement invalide, illisible ou trop volumineux', async () => {
    const bodies = [
      JSON.stringify({ ...SUBSCRIBER, endpoint: 'http://push.exemple.fr/telephone' }),
      JSON.stringify({ ...SUBSCRIBER, device: 'montre' }),
      JSON.stringify({ endpoint: SUBSCRIBER.endpoint }),
      JSON.stringify({ ...SUBSCRIBER, autre: 'x'.repeat(200_001) }),
      'null',
      'pas du json',
    ];
    for (const body of bodies) {
      const response = await send('POST', subscription, body);
      expect(response.status).toBe(400);
    }
    expect(pushed).not.toHaveBeenCalled();
  });

  it('oublie un appareil qui se désabonne', async () => {
    await send('POST', subscription, JSON.stringify(SUBSCRIBER));
    const response = await send('DELETE', subscription, JSON.stringify({ endpoint: SUBSCRIBER.endpoint }));
    expect(response.status).toBe(200);

    await send('POST', subscription, JSON.stringify(SUBSCRIBER));
    expect(pushed).toHaveBeenCalledTimes(2);
    expect((await send('DELETE', subscription, '{}')).status).toBe(400);
    expect((await send('DELETE', subscription, 'pas du json')).status).toBe(400);
  });
});

describe('fichiers de l’appli', () => {
  it('sert la page d’accueil sans cache', async () => {
    const response = await fetch(`${origin}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toContain('<title>Clim</title>');
  });

  it('sert les ressources versionnées avec un cache long', async () => {
    const response = await fetch(`${origin}/assets/app.js`);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  it('renvoie la page d’accueil pour une route de l’appli', async () => {
    const response = await fetch(`${origin}/programme`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>Clim</title>');
  });

  it('répond 404 pour un fichier absent', async () => {
    expect((await fetch(`${origin}/assets/absent.js`)).status).toBe(404);
  });

  it('ne sort jamais du dossier de l’appli', async () => {
    for (const path of ['/../secret.txt', '/..%2Fsecret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt']) {
      const response = await rawGet(path);
      expect(response.status).toBe(404);
      expect(response.body).not.toContain('secret');
    }
  });

  it('refuse une adresse mal encodée', async () => {
    expect((await rawGet('/%E0%A4%A')).status).toBe(400);
  });

  it('signale une appli qui n’a pas été construite', async () => {
    await stop();
    await serve(join(folder, 'absent'));
    const response = await fetch(`${origin}/`);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('npm run build');
  });
});
