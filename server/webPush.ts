import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
} from 'node:crypto';

const CURVE = 'prime256v1';
const RECORD_SIZE = 4096;
const LAST_RECORD = Buffer.from([2]);
const TOKEN_LIFETIME_S = 12 * 3600;
const TIMEOUT_MS = 10_000;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushRequest {
  target: PushTarget;
  payload: string;
  vapid: VapidKeys;
  contact: string;
  ttl: number;
  topic: string;
}

const decode = (text: string): Buffer => Buffer.from(text, 'base64url');
const encodeJson = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const derive = (secret: Buffer, salt: Buffer, info: Buffer, length: number): Buffer =>
  Buffer.from(hkdfSync('sha256', secret, salt, info, length));

export function createVapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: CURVE });
  const { d = '', x = '', y = '' } = privateKey.export({ format: 'jwk' });
  const point = Buffer.concat([Buffer.from([4]), decode(x), decode(y)]);
  return { publicKey: point.toString('base64url'), privateKey: d };
}

export function encryptPayload(payload: Buffer, keys: PushTarget['keys']): Buffer {
  const local = createECDH(CURVE);
  const sender = local.generateKeys();
  const receiver = decode(keys.p256dh);
  const salt = randomBytes(16);
  const context = Buffer.concat([Buffer.from('WebPush: info\0'), receiver, sender]);
  const material = derive(local.computeSecret(receiver), decode(keys.auth), context, 32);
  const key = derive(material, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = derive(material, salt, Buffer.from('Content-Encoding: nonce\0'), 12);

  const cipher = createCipheriv('aes-128-gcm', key, nonce);
  const sealed = Buffer.concat([
    cipher.update(payload),
    cipher.update(LAST_RECORD),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const header = Buffer.alloc(21);
  salt.copy(header);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(sender.length, 20);
  return Buffer.concat([header, sender, sealed]);
}

export function vapidAuthorization(endpoint: string, vapid: VapidKeys, contact: string, now: number): string {
  const point = decode(vapid.publicKey);
  const key = createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: vapid.privateKey,
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33).toString('base64url'),
    },
  });
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + TOKEN_LIFETIME_S, sub: contact };
  const unsigned = `${encodeJson({ typ: 'JWT', alg: 'ES256' })}.${encodeJson(claims)}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${signature.toString('base64url')}, k=${vapid.publicKey}`;
}

export async function sendPush(request: PushRequest, now: number = Date.now()): Promise<number> {
  const { target, payload, vapid, contact, ttl, topic } = request;
  const response = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthorization(target.endpoint, vapid, contact, now),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Topic: topic,
      Urgency: 'high',
    },
    body: new Uint8Array(encryptPayload(Buffer.from(payload, 'utf8'), target.keys)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await response.arrayBuffer();
  return response.status;
}
