import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { attempt } from '../src/lib/attempt';
import type { KeyValueStore } from '../src/store/storage';
import type { Coordinates } from './weather';

export interface Config {
  clim: string;
  port: number;
  meteo: Coordinates;
}

export const DEFAULT_CONFIG: Config = {
  clim: '192.168.1.50',
  port: 8787,
  meteo: { latitude: 48.8566, longitude: 2.3522 },
};

const readJson = <T>(file: string): T | null => attempt(() => JSON.parse(readFileSync(file, 'utf8')) as T) ?? null;

export function loadConfig(file: string): Config {
  if (!existsSync(file)) {
    writeFileSync(file, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
    return DEFAULT_CONFIG;
  }
  const saved = readJson<Partial<Config>>(file);
  return { ...DEFAULT_CONFIG, ...saved, meteo: { ...DEFAULT_CONFIG.meteo, ...saved?.meteo } };
}

export function fileStore(file: string): KeyValueStore {
  const data = readJson<Record<string, string>>(file) ?? {};
  return {
    get: (key) => data[key] ?? null,
    set: (key, value) => {
      data[key] = value;
      attempt(() => writeFileSync(file, JSON.stringify(data)));
    },
  };
}
