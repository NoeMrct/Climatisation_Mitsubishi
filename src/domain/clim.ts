import {
  POWERFUL_MAX_MS,
  canEconoCool,
  canISave,
  canPowerful,
  clampSetpoint,
  currentSetpoint,
  hasSetpoint,
} from './capabilities';
import type { ClimCommand, ClimSettings, Preset } from './types';

export const DEFAULT_SETTINGS: ClimSettings = {
  power: true,
  mode: 'heat',
  setpoints: { auto: 22, cool: 24, heat: 21 },
  fan: 'auto',
  vaneV: 3,
  vaneH: 2,
  lastRow: 3,
  lastCol: 2,
  powerfulUntil: null,
  econoCool: false,
  isave: false,
  isavePresets: {},
  isaveBackup: null,
  nightMode: false,
};

function presetOf(s: ClimSettings): Preset | null {
  if (!hasSetpoint(s.mode)) return null;
  return { setpoint: s.setpoints[s.mode], fan: s.fan, vaneV: s.vaneV, vaneH: s.vaneH };
}

function applyPreset(s: ClimSettings, preset: Preset): ClimSettings {
  if (!hasSetpoint(s.mode)) return s;
  return {
    ...s,
    setpoints: { ...s.setpoints, [s.mode]: clampSetpoint(s.mode, preset.setpoint) },
    fan: preset.fan,
    vaneV: preset.vaneV,
    vaneH: preset.vaneH,
  };
}

function rememberISave(s: ClimSettings): ClimSettings {
  if (!s.isave || (s.mode !== 'cool' && s.mode !== 'heat')) return s;
  const preset = presetOf(s);
  return preset ? { ...s, isavePresets: { ...s.isavePresets, [s.mode]: preset } } : s;
}

export function applyCommand(settings: ClimSettings, command: ClimCommand, now: number): ClimSettings {
  switch (command.type) {
    case 'power':
      return { ...settings, power: command.on, powerfulUntil: null };

    case 'mode': {
      if (command.mode === settings.mode) return settings;
      const keepsEcono = command.mode === 'cool' || command.mode === 'heat';
      return {
        ...settings,
        mode: command.mode,
        powerfulUntil: null,
        econoCool: settings.econoCool && keepsEcono,
        isave: false,
        isaveBackup: null,
      };
    }

    case 'setpoint': {
      if (!hasSetpoint(settings.mode)) return settings;
      const value = clampSetpoint(settings.mode, command.value);
      return rememberISave({ ...settings, setpoints: { ...settings.setpoints, [settings.mode]: value } });
    }

    case 'fan':
      return rememberISave({ ...settings, fan: command.fan, powerfulUntil: null, econoCool: false, nightMode: false });

    case 'vanes': {
      const next: ClimSettings = { ...settings };
      if (command.v !== undefined) {
        next.vaneV = command.v;
        if (typeof command.v === 'number') next.lastRow = command.v;
      }
      if (command.h !== undefined) {
        next.vaneH = command.h;
        if (typeof command.h === 'number') next.lastCol = command.h;
      }
      return rememberISave(next);
    }

    case 'powerful': {
      if (!command.on) return { ...settings, powerfulUntil: null };
      if (!canPowerful(settings)) return settings;
      return { ...settings, powerfulUntil: now + POWERFUL_MAX_MS, econoCool: false, nightMode: false };
    }

    case 'econoCool': {
      if (!command.on) return { ...settings, econoCool: false };
      if (!canEconoCool(settings)) return settings;
      return { ...settings, econoCool: true, powerfulUntil: null };
    }

    case 'isave': {
      if (!command.on) {
        if (!settings.isave) return settings;
        const restored = settings.isaveBackup ? applyPreset(settings, settings.isaveBackup) : settings;
        return { ...restored, isave: false, isaveBackup: null };
      }
      if (!canISave(settings) || settings.isave || (settings.mode !== 'cool' && settings.mode !== 'heat'))
        return settings;
      const current = presetOf(settings);
      const favourite = settings.isavePresets[settings.mode] ?? current;
      if (!current || !favourite) return settings;
      const base: ClimSettings = { ...settings, powerfulUntil: null, econoCool: false };
      return rememberISave({ ...applyPreset(base, favourite), isave: true, isaveBackup: current });
    }

    case 'nightMode':
      return command.on ? { ...settings, nightMode: true, powerfulUntil: null } : { ...settings, nightMode: false };
  }
}

export const isPowerful = (settings: ClimSettings, now: number): boolean =>
  settings.powerfulUntil !== null && now < settings.powerfulUntil;

function targetReached(settings: ClimSettings, roomTemp: number): boolean {
  const target = currentSetpoint(settings);
  if (target === null) return true;
  if (settings.mode === 'heat') return roomTemp >= target;
  if (settings.mode === 'cool') return roomTemp <= target;
  return true;
}

export function settleOptions(settings: ClimSettings, roomTemp: number, now: number): ClimSettings {
  if (settings.powerfulUntil === null) return settings;
  const finished = !settings.power || now >= settings.powerfulUntil || targetReached(settings, roomTemp);
  return finished ? { ...settings, powerfulUntil: null } : settings;
}
