import { describe, expect, it } from 'vitest';
import { LINKS, routeOf, type Route } from './routes';

describe('routes de l’appli', () => {
  it('retrouve l’écran de chaque lien', () => {
    for (const [route, link] of Object.entries(LINKS)) expect(routeOf(link)).toBe(route);
    expect(new Set(Object.values(LINKS)).size).toBe(Object.keys(LINKS).length);
  });

  it('tolère une barre finale et retombe sur l’accueil pour une adresse inconnue', () => {
    const cases: [string, Route][] = [
      ['', 'home'],
      ['#', 'home'],
      ['#/', 'home'],
      ['#/auto/', 'auto'],
      ['#/auto/prevision/', 'prevision'],
      ['#/inconnu', 'home'],
    ];
    for (const [hash, route] of cases) expect(routeOf(hash)).toBe(route);
  });
});
