import { ROOM_NAME } from './capabilities';
import type { Prediction, Sample } from './forecast';
import { formatClock, formatDuration, formatTemp } from './format';
import type { AutoMode } from './regulation';

export type LeadMinutes = 15 | 30 | 60;

export interface NotificationPrefs {
  forecast: boolean;
  lead: LeadMinutes;
  onStart: boolean;
  onStop: boolean;
  phone: boolean;
  pc: boolean;
  quiet: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  forecast: true,
  lead: 30,
  onStart: true,
  onStop: true,
  phone: true,
  pc: true,
  quiet: true,
};

export const QUIET_HOURS = { start: 22 * 60 + 30, end: 7 * 60 } as const;

export function isQuietTime(prefs: NotificationPrefs, timestamp: number): boolean {
  if (!prefs.quiet) return false;
  const date = new Date(timestamp);
  const minute = date.getHours() * 60 + date.getMinutes();
  return minute >= QUIET_HOURS.start || minute < QUIET_HOURS.end;
}

export type NotificationKind = 'forecast' | 'start' | 'stop';

export interface ForecastDetail {
  prediction: Prediction;
  samples: Sample[];
  roomTemp: number;
  outdoor: number;
  loss: number;
  sentAt: number;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  mode: AutoMode;
  at: number;
  title: string;
  body: string;
  detail: string | null;
  forecast: ForecastDetail | null;
}

export const SENDER = `Clim · ${ROOM_NAME}`;
const room = `le ${ROOM_NAME.toLowerCase()}`;

const outside = (outdoor: number | null): string =>
  outdoor === null ? '' : ` Il fait ${formatTemp(Math.round(outdoor))}° dehors.`;

export function leadText(minutes: number): string {
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  return formatDuration(rounded * 60_000);
}

export const leadLabel = (lead: LeadMinutes): string => (lead === 60 ? '1 h' : `${lead} min`);

type Text = Pick<AppNotification, 'title' | 'body' | 'detail'>;

export function forecastText(prediction: Prediction, outdoor: number | null): Text {
  const when = formatClock(prediction.crossAt);
  const delay = leadText(prediction.minutes);
  const threshold = formatTemp(prediction.threshold);
  const rate = formatTemp(prediction.rate);
  const air = outdoor === null ? '' : ` Il fait ${formatTemp(Math.round(outdoor))}° dehors`;
  if (prediction.mode === 'heat') {
    return {
      title: `Chauffage prévu vers ${when}`,
      body: `La pièce passera sous ${threshold}° d’ici ${delay}.${outside(outdoor)}`,
      detail: `La pièce passera sous ${threshold}° dans ${delay} environ.${air ? `${air} et elle perd ${rate}° par heure.` : ''}`,
    };
  }
  return {
    title: `Clim prévue vers ${when}`,
    body: `La pièce atteindra ${threshold}° d’ici ${delay}.${outside(outdoor)}`,
    detail: `La pièce atteindra ${threshold}° dans ${delay} environ.${air ? `${air} et elle gagne ${rate}° par heure.` : ''}`,
  };
}

export function startText(mode: AutoMode, roomTemp: number, target: number, outdoor: number | null): Text {
  return {
    title: mode === 'heat' ? 'Chauffage lancé' : 'Rafraîchissement lancé',
    body: `${formatTemp(roomTemp)}° dans ${room}, objectif ${formatTemp(target)}°.${outside(outdoor)}`,
    detail: null,
  };
}

export function stopText(
  mode: AutoMode,
  target: number,
  durationMs: number,
  outdoor: number | null,
  nextStartAt: number | null,
): Text {
  const what = mode === 'heat' ? 'Chauffage arrêté' : 'Rafraîchissement arrêté';
  const next = nextStartAt === null ? outside(outdoor) : ` Prochaine relance estimée vers ${formatClock(nextStartAt)}.`;
  return {
    title: `${formatTemp(target)}° atteints, clim coupée`,
    body: `${what} après ${formatDuration(durationMs)}.${next}`,
    detail: null,
  };
}
