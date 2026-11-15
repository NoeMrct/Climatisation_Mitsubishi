import type { ClimSettings, Mode, SetpointMode } from './types';

export const MODEL = 'MSZ-FT35VGK';
export const ROOM_NAME = 'Salon';

export const SETPOINT_RANGE: Record<SetpointMode, { min: number; max: number }> = {
  heat: { min: 10, max: 31 },
  cool: { min: 16, max: 31 },
  auto: { min: 16, max: 31 },
};
export const SETPOINT_STEP = 1;

export const POWERFUL_MAX_MS = 60 * 60_000;
export const ECONO_OFFSET = 2;
export const NIGHT_OFFSET = 1;

export const RESTART_DELAY_MS = 3 * 60_000;

export const MAX_SLOTS_PER_DAY = 4;

export function hasSetpoint(mode: Mode): mode is SetpointMode {
  return mode === 'auto' || mode === 'cool' || mode === 'heat';
}

export function clampSetpoint(mode: SetpointMode, value: number): number {
  const { min, max } = SETPOINT_RANGE[mode];
  const stepped = Math.round(value / SETPOINT_STEP) * SETPOINT_STEP;
  return Math.max(min, Math.min(max, stepped));
}

export function currentSetpoint(settings: ClimSettings): number | null {
  return hasSetpoint(settings.mode) ? settings.setpoints[settings.mode] : null;
}

const coolOrHeat = (mode: Mode): mode is 'cool' | 'heat' => mode === 'cool' || mode === 'heat';

export const canPowerful = (s: ClimSettings): boolean => s.power && coolOrHeat(s.mode);
export const canISave = (s: ClimSettings): boolean => s.power && coolOrHeat(s.mode);
export const canEconoCool = (s: ClimSettings): boolean => s.power && coolOrHeat(s.mode);
