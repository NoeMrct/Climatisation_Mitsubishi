import { RESTART_DELAY_MS } from './capabilities';

export type AutoMode = 'heat' | 'cool';

export interface Band {
  enabled: boolean;
  low: number;
  high: number;
}

export interface RegulationSettings {
  enabled: boolean;
  heat: Band;
  cool: Band;
}

export const DEFAULT_REGULATION: RegulationSettings = {
  enabled: true,
  heat: { enabled: true, low: 19, high: 21 },
  cool: { enabled: false, low: 19, high: 23 },
};

export interface AutoSession {
  mode: AutoMode;
  startedAt: number;
  startTemp: number;
}

export interface RegulationRuntime {
  session: AutoSession | null;
  pausedUntil: number | null;
  lastStop: { mode: AutoMode; at: number } | null;
}

export const IDLE_RUNTIME: RegulationRuntime = { session: null, pausedUntil: null, lastStop: null };

export const REGULATION_LIMITS = {
  minRunMs: 5 * 60_000,
  minRestMs: RESTART_DELAY_MS,
  oppositeLockMs: 60 * 60_000,
} as const;

export type Decision =
  { type: 'none' } | { type: 'start'; mode: AutoMode; target: number } | { type: 'stop'; mode: AutoMode };

export interface DecisionInput {
  now: number;
  roomTemp: number;
  power: boolean;
}

export const targetOf = (settings: RegulationSettings, mode: AutoMode): number =>
  mode === 'heat' ? settings.heat.high : settings.cool.low;

export const triggerOf = (settings: RegulationSettings, mode: AutoMode): number =>
  mode === 'heat' ? settings.heat.low : settings.cool.high;

export function decide(settings: RegulationSettings, runtime: RegulationRuntime, input: DecisionInput): Decision {
  const { now, roomTemp, power } = input;
  if (!settings.enabled) return { type: 'none' };

  const { session } = runtime;
  if (session) {
    const band = settings[session.mode];
    if (!band.enabled) return { type: 'stop', mode: session.mode };
    const reached = session.mode === 'heat' ? roomTemp >= band.high : roomTemp <= band.low;
    const ranLongEnough = now - session.startedAt >= REGULATION_LIMITS.minRunMs;
    return reached && ranLongEnough ? { type: 'stop', mode: session.mode } : { type: 'none' };
  }

  if (power) return { type: 'none' };
  if (runtime.pausedUntil !== null && now < runtime.pausedUntil) return { type: 'none' };

  const { lastStop } = runtime;
  if (lastStop && now - lastStop.at < REGULATION_LIMITS.minRestMs) return { type: 'none' };
  const locked = (mode: AutoMode): boolean =>
    lastStop !== null && lastStop.mode !== mode && now - lastStop.at < REGULATION_LIMITS.oppositeLockMs;

  if (settings.heat.enabled && roomTemp < settings.heat.low && !locked('heat')) {
    return { type: 'start', mode: 'heat', target: settings.heat.high };
  }
  if (settings.cool.enabled && roomTemp >= settings.cool.high && !locked('cool')) {
    return { type: 'start', mode: 'cool', target: settings.cool.low };
  }
  return { type: 'none' };
}

export type BandKey = 'heat.low' | 'heat.high' | 'cool.low' | 'cool.high';

export function bandLimits(settings: RegulationSettings, key: BandKey): { min: number; max: number } {
  switch (key) {
    case 'heat.low':
      return { min: 10, max: settings.heat.high - 1 };
    case 'heat.high':
      return { min: settings.heat.low + 1, max: 31 };
    case 'cool.low':
      return { min: 16, max: settings.cool.high - 1 };
    case 'cool.high':
      return { min: settings.cool.low + 1, max: 31 };
  }
}

export function bandValue(settings: RegulationSettings, key: BandKey): number {
  const [mode, edge] = key.split('.') as [AutoMode, 'low' | 'high'];
  return settings[mode][edge];
}

export function stepBand(settings: RegulationSettings, key: BandKey, delta: 1 | -1): RegulationSettings {
  const [mode, edge] = key.split('.') as [AutoMode, 'low' | 'high'];
  const { min, max } = bandLimits(settings, key);
  const value = settings[mode][edge] + delta;
  if (value < min || value > max) return settings;
  return { ...settings, [mode]: { ...settings[mode], [edge]: value } };
}

export const bandPosition = (temp: number): number => Math.max(0, Math.min(100, ((temp - 15) / 12) * 100));

export function regulationSummary(settings: RegulationSettings): string {
  if (!settings.enabled) return 'Régulation en pause : la clim attend tes commandes.';
  const parts: string[] = [];
  if (settings.heat.enabled) parts.push(`Chauffe sous ${settings.heat.low}°, coupe à ${settings.heat.high}°.`);
  if (settings.cool.enabled) parts.push(`Rafraîchit dès ${settings.cool.high}°, coupe à ${settings.cool.low}°.`);
  return parts.length > 0 ? parts.join(' ') : 'Aucun mode actif : active le chauffage ou le rafraîchissement.';
}

export function regulationConflict(settings: RegulationSettings): string {
  const { heat, cool } = settings;
  if (!settings.enabled || !heat.enabled || !cool.enabled) return '';
  const advice = 'les deux modes se répondraient. Laisse au moins 1° entre ces seuils.';
  if (cool.low <= heat.low) {
    return `Le froid coupe à ${cool.low}° alors que le chauffage relance sous ${heat.low}° : ${advice}`;
  }
  if (cool.high <= heat.high) {
    return `Le froid se déclenche à ${cool.high}° alors que le chauffage monte jusqu’à ${heat.high}° : ${advice}`;
  }
  return '';
}
