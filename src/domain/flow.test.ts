import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './clim';
import { FLOW_PROFILES, flowLevel, flowSpeed, type FlowLevel } from './flow';
import type { ClimSettings, ClimState } from './types';

const NOW = 1_000_000;
const LEVELS: FlowLevel[] = [1, 2, 3, 4, 5, 6];

const clim = (settings: Partial<ClimSettings> = {}, output = 1): ClimState => ({
  settings: { ...DEFAULT_SETTINGS, ...settings },
  roomTemp: 19.5,
  outdoorTemp: 4,
  activity: 'heating',
  autoPhase: null,
  output,
  online: true,
});

describe('intensité du flux d’air', () => {
  it('suit la vitesse de ventilation choisie', () => {
    const fans = ['quiet', 1, 2, 3, 4] as const;
    expect(fans.map((fan) => flowLevel(clim({ fan }), NOW))).toEqual([1, 2, 3, 4, 5]);
  });

  it('suit la puissance demandée quand la ventilation est en Auto', () => {
    expect(flowLevel(clim({}, 1), NOW)).toBe(4);
    expect(flowLevel(clim({}, 0.6), NOW)).toBe(3);
    expect(flowLevel(clim({}, 0), NOW)).toBe(2);
  });

  it('passe au maximum en Powerful et au minimum en Econo Cool ou en mode nuit', () => {
    expect(flowLevel(clim({ fan: 'quiet', powerfulUntil: NOW + 60_000 }), NOW)).toBe(6);
    expect(flowLevel(clim({ fan: 4, powerfulUntil: NOW - 1 }), NOW)).toBe(5);
    expect(flowLevel(clim({ fan: 4, econoCool: true }), NOW)).toBe(1);
    expect(flowLevel(clim({ fan: 3, nightMode: true }), NOW)).toBe(1);
  });

  it('accélère, densifie et éclaircit les filets d’air à chaque niveau', () => {
    for (const level of LEVELS.slice(1)) {
      const calmer = FLOW_PROFILES[(level - 1) as FlowLevel];
      const stronger = FLOW_PROFILES[level];
      expect(flowSpeed(stronger)).toBeGreaterThan(flowSpeed(calmer) * 1.2);
      expect(stronger.streaks).toBeGreaterThan(calmer.streaks);
      expect(stronger.dash).toBeGreaterThan(calmer.dash);
      expect(stronger.width).toBeGreaterThan(calmer.width);
      expect(stronger.opacity).toBeGreaterThanOrEqual(calmer.opacity);
    }
  });
});
