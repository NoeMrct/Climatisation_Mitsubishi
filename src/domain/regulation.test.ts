import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REGULATION,
  IDLE_RUNTIME,
  bandLimits,
  decide,
  regulationConflict,
  regulationSummary,
  stepBand,
  type RegulationRuntime,
  type RegulationSettings,
} from './regulation';

const MIN = 60_000;
const NOW = 100 * 60 * MIN;
const both: RegulationSettings = {
  enabled: true,
  heat: { enabled: true, low: 19, high: 21 },
  cool: { enabled: true, low: 22, high: 25 },
};
const off = (roomTemp: number) => ({ now: NOW, roomTemp, power: false });

describe('décision de la régulation', () => {
  it('relance le chauffage sous le seuil bas, avec le seuil haut pour objectif', () => {
    expect(decide(DEFAULT_REGULATION, IDLE_RUNTIME, off(18.9))).toEqual({ type: 'start', mode: 'heat', target: 21 });
    expect(decide(DEFAULT_REGULATION, IDLE_RUNTIME, off(19))).toEqual({ type: 'none' });
  });

  it('déclenche le froid à partir du seuil haut', () => {
    expect(decide(both, IDLE_RUNTIME, off(25))).toEqual({ type: 'start', mode: 'cool', target: 22 });
    expect(decide(both, IDLE_RUNTIME, off(24.9))).toEqual({ type: 'none' });
  });

  it('coupe une marche automatique quand l’objectif est atteint', () => {
    const runtime: RegulationRuntime = {
      ...IDLE_RUNTIME,
      session: { mode: 'heat', startedAt: NOW - 40 * MIN, startTemp: 18.9 },
    };
    expect(decide(DEFAULT_REGULATION, runtime, { now: NOW, roomTemp: 20.9, power: true })).toEqual({ type: 'none' });
    expect(decide(DEFAULT_REGULATION, runtime, { now: NOW, roomTemp: 21, power: true })).toEqual({
      type: 'stop',
      mode: 'heat',
    });
  });

  it('laisse tourner au moins 5 minutes', () => {
    const runtime: RegulationRuntime = {
      ...IDLE_RUNTIME,
      session: { mode: 'heat', startedAt: NOW - 2 * MIN, startTemp: 20.9 },
    };
    expect(decide(DEFAULT_REGULATION, runtime, { now: NOW, roomTemp: 21.2, power: true })).toEqual({ type: 'none' });
  });

  it('ne touche à rien quand la clim tourne à la main, est en pause ou désactivée', () => {
    expect(decide(DEFAULT_REGULATION, IDLE_RUNTIME, { now: NOW, roomTemp: 15, power: true })).toEqual({ type: 'none' });
    expect(decide(DEFAULT_REGULATION, { ...IDLE_RUNTIME, pausedUntil: NOW + MIN }, off(15))).toEqual({ type: 'none' });
    expect(decide({ ...DEFAULT_REGULATION, enabled: false }, IDLE_RUNTIME, off(15))).toEqual({ type: 'none' });
  });

  it('respecte le repos du compresseur et le verrou entre chaud et froid', () => {
    const justStopped: RegulationRuntime = { ...IDLE_RUNTIME, lastStop: { mode: 'heat', at: NOW - MIN } };
    expect(decide(DEFAULT_REGULATION, justStopped, off(18))).toEqual({ type: 'none' });
    const afterCooling: RegulationRuntime = { ...IDLE_RUNTIME, lastStop: { mode: 'cool', at: NOW - 30 * MIN } };
    expect(decide(both, afterCooling, off(18))).toEqual({ type: 'none' });
    expect(decide(both, { ...IDLE_RUNTIME, lastStop: { mode: 'cool', at: NOW - 61 * MIN } }, off(18))).toMatchObject({
      type: 'start',
    });
  });
});

describe('réglage des seuils', () => {
  it('garde au moins 1° dans chaque plage', () => {
    expect(bandLimits(DEFAULT_REGULATION, 'heat.low')).toEqual({ min: 10, max: 20 });
    expect(bandLimits(DEFAULT_REGULATION, 'cool.high')).toEqual({ min: 20, max: 31 });
    const tight = stepBand(DEFAULT_REGULATION, 'heat.low', 1);
    expect(tight.heat.low).toBe(20);
    expect(stepBand(tight, 'heat.low', 1)).toBe(tight);
  });

  it('résume le réglage en une phrase', () => {
    expect(regulationSummary(DEFAULT_REGULATION)).toBe('Chauffe sous 19°, coupe à 21°.');
    expect(regulationSummary({ ...DEFAULT_REGULATION, enabled: false })).toBe(
      'Régulation en pause : la clim attend tes commandes.',
    );
  });

  it('signale deux plages qui se chevauchent', () => {
    const asked: RegulationSettings = { ...DEFAULT_REGULATION, cool: { enabled: true, low: 19, high: 23 } };
    expect(regulationConflict(asked)).toContain('Le froid coupe à 19° alors que le chauffage relance sous 19°');
    expect(regulationConflict(both)).toBe('');
    expect(regulationConflict(DEFAULT_REGULATION)).toBe('');
  });
});
