import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

export type Route = 'home' | 'flux' | 'modes' | 'programme' | 'auto' | 'notifications' | 'simulateur';

export const LINKS: Record<Route, string> = {
  home: '#/',
  flux: '#/flux',
  modes: '#/modes',
  programme: '#/programme',
  auto: '#/auto',
  notifications: '#/auto/notifications',
  simulateur: '#/simulateur',
};

const ROUTES = new Map<string, Route>(Object.entries(LINKS).map(([route, link]) => [link, route as Route]));

function readRoute(): Route {
  const hash = window.location.hash.replace(/\/+$/, '');
  return ROUTES.get(hash === '#' || hash === '' ? '#/' : hash) ?? 'home';
}

function subscribeToHash(notify: () => void): () => void {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}

export function useHashRoute(): Route {
  return useSyncExternalStore(subscribeToHash, readRoute);
}
