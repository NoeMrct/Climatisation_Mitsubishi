import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AppApi } from './api';
import type { Snapshot } from './controller';

export const ControllerContext = createContext<AppApi | null>(null);

export function useController(): AppApi {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error('AppProvider manquant autour du composant.');
  return controller;
}

export function useApp(): Snapshot {
  const controller = useController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}
