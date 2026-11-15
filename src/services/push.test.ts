import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disablePush, enablePush, initialPushStatus, onNotificationLink, resumePush } from './push';

const SERVER_KEY = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const OTHER_KEY = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const KEYS = { p256dh: OTHER_KEY, auth: 'BTBZMqHH6r4Tts7J_aSIgg' };

const bytesOf = (key: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));

interface FakeSubscription {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer };
  toJSON: () => { endpoint: string; expirationTime: null; keys: typeof KEYS };
  unsubscribe: () => Promise<boolean>;
}

class FakePushManager {
  current: FakeSubscription | null = null;
  created = 0;

  getSubscription = vi.fn(() => Promise.resolve(this.current));

  subscribe = vi.fn((options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array<ArrayBuffer> }) => {
    this.created += 1;
    this.current = this.make(`https://push.exemple.fr/${this.created}`, options.applicationServerKey);
    return Promise.resolve(this.current);
  });

  make(endpoint: string, key: Uint8Array<ArrayBuffer>): FakeSubscription {
    return {
      endpoint,
      options: { applicationServerKey: key.buffer },
      toJSON: () => ({ endpoint, expirationTime: null, keys: KEYS }),
      unsubscribe: () => {
        this.current = null;
        return Promise.resolve(true);
      },
    };
  }
}

type Permission = 'default' | 'granted' | 'denied';

const notification = {
  permission: 'default' as Permission,
  answer: 'granted' as Permission,
  requestPermission: vi.fn(() => {
    notification.permission = notification.answer;
    return Promise.resolve(notification.answer);
  }),
};

let pushManager: FakePushManager;
let registered: boolean;
let listeners: ((event: { data: unknown }) => void)[];
const fetchMock = vi.fn<typeof fetch>();

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const serverCalls = (): { method: string; url: string; body: unknown }[] =>
  fetchMock.mock.calls.map(([url, init]) => ({
    method: init?.method ?? 'GET',
    url: String(url),
    body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
  }));

function installBrowser(): void {
  const registration = { pushManager };
  vi.stubGlobal('Notification', notification);
  vi.stubGlobal('window', { Notification: notification, PushManager: FakePushManager });
  vi.stubGlobal('navigator', {
    serviceWorker: {
      ready: Promise.resolve(registration),
      getRegistration: () => Promise.resolve(registered ? registration : undefined),
      addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => listeners.push(listener),
    },
  });
}

beforeEach(() => {
  pushManager = new FakePushManager();
  registered = true;
  listeners = [];
  notification.permission = 'default';
  notification.answer = 'granted';
  notification.requestPermission.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) =>
    Promise.resolve(json(String(url).endsWith('/key') ? { key: SERVER_KEY } : { ok: true })),
  );
  vi.stubGlobal('fetch', fetchMock);
  installBrowser();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appareil sans notifications push', () => {
  it('se déclare indisponible hors d’un navigateur compatible', async () => {
    vi.stubGlobal('window', undefined);
    expect(initialPushStatus()).toBe('unsupported');
    await expect(resumePush('pc')).resolves.toBe('unsupported');
    await expect(enablePush('pc')).resolves.toBe('unsupported');
    await expect(disablePush()).resolves.toBe('unsupported');

    vi.stubGlobal('window', { Notification: notification });
    expect(initialPushStatus()).toBe('unsupported');
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('se déclare indisponible sans service worker enregistré', async () => {
    registered = false;
    await expect(enablePush('pc')).resolves.toBe('unsupported');
    await expect(disablePush()).resolves.toBe('unsupported');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

describe('état de départ', () => {
  it('part désactivé, ou bloqué quand l’appareil refuse les notifications', () => {
    expect(initialPushStatus()).toBe('off');
    notification.permission = 'denied';
    expect(initialPushStatus()).toBe('blocked');
  });
});

describe('activation', () => {
  it('demande l’autorisation, s’abonne avec la clé du serveur et s’y enregistre', async () => {
    await expect(enablePush('phone')).resolves.toBe('on');

    expect(notification.requestPermission).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledExactlyOnceWith({
      userVisibleOnly: true,
      applicationServerKey: bytesOf(SERVER_KEY),
    });
    const [{ applicationServerKey }] = pushManager.subscribe.mock.calls[0];
    expect(applicationServerKey).toHaveLength(65);
    expect(applicationServerKey[0]).toBe(4);
    expect(serverCalls()).toEqual([
      { method: 'GET', url: '/api/push/key', body: null },
      {
        method: 'POST',
        url: '/api/push/subscription',
        body: { endpoint: 'https://push.exemple.fr/1', keys: KEYS, device: 'phone' },
      },
    ]);
  });

  it('reste désactivé quand l’autorisation est refusée ou laissée sans réponse', async () => {
    notification.answer = 'default';
    await expect(enablePush('pc')).resolves.toBe('off');
    notification.answer = 'denied';
    await expect(enablePush('pc')).resolves.toBe('blocked');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ne s’abonne pas quand le serveur ne donne pas sa clé', async () => {
    fetchMock.mockRejectedValueOnce(new Error('hors ligne'));
    await expect(enablePush('pc')).resolves.toBe('off');
    fetchMock.mockResolvedValueOnce(json({ error: 'introuvable' }, 404));
    await expect(enablePush('pc')).resolves.toBe('off');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('annule l’abonnement que le serveur n’a pas pu enregistrer', async () => {
    fetchMock.mockResolvedValueOnce(json({ key: SERVER_KEY })).mockResolvedValueOnce(json({ error: 'refusé' }, 400));
    await expect(enablePush('pc')).resolves.toBe('off');
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    expect(pushManager.current).toBeNull();

    fetchMock.mockResolvedValueOnce(json({ key: SERVER_KEY })).mockRejectedValueOnce(new Error('hors ligne'));
    await expect(enablePush('pc')).resolves.toBe('off');
    expect(pushManager.current).toBeNull();
  });
});

describe('reprise au lancement de l’appli', () => {
  it('ne fait rien pour un appareil qui n’est pas abonné', async () => {
    await expect(resumePush('pc')).resolves.toBe('off');
    notification.permission = 'granted';
    await expect(resumePush('pc')).resolves.toBe('off');
    notification.permission = 'denied';
    await expect(resumePush('pc')).resolves.toBe('blocked');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rappelle l’abonnement existant au serveur', async () => {
    notification.permission = 'granted';
    pushManager.current = pushManager.make('https://push.exemple.fr/ancien', bytesOf(SERVER_KEY));
    await expect(resumePush('phone')).resolves.toBe('on');

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(serverCalls()[1]).toEqual({
      method: 'POST',
      url: '/api/push/subscription',
      body: { endpoint: 'https://push.exemple.fr/ancien', keys: KEYS, device: 'phone' },
    });
  });

  it('se réabonne quand la clé du serveur a changé', async () => {
    notification.permission = 'granted';
    pushManager.current = pushManager.make('https://push.exemple.fr/ancien', bytesOf(OTHER_KEY));
    await expect(resumePush('pc')).resolves.toBe('on');

    expect(pushManager.subscribe).toHaveBeenCalledExactlyOnceWith({
      userVisibleOnly: true,
      applicationServerKey: bytesOf(SERVER_KEY),
    });
    expect(serverCalls()[1].body).toMatchObject({ endpoint: 'https://push.exemple.fr/1', device: 'pc' });
  });

  it('garde l’abonnement quand le serveur est injoignable', async () => {
    notification.permission = 'granted';
    pushManager.current = pushManager.make('https://push.exemple.fr/ancien', bytesOf(SERVER_KEY));
    fetchMock.mockRejectedValue(new Error('hors ligne'));
    await expect(resumePush('pc')).resolves.toBe('on');
    expect(pushManager.current?.endpoint).toBe('https://push.exemple.fr/ancien');
  });
});

describe('désactivation', () => {
  it('prévient le serveur puis résilie l’abonnement de l’appareil', async () => {
    await enablePush('pc');
    fetchMock.mockClear();
    await expect(disablePush()).resolves.toBe('off');
    expect(serverCalls()).toEqual([
      { method: 'DELETE', url: '/api/push/subscription', body: { endpoint: 'https://push.exemple.fr/1' } },
    ]);
    expect(pushManager.current).toBeNull();
  });

  it('résilie quand même si le serveur est injoignable, et ne fait rien sans abonnement', async () => {
    await enablePush('pc');
    fetchMock.mockRejectedValue(new Error('hors ligne'));
    await expect(disablePush()).resolves.toBe('off');
    expect(pushManager.current).toBeNull();

    fetchMock.mockClear();
    await expect(disablePush()).resolves.toBe('off');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('liens ouverts depuis une notification', () => {
  it('transmet le lien envoyé par le service worker', () => {
    const open = vi.fn<(link: string) => void>();
    onNotificationLink(open);
    expect(listeners).toHaveLength(1);

    listeners[0]({ data: { link: '#/auto/prevision' } });
    listeners[0]({ data: { link: 12 } });
    listeners[0]({ data: { autre: '#/' } });
    listeners[0]({ data: null });
    expect(open.mock.calls).toEqual([['#/auto/prevision']]);
  });

  it('n’écoute rien sans service worker', () => {
    vi.stubGlobal('window', undefined);
    onNotificationLink(vi.fn());
    expect(listeners).toHaveLength(0);
  });
});
