import type { NotificationPrefs } from '../domain/notify';
import type { RegulationSettings } from '../domain/regulation';
import type { Schedule } from '../domain/schedule';
import type { ClimCommand } from '../domain/types';
import type { Snapshot } from './controller';

export interface AppApi {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Snapshot;
  start(): void;
  stop(): void;
  command(command: ClimCommand): void;
  setRegulation(next: RegulationSettings): void;
  resumeRegulation(): void;
  setNotificationPrefs(patch: Partial<NotificationPrefs>): void;
  setSchedule(next: Schedule): void;
  dismissToast(): void;
  startNow(): void;
  postpone(durationMs: number): void;
  skipUntilMorning(): void;
  requestNotifications(): Promise<void>;
  setOutdoorTemp(value: number): void;
  setRoomTemp(value: number): void;
  setSpeed(speed: number): void;
  resetSimulator(): void;
}

export const REMOTE_ACTIONS = [
  'command',
  'setRegulation',
  'resumeRegulation',
  'setNotificationPrefs',
  'setSchedule',
  'startNow',
  'postpone',
  'skipUntilMorning',
] as const satisfies readonly (keyof AppApi)[];

export type RemoteAction = (typeof REMOTE_ACTIONS)[number];
