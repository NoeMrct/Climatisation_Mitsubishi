export type Route = 'home' | 'flux' | 'modes' | 'programme' | 'auto' | 'prevision' | 'notifications' | 'simulateur';

export const LINKS: Record<Route, string> = {
  home: '#/',
  flux: '#/flux',
  modes: '#/modes',
  programme: '#/programme',
  auto: '#/auto',
  prevision: '#/auto/prevision',
  notifications: '#/auto/notifications',
  simulateur: '#/simulateur',
};

const ROUTES = new Map<string, Route>(Object.entries(LINKS).map(([route, link]) => [link, route as Route]));

export function routeOf(hash: string): Route {
  const link = hash.replace(/\/+$/, '');
  return ROUTES.get(link === '#' || link === '' ? '#/' : link) ?? 'home';
}
