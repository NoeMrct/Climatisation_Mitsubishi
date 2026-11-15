import { describe, expect, it } from 'vitest';
import { POWERFUL_MAX_MS } from './capabilities';
import { DEFAULT_SETTINGS, applyCommand, isPowerful, settleOptions } from './clim';
import type { ClimSettings } from './types';

const NOW = 1_000_000;
const cool: ClimSettings = { ...DEFAULT_SETTINGS, mode: 'cool' };

describe('applyCommand', () => {
  it('borne la consigne aux limites du mode', () => {
    expect(applyCommand(DEFAULT_SETTINGS, { type: 'setpoint', value: 5 }, NOW).setpoints.heat).toBe(10);
    expect(applyCommand(cool, { type: 'setpoint', value: 12 }, NOW).setpoints.cool).toBe(16);
    expect(applyCommand(cool, { type: 'setpoint', value: 40 }, NOW).setpoints.cool).toBe(31);
  });

  it('ignore la consigne en déshumidification et en ventilation', () => {
    const dry: ClimSettings = { ...DEFAULT_SETTINGS, mode: 'dry' };
    expect(applyCommand(dry, { type: 'setpoint', value: 25 }, NOW)).toBe(dry);
  });

  it('retient une consigne par mode', () => {
    let s = applyCommand(DEFAULT_SETTINGS, { type: 'setpoint', value: 23 }, NOW);
    s = applyCommand(s, { type: 'mode', mode: 'cool' }, NOW);
    s = applyCommand(s, { type: 'setpoint', value: 26 }, NOW);
    s = applyCommand(s, { type: 'mode', mode: 'heat' }, NOW);
    expect(s.setpoints).toMatchObject({ heat: 23, cool: 26 });
  });

  it('lance Powerful jusqu’à la consigne, une heure au plus', () => {
    const s = applyCommand(DEFAULT_SETTINGS, { type: 'powerful', on: true }, NOW);
    expect(isPowerful(s, NOW + 60_000)).toBe(true);
    expect(settleOptions(s, 19, NOW + 60_000)).toBe(s);
    expect(settleOptions(s, 21, NOW + 60_000).powerfulUntil).toBeNull();
    expect(settleOptions(s, 19, NOW + POWERFUL_MAX_MS).powerfulUntil).toBeNull();
  });

  it('arrête Powerful en froid quand la pièce est descendue à la consigne', () => {
    const s = applyCommand(cool, { type: 'powerful', on: true }, NOW);
    expect(settleOptions(s, 26, NOW + 1).powerfulUntil).not.toBeNull();
    expect(settleOptions(s, 24, NOW + 1).powerfulUntil).toBeNull();
  });

  it('annule Powerful quand on touche à la ventilation ou qu’on éteint', () => {
    const s = applyCommand(DEFAULT_SETTINGS, { type: 'powerful', on: true }, NOW);
    expect(applyCommand(s, { type: 'fan', fan: 2 }, NOW).powerfulUntil).toBeNull();
    expect(applyCommand(s, { type: 'power', on: false }, NOW).powerfulUntil).toBeNull();
    expect(settleOptions({ ...s, power: false }, 15, NOW + 1).powerfulUntil).toBeNull();
  });

  it('refuse Powerful hors des modes Froid et Chaud', () => {
    const fan: ClimSettings = { ...DEFAULT_SETTINGS, mode: 'fan' };
    expect(applyCommand(fan, { type: 'powerful', on: true }, NOW).powerfulUntil).toBeNull();
  });

  it('rend Powerful incompatible avec Econo Cool et le mode nuit', () => {
    let calm = applyCommand(DEFAULT_SETTINGS, { type: 'econoCool', on: true }, NOW);
    calm = applyCommand(calm, { type: 'nightMode', on: true }, NOW);
    expect(calm).toMatchObject({ econoCool: true, nightMode: true });

    const boosted = applyCommand(calm, { type: 'powerful', on: true }, NOW);
    expect(boosted).toMatchObject({ econoCool: false, nightMode: false });
    expect(isPowerful(boosted, NOW)).toBe(true);
    expect(applyCommand(boosted, { type: 'econoCool', on: true }, NOW).powerfulUntil).toBeNull();
    expect(applyCommand(boosted, { type: 'nightMode', on: true }, NOW).powerfulUntil).toBeNull();
  });

  it('propose Econo Cool en Chaud comme en Froid, clim allumée', () => {
    expect(applyCommand(DEFAULT_SETTINGS, { type: 'econoCool', on: true }, NOW).econoCool).toBe(true);
    expect(applyCommand(cool, { type: 'econoCool', on: true }, NOW).econoCool).toBe(true);
    const off: ClimSettings = { ...DEFAULT_SETTINGS, power: false };
    expect(applyCommand(off, { type: 'econoCool', on: true }, NOW).econoCool).toBe(false);
    const fan: ClimSettings = { ...DEFAULT_SETTINGS, mode: 'fan' };
    expect(applyCommand(fan, { type: 'econoCool', on: true }, NOW).econoCool).toBe(false);
  });

  it('garde Econo Cool entre Chaud et Froid, pas dans les autres modes', () => {
    const s = applyCommand(DEFAULT_SETTINGS, { type: 'econoCool', on: true }, NOW);
    expect(applyCommand(s, { type: 'mode', mode: 'cool' }, NOW).econoCool).toBe(true);
    expect(applyCommand(s, { type: 'mode', mode: 'dry' }, NOW).econoCool).toBe(false);
  });

  it('coupe Econo Cool et le mode nuit quand on règle la ventilation à la main', () => {
    let s = applyCommand(DEFAULT_SETTINGS, { type: 'econoCool', on: true }, NOW);
    s = applyCommand(s, { type: 'nightMode', on: true }, NOW);
    expect(applyCommand(s, { type: 'fan', fan: 3 }, NOW)).toMatchObject({ fan: 3, econoCool: false, nightMode: false });
    expect(applyCommand(s, { type: 'nightMode', on: false }, NOW)).toMatchObject({ econoCool: true, nightMode: false });
  });

  it('mémorise la dernière position fixe des volets', () => {
    let s = applyCommand(DEFAULT_SETTINGS, { type: 'vanes', v: 1, h: 4 }, NOW);
    s = applyCommand(s, { type: 'vanes', v: 'swing', h: 'split' }, NOW);
    expect(s).toMatchObject({ vaneV: 'swing', vaneH: 'split', lastRow: 1, lastCol: 4 });
  });

  it('i-save rappelle le réglage favori puis rend le réglage précédent', () => {
    let s = applyCommand(DEFAULT_SETTINGS, { type: 'isave', on: true }, NOW);
    s = applyCommand(s, { type: 'setpoint', value: 18 }, NOW);
    s = applyCommand(s, { type: 'fan', fan: 'quiet' }, NOW);
    s = applyCommand(s, { type: 'isave', on: false }, NOW);
    expect(s).toMatchObject({ isave: false, fan: 'auto' });
    expect(s.setpoints.heat).toBe(21);

    s = applyCommand(s, { type: 'isave', on: true }, NOW);
    expect(s).toMatchObject({ isave: true, fan: 'quiet' });
    expect(s.setpoints.heat).toBe(18);
  });
});
