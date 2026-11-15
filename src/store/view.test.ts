import { describe, expect, it } from 'vitest';
import { makeController, makeSnapshot } from '../test/fixtures';
import { ACCENTS, climLook, fanLabel, modeInfo, programText, regulationLine, statusText } from './view';

describe('aspect de la clim', () => {
  it('associe chaque mode à sa couleur et à son libellé', () => {
    expect(climLook(makeSnapshot({ mode: 'heat' }).clim)).toMatchObject({
      look: 'heat',
      accent: ACCENTS.heat,
      label: 'Chauffage',
    });
    expect(climLook(makeSnapshot({ mode: 'cool' }).clim)).toMatchObject({
      look: 'cool',
      accent: ACCENTS.cool,
      label: 'Rafraîchissement',
    });
    expect(climLook(makeSnapshot({ mode: 'dry' }).clim).label).toBe('Déshumidification');
    expect(climLook(makeSnapshot({ mode: 'fan' }).clim).accent).toBe(ACCENTS.neutral);
  });

  it('devine le sens du mode Auto à partir des températures', () => {
    expect(climLook(makeSnapshot({ mode: 'auto' }).clim)).toMatchObject({ look: 'heat', label: 'Auto · chauffage' });
    const warm = makeController({ mode: 'auto', power: false });
    warm.device.setRoomTemp(26);
    expect(climLook(warm.device.getState())).toMatchObject({ look: 'cool', label: 'Auto · rafraîchissement' });
  });

  it('décrit une unité éteinte aux lecteurs d’écran', () => {
    expect(climLook(makeSnapshot({ power: false }).clim).unitLabel).toBe('Unité intérieure à l’arrêt, volet fermé');
  });

  it('nomme la ventilation et les modes', () => {
    expect([fanLabel('auto'), fanLabel('quiet'), fanLabel(3)]).toEqual(['Auto', 'Silencieux', 'Vitesse 3']);
    expect(modeInfo('dry')).toMatchObject({ name: 'Déshumidification', short: 'Déshumid.' });
  });
});

describe('lignes d’état', () => {
  it('signale une commande manuelle quand la régulation ne pilote pas la marche', () => {
    expect(statusText(makeSnapshot())).toBe('Simulateur · commande manuelle');
  });

  it('annonce la prévision, puis la pause après un arrêt à la main', () => {
    const { controller, advance } = makeController({ power: false });
    advance(2);
    expect(statusText(controller.getSnapshot())).toMatch(/^Simulateur · chauffe vers \d\d:\d\d$/);
    expect(regulationLine(controller.getSnapshot())).toMatch(/^Chauffage prévu vers \d\d:\d\d$/);
    controller.postpone(60 * 60_000);
    expect(statusText(controller.getSnapshot())).toBe('Simulateur · pause jusqu’à 18:02');
    expect(regulationLine(controller.getSnapshot())).toBe('En pause jusqu’à 18:02');
  });

  it('affiche l’objectif d’une marche automatique', () => {
    const { controller } = makeController({ power: false });
    controller.command({ type: 'power', on: true });
    expect(statusText(controller.getSnapshot())).toBe('Simulateur · objectif 21°');
    expect(regulationLine(controller.getSnapshot())).toBe('En cours : objectif 21°');
  });

  it('résume le réglage quand rien n’est en cours', () => {
    const { controller } = makeController();
    const { regulation } = controller.getSnapshot();
    expect(regulationLine(controller.getSnapshot())).toBe('Chauffe sous 19°, coupe à 21°');
    controller.setRegulation({ ...regulation, enabled: false });
    expect(regulationLine(controller.getSnapshot())).toBe('Désactivée');
    expect(statusText(controller.getSnapshot())).toBe('Simulateur');
  });

  it('décale l’objectif et les seuils affichés quand Econo Cool ou le mode nuit sont actifs', () => {
    const { controller } = makeController();
    controller.command({ type: 'econoCool', on: true });
    expect(regulationLine(controller.getSnapshot())).toBe('Chauffe sous 17°, coupe à 19°');

    const started = makeController({ power: false });
    started.controller.command({ type: 'power', on: true });
    started.controller.command({ type: 'nightMode', on: true });
    expect(statusText(started.controller.getSnapshot())).toBe('Simulateur · objectif 20°');
    expect(regulationLine(started.controller.getSnapshot())).toBe('En cours : objectif 20°');
  });

  it('annonce le prochain événement du programme', () => {
    const { controller } = makeController();
    expect(programText(controller.getSnapshot())).toBe('Aucun programme actif');
    controller.setSchedule({ ...controller.getSnapshot().schedule, weeklyEnabled: true });
    expect(programText(controller.getSnapshot())).toBe('Marche programmée à 17:30');
  });
});
