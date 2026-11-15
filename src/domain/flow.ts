import { isPowerful } from './clim';
import { effectiveFan } from './options';
import type { ClimState, FanSpeed } from './types';

export type FlowLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface FlowProfile {
  streaks: number;
  dash: number;
  gap: number;
  width: number;
  opacity: number;
  pace: number;
}

export const FLOW_PROFILES: Record<FlowLevel, FlowProfile> = {
  1: { streaks: 3, dash: 7, gap: 95, width: 1.2, opacity: 0.5, pace: 2.25 },
  2: { streaks: 4, dash: 9, gap: 86, width: 1.3, opacity: 0.7, pace: 1.5 },
  3: { streaks: 5, dash: 10, gap: 80, width: 1.4, opacity: 0.9, pace: 1 },
  4: { streaks: 6, dash: 13, gap: 64, width: 1.6, opacity: 0.95, pace: 0.62 },
  5: { streaks: 8, dash: 16, gap: 50, width: 1.8, opacity: 1, pace: 0.38 },
  6: { streaks: 10, dash: 22, gap: 38, width: 2.1, opacity: 1, pace: 0.24 },
};

const FAN_LEVEL: Record<Exclude<FanSpeed, 'auto'>, FlowLevel> = { quiet: 1, 1: 2, 2: 3, 3: 4, 4: 5 };
const FULL_OUTPUT = 0.9;

export function flowLevel(clim: ClimState, now: number): FlowLevel {
  if (isPowerful(clim.settings, now)) return 6;
  const fan = effectiveFan(clim.settings, now);
  if (fan !== 'auto') return FAN_LEVEL[fan];
  if (clim.output >= FULL_OUTPUT) return 4;
  return clim.output > 0 ? 3 : 2;
}

export const flowSpeed = (profile: FlowProfile): number => (profile.dash + profile.gap) / profile.pace;
