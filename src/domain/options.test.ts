import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './clim';
import { activeRegulation, comfortOffset, effectiveFan, effectiveSetpoint } from './options';
import { DEFAULT_REGULATION } from './regulation';
import type { ClimSettings } from './types';

const NOW = 1_000_000;
const heat = DEFAULT_SETTINGS;
const cool: ClimSettings = { ...DEFAULT_SETTINGS, mode: 'cool' };
const boosted = { powerfulUntil: NOW + 60_000 };

describe('réglage réellement envoyé à la clim', () => {
  it('garde la consigne et la ventilation choisies quand aucune option n’est active', () => {
    expect(effectiveSetpoint(heat, NOW)).toBe(21);
    expect(effectiveFan({ ...heat, fan: 2 }, NOW)).toBe(2);
  });

  it('Econo Cool retire 2° en chauffage et en ajoute 2 en froid, ventilation silencieuse', () => {
    expect(effectiveSetpoint({ ...heat, econoCool: true }, NOW)).toBe(19);
    expect(effectiveSetpoint({ ...cool, econoCool: true }, NOW)).toBe(26);
    expect(effectiveFan({ ...heat, fan: 3, econoCool: true }, NOW)).toBe('quiet');
  });

  it('le mode nuit décale la consigne d’1° et passe en ventilation silencieuse', () => {
    expect(effectiveSetpoint({ ...heat, nightMode: true }, NOW)).toBe(20);
    expect(effectiveSetpoint({ ...cool, nightMode: true }, NOW)).toBe(25);
    expect(effectiveFan({ ...cool, nightMode: true }, NOW)).toBe('quiet');
  });

  it('cumule Econo Cool et le mode nuit', () => {
    const both = { econoCool: true, nightMode: true };
    expect(effectiveSetpoint({ ...heat, ...both }, NOW)).toBe(18);
    expect(effectiveSetpoint({ ...cool, ...both }, NOW)).toBe(27);
    expect([comfortOffset({ ...heat, ...both }, 'heat'), comfortOffset({ ...heat, ...both }, 'cool')]).toEqual([-3, 3]);
  });

  it('Powerful vise la limite du mode avec la ventilation au maximum, tant qu’il est actif', () => {
    expect(effectiveSetpoint({ ...heat, ...boosted }, NOW)).toBe(31);
    expect(effectiveSetpoint({ ...cool, ...boosted }, NOW)).toBe(16);
    expect(effectiveFan({ ...heat, fan: 'quiet', ...boosted }, NOW)).toBe(4);
    expect(effectiveSetpoint({ ...heat, ...boosted }, NOW + 60_000)).toBe(21);
  });

  it('reste dans la plage du mode', () => {
    const coldest: ClimSettings = { ...heat, setpoints: { ...heat.setpoints, heat: 10 }, econoCool: true };
    const warmest: ClimSettings = { ...cool, setpoints: { ...cool.setpoints, cool: 31 }, econoCool: true };
    expect(effectiveSetpoint(coldest, NOW)).toBe(10);
    expect(effectiveSetpoint(warmest, NOW)).toBe(31);
  });

  it('ne décale pas la consigne en mode Auto et n’en invente pas sans consigne', () => {
    expect(effectiveSetpoint({ ...heat, mode: 'auto', nightMode: true }, NOW)).toBe(22);
    expect(effectiveSetpoint({ ...heat, mode: 'fan', nightMode: true }, NOW)).toBeNull();
    expect(effectiveFan({ ...heat, mode: 'fan', nightMode: true }, NOW)).toBe('quiet');
  });
});

describe('régulation décalée par les options', () => {
  it('ne change rien sans option active', () => {
    expect(activeRegulation(DEFAULT_REGULATION, heat)).toBe(DEFAULT_REGULATION);
  });

  it('décale les deux seuils de chaque mode du même écart que la consigne', () => {
    const shifted = activeRegulation(DEFAULT_REGULATION, { ...heat, econoCool: true });
    expect(shifted.heat).toEqual({ enabled: true, low: 17, high: 19 });
    expect(shifted.cool).toEqual({ enabled: false, low: 21, high: 25 });
    expect(shifted.enabled).toBe(DEFAULT_REGULATION.enabled);
  });
});
