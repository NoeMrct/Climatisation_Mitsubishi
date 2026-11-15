import { createServer } from 'node:http';
import os from 'node:os';
import { join } from 'node:path';
import { systemClock } from '../src/device/clock';
import { DEFAULT_THERMAL } from '../src/domain/forecast';
import { DEFAULT_NOTIFICATION_PREFS } from '../src/domain/notify';
import { DEFAULT_REGULATION, IDLE_RUNTIME } from '../src/domain/regulation';
import { defaultSchedule } from '../src/domain/schedule';
import { attemptAsync } from '../src/lib/attempt';
import { AppController } from '../src/store/controller';
import { loadState, type PersistedState } from '../src/store/storage';
import { createRequestHandler } from './api';
import { fileStore, loadConfig } from './config';
import { LocalClim } from './LocalClim';
import { fetchOutdoorTemp } from './weather';

const ROOT = process.cwd();
const WEATHER_EVERY_MS = 10 * 60_000;

const firstState = (): PersistedState => ({
  regulation: { ...DEFAULT_REGULATION, enabled: false },
  runtime: IDLE_RUNTIME,
  notifications: DEFAULT_NOTIFICATION_PREFS,
  schedule: defaultSchedule(),
  thermal: DEFAULT_THERMAL,
  simulator: null,
});

const lanAddresses = (port: number): string[] =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((info) => info?.family === 'IPv4' && !info.internal)
    .map((info) => `http://${info?.address}:${port}`);

const config = loadConfig(join(ROOT, 'clim.config.json'));
const store = fileStore(join(ROOT, 'clim.state.json'));
const device = new LocalClim(config.clim, { store });
const controller = new AppController({
  device,
  clock: systemClock,
  store,
  simulator: null,
  saved: loadState(store) ?? firstState(),
  filterByDevice: false,
});
controller.start();

const refreshWeather = async (): Promise<void> => {
  const temperature = await attemptAsync(() => fetchOutdoorTemp(config.meteo));
  if (typeof temperature === 'number') device.setOutdoorTemp(temperature);
};
void refreshWeather();
setInterval(() => void refreshWeather(), WEATHER_EVERY_MS);

createServer(createRequestHandler({ controller, staticDir: join(ROOT, 'dist') })).listen(config.port, () => {
  console.log(`Clim : serveur prêt, clim attendue à ${config.clim}.`);
  console.log(`Sur ce PC : http://localhost:${config.port}`);
  console.log(`Sur le téléphone (même Wi-Fi) : ${lanAddresses(config.port).join(' ou ')}`);
});
