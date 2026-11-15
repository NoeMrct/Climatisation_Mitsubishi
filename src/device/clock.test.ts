import { describe, expect, it } from 'vitest';
import { SimClock, systemClock } from './clock';

describe('horloges', () => {
  it('suit l’heure réelle à vitesse normale', () => {
    let real = 1000;
    const clock = new SimClock(50_000, () => real);
    real += 2000;
    expect(clock.now()).toBe(52_000);
    expect(clock.speed).toBe(1);
  });

  it('accélère sans saut au changement de vitesse', () => {
    let real = 0;
    const clock = new SimClock(0, () => real);
    real = 1000;
    clock.setSpeed(60);
    expect(clock.now()).toBe(1000);
    real = 2000;
    expect(clock.now()).toBe(61_000);
    expect(clock.offset).toBe(59_000);
  });

  it('repart d’une heure donnée à vitesse normale', () => {
    let real = 0;
    const clock = new SimClock(0, () => real);
    clock.setSpeed(10);
    real = 5000;
    clock.reset(100);
    real = 6000;
    expect(clock.now()).toBe(1100);
    expect(clock.speed).toBe(1);
  });

  it('expose l’horloge du système', () => {
    expect(Math.abs(systemClock.now() - Date.now())).toBeLessThan(50);
  });
});
