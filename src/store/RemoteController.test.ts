import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '../domain/notify';
import { makeSnapshot } from '../test/fixtures';
import type { Snapshot } from './controller';
import { RemoteController } from './RemoteController';

const CACHE_KEY = 'clim.remote.snapshot';

class FakeEventSource {
  static opened: FakeEventSource[] = [];
  readonly url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.opened.push(this);
  }

  close(): void {
    this.closed = true;
  }
}

const TOAST: AppNotification = {
  id: 'n1',
  kind: 'start',
  mode: 'heat',
  at: 0,
  title: 'Chauffage lancé',
  body: 'Objectif 21°',
  detail: null,
  forecast: null,
};

const storage = new Map<string, string>();
const fetchMock = vi.fn<typeof fetch>();

const json = (value: unknown): Response =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

const lastSource = (): FakeEventSource => FakeEventSource.opened[FakeEventSource.opened.length - 1];

async function connected(snapshot: Snapshot = makeSnapshot()): Promise<RemoteController> {
  fetchMock.mockResolvedValueOnce(json(snapshot));
  const remote = await RemoteController.connect();
  if (!remote) throw new Error('connexion attendue');
  return remote;
}

beforeEach(() => {
  storage.clear();
  FakeEventSource.opened = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(json({ ok: true })));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connexion au serveur', () => {
  it('part de l’état du serveur quand il répond', async () => {
    const snapshot = makeSnapshot();
    const remote = await connected(snapshot);
    expect(fetchMock).toHaveBeenCalledWith('/api/snapshot', { signal: expect.any(AbortSignal) });
    expect(remote.getSnapshot().clim).toEqual(snapshot.clim);
    expect(remote.getSnapshot()).toMatchObject({ deviceClass: 'pc', permission: 'unsupported' });
  });

  it('laisse la place au simulateur sans serveur ni copie locale', async () => {
    fetchMock.mockRejectedValueOnce(new Error('hors ligne'));
    expect(await RemoteController.connect()).toBeNull();

    fetchMock.mockResolvedValueOnce(new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }));
    expect(await RemoteController.connect()).toBeNull();

    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 502, headers: { 'Content-Type': 'application/json' } }),
    );
    expect(await RemoteController.connect()).toBeNull();
  });

  it('reprend la dernière copie, marquée hors ligne, quand le serveur ne répond plus', async () => {
    storage.set(CACHE_KEY, JSON.stringify(makeSnapshot({ mode: 'cool' })));
    fetchMock.mockRejectedValueOnce(new Error('hors ligne'));
    const remote = await RemoteController.connect();
    expect(remote?.getSnapshot().clim).toMatchObject({ online: false, settings: { mode: 'cool' } });
  });

  it('ignore une copie locale illisible', async () => {
    storage.set(CACHE_KEY, '{illisible');
    fetchMock.mockRejectedValueOnce(new Error('hors ligne'));
    expect(await RemoteController.connect()).toBeNull();
  });
});

describe('suivi de l’état', () => {
  it('suit le flux du serveur, prévient les abonnés et garde une copie', async () => {
    const remote = await connected();
    const listener = vi.fn();
    remote.subscribe(listener);
    remote.start();
    remote.start();
    expect(FakeEventSource.opened).toHaveLength(1);
    expect(lastSource().url).toBe('/api/events');

    const next = makeSnapshot({ power: false });
    lastSource().onmessage?.({ data: JSON.stringify(next) });
    expect(remote.getSnapshot().clim.settings.power).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.get(CACHE_KEY) ?? '{}')).toEqual(next);
  });

  it('n’appelle plus un abonné qui s’est retiré', async () => {
    const remote = await connected();
    const listener = vi.fn();
    const unsubscribe = remote.subscribe(listener);
    remote.start();
    unsubscribe();
    lastSource().onmessage?.({ data: JSON.stringify(makeSnapshot()) });
    expect(listener).not.toHaveBeenCalled();
  });

  it('passe hors ligne quand le flux se coupe et ferme le flux à l’arrêt', async () => {
    const remote = await connected();
    remote.start();
    const source = lastSource();
    source.onerror?.();
    expect(remote.getSnapshot().clim.online).toBe(false);

    remote.stop();
    expect(source.closed).toBe(true);
    remote.start();
    expect(FakeEventSource.opened).toHaveLength(2);
  });
});

describe('actions', () => {
  const sentBodies = (): unknown[] =>
    fetchMock.mock.calls.filter(([url]) => url === '/api/action').map(([, init]) => JSON.parse(String(init?.body)));

  it('relaie chaque action au serveur avec ses arguments', async () => {
    const remote = await connected();
    const { regulation, schedule } = remote.getSnapshot();
    remote.command({ type: 'power', on: false });
    remote.setRegulation(regulation);
    remote.resumeRegulation();
    remote.setNotificationPrefs({ lead: 60 });
    remote.setSchedule(schedule);
    remote.startNow();
    remote.postpone(3_600_000);
    remote.skipUntilMorning();

    expect(sentBodies()).toEqual([
      { name: 'command', args: [{ type: 'power', on: false }] },
      { name: 'setRegulation', args: [regulation] },
      { name: 'resumeRegulation', args: [] },
      { name: 'setNotificationPrefs', args: [{ lead: 60 }] },
      { name: 'setSchedule', args: [schedule] },
      { name: 'startNow', args: [] },
      { name: 'postpone', args: [3_600_000] },
      { name: 'skipUntilMorning', args: [] },
    ]);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/action', expect.objectContaining({ method: 'POST' }));
  });

  it('passe hors ligne quand une action n’arrive pas au serveur', async () => {
    const remote = await connected();
    fetchMock.mockRejectedValueOnce(new Error('hors ligne'));
    remote.startNow();
    await vi.waitFor(() => expect(remote.getSnapshot().clim.online).toBe(false));
  });

  it('n’envoie rien pour les réglages du simulateur', async () => {
    const remote = await connected();
    remote.setOutdoorTemp();
    remote.setRoomTemp();
    remote.setSpeed();
    remote.resetSimulator();
    expect(sentBodies()).toEqual([]);
  });
});

describe('notifications', () => {
  it('masque une notification fermée sur cet appareil sans prévenir le serveur', async () => {
    const remote = await connected({ ...makeSnapshot(), toast: TOAST });
    const listener = vi.fn();
    remote.subscribe(listener);
    expect(remote.getSnapshot().toast).toEqual(TOAST);

    remote.dismissToast();
    expect(remote.getSnapshot().toast).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('montre de nouveau une notification différente après une fermeture', async () => {
    const remote = await connected({ ...makeSnapshot(), toast: TOAST });
    remote.start();
    remote.dismissToast();
    lastSource().onmessage?.({ data: JSON.stringify({ ...makeSnapshot(), toast: { ...TOAST, id: 'n2' } }) });
    expect(remote.getSnapshot().toast?.id).toBe('n2');
  });

  it('ne montre pas les notifications que cet appareil a désactivées', async () => {
    const snapshot = makeSnapshot();
    const remote = await connected({
      ...snapshot,
      toast: TOAST,
      notificationPrefs: { ...snapshot.notificationPrefs, pc: false },
    });
    expect(remote.getSnapshot().toast).toBeNull();
  });

  it('reporte l’autorisation du système après une demande', async () => {
    const remote = await connected();
    await remote.requestNotifications();
    expect(remote.getSnapshot().permission).toBe('unsupported');
  });
});
