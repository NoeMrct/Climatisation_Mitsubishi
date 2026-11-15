import { useCallback, useSyncExternalStore } from 'react';
import { LINKS, routeOf, type Route } from './routes';

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

function subscribeToHash(notify: () => void): () => void {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}

export function useHashRoute(): Route {
  return useSyncExternalStore(subscribeToHash, () => routeOf(window.location.hash));
}

export function navigate(route: Route): void {
  window.location.hash = LINKS[route];
}
