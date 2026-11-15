import { attempt } from '../lib/attempt';
import type { AppNotification, DeviceClass, NotificationKind } from './notify';

export type PushStatus = 'unsupported' | 'blocked' | 'off' | 'on';

export type PushKind = NotificationKind | 'ready';

const KINDS: readonly PushKind[] = ['forecast', 'start', 'stop', 'ready'];

export interface PushMessage {
  kind: PushKind;
  title: string;
  body: string;
  at: number;
  silent: boolean;
}

export interface PushSubscriber {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  device: DeviceClass;
}

export const pushTopic = (kind: PushKind): string => `clim-${kind}`;

export function pushMessage({ kind, title, body, at, silent }: AppNotification): PushMessage {
  return { kind, title, body, at, silent };
}

const isKind = (value: unknown): value is PushKind => (KINDS as readonly unknown[]).includes(value);

export function readPushMessage(text: string | undefined): PushMessage | null {
  const data = text ? attempt(() => JSON.parse(text) as Partial<Record<keyof PushMessage, unknown>> | null) : null;
  if (typeof data !== 'object' || data === null) return null;
  const { kind, title, body, at, silent } = data;
  if (!isKind(kind) || typeof title !== 'string' || typeof body !== 'string') return null;
  if (typeof at !== 'number' || typeof silent !== 'boolean') return null;
  return { kind, title, body, at, silent };
}
