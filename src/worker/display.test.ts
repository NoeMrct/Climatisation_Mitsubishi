import { describe, expect, it } from 'vitest';
import type { PushMessage } from '../domain/push';
import { REMOTE_ACTIONS } from '../store/api';
import { callOf, displayOf, failureDisplay, linkOf, unreadableMessage } from './display';

const SCOPE = 'https://clim.exemple.fr/';
const AT = new Date(2026, 10, 15, 17, 15).getTime();

const START: PushMessage = {
  kind: 'start',
  title: 'Chauffage lancé',
  body: '18,9° dans le salon, objectif 21°.',
  at: AT,
  silent: false,
};

describe('affichage d’une notification push', () => {
  it('reprend le titre, le texte et l’heure de l’événement', () => {
    expect(displayOf(START, SCOPE)).toEqual({
      title: 'Chauffage lancé',
      options: {
        body: '18,9° dans le salon, objectif 21°.',
        tag: 'clim-start',
        icon: 'https://clim.exemple.fr/pwa-192.png',
        lang: 'fr',
        silent: false,
        timestamp: AT,
        data: 'start',
        actions: [],
      },
    });
  });

  it('propose de démarrer ou de reporter face à une prévision', () => {
    const { options } = displayOf({ ...START, kind: 'forecast', title: 'Chauffage prévu vers 17:40' }, SCOPE);
    expect(options.tag).toBe('clim-forecast');
    expect(options.actions).toEqual([
      { action: 'start', title: 'Démarrer maintenant' },
      { action: 'postpone', title: 'Reporter d’1 h' },
    ]);
  });

  it('reste muette pendant la plage de nuit', () => {
    expect(displayOf({ ...START, silent: true }, SCOPE).options.silent).toBe(true);
  });

  it('remplace un message illisible par une notification générique', () => {
    const display = displayOf(unreadableMessage(AT), SCOPE);
    expect(display.title).toBe('Clim · Salon');
    expect(display.options).toMatchObject({ body: 'Nouvelle notification de la clim.', timestamp: AT, actions: [] });
  });

  it('prévient quand une action n’a pas pu être transmise', () => {
    const display = failureDisplay(SCOPE, AT);
    expect(display.title).toBe('Clim injoignable');
    expect(display.options).toMatchObject({
      tag: 'clim-injoignable',
      icon: 'https://clim.exemple.fr/pwa-192.png',
      timestamp: AT,
      actions: [],
    });
    expect(linkOf(display.options.data)).toBe('#/');
  });
});

describe('clic sur une notification', () => {
  it('traduit chaque bouton en action que le serveur autorise', () => {
    expect(callOf('start')).toEqual({ name: 'startNow', args: [] });
    expect(callOf('postpone')).toEqual({ name: 'postpone', args: [3_600_000] });
    for (const { action } of displayOf({ ...START, kind: 'forecast' }, SCOPE).options.actions) {
      expect(REMOTE_ACTIONS).toContain(callOf(action)?.name);
    }
  });

  it('n’envoie rien pour un clic sur le texte ou un bouton inconnu', () => {
    expect(callOf('')).toBeNull();
    expect(callOf('constructor')).toBeNull();
  });

  it('ouvre la prévision pour une prévision, l’accueil pour le reste', () => {
    expect(linkOf('forecast')).toBe('#/auto/prevision');
    expect([linkOf('start'), linkOf('stop'), linkOf('ready'), linkOf(null), linkOf(undefined)]).toEqual([
      '#/',
      '#/',
      '#/',
      '#/',
      '#/',
    ]);
  });
});
