import type { Look } from '../domain/airflow';
import { formatClock, formatTemp } from '../domain/format';
import { activeRegulation } from '../domain/options';
import { targetOf, type RegulationSettings } from '../domain/regulation';
import { describeEvent } from '../domain/schedule';
import type { Activity, ClimState, FanSpeed, Mode } from '../domain/types';
import type { IconName } from '../ui/icons';
import type { Snapshot } from './controller';

export interface Accent {
  color: string;
  rgb: string;
  light: string;
}

export const ACCENTS = {
  heat: { color: '#FF6B45', rgb: '255, 107, 69', light: '#FFD2C2' },
  cool: { color: '#4CA3FF', rgb: '76, 163, 255', light: '#CFE6FF' },
  neutral: { color: '#C9CED6', rgb: '201, 206, 214', light: '#FFFFFF' },
} as const satisfies Record<string, Accent>;

export interface ModeInfo {
  mode: Mode;
  icon: IconName;
  name: string;
  short: string;
  sub: string;
}

export const MODE_LIST: readonly ModeInfo[] = [
  { mode: 'auto', icon: 'auto', name: 'Auto', short: 'Auto', sub: 'Chaud ou froid selon la consigne' },
  { mode: 'cool', icon: 'snow', name: 'Froid', short: 'Froid', sub: 'Consigne de 16 à 31°' },
  { mode: 'dry', icon: 'drop', name: 'Déshumidification', short: 'Déshumid.', sub: 'Assèche l’air de la pièce' },
  { mode: 'heat', icon: 'sun', name: 'Chaud', short: 'Chaud', sub: 'Consigne de 10 à 31°' },
  { mode: 'fan', icon: 'wind', name: 'Ventilation', short: 'Ventilation', sub: 'Brasse l’air, sans chaud ni froid' },
];

export const modeInfo = (mode: Mode): ModeInfo => MODE_LIST.find((item) => item.mode === mode) ?? MODE_LIST[0];

export interface ClimLook {
  look: Look;
  accent: Accent;
  label: string;
  icon: IconName;
  unitLabel: string;
}

export function climLook(clim: ClimState): ClimLook {
  const { settings } = clim;
  const closed = 'Unité intérieure à l’arrêt, volet fermé';
  const unit = (text: string): string => (settings.power ? text : closed);
  switch (settings.mode) {
    case 'heat':
      return {
        look: 'heat',
        accent: ACCENTS.heat,
        label: 'Chauffage',
        icon: 'sun',
        unitLabel: unit('Unité intérieure en chauffage'),
      };
    case 'cool':
      return {
        look: 'cool',
        accent: ACCENTS.cool,
        label: 'Rafraîchissement',
        icon: 'snow',
        unitLabel: unit('Unité intérieure en rafraîchissement'),
      };
    case 'dry':
      return {
        look: 'cool',
        accent: ACCENTS.cool,
        label: 'Déshumidification',
        icon: 'drop',
        unitLabel: unit('Unité intérieure en déshumidification'),
      };
    case 'fan':
      return {
        look: 'cool',
        accent: ACCENTS.neutral,
        label: 'Ventilation',
        icon: 'wind',
        unitLabel: unit('Unité intérieure en ventilation'),
      };
    case 'auto': {
      const heating = clim.autoPhase ? clim.autoPhase === 'heat' : clim.roomTemp < settings.setpoints.auto;
      return heating
        ? {
            look: 'heat',
            accent: ACCENTS.heat,
            label: 'Auto · chauffage',
            icon: 'auto',
            unitLabel: unit('Unité intérieure en chauffage'),
          }
        : {
            look: 'cool',
            accent: ACCENTS.cool,
            label: 'Auto · rafraîchissement',
            icon: 'auto',
            unitLabel: unit('Unité intérieure en rafraîchissement'),
          };
    }
  }
}

export function fanLabel(fan: FanSpeed): string {
  if (fan === 'auto') return 'Auto';
  if (fan === 'quiet') return 'Silencieux';
  return `Vitesse ${fan}`;
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  off: 'Éteinte',
  heating: 'Chauffe',
  cooling: 'Rafraîchit',
  drying: 'Déshumidifie',
  fan: 'Ventile',
  idle: 'Consigne atteinte',
  standby: 'Compresseur en attente',
};

function situation(snapshot: Snapshot): string | null {
  const { clim, session, pausedUntil, prediction, nextEvent, regulation, now } = snapshot;
  if (clim.activity === 'standby') return 'compresseur en attente';
  if (session) return `objectif ${formatTemp(targetOf(activeRegulation(regulation, clim.settings), session.mode))}°`;
  if (pausedUntil !== null) return `pause jusqu’à ${formatClock(pausedUntil)}`;
  if (prediction && prediction.minutes <= 90) {
    return `${prediction.mode === 'heat' ? 'chauffe' : 'froid'} vers ${formatClock(prediction.crossAt)}`;
  }
  if (nextEvent) return describeEvent(nextEvent, now);
  if (regulation.enabled) return clim.settings.power ? 'commande manuelle' : 'régulation auto';
  return null;
}

export function statusText(snapshot: Snapshot): string {
  const link = snapshot.clim.online ? snapshot.device.label : 'Hors ligne';
  const detail = situation(snapshot);
  return detail ? `${link} · ${detail}` : link;
}

export function programText(snapshot: Snapshot): string {
  const { nextEvent, now } = snapshot;
  if (!nextEvent) return 'Aucun programme actif';
  const when = describeEvent(nextEvent, now).replace(/^(marche|arrêt) /, '');
  return `${nextEvent.action === 'on' ? 'Marche programmée' : 'Arrêt programmé'} ${when}`;
}

const shortSummary = (regulation: RegulationSettings): string => {
  if (!regulation.enabled) return 'Désactivée';
  const { heat, cool } = regulation;
  if (heat.enabled && cool.enabled) return 'Chauffage et rafraîchissement';
  if (heat.enabled) return `Chauffe sous ${heat.low}°, coupe à ${heat.high}°`;
  if (cool.enabled) return `Rafraîchit dès ${cool.high}°, coupe à ${cool.low}°`;
  return 'Aucun mode actif';
};

export function regulationLine(snapshot: Snapshot): string {
  const { session, pausedUntil, prediction } = snapshot;
  const regulation = activeRegulation(snapshot.regulation, snapshot.clim.settings);
  if (session) return `En cours : objectif ${formatTemp(targetOf(regulation, session.mode))}°`;
  if (pausedUntil !== null) return `En pause jusqu’à ${formatClock(pausedUntil)}`;
  if (prediction && prediction.minutes <= 90) {
    return `${prediction.mode === 'heat' ? 'Chauffage prévu' : 'Clim prévue'} vers ${formatClock(prediction.crossAt)}`;
  }
  return shortSummary(regulation);
}
