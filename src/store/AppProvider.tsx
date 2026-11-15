import { useEffect, type ReactNode } from 'react';
import type { AppApi } from './api';
import { ControllerContext } from './hooks';

interface AppProviderProps {
  controller: AppApi;
  children: ReactNode;
}

export function AppProvider({ controller, children }: AppProviderProps) {
  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  return <ControllerContext value={controller}>{children}</ControllerContext>;
}
