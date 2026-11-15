import type { DeviceClass } from '../domain/notify';
import type { PushStatus } from '../domain/push';
import { attemptAsync } from '../lib/attempt';

const KEY_URL = '/api/push/key';
const SUBSCRIPTION_URL = '/api/push/subscription';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

const available = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;

const toBytes = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));

const toText = (buffer: ArrayBuffer | null): string =>
  btoa(String.fromCharCode(...new Uint8Array(buffer ?? new ArrayBuffer(0))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function fetchKey(): Promise<string> {
  const response = await fetch(KEY_URL);
  const { key } = (await response.json()) as { key?: unknown };
  if (!response.ok || typeof key !== 'string') throw new Error('clé du serveur absente');
  return key;
}

async function connect(pushManager: PushManager, device: DeviceClass): Promise<boolean> {
  const key = await fetchKey();
  const existing = await pushManager.getSubscription();
  const current = existing && toText(existing.options.applicationServerKey) === key ? existing : null;
  if (existing && !current) await existing.unsubscribe();
  const subscription =
    current ?? (await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) }));
  const { endpoint, keys } = subscription.toJSON();
  const response = await fetch(SUBSCRIPTION_URL, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ endpoint, keys, device }),
  });
  return response.ok;
}

async function statusOf(pushManager: PushManager): Promise<PushStatus> {
  if (Notification.permission === 'denied') return 'blocked';
  return (await attemptAsync(() => pushManager.getSubscription())) ? 'on' : 'off';
}

export function initialPushStatus(): PushStatus {
  if (!available()) return 'unsupported';
  return Notification.permission === 'denied' ? 'blocked' : 'off';
}

export async function resumePush(device: DeviceClass): Promise<PushStatus> {
  if (!available()) return 'unsupported';
  const { pushManager } = await navigator.serviceWorker.ready;
  const subscribed = Notification.permission === 'granted' && (await attemptAsync(() => pushManager.getSubscription()));
  if (subscribed) await attemptAsync(() => connect(pushManager, device));
  return statusOf(pushManager);
}

export async function enablePush(device: DeviceClass): Promise<PushStatus> {
  if (!available()) return 'unsupported';
  const permission = await attemptAsync(() => Notification.requestPermission());
  if (!(await attemptAsync(() => navigator.serviceWorker.getRegistration()))) return 'unsupported';
  const { pushManager } = await navigator.serviceWorker.ready;
  if (permission !== 'granted') return statusOf(pushManager);
  const connected = await attemptAsync(() => connect(pushManager, device));
  if (!connected) await attemptAsync(async () => (await pushManager.getSubscription())?.unsubscribe());
  return statusOf(pushManager);
}

export async function disablePush(): Promise<PushStatus> {
  if (!available()) return 'unsupported';
  const registration = await attemptAsync(() => navigator.serviceWorker.getRegistration());
  if (!registration) return 'unsupported';
  const subscription = await attemptAsync(() => registration.pushManager.getSubscription());
  if (subscription) {
    const body = JSON.stringify({ endpoint: subscription.endpoint });
    await attemptAsync(() => fetch(SUBSCRIPTION_URL, { method: 'DELETE', headers: JSON_HEADERS, body }));
    await attemptAsync(() => subscription.unsubscribe());
  }
  return statusOf(registration.pushManager);
}

export function onNotificationLink(open: (link: string) => void): void {
  if (!available()) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ link?: unknown } | null>) => {
    const link = event.data?.link;
    if (typeof link === 'string') open(link);
  });
}
