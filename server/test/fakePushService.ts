import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PushTarget } from '../webPush';

const CURVE = 'prime256v1';
const TAG_LENGTH = 16;

export interface Receiver {
  privateKey: Buffer;
  auth: Buffer;
}

export interface Delivery {
  path: string;
  headers: IncomingHttpHeaders;
  text: string;
}

export interface FakePushService {
  readonly origin: string;
  readonly deliveries: Delivery[];
  status: number;
  subscribe(): PushTarget;
  close(): Promise<void>;
}

const derive = (secret: Buffer, salt: Buffer, info: Buffer, length: number): Buffer =>
  Buffer.from(hkdfSync('sha256', secret, salt, info, length));

export function openPushMessage(message: Buffer, receiver: Receiver): Buffer {
  const salt = message.subarray(0, 16);
  const keyEnd = 21 + message.readUInt8(20);
  const sender = message.subarray(21, keyEnd);
  const sealed = message.subarray(keyEnd, message.length - TAG_LENGTH);

  const local = createECDH(CURVE);
  local.setPrivateKey(receiver.privateKey);
  const context = Buffer.concat([Buffer.from('WebPush: info\0'), local.getPublicKey(), sender]);
  const material = derive(local.computeSecret(sender), receiver.auth, context, 32);
  const key = derive(material, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = derive(material, salt, Buffer.from('Content-Encoding: nonce\0'), 12);

  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(message.subarray(message.length - TAG_LENGTH));
  const record = Buffer.concat([decipher.update(sealed), decipher.final()]);
  return record.subarray(0, record.lastIndexOf(2));
}

export async function startFakePushService(): Promise<FakePushService> {
  const receivers = new Map<string, Receiver>();
  const deliveries: Delivery[] = [];

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const path = request.url ?? '';
      const receiver = receivers.get(path);
      if (!receiver) {
        response.writeHead(404).end();
        return;
      }
      const text = openPushMessage(Buffer.concat(chunks), receiver).toString('utf8');
      deliveries.push({ path, headers: request.headers, text });
      response.writeHead(service.status).end();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const service: FakePushService = {
    origin,
    deliveries,
    status: 201,
    subscribe() {
      const pair = createECDH(CURVE);
      const p256dh = pair.generateKeys();
      const auth = randomBytes(16);
      const path = `/push/${receivers.size + 1}`;
      receivers.set(path, { privateKey: pair.getPrivateKey(), auth });
      return {
        endpoint: `${origin}${path}`,
        keys: { p256dh: p256dh.toString('base64url'), auth: auth.toString('base64url') },
      };
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  return service;
}
