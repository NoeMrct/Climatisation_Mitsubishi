import type { ClimCommand, ClimState } from '../domain/types';

export type DeviceKind = 'simulator' | 'local' | 'melcloud' | 'cn105';

export interface ClimDevice {
  readonly kind: DeviceKind;
  readonly label: string;
  getState(): ClimState;
  send(command: ClimCommand): Promise<void>;
  subscribe(listener: (state: ClimState) => void): () => void;
  tick?(now: number): void;
}
