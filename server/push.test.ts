import { describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '../src/domain/notify';
import type { PushSubscriber } from '../src/domain/push';
import { memoryStore, type KeyValueStore } from '../src/store/storage';
import { PushHub, readSubscriber } from './push';
import { startFakePushService } from './test/fakePushService';
import type { PushRequest } from './webPush';

const STORE_KEY = 'clim.push.v1';
const CONTACT = 'https://exemple.fr/clim';
const KEYS = {
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
};
const PHONE: PushSubscriber = { endpoint: 'https://push.exemple.fr/telephone', keys: KEYS, device: 'phone' };
const PC: PushSubscriber = { endpoint: 'https://push.exemple.fr/pc', keys: KEYS, device: 'pc' };

const NOTIFICATION: AppNotification = {
  kind: 'start',
  at: new Date(2026, 10, 15, 17, 0).getTime(),
  title: 'Chauffage lancé',
  body: '18,9° dans le salon, objectif 21°.',
  silent: false,
  devices: ['phone', 'pc'],
};

function setup(store: KeyValueStore = memoryStore(), status: () => Promise<number> = () => Promise.resolve(201)) {
  const send = vi.fn<(request: PushRequest) => Promise<number>>(status);
  const onFailure = vi.fn<(host: string, status: number | null) => void>();
  const hub = new PushHub({ store, contact: CONTACT, send, onFailure });
  const sentTo = (): string[] => send.mock.calls.map(([request]) => request.target.endpoint);
  return { hub, send, onFailure, store, sentTo };
}

describe('lecture d’un abonnement', () => {
  it('garde l’adresse, les clés et la classe de l’appareil', () => {
    expect(readSubscriber({ ...PHONE, expirationTime: null, autre: 1 })).toEqual(PHONE);
    expect(readSubscriber({ ...PC, keys: { ...KEYS, auth: `${KEYS.auth}==` } })?.device).toBe('pc');
  });

  it('refuse un abonnement incomplet, mal formé ou hors HTTPS', () => {
    const rejected: unknown[] = [
      null,
      'abonnement',
      {},
      { ...PHONE, endpoint: 'http://push.exemple.fr/telephone' },
      { ...PHONE, endpoint: 'pas une adresse' },
      { ...PHONE, endpoint: `https://push.exemple.fr/${'x'.repeat(2048)}` },
      { ...PHONE, device: 'montre' },
      { ...PHONE, keys: null },
      { ...PHONE, keys: { p256dh: KEYS.p256dh } },
      { ...PHONE, keys: { ...KEYS, p256dh: KEYS.auth } },
      { ...PHONE, keys: { ...KEYS, auth: 'trop court' } },
    ];
    for (const value of rejected) expect(readSubscriber(value)).toBeNull();
  });
});

describe('clés du serveur', () => {
  it('crée une paire de clés au premier lancement et la retrouve au redémarrage', () => {
    const { hub, store } = setup();
    expect(Buffer.from(hub.publicKey, 'base64url')).toHaveLength(65);
    expect(setup(store).hub.publicKey).toBe(hub.publicKey);
    expect(setup().hub.publicKey).not.toBe(hub.publicKey);
  });

  it('repart d’une paire neuve quand l’état enregistré est illisible', () => {
    for (const saved of ['{illisible', '42', '{"vapid":{"publicKey":"abc"}}']) {
      const store = memoryStore();
      store.set(STORE_KEY, saved);
      const { hub } = setup(store);
      expect(Buffer.from(hub.publicKey, 'base64url')).toHaveLength(65);
      expect(setup(store).hub.publicKey).toBe(hub.publicKey);
    }
  });
});

describe('abonnés', () => {
  it('accueille un nouvel appareil par une notification, une seule fois', async () => {
    const { hub, send } = setup();
    await hub.subscribe(PHONE);
    await hub.subscribe({ ...PHONE, device: 'pc' });

    expect(send).toHaveBeenCalledTimes(1);
    const [request] = send.mock.calls[0];
    expect(request).toMatchObject({ target: PHONE, contact: CONTACT, ttl: 1800, topic: 'clim-ready' });
    expect(request.vapid.publicKey).toBe(hub.publicKey);
    expect(JSON.parse(request.payload)).toEqual({
      kind: 'ready',
      title: 'Notifications activées',
      body: 'Cet appareil recevra les alertes de la clim du salon.',
      at: expect.any(Number),
      silent: false,
    });
  });

  it('adresse une notification aux seules classes d’appareils retenues', async () => {
    const { hub, send, sentTo } = setup();
    await hub.subscribe(PHONE);
    await hub.subscribe(PC);
    send.mockClear();

    await hub.announce(NOTIFICATION);
    expect(sentTo()).toEqual([PHONE.endpoint, PC.endpoint]);
    expect(send.mock.calls[0][0]).toMatchObject({ topic: 'clim-start', ttl: 1800 });
    expect(JSON.parse(send.mock.calls[0][0].payload)).toEqual({
      kind: 'start',
      title: 'Chauffage lancé',
      body: '18,9° dans le salon, objectif 21°.',
      at: NOTIFICATION.at,
      silent: false,
    });

    send.mockClear();
    await hub.announce({ ...NOTIFICATION, devices: ['pc'] });
    expect(sentTo()).toEqual([PC.endpoint]);
  });

  it('retrouve les abonnés après un redémarrage et suit un changement de classe', async () => {
    const first = setup();
    await first.hub.subscribe(PHONE);
    await first.hub.subscribe({ ...PHONE, device: 'pc' });

    const second = setup(first.store);
    await second.hub.announce({ ...NOTIFICATION, devices: ['phone'] });
    expect(second.sentTo()).toEqual([]);
    await second.hub.announce({ ...NOTIFICATION, devices: ['pc'] });
    expect(second.sentTo()).toEqual([PHONE.endpoint]);
  });

  it('oublie un appareil qui se désabonne', async () => {
    const { hub, send, sentTo, store } = setup();
    await hub.subscribe(PHONE);
    await hub.subscribe(PC);
    hub.unsubscribe(PHONE.endpoint);
    hub.unsubscribe('https://push.exemple.fr/inconnu');
    send.mockClear();

    await hub.announce(NOTIFICATION);
    expect(sentTo()).toEqual([PC.endpoint]);

    const restarted = setup(store);
    await restarted.hub.subscribe(PC);
    await restarted.hub.subscribe(PHONE);
    expect(restarted.sentTo()).toEqual([PHONE.endpoint]);
  });

  it('ne garde que les vingt abonnés les plus récents', async () => {
    const { hub, send, sentTo } = setup();
    for (let index = 1; index <= 22; index += 1) {
      await hub.subscribe({ ...PHONE, endpoint: `https://push.exemple.fr/${index}` });
    }
    send.mockClear();
    await hub.announce(NOTIFICATION);
    expect(sentTo()).toHaveLength(20);
    expect(sentTo()[0]).toBe('https://push.exemple.fr/3');
  });
});

describe('réponses du service de push', () => {
  it('retire un abonnement que le service déclare disparu', async () => {
    for (const gone of [404, 410]) {
      const { hub, send, onFailure, sentTo } = setup();
      await hub.subscribe(PHONE);
      await hub.subscribe(PC);
      send.mockClear();
      send.mockImplementation(({ target }) => Promise.resolve(target.endpoint === PHONE.endpoint ? gone : 201));

      await hub.announce(NOTIFICATION);
      send.mockClear();
      await hub.announce(NOTIFICATION);
      expect(sentTo()).toEqual([PC.endpoint]);
      expect(onFailure).not.toHaveBeenCalled();
    }
  });

  it('signale un envoi refusé ou impossible et garde l’abonné', async () => {
    const { hub, send, onFailure, sentTo } = setup();
    await hub.subscribe(PHONE);
    send.mockClear();

    send.mockResolvedValueOnce(403);
    await hub.announce(NOTIFICATION);
    expect(onFailure).toHaveBeenLastCalledWith('push.exemple.fr', 403);

    send.mockRejectedValueOnce(new Error('hors ligne'));
    await hub.announce(NOTIFICATION);
    expect(onFailure).toHaveBeenLastCalledWith('push.exemple.fr', null);

    send.mockClear();
    await hub.announce(NOTIFICATION);
    expect(sentTo()).toEqual([PHONE.endpoint]);
    expect(onFailure).toHaveBeenCalledTimes(2);
  });
});

describe('de bout en bout avec un service de push', () => {
  it('remet un message chiffré à l’appareil, puis oublie l’abonnement révoqué', async () => {
    const service = await startFakePushService();
    try {
      const hub = new PushHub({ store: memoryStore(), contact: CONTACT });
      await hub.subscribe({ ...service.subscribe(), device: 'phone' });
      await hub.announce({ ...NOTIFICATION, silent: true });

      expect(service.deliveries.map((delivery) => JSON.parse(delivery.text) as unknown)).toEqual([
        expect.objectContaining({ kind: 'ready' }),
        { kind: 'start', title: NOTIFICATION.title, body: NOTIFICATION.body, at: NOTIFICATION.at, silent: true },
      ]);
      expect(service.deliveries[1].headers).toMatchObject({ topic: 'clim-start', ttl: '1800' });

      service.status = 410;
      await hub.announce(NOTIFICATION);
      await hub.announce(NOTIFICATION);
      expect(service.deliveries).toHaveLength(3);
    } finally {
      await service.close();
    }
  });
});
