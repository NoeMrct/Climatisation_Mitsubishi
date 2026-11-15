import { describe, expect, it } from 'vitest';
import { DEFAULT_THERMAL, driftTemp, fitLoss, hoursToReach, learnRate, predict, type Sample } from './forecast';
import { DEFAULT_REGULATION } from './regulation';

const MIN = 60_000;

describe('prévision', () => {
  it('calcule le temps avant de franchir un seuil', () => {
    const hours = hoursToReach(19.45, 19, 4, 0.0712);
    expect(hours).not.toBeNull();
    expect((hours ?? 0) * 60).toBeCloseTo(24.9, 0);
  });

  it('ne prévoit rien si la pièce s’éloigne du seuil ou l’a déjà franchi', () => {
    expect(hoursToReach(19.45, 19, 25, 0.07)).toBeNull();
    expect(hoursToReach(18.5, 19, 4, 0.07)).toBeNull();
  });

  it('retrouve la perte de la pièce à partir de relevés', () => {
    const samples: Sample[] = [];
    for (let minute = 0; minute <= 30; minute += 1) {
      samples.push({ at: minute * MIN, temp: driftTemp(21, 4, 0.085, minute / 60) });
    }
    expect(fitLoss(samples, 4)).toBeCloseTo(0.085, 4);
    expect(fitLoss(samples.slice(0, 4), 4)).toBeNull();
  });

  it('annonce le prochain chauffage et l’heure où l’objectif sera atteint', () => {
    const now = 1_000_000_000;
    const prediction = predict({
      regulation: DEFAULT_REGULATION,
      roomTemp: 19.45,
      outdoor: 4,
      model: DEFAULT_THERMAL,
      now,
    });
    expect(prediction).toMatchObject({ mode: 'heat', threshold: 19, target: 21 });
    expect(prediction?.minutes).toBeGreaterThan(20);
    expect(prediction?.minutes).toBeLessThan(30);
    expect(prediction?.rate).toBeCloseTo(1.08, 1);
    expect((prediction?.reachAt ?? 0) - (prediction?.crossAt ?? 0)).toBe((2 / DEFAULT_THERMAL.heatRate) * 3_600_000);
  });

  it('annonce le froid quand il fait chaud dehors', () => {
    const regulation = {
      ...DEFAULT_REGULATION,
      heat: { ...DEFAULT_REGULATION.heat, enabled: false },
      cool: { enabled: true, low: 19, high: 23 },
    };
    const prediction = predict({ regulation, roomTemp: 22.6, outdoor: 31, model: DEFAULT_THERMAL, now: 0 });
    expect(prediction).toMatchObject({ mode: 'cool', threshold: 23, target: 19 });
    expect(predict({ regulation, roomTemp: 22.6, outdoor: 20, model: DEFAULT_THERMAL, now: 0 })).toBeNull();
  });

  it('affine la vitesse de chauffe après une marche assez longue', () => {
    const learned = learnRate(DEFAULT_THERMAL, 'heat', 2, 40 * MIN);
    expect(learned.heatRate).toBeCloseTo(DEFAULT_THERMAL.heatRate * 0.7 + 3 * 0.3, 5);
    expect(learnRate(DEFAULT_THERMAL, 'heat', 2, 5 * MIN)).toBe(DEFAULT_THERMAL);
  });
});
