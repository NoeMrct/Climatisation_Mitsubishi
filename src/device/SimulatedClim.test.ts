import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../domain/clim';
import { SimulatedClim, modulation } from './SimulatedClim';

const MIN = 60_000;
const START = 1_000_000_000;

function run(device: SimulatedClim, from: number, minutes: number): number {
  let now = from;
  for (let step = 0; step < minutes; step += 1) {
    now += MIN;
    device.tick(now);
  }
  return now;
}

describe('clim simulée', () => {
  it('module sa puissance selon l’écart à la consigne', () => {
    expect(modulation(2)).toBe(1);
    expect(modulation(0)).toBe(0.5);
    expect(modulation(-1)).toBe(0);
  });

  it('chauffe la pièce jusqu’à la consigne, puis la tient', () => {
    const device = new SimulatedClim({ settings: DEFAULT_SETTINGS, roomTemp: 19, outdoorTemp: 4 }, START);
    expect(device.getState().activity).toBe('heating');
    const later = run(device, START, 60);
    expect(device.getState().roomTemp).toBeGreaterThan(21);
    run(device, later, 180);
    const { roomTemp, output } = device.getState();
    expect(roomTemp).toBeGreaterThan(21);
    expect(roomTemp).toBeLessThan(21.6);
    expect(output).toBeGreaterThan(0.2);
    expect(output).toBeLessThan(0.5);
  });

  it('laisse la pièce se refroidir quand elle est éteinte', () => {
    const device = new SimulatedClim(
      { settings: { ...DEFAULT_SETTINGS, power: false }, roomTemp: 19.5, outdoorTemp: 4 },
      START,
    );
    run(device, START, 60);

    expect(device.getState().roomTemp).toBeCloseTo(19.5 - 1.05, 1);
    expect(device.getState().activity).toBe('off');
  });

  it('fait patienter le compresseur trois minutes après un arrêt', async () => {
    const device = new SimulatedClim({ settings: DEFAULT_SETTINGS, roomTemp: 19, outdoorTemp: 4 }, START);
    let now = run(device, START, 5);
    await device.send({ type: 'power', on: false });
    await device.send({ type: 'power', on: true });
    expect(device.getState().activity).toBe('standby');
    now = run(device, now, 2);
    expect(device.getState().activity).toBe('standby');
    run(device, now, 2);
    expect(device.getState().activity).toBe('heating');
  });

  it('rafraîchit en mode Froid et choisit seul en mode Auto', async () => {
    const device = new SimulatedClim(
      { settings: { ...DEFAULT_SETTINGS, mode: 'cool' }, roomTemp: 27, outdoorTemp: 32 },
      START,
    );
    run(device, START, 30);
    expect(device.getState().roomTemp).toBeLessThan(26);
    await device.send({ type: 'mode', mode: 'auto' });
    expect(device.getState()).toMatchObject({ autoPhase: 'cool', activity: 'cooling' });
  });

  it('prévient ses abonnés à chaque changement', async () => {
    const device = new SimulatedClim({ settings: DEFAULT_SETTINGS, roomTemp: 19, outdoorTemp: 4 }, START);
    let calls = 0;
    const unsubscribe = device.subscribe(() => {
      calls += 1;
    });
    await device.send({ type: 'fan', fan: 3 });
    expect(calls).toBe(1);
    expect(device.getState().settings.fan).toBe(3);
    unsubscribe();
    await device.send({ type: 'fan', fan: 1 });
    expect(calls).toBe(1);
  });

  it('tourne à plein régime en Powerful, puis revient au réglage normal une fois la consigne atteinte', () => {
    const device = new SimulatedClim({ settings: DEFAULT_SETTINGS, roomTemp: 20.9, outdoorTemp: 4 }, START);
    expect(device.getState().output).toBeLessThan(1);

    void device.send({ type: 'powerful', on: true });
    expect(device.getState().output).toBe(1);

    run(device, START, 10);
    expect(device.getState().roomTemp).toBeGreaterThanOrEqual(21);
    expect(device.getState().settings.powerfulUntil).toBeNull();
    expect(device.getState().settings.setpoints.heat).toBe(21);
  });

  it('vise 2° de moins en chauffage avec Econo Cool, sans toucher à la consigne affichée', () => {
    const device = new SimulatedClim({ settings: DEFAULT_SETTINGS, roomTemp: 20.5, outdoorTemp: 4 }, START);
    expect(device.getState().activity).toBe('heating');

    void device.send({ type: 'econoCool', on: true });
    expect(device.getState()).toMatchObject({ activity: 'idle', output: 0 });
    expect(device.getState().settings.setpoints.heat).toBe(21);
  });
});
