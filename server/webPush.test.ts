import { createPublicKey, verify } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openPushMessage, startFakePushService, type FakePushService } from './test/fakePushService';
import { createVapidKeys, encryptPayload, sendPush, vapidAuthorization } from './webPush';

const decode = (text: string): Buffer => Buffer.from(text, 'base64url');
const readJson = (text: string): Record<string, unknown> =>
  JSON.parse(decode(text).toString('utf8')) as Record<string, unknown>;

const RFC_8291 = {
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_' +
    'yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  privateKey: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  text: 'When I grow up, I want to be a watermelon',
};

const NOW = new Date(2026, 10, 15, 17, 0).getTime();
const CONTACT = 'https://exemple.fr/clim';

let service: FakePushService;

beforeEach(async () => {
  service = await startFakePushService();
});

afterEach(async () => {
  await service.close();
});

describe('chiffrement d’un message push', () => {
  const receiver = { privateKey: decode(RFC_8291.privateKey), auth: decode(RFC_8291.auth) };
  const keys = {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: RFC_8291.auth,
  };

  it('relit le message d’exemple de la RFC 8291', () => {
    expect(openPushMessage(decode(RFC_8291.message), receiver).toString('utf8')).toBe(RFC_8291.text);
  });

  it('produit un message que l’appareil abonné relit, quelle que soit la longueur', () => {
    for (const text of [
      '',
      'a',
      'Chauffage prévu vers 17:40',
      '{"title":"21° atteints, clim coupée"}',
      'x'.repeat(3000),
    ]) {
      const message = encryptPayload(Buffer.from(text, 'utf8'), keys);
      expect(openPushMessage(message, receiver).toString('utf8')).toBe(text);
    }
  });

  it('écrit l’en-tête aes128gcm : sel, taille d’enregistrement et clé éphémère', () => {
    const message = encryptPayload(Buffer.from('salon'), keys);
    expect(message.readUInt32BE(16)).toBe(4096);
    expect(message.readUInt8(20)).toBe(65);
    expect(message[21]).toBe(4);
    expect(message.length).toBe(21 + 65 + 'salon'.length + 1 + 16);
  });

  it('tire un sel et une clé éphémère différents à chaque message', () => {
    const first = encryptPayload(Buffer.from('salon'), keys);
    const second = encryptPayload(Buffer.from('salon'), keys);
    expect(first.subarray(0, 16).equals(second.subarray(0, 16))).toBe(false);
    expect(first.subarray(21, 86).equals(second.subarray(21, 86))).toBe(false);
  });

  it('reste illisible pour un autre appareil', () => {
    const message = encryptPayload(Buffer.from('salon'), keys);
    const stranger = { privateKey: decode(createVapidKeys().privateKey), auth: receiver.auth };
    expect(() => openPushMessage(message, stranger)).toThrow();
  });
});

describe('identification VAPID', () => {
  it('crée une paire de clés P-256 propre à chaque installation', () => {
    const first = createVapidKeys();
    const second = createVapidKeys();
    expect(decode(first.publicKey)).toHaveLength(65);
    expect(decode(first.publicKey)[0]).toBe(4);
    expect(decode(first.privateKey)).toHaveLength(32);
    expect(second.publicKey).not.toBe(first.publicKey);
  });

  it('signe un jeton que la clé publique permet de vérifier', () => {
    const vapid = createVapidKeys();
    const header = vapidAuthorization('https://push.exemple.fr/abonne/42?jeton=1', vapid, CONTACT, NOW);
    const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
    if (!match) throw new Error('en-tête VAPID attendu');
    const [, head, claims, signature, key] = match;

    expect(key).toBe(vapid.publicKey);
    expect(readJson(head)).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(readJson(claims)).toEqual({
      aud: 'https://push.exemple.fr',
      exp: Math.floor(NOW / 1000) + 12 * 3600,
      sub: CONTACT,
    });

    const point = decode(vapid.publicKey);
    const publicKey = createPublicKey({
      format: 'jwk',
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: point.subarray(1, 33).toString('base64url'),
        y: point.subarray(33).toString('base64url'),
      },
    });
    const signed = Buffer.from(`${head}.${claims}`);
    expect(verify('sha256', signed, { key: publicKey, dsaEncoding: 'ieee-p1363' }, decode(signature))).toBe(true);
    expect(decode(signature)).toHaveLength(64);
  });
});

describe('envoi au service de push', () => {
  const request = (target: ReturnType<FakePushService['subscribe']>) => ({
    target,
    payload: '{"title":"Chauffage lancé"}',
    vapid: createVapidKeys(),
    contact: CONTACT,
    ttl: 1800,
    topic: 'clim-start',
  });

  it('poste le message chiffré avec les en-têtes attendus', async () => {
    const target = service.subscribe();
    await expect(sendPush(request(target), NOW)).resolves.toBe(201);

    expect(service.deliveries).toHaveLength(1);
    const [delivery] = service.deliveries;
    expect(delivery.text).toBe('{"title":"Chauffage lancé"}');
    expect(delivery.path).toBe(new URL(target.endpoint).pathname);
    expect(delivery.headers).toMatchObject({
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '1800',
      topic: 'clim-start',
      urgency: 'high',
    });
    const claims = /^vapid t=[\w-]+\.([\w-]+)\./.exec(delivery.headers.authorization ?? '')?.[1] ?? '';
    expect(readJson(claims)).toMatchObject({ aud: service.origin, sub: CONTACT });
  });

  it('renvoie le code du service quand l’abonnement n’existe plus', async () => {
    const target = service.subscribe();
    service.status = 410;
    await expect(sendPush(request(target), NOW)).resolves.toBe(410);
    await expect(sendPush(request({ ...target, endpoint: `${service.origin}/inconnu` }), NOW)).resolves.toBe(404);
  });

  it('laisse remonter une panne du réseau', async () => {
    const target = service.subscribe();
    await service.close();
    await expect(sendPush(request(target), NOW)).rejects.toThrow();
  });
});
