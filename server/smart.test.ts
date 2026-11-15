import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { decrypt, encrypt, exchange } from './smart';

const POLL_VECTOR = 'AAECAwQFBgcICQoLDA0OD5DG2SQFhhQQayEaAQT5w+s=';
const COMMAND = '<CSV><CODE><VALUE>fc4101301001010201000c0000000000000002a64184</VALUE></CODE></CSV>';
const COMMAND_VECTOR =
  'AAECAwQFBgcICQoLDA0OD/g8jFcINgiUyv1arNZjoNuTYuK4Cz/MP2IJl4/z+HQ1jwLpHDzqXzIeQbBQscQ8/lVFND45hWNRabZTlIM0nbZ9MeY2sWfBOTBuuQhdMgZnfaQeoZ2tW8jz1pc2KA/drw==';

describe('chiffrement des échanges', () => {
  it('déchiffre des messages produits par OpenSSL', () => {
    expect(decrypt(POLL_VECTOR)).toBe('<CSV></CSV>');
    expect(decrypt(COMMAND_VECTOR)).toBe(COMMAND);
  });

  it('relit ce qu’il a chiffré, quelle que soit la longueur', () => {
    for (const text of [
      '',
      'a',
      '<CSV></CSV>',
      'x'.repeat(15),
      'x'.repeat(16),
      'x'.repeat(47),
      'température : 21,5 °C',
    ]) {
      expect(decrypt(encrypt(text))).toBe(text);
    }
  });

  it('tire un vecteur d’initialisation différent à chaque message', () => {
    const first = Buffer.from(encrypt(COMMAND), 'base64');
    const second = Buffer.from(encrypt(COMMAND), 'base64');
    expect(first.equals(second)).toBe(false);
    expect(first.length).toBe(16 + 96);
    expect(first.length % 16).toBe(0);
  });
});

describe('échange avec l’unité', () => {
  const servers: net.Server[] = [];
  const sockets: net.Socket[] = [];

  async function listen(onConnection: (socket: net.Socket) => void): Promise<string> {
    const server = net.createServer((socket) => {
      sockets.push(socket);
      onConnection(socket);
    });
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    return `127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const answer = (socket: net.Socket, body: string): void => {
    socket.end(`HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  };

  const close = (server: net.Server): Promise<void> =>
    new Promise((resolve) => {
      server.close(() => resolve());
    });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.destroy();
    await Promise.all(servers.splice(0).map(close));
  });

  it('envoie une requête chiffrée et rend la réponse en clair', async () => {
    let received = '';
    const address = await listen((socket) => {
      socket.on('data', (chunk: Buffer) => {
        received += chunk.toString('latin1');
        if (received.includes('</ESV>'))
          answer(socket, `<?xml version="1.0" encoding="UTF-8"?><ESV>${encrypt('<LSV>ok</LSV>')}</ESV>`);
      });
    });

    await expect(exchange(address, '<CSV></CSV>')).resolves.toBe('<LSV>ok</LSV>');

    const [head, body] = received.split('\r\n\r\n');
    expect(head).toMatch(/^POST \/smart HTTP\/1\.1\r\n/);
    expect(head).toContain(`Host: ${address}`);
    expect(head).toContain(`Content-Length: ${Buffer.byteLength(body)}`);
    expect(decrypt(/<ESV>([^<]+)<\/ESV>/.exec(body)?.[1] ?? '')).toBe('<CSV></CSV>');
  });

  it('échoue quand l’unité ferme la connexion sans répondre', async () => {
    const address = await listen((socket) => socket.end());
    await expect(exchange(address, '<CSV></CSV>')).rejects.toThrow('réponse sans données');
  });

  it('échoue quand la réponse est illisible', async () => {
    const address = await listen((socket) => answer(socket, '<ESV>YWJj</ESV>'));
    await expect(exchange(address, '<CSV></CSV>')).rejects.toThrow();
  });

  it('abandonne quand l’unité ne répond pas dans le délai', async () => {
    const address = await listen(() => undefined);
    await expect(exchange(address, '<CSV></CSV>', 40)).rejects.toThrow('délai dépassé');
  });

  it('échoue quand rien n’écoute à cette adresse', async () => {
    const address = await listen(() => undefined);
    await Promise.all(servers.splice(0).map(close));
    await expect(exchange(address, '<CSV></CSV>', 500)).rejects.toThrow();
  });
});
