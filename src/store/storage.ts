import type { SimSnapshot } from '../device/SimulatedClim';
import { DEFAULT_SETTINGS } from '../domain/clim';
import { DEFAULT_THERMAL, type ThermalModel } from '../domain/forecast';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../domain/notify';
import {
  DEFAULT_REGULATION,
  IDLE_RUNTIME,
  type RegulationRuntime,
  type RegulationSettings,
} from '../domain/regulation';
import { defaultSchedule, type Schedule } from '../domain/schedule';
import { attempt } from '../lib/attempt';

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const browserStore: KeyValueStore = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    attempt(() => localStorage.setItem(key, value));
  },
};

export function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
  };
}

export interface PersistedState {
  regulation: RegulationSettings;
  runtime: RegulationRuntime;
  notifications: NotificationPrefs;
  schedule: Schedule;
  thermal: ThermalModel;
  simulator: (SimSnapshot & { clockOffset: number }) | null;
}

const KEY = 'clim.state.v1';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function loadState(store: KeyValueStore): PersistedState | null {
  const raw = store.get(KEY);
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) return null;
    const saved = data as Partial<PersistedState>;
    const regulation = saved.regulation ?? DEFAULT_REGULATION;
    const schedule =
      saved.schedule && Array.isArray(saved.schedule.days) && saved.schedule.days.length === 7
        ? { ...defaultSchedule(), ...saved.schedule }
        : defaultSchedule();
    const sim = saved.simulator;
    return {
      regulation: {
        enabled: regulation.enabled ?? DEFAULT_REGULATION.enabled,
        heat: { ...DEFAULT_REGULATION.heat, ...regulation.heat },
        cool: { ...DEFAULT_REGULATION.cool, ...regulation.cool },
      },
      runtime: { ...IDLE_RUNTIME, ...saved.runtime },
      notifications: { ...DEFAULT_NOTIFICATION_PREFS, ...saved.notifications },
      schedule,
      thermal: { ...DEFAULT_THERMAL, ...saved.thermal },
      simulator:
        sim && typeof sim.roomTemp === 'number' && typeof sim.outdoorTemp === 'number'
          ? {
              settings: { ...DEFAULT_SETTINGS, ...sim.settings },
              roomTemp: sim.roomTemp,
              outdoorTemp: sim.outdoorTemp,
              clockOffset: typeof sim.clockOffset === 'number' ? sim.clockOffset : 0,
            }
          : null,
    };
  } catch {
    return null;
  }
}

export function saveState(store: KeyValueStore, state: PersistedState): void {
  store.set(KEY, JSON.stringify(state));
}
