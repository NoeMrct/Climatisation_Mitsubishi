import { DEVICE_CLASSES, READY_TEXT, type AppNotification, type DeviceClass } from '../src/domain/notify';
import { pushMessage, pushTopic, type PushMessage, type PushSubscriber } from '../src/domain/push';
import { attempt, attemptAsync } from '../src/lib/attempt';
import type { KeyValueStore } from '../src/store/storage';
import { createVapidKeys, sendPush, type PushRequest, type VapidKeys } from './webPush';

const STORE_KEY = 'clim.push.v1';
const TTL_S = 30 * 60;
const MAX_SUBSCRIBERS = 20;
const MAX_ENDPOINT_LENGTH = 2048;
const PUBLIC_KEY_LENGTH = 65;
const AUTH_LENGTH = 16;
const GONE: readonly number[] = [404, 410];

interface Saved {
  vapid: VapidKeys;
  subscribers: PushSubscriber[];
}

export interface PushHubOptions {
  store: KeyValueStore;
  contact: string;
  send?: (request: PushRequest) => Promise<number>;
  onFailure?: (host: string, status: number | null) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isDevice = (value: unknown): value is DeviceClass => (DEVICE_CLASSES as readonly unknown[]).includes(value);

const isKey = (value: unknown, length: number): value is string =>
  typeof value === 'string' && /^[\w-]+=*$/.test(value) && Buffer.from(value, 'base64url').length === length;

export function readSubscriber(value: unknown): PushSubscriber | null {
  if (!isRecord(value) || !isRecord(value.keys)) return null;
  const { endpoint, device } = value;
  const { p256dh, auth } = value.keys;
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return null;
  if (attempt(() => new URL(endpoint).protocol) !== 'https:') return null;
  if (!isDevice(device) || !isKey(p256dh, PUBLIC_KEY_LENGTH) || !isKey(auth, AUTH_LENGTH)) return null;
  return { endpoint, keys: { p256dh, auth }, device };
}

function load(store: KeyValueStore): Saved | null {
  const raw = store.get(STORE_KEY);
  const saved = raw ? attempt(() => JSON.parse(raw) as unknown) : null;
  if (!isRecord(saved) || !isRecord(saved.vapid)) return null;
  const { publicKey, privateKey } = saved.vapid;
  if (!isKey(publicKey, PUBLIC_KEY_LENGTH) || typeof privateKey !== 'string') return null;
  const subscribers = Array.isArray(saved.subscribers) ? saved.subscribers : [];
  return {
    vapid: { publicKey, privateKey },
    subscribers: subscribers.flatMap((item: unknown) => readSubscriber(item) ?? []),
  };
}

export class PushHub {
  readonly publicKey: string;

  private readonly store: KeyValueStore;
  private readonly contact: string;
  private readonly send: (request: PushRequest) => Promise<number>;
  private readonly onFailure: (host: string, status: number | null) => void;
  private readonly vapid: VapidKeys;
  private subscribers: PushSubscriber[];

  constructor(options: PushHubOptions) {
    const saved = load(options.store);
    this.store = options.store;
    this.contact = options.contact;
    this.send = options.send ?? sendPush;
    this.onFailure = options.onFailure ?? (() => {});
    this.vapid = saved?.vapid ?? createVapidKeys();
    this.subscribers = saved?.subscribers ?? [];
    this.publicKey = this.vapid.publicKey;
    if (!saved) this.save();
  }

  subscribe(subscriber: PushSubscriber): Promise<void> {
    const others = this.subscribers.filter((item) => item.endpoint !== subscriber.endpoint);
    const known = others.length < this.subscribers.length;
    this.subscribers = [...others, subscriber].slice(-MAX_SUBSCRIBERS);
    this.save();
    if (known) return Promise.resolve();
    return this.deliver([subscriber], { kind: 'ready', ...READY_TEXT, at: Date.now(), silent: false });
  }

  unsubscribe(endpoint: string): void {
    this.subscribers = this.subscribers.filter((item) => item.endpoint !== endpoint);
    this.save();
  }

  announce(notification: AppNotification): Promise<void> {
    const targets = this.subscribers.filter((item) => notification.devices.includes(item.device));
    return this.deliver(targets, pushMessage(notification));
  }

  private async deliver(targets: readonly PushSubscriber[], message: PushMessage): Promise<void> {
    const payload = JSON.stringify(message);
    const topic = pushTopic(message.kind);
    await Promise.all(
      targets.map(async (target) => {
        const request = { target, payload, vapid: this.vapid, contact: this.contact, ttl: TTL_S, topic };
        const status = (await attemptAsync(() => this.send(request))) ?? null;
        if (status !== null && GONE.includes(status)) this.unsubscribe(target.endpoint);
        else if (status === null || status >= 400) this.onFailure(new URL(target.endpoint).host, status);
      }),
    );
  }

  private save(): void {
    const saved: Saved = { vapid: this.vapid, subscribers: this.subscribers };
    this.store.set(STORE_KEY, JSON.stringify(saved));
  }
}
