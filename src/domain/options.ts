import { ECONO_OFFSET, NIGHT_OFFSET, SETPOINT_RANGE, currentSetpoint } from './capabilities';
import { isPowerful } from './clim';
import type { AutoMode, Band, RegulationSettings } from './regulation';
import type { ClimSettings, FanSpeed } from './types';

export const POWERFUL_FAN: FanSpeed = 4;
export const QUIET_FAN: FanSpeed = 'quiet';

export function comfortOffset(settings: ClimSettings, mode: AutoMode): number {
  const degrees = (settings.econoCool ? ECONO_OFFSET : 0) + (settings.nightMode ? NIGHT_OFFSET : 0);
  return mode === 'heat' ? -degrees : degrees;
}

export function effectiveSetpoint(settings: ClimSettings, now: number): number | null {
  const base = currentSetpoint(settings);
  if (base === null || settings.mode === 'auto' || settings.mode === 'dry' || settings.mode === 'fan') return base;
  const { min, max } = SETPOINT_RANGE[settings.mode];
  if (isPowerful(settings, now)) return settings.mode === 'heat' ? max : min;
  return Math.max(min, Math.min(max, base + comfortOffset(settings, settings.mode)));
}

export function effectiveFan(settings: ClimSettings, now: number): FanSpeed {
  if (isPowerful(settings, now)) return POWERFUL_FAN;
  return settings.econoCool || settings.nightMode ? QUIET_FAN : settings.fan;
}

const shift = (band: Band, offset: number): Band => ({ ...band, low: band.low + offset, high: band.high + offset });

export function activeRegulation(regulation: RegulationSettings, settings: ClimSettings): RegulationSettings {
  const heat = comfortOffset(settings, 'heat');
  const cool = comfortOffset(settings, 'cool');
  if (heat === 0 && cool === 0) return regulation;
  return { ...regulation, heat: shift(regulation.heat, heat), cool: shift(regulation.cool, cool) };
}
