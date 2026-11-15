import { describe, expect, it } from 'vitest';
import { SimClock } from '../device/clock';
import { SimulatedClim } from '../device/SimulatedClim';
import { DEFAULT_SETTINGS } from '../domain/clim';
import type { AppNotification } from '../domain/notify';
import { AppController } from './controller';
import { loadState, memoryStore } from './storage';

const MIN = 60_000;

const START = new Date(2026, 10, 15, 17, 0).getTime();

function setup(power = true, start = START) {
  let real = 0;
  const clock = new SimClock(start, () => real);
  clock.setSpeed(60);
  const device = new SimulatedClim({ settings: { ...DEFAULT_SETTINGS, power }, roomTemp: 19.5, outdoorTemp: 4 }, start);
  const sent: AppNotification[] = [];
  const store = memoryStore();
  const controller = new AppController({
    device,
    clock,
    store,
    simulator: { device, clock },
    runtime: power
      ? { session: { mode: 'heat', startedAt: start - 15 * MIN, startTemp: 18.9 }, pausedUntil: null, lastStop: null }
      : undefined,
    announce: (notification) => sent.push(notification),
  });

  const advance = (minutes: number, until?: () => boolean): void => {
    for (let step = 0; step < minutes; step += 1) {
      real += 1000;
      controller.tick();
      if (until?.()) return;
    }
  };
  return { controller, device, sent, store, advance };
}

describe('régulation de bout en bout', () => {
  it('coupe à 21°, prévient avant la relance, puis relance sous 19°', () => {
    const { controller, sent, advance } = setup();

    advance(120, () => sent.length === 1);
    expect(sent[0]).toMatchObject({ kind: 'stop', title: '21° atteints, clim coupée' });
    expect(sent[0].body).toMatch(/^Chauffage arrêté après \d+ min\. Prochaine relance estimée vers \d\d:\d\d\.$/);
    expect(controller.getSnapshot().clim.settings.power).toBe(false);
    expect(controller.getSnapshot().clim.roomTemp).toBeGreaterThanOrEqual(21);

    advance(200, () => sent.length === 2);
    expect(sent[1]).toMatchObject({ kind: 'forecast', silent: false, devices: ['phone', 'pc'] });
    expect(sent[1].title).toMatch(/^Chauffage prévu vers \d\d:\d\d$/);
    expect(sent[1].body).toMatch(/^La pièce passera sous 19° d’ici \d+ min\. Il fait 4° dehors\.$/);
    expect(controller.getSnapshot().prediction?.minutes).toBeLessThanOrEqual(30);

    advance(60, () => sent.length === 3);
    expect(sent[2]).toMatchObject({ kind: 'start', title: 'Chauffage lancé' });
    const snapshot = controller.getSnapshot();
    expect(snapshot.clim.settings).toMatchObject({ power: true, mode: 'heat' });
    expect(snapshot.clim.settings.setpoints.heat).toBe(21);
    expect(snapshot.session?.mode).toBe('heat');
    expect(snapshot.clim.roomTemp).toBeLessThan(19);
  });

  it('met la régulation en pause une heure après un arrêt à la main', () => {
    const { controller, device, advance } = setup();
    controller.command({ type: 'power', on: false });
    expect(controller.getSnapshot().pausedUntil).toBe(START + 60 * MIN);
    device.setRoomTemp(18);
    advance(55);
    expect(controller.getSnapshot().clim.settings.power).toBe(false);
    advance(10);
    expect(controller.getSnapshot().clim.settings.power).toBe(true);
  });

  it('rend la main quand on change la consigne pendant une marche automatique', () => {
    const { controller, advance } = setup();
    controller.command({ type: 'setpoint', value: 23 });
    expect(controller.getSnapshot().session).toBeNull();
    advance(240);

    expect(controller.getSnapshot().clim.settings.power).toBe(true);
    expect(controller.getSnapshot().clim.roomTemp).toBeGreaterThan(22.5);
  });

  it('« Démarrer maintenant » lance le cycle sans attendre le seuil', () => {
    const { controller, advance } = setup(false);
    advance(5);
    expect(controller.getSnapshot().prediction?.mode).toBe('heat');
    controller.startNow();
    const snapshot = controller.getSnapshot();
    expect(snapshot.clim.settings.power).toBe(true);
    expect(snapshot.session?.mode).toBe('heat');
    expect(snapshot.prediction).toBeNull();
  });

  it('« Reporter d’1 h » et « Pas ce soir » retardent la relance', () => {
    const { controller } = setup(false);
    controller.postpone(60 * MIN);
    expect(controller.getSnapshot().pausedUntil).toBe(START + 60 * MIN);
    controller.skipUntilMorning();
    expect(controller.getSnapshot().pausedUntil).toBe(new Date(2026, 10, 16, 6, 0).getTime());
    controller.resumeRegulation();
    expect(controller.getSnapshot().pausedUntil).toBeNull();
  });

  it('allumer à la main avec la régulation active lance un cycle qui se coupera à l’objectif', () => {
    const { controller } = setup(false);
    controller.command({ type: 'power', on: true });
    expect(controller.getSnapshot().session?.mode).toBe('heat');
    controller.setRegulation({ ...controller.getSnapshot().regulation, enabled: false });
    expect(controller.getSnapshot().session).toBeNull();
  });

  it('joue le programme et désarme la minuterie simple', () => {
    const { controller, advance } = setup();
    const { schedule } = controller.getSnapshot();
    controller.setSchedule({ ...schedule, timerOff: { enabled: true, minute: 17 * 60 + 10 } });
    advance(12);
    const snapshot = controller.getSnapshot();
    expect(snapshot.clim.settings.power).toBe(false);
    expect(snapshot.schedule.timerOff.enabled).toBe(false);
  });

  it('n’adresse les notifications qu’aux appareils retenus et enregistre les réglages', () => {
    const { controller, sent, store, advance } = setup();
    controller.setNotificationPrefs({ pc: false, lead: 60 });
    advance(120, () => sent.length === 1);
    expect(sent[0]).toMatchObject({ kind: 'stop', devices: ['phone'] });
    expect(loadState(store)?.notifications).toMatchObject({ pc: false, lead: 60 });
    expect(loadState(store)?.simulator?.settings.power).toBe(false);
  });

  it('n’annonce rien quand aucun appareil n’est retenu', () => {
    const { controller, sent, advance } = setup();
    controller.setNotificationPrefs({ phone: false, pc: false });
    advance(120);
    expect(controller.getSnapshot().clim.settings.power).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('rend les notifications muettes pendant la plage de nuit', () => {
    const night = new Date(2026, 10, 15, 23, 0).getTime();
    const { controller, sent, advance } = setup(true, night);
    advance(120, () => sent.length === 1);
    expect(sent[0]).toMatchObject({ kind: 'stop', silent: true });

    controller.setNotificationPrefs({ quiet: false });
    advance(300, () => sent.length === 2);
    expect(sent[1]).toMatchObject({ kind: 'forecast', silent: false });
  });

  it('ne répète pas la prévision quand la température oscille autour du seuil', () => {
    const { device, sent, advance } = setup();
    advance(120, () => sent.length === 1);
    advance(200, () => sent.length === 2);
    expect(sent[1].kind).toBe('forecast');

    for (let swing = 0; swing < 5; swing += 1) {
      device.setRoomTemp(20.5);
      advance(1);
      device.setRoomTemp(19.3);
      advance(1);
    }
    expect(sent).toHaveLength(2);

    device.setRoomTemp(18.9);
    advance(5, () => sent.length === 3);
    expect(sent[2].kind).toBe('start');
    advance(300, () => sent.length === 5);
    expect(sent.slice(3).map((notification) => notification.kind)).toEqual(['stop', 'forecast']);
  });

  it('garde les relevés récents pour tracer la prévision', () => {
    const { controller, advance } = setup(false);
    advance(90);
    const { history, now } = controller.getSnapshot();
    expect(history.length).toBeGreaterThanOrEqual(44);
    expect(history.length).toBeLessThanOrEqual(46);
    expect(history.every((sample) => sample.at >= now - 45 * MIN && sample.at <= now)).toBe(true);
  });

  it('coupe 2° plus bas quand Econo Cool est actif', () => {
    const { controller, sent, advance } = setup();
    controller.command({ type: 'econoCool', on: true });
    advance(1);
    expect(controller.getSnapshot().clim.settings.power).toBe(false);
    expect(controller.getSnapshot().session).toBeNull();
    expect(sent[sent.length - 1]).toMatchObject({ kind: 'stop' });
    expect(sent[sent.length - 1].title).toContain('19°');
  });
});
