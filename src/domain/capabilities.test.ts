import { describe, expect, it } from 'vitest';
import { canEconoCool, canISave, canPowerful, clampSetpoint, currentSetpoint, hasSetpoint } from './capabilities';
import { DEFAULT_SETTINGS } from './clim';

describe('capacités de la clim', () => {
  it('borne et arrondit la consigne selon le mode', () => {
    expect(clampSetpoint('heat', 9.4)).toBe(10);
    expect(clampSetpoint('cool', 15)).toBe(16);
    expect(clampSetpoint('auto', 20.6)).toBe(21);
    expect(clampSetpoint('heat', 40)).toBe(31);
  });

  it('ne donne une consigne qu’aux modes qui en ont une', () => {
    expect(['auto', 'cool', 'heat', 'dry', 'fan'].map((mode) => hasSetpoint(mode as never))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(currentSetpoint(DEFAULT_SETTINGS)).toBe(21);
    expect(currentSetpoint({ ...DEFAULT_SETTINGS, mode: 'fan' })).toBeNull();
  });

  it('réserve les options aux modes Froid et Chaud, clim allumée', () => {
    const cool = { ...DEFAULT_SETTINGS, mode: 'cool' as const };
    const dry = { ...DEFAULT_SETTINGS, mode: 'dry' as const };
    for (const can of [canPowerful, canISave, canEconoCool]) {
      expect([can(DEFAULT_SETTINGS), can(cool), can(dry), can({ ...cool, power: false })]).toEqual([
        true,
        true,
        false,
        false,
      ]);
    }
  });
});
