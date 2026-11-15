import type { NotificationPrefs } from '../domain/notify';
import type { RegulationSettings } from '../domain/regulation';
import type { Schedule } from '../domain/schedule';
import type { ClimCommand } from '../domain/types';
import { attempt, attemptAsync } from '../lib/attempt';
import { detectDeviceClass } from '../services/platform';
import { requestSystemPermission, showSystemNotification, systemPermission } from '../services/systemNotifications';
import type { AppApi, RemoteAction } from './api';
import type { Snapshot } from './controller';

const CACHE_KEY = 'clim.remote.snapshot';
const CACHE_EVERY_MS = 5000;
const CONNECT_TIMEOUT_MS = 2500;

const offline = (snapshot: Snapshot): Snapshot => ({ ...snapshot, clim: { ...snapshot.clim, online: false } });

function readCache(): Snapshot | null {
  const raw = attempt(() => localStorage.getItem(CACHE_KEY));
  return raw ? (attempt(() => JSON.parse(raw) as Snapshot) ?? null) : null;
}

async function fetchSnapshot(): Promise<Snapshot | null> {
  const response = await fetch('/api/snapshot', { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
  const isJson = response.headers.get('content-type')?.includes('json') ?? false;
  return response.ok && isJson ? ((await response.json()) as Snapshot) : null;
}

export class RemoteController implements AppApi {
  private snapshot: Snapshot;
  private remote: Snapshot;
  private source: EventSource | null = null;
  private permission = systemPermission();
  private readonly deviceClass = detectDeviceClass();
  private readonly listeners = new Set<() => void>();
  private dismissed: string | null = null;
  private announced: string | null = null;
  private cachedAt = 0;

  constructor(initial: Snapshot) {
    this.remote = initial;
    this.snapshot = this.localize(initial);
  }

  static async connect(): Promise<RemoteController | null> {
    const live = await attemptAsync(fetchSnapshot);
    if (live) return new RemoteController(live);
    const cached = readCache();
    return cached ? new RemoteController(offline(cached)) : null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Snapshot => this.snapshot;

  start(): void {
    if (this.source) return;
    this.source = new EventSource('/api/events');
    this.source.onmessage = (event: MessageEvent<string>) => this.accept(JSON.parse(event.data) as Snapshot);
    this.source.onerror = () => this.markOffline();
  }

  stop(): void {
    this.source?.close();
    this.source = null;
  }

  command(command: ClimCommand): void {
    this.call('command', command);
  }

  setRegulation(next: RegulationSettings): void {
    this.call('setRegulation', next);
  }

  resumeRegulation(): void {
    this.call('resumeRegulation');
  }

  setNotificationPrefs(patch: Partial<NotificationPrefs>): void {
    this.call('setNotificationPrefs', patch);
  }

  setSchedule(next: Schedule): void {
    this.call('setSchedule', next);
  }

  dismissToast(): void {
    this.dismissed = this.remote.toast?.id ?? null;
    this.accept(this.remote, false);
  }

  startNow(): void {
    this.call('startNow');
  }

  postpone(durationMs: number): void {
    this.call('postpone', durationMs);
  }

  skipUntilMorning(): void {
    this.call('skipUntilMorning');
  }

  async requestNotifications(): Promise<void> {
    this.permission = await requestSystemPermission();
    this.accept(this.remote, false);
  }

  setOutdoorTemp(): void {}
  setRoomTemp(): void {}
  setSpeed(): void {}
  resetSimulator(): void {}

  private localize(remote: Snapshot): Snapshot {
    const wanted = remote.notificationPrefs[this.deviceClass];
    const toast = wanted && remote.toast?.id !== this.dismissed ? remote.toast : null;
    return { ...remote, deviceClass: this.deviceClass, permission: this.permission, toast };
  }

  private accept(remote: Snapshot, cache = true): void {
    this.remote = remote;
    this.snapshot = this.localize(remote);
    const { toast } = this.snapshot;
    if (toast && toast.id !== this.announced) {
      this.announced = toast.id;
      void showSystemNotification(toast, false);
    }
    if (cache && Date.now() - this.cachedAt > CACHE_EVERY_MS) {
      this.cachedAt = Date.now();
      attempt(() => localStorage.setItem(CACHE_KEY, JSON.stringify(remote)));
    }
    for (const listener of this.listeners) listener();
  }

  private markOffline(): void {
    this.accept(offline(this.remote), false);
  }

  private call(name: RemoteAction, ...args: unknown[]): void {
    void fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, args }),
    }).catch(() => this.markOffline());
  }
}
