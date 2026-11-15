export type Mode = 'auto' | 'cool' | 'dry' | 'heat' | 'fan';

export type SetpointMode = 'auto' | 'cool' | 'heat';

export type FanSpeed = 'auto' | 'quiet' | 1 | 2 | 3 | 4;

export type VaneStep = 0 | 1 | 2 | 3 | 4;

export type VaneV = 'auto' | 'swing' | VaneStep;

export type VaneH = 'split' | 'swing' | VaneStep;

export interface Preset {
  setpoint: number;
  fan: FanSpeed;
  vaneV: VaneV;
  vaneH: VaneH;
}

export interface ClimSettings {
  power: boolean;
  mode: Mode;
  setpoints: Record<SetpointMode, number>;
  fan: FanSpeed;
  vaneV: VaneV;
  vaneH: VaneH;
  lastRow: VaneStep;
  lastCol: VaneStep;
  powerfulUntil: number | null;
  econoCool: boolean;
  isave: boolean;
  isavePresets: Partial<Record<'cool' | 'heat', Preset>>;
  isaveBackup: Preset | null;
  nightMode: boolean;
}

export type Activity = 'off' | 'heating' | 'cooling' | 'drying' | 'fan' | 'idle' | 'standby';

export interface ClimState {
  settings: ClimSettings;
  roomTemp: number;
  outdoorTemp: number | null;
  activity: Activity;
  autoPhase: 'heat' | 'cool' | null;
  output: number;
  online: boolean;
}

export type ClimCommand =
  | { type: 'power'; on: boolean }
  | { type: 'mode'; mode: Mode }
  | { type: 'setpoint'; value: number }
  | { type: 'fan'; fan: FanSpeed }
  | { type: 'vanes'; v?: VaneV; h?: VaneH }
  | { type: 'powerful'; on: boolean }
  | { type: 'econoCool'; on: boolean }
  | { type: 'isave'; on: boolean }
  | { type: 'nightMode'; on: boolean };
