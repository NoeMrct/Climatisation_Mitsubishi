import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import os from 'node:os';
import { join } from 'node:path';
import { systemClock } from '../src/device/clock';
import { DEFAULT_THERMAL } from '../src/domain/forecast';
import { DEFAULT_NOTIFICATION_PREFS } from '../src/domain/notify';
import { DEFAULT_REGULATION, IDLE_RUNTIME } from '../src/domain/regulation';
import { defaultSchedule } from '../src/domain/schedule';
import { attempt, attemptAsync } from '../src/lib/attempt';
import { AppController } from '../src/store/controller';
import { loadState, type PersistedState } from '../src/store/storage';
import { createRequestHandler } from './api';
import { fileStore, loadConfig, loadTls, type HttpsConfig } from './config';
import { LocalClim } from './LocalClim';
import { PushHub } from './push';
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

const lanAddresses = (scheme: 'http' | 'https', port: number): string =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((info) => info?.family === 'IPv4' && !info.internal)
    .map((info) => `${scheme}://${info?.address}:${port}`)
    .join(' ou ');

const config = loadConfig(join(ROOT, 'clim.config.json'));
const store = fileStore(join(ROOT, 'clim.state.json'));
const device = new LocalClim(config.clim, { store });
const push = new PushHub({
  store,
  contact: config.contact,
  onFailure: (host, status) => {
    console.warn(`Notification push non remise par ${host} (${status ?? 'service injoignable'}).`);
  },
});
const controller = new AppController({
  device,
  clock: systemClock,
  store,
  simulator: null,
  saved: loadState(store) ?? firstState(),
  announce: (notification) => void push.announce(notification),
});
controller.start();

const refreshWeather = async (): Promise<void> => {
  const temperature = await attemptAsync(() => fetchOutdoorTemp(config.meteo));
  if (typeof temperature === 'number') device.setOutdoorTemp(temperature);
};
void refreshWeather();
setInterval(() => void refreshWeather(), WEATHER_EVERY_MS);

const handler = createRequestHandler({ controller, staticDir: join(ROOT, 'dist'), push });

createServer(handler).listen(config.port, () => {
  console.log(`Clim : serveur prêt, clim attendue à ${config.clim}.`);
  console.log(`Sur ce PC : http://localhost:${config.port}`);
  console.log(`Sur le téléphone (même Wi-Fi) : ${lanAddresses('http', config.port)}`);
});

function listenSecurely(https: HttpsConfig): void {
  const tls = loadTls(https, ROOT);
  const server = tls && attempt(() => createSecureServer(tls, handler));
  if (!server) {
    console.warn('HTTPS désactivé : certificat ou clé illisible (clé « https » de clim.config.json).');
    return;
  }
  server.listen(https.port, () => {
    console.log(`En HTTPS, pour les notifications du téléphone : ${lanAddresses('https', https.port)}`);
  });
}

if (config.https) listenSecurely(config.https);
