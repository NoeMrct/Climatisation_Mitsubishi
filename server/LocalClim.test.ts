import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from '../src/store/storage';
import { LocalClim, type LocalClimOptions } from './LocalClim';
import { startFakeUnit, type FakeUnit } from './test/fakeUnit';

const FAST: LocalClimOptions = { pollMs: 0, settleMs: 0, flushMs: 5 };
const HEATING_AT_21 = { power: 1, mode: 1, coarseTemp: 31 - 21, fineTemp: 0x80 + 42, roomTemp: 18 };

let unit: FakeUnit;

beforeEach(async () => {
  unit = await startFakeUnit();
});

afterEach(async () => {
  await unit.close();
});

async function connect(options: LocalClimOptions = FAST): Promise<LocalClim> {
  const clim = new LocalClim(unit.address, options);
  clim.tick();
  await vi.waitFor(() => expect(clim.getState().online).toBe(true));
  return clim;
}

async function refresh(clim: LocalClim): Promise<void> {
  const polls = unit.polls;
  clim.tick();
  await vi.waitFor(() => expect(unit.polls).toBeGreaterThan(polls));
}

async function sent(count: number): Promise<void> {
  await vi.waitFor(() => expect(unit.commands).toHaveLength(count));
}

const unitTarget = (): { temp: number; fan: number } => ({
  temp: 31 - unit.registers.coarseTemp,
  fan: unit.registers.fan,
});

describe('liaison locale avec la clim', () => {
  it('reste hors ligne tant que l’unité n’a pas répondu', () => {
    expect(new LocalClim(unit.address, FAST).getState()).toMatchObject({ online: false, activity: 'off' });
  });

  it('relève les réglages et la température de l’unité', async () => {
    const clim = await connect();
    const state = clim.getState();
    expect(state.settings).toMatchObject({ power: false, mode: 'auto', fan: 'auto', vaneV: 'auto', vaneH: 1 });
    expect(state.settings.setpoints.auto).toBe(19);
    expect(state).toMatchObject({ roomTemp: 16, outdoorTemp: null, activity: 'off', output: 0 });
  });

  it('prend la température extérieure de la météo quand l’unité n’en donne pas', async () => {
    const clim = await connect();
    clim.setOutdoorTemp(7.5);
    expect(clim.getState().outdoorTemp).toBe(7.5);
  });

  it('applique l’ordre tout de suite et regroupe les réglages rapprochés en une seule trame', async () => {
    const clim = await connect();
    void clim.send({ type: 'power', on: true });
    void clim.send({ type: 'mode', mode: 'heat' });
    void clim.send({ type: 'setpoint', value: 22 });
    expect(clim.getState().settings).toMatchObject({ power: true, mode: 'heat' });

    await sent(1);
    expect(unit.commands[0].slice(12, 16)).toBe('0702');
    expect(unit.registers).toMatchObject({ power: 1, mode: 1, coarseTemp: 31 - 22, fineTemp: 0x80 + 44 });
  });

  it('transmet la ventilation et les volets', async () => {
    const clim = await connect();
    void clim.send({ type: 'fan', fan: 3 });
    void clim.send({ type: 'vanes', v: 'swing', h: 'split' });
    await sent(1);
    expect(unit.registers).toMatchObject({ fan: 5, vaneV: 7, vaneH: 8 });
  });

  it('n’envoie rien quand un ordre ne change pas le réglage de l’unité', async () => {
    const clim = await connect();
    await clim.send({ type: 'power', on: false });
    await clim.send({ type: 'isave', on: true });
    await refresh(clim);
    expect(unit.commands).toHaveLength(0);
  });

  it('adopte un réglage fait à la télécommande', async () => {
    const clim = await connect();
    Object.assign(unit.registers, { power: 1, mode: 3, coarseTemp: 31 - 24, fineTemp: 0x80 + 48, operating: 1 });
    await refresh(clim);
    await vi.waitFor(() => expect(clim.getState().settings.mode).toBe('cool'));
    expect(clim.getState().settings.setpoints.cool).toBe(24);
    expect(clim.getState()).toMatchObject({ activity: 'cooling', output: 1 });
    expect(unit.commands).toHaveLength(0);
  });

  it('distingue le repos de la marche quand le compresseur s’arrête', async () => {
    const clim = await connect();
    Object.assign(unit.registers, { power: 1, mode: 1, operating: 0 });
    await refresh(clim);
    await vi.waitFor(() => expect(clim.getState().activity).toBe('idle'));
    expect(clim.getState().output).toBe(0);
  });

  it('garde le réglage demandé le temps que l’unité le prenne en compte', async () => {
    const clim = await connect({ ...FAST, settleMs: 400 });
    unit.frozen = true;
    void clim.send({ type: 'power', on: true });
    await sent(1);
    await refresh(clim);
    expect(clim.getState().settings.power).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 450));
    await refresh(clim);
    await vi.waitFor(() => expect(clim.getState().settings.power).toBe(false));
  });

  it('passe hors ligne après trois échecs, puis revient dès que l’unité répond', async () => {
    const clim = await connect();
    unit.silent = true;
    clim.tick();
    clim.tick();
    expect(clim.getState().online).toBe(true);
    clim.tick();
    await vi.waitFor(() => expect(clim.getState().online).toBe(false));

    unit.silent = false;
    clim.tick();
    await vi.waitFor(() => expect(clim.getState().online).toBe(true));
  });

  it('prévient les abonnés à chaque changement, jusqu’au désabonnement', async () => {
    const clim = await connect();
    const listener = vi.fn();
    const unsubscribe = clim.subscribe(listener);
    await clim.send({ type: 'power', on: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(clim.getState());

    unsubscribe();
    await clim.send({ type: 'power', on: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('n’envoie rien quand deux ordres rapprochés s’annulent', async () => {
    const clim = await connect();
    void clim.send({ type: 'power', on: true });
    void clim.send({ type: 'power', on: false });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await refresh(clim);
    expect(unit.commands).toHaveLength(0);
  });
});

describe('mode Auto', () => {
  it('passe en Auto avec le code attendu par l’unité, et y reste après relecture', async () => {
    Object.assign(unit.registers, HEATING_AT_21);
    const clim = await connect();
    expect(clim.getState().settings.mode).toBe('heat');

    void clim.send({ type: 'mode', mode: 'auto' });
    await sent(1);
    expect(unit.commands[0].slice(18, 20)).toBe('08');
    expect(unit.registers.mode).toBe(0);

    await refresh(clim);
    expect(clim.getState().settings.mode).toBe('auto');
  });

  it('affiche le sens choisi par l’unité', async () => {
    const clim = await connect();
    Object.assign(unit.registers, { power: 1, mode: 0, operating: 1, autoMode: 3, roomTemp: 17 });
    await refresh(clim);
    await vi.waitFor(() => expect(clim.getState().autoPhase).toBe('cool'));
    expect(clim.getState().activity).toBe('cooling');
  });
});

describe('options pilotées par l’appli', () => {
  beforeEach(() => {
    Object.assign(unit.registers, HEATING_AT_21);
  });

  it('Powerful pousse la consigne et la ventilation au maximum, puis rétablit le réglage à la température voulue', async () => {
    const clim = await connect();
    void clim.send({ type: 'powerful', on: true });
    await sent(1);
    expect(unitTarget()).toEqual({ temp: 31, fan: 6 });
    expect(clim.getState().settings.setpoints.heat).toBe(21);
    expect(clim.getState().settings.fan).toBe('auto');

    await refresh(clim);
    expect(clim.getState().settings.powerfulUntil).not.toBeNull();

    unit.registers.roomTemp = 21;
    await refresh(clim);
    await vi.waitFor(() => expect(clim.getState().roomTemp).toBe(21));
    clim.tick();
    await sent(2);
    expect(unitTarget()).toEqual({ temp: 21, fan: 0 });
    expect(clim.getState().settings.powerfulUntil).toBeNull();
  });

  it('Econo Cool et le mode nuit abaissent la consigne envoyée et passent en ventilation silencieuse', async () => {
    const clim = await connect();
    void clim.send({ type: 'econoCool', on: true });
    await sent(1);
    expect(unitTarget()).toEqual({ temp: 19, fan: 1 });

    void clim.send({ type: 'nightMode', on: true });
    await sent(2);
    expect(unitTarget()).toEqual({ temp: 18, fan: 1 });
    expect(clim.getState().settings).toMatchObject({ econoCool: true, nightMode: true, fan: 'auto' });
    expect(clim.getState().settings.setpoints.heat).toBe(21);

    void clim.send({ type: 'econoCool', on: false });
    void clim.send({ type: 'nightMode', on: false });
    await sent(3);
    expect(unitTarget()).toEqual({ temp: 21, fan: 0 });
  });

  it('i-save rappelle le réglage favori, puis rend le réglage précédent', async () => {
    const clim = await connect();
    void clim.send({ type: 'isave', on: true });
    void clim.send({ type: 'setpoint', value: 18 });
    void clim.send({ type: 'fan', fan: 'quiet' });
    await sent(1);
    expect(unitTarget()).toEqual({ temp: 18, fan: 1 });

    void clim.send({ type: 'isave', on: false });
    await sent(2);
    expect(unitTarget()).toEqual({ temp: 21, fan: 0 });

    void clim.send({ type: 'isave', on: true });
    await sent(3);
    expect(unitTarget()).toEqual({ temp: 18, fan: 1 });
  });

  it('un réglage fait à la télécommande désactive les options, sans renvoyer d’ordre', async () => {
    const clim = await connect();
    void clim.send({ type: 'econoCool', on: true });
    await sent(1);

    Object.assign(unit.registers, { coarseTemp: 31 - 23, fineTemp: 0x80 + 46 });
    await refresh(clim);
    await vi.waitFor(() => expect(clim.getState().settings.econoCool).toBe(false));
    expect(clim.getState().settings.setpoints.heat).toBe(23);
    expect(clim.getState().settings.fan).toBe('quiet');
    await refresh(clim);
    expect(unit.commands).toHaveLength(1);
  });

  it('retrouve ses options après un redémarrage, sans rien renvoyer', async () => {
    const store = memoryStore();
    const first = await connect({ ...FAST, store });
    void first.send({ type: 'econoCool', on: true });
    await sent(1);

    const second = new LocalClim(unit.address, { ...FAST, store });
    expect(second.getState().settings).toMatchObject({ econoCool: true, mode: 'heat' });
    await refresh(second);
    await vi.waitFor(() => expect(second.getState().online).toBe(true));
    expect(second.getState().settings.econoCool).toBe(true);
    expect(second.getState().settings.setpoints.heat).toBe(21);
    expect(unit.commands).toHaveLength(1);
  });

  it('rétablit le réglage au redémarrage quand Powerful s’est terminé entre-temps', async () => {
    const store = memoryStore();
    const first = await connect({ ...FAST, store });
    void first.send({ type: 'powerful', on: true });
    await sent(1);
    expect(unitTarget()).toEqual({ temp: 31, fan: 6 });

    unit.registers.roomTemp = 22;
    const second = new LocalClim(unit.address, { ...FAST, store });
    await refresh(second);
    await vi.waitFor(() => expect(second.getState().roomTemp).toBe(22));
    second.tick();
    await sent(2);
    expect(unitTarget()).toEqual({ temp: 21, fan: 0 });
    expect(second.getState().settings.setpoints.heat).toBe(21);
  });

  it('ignore un état enregistré illisible', () => {
    const store = memoryStore();
    store.set('clim.local.v1', '{illisible');
    expect(new LocalClim(unit.address, { ...FAST, store }).getState().settings.power).toBe(false);
  });
});
