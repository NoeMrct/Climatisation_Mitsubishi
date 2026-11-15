import { describe, expect, it } from 'vitest';
import { formatAgo, formatDuration, formatTemp, parseMinute } from './format';
import { DEFAULT_NOTIFICATION_PREFS, forecastText, isQuietTime, leadText, startText, stopText } from './notify';
import type { Prediction } from './forecast';

const at = (hour: number, minute = 0): number => new Date(2026, 10, 15, hour, minute).getTime();

describe('formats', () => {
  it('écrit les températures et les durées à la française', () => {
    expect(formatTemp(19.5)).toBe('19,5');
    expect(formatTemp(21)).toBe('21');
    expect(formatTemp(-0.04)).toBe('0');
    expect(formatDuration(48 * 60_000)).toBe('48 min');
    expect(formatDuration(95 * 60_000)).toBe('1 h 35');
    expect(formatDuration(125 * 60_000)).toBe('2 h 05');
    expect(formatAgo(20_000)).toBe('maintenant');
    expect(formatAgo(73 * 60_000)).toBe('il y a 1 h 13');
  });

  it('lit une heure saisie', () => {
    expect(parseMinute('06:30')).toBe(390);
    expect(parseMinute('24:00')).toBeNull();
  });
});

describe('textes des notifications', () => {
  const prediction: Prediction = {
    mode: 'heat',
    threshold: 19,
    target: 21,
    crossAt: at(17, 40),
    reachAt: at(18, 28),
    minutes: 24.9,
    rate: 1.1,
  };

  it('annonce un chauffage prévu', () => {
    const text = forecastText(prediction, 4);
    expect(text.title).toBe('Chauffage prévu vers 17:40');
    expect(text.body).toBe('La pièce passera sous 19° d’ici 25 min. Il fait 4° dehors.');
    expect(text.detail).toBe(
      'La pièce passera sous 19° dans 25 min environ. Il fait 4° dehors et elle perd 1,1° par heure.',
    );
  });

  it('annonce une clim prévue', () => {
    const text = forecastText(
      { ...prediction, mode: 'cool', threshold: 23, target: 19, crossAt: at(14, 20), minutes: 31 },
      31,
    );
    expect(text.title).toBe('Clim prévue vers 14:20');
    expect(text.body).toBe('La pièce atteindra 23° d’ici 30 min. Il fait 31° dehors.');
  });

  it('annonce le lancement et l’arrêt', () => {
    expect(startText('heat', 18.9, 21, 4)).toMatchObject({
      title: 'Chauffage lancé',
      body: '18,9° dans le salon, objectif 21°. Il fait 4° dehors.',
    });
    expect(stopText('heat', 21, 48 * 60_000, 4, at(21, 30))).toMatchObject({
      title: '21° atteints, clim coupée',
      body: 'Chauffage arrêté après 48 min. Prochaine relance estimée vers 21:30.',
    });
    expect(stopText('cool', 19, 95 * 60_000, 31, null).body).toBe(
      'Rafraîchissement arrêté après 1 h 35. Il fait 31° dehors.',
    );
  });

  it('arrondit le délai et respecte la plage de nuit', () => {
    expect(leadText(62)).toBe('1 h');
    expect(leadText(1)).toBe('5 min');
    expect(isQuietTime(DEFAULT_NOTIFICATION_PREFS, at(23))).toBe(true);
    expect(isQuietTime(DEFAULT_NOTIFICATION_PREFS, at(6, 59))).toBe(true);
    expect(isQuietTime(DEFAULT_NOTIFICATION_PREFS, at(12))).toBe(false);
    expect(isQuietTime({ ...DEFAULT_NOTIFICATION_PREFS, quiet: false }, at(23))).toBe(false);
  });
});
