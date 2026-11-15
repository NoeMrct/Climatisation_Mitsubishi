import { POSTPONE_MS } from '../domain/forecast';
import { SENDER } from '../domain/notify';
import { pushTopic, type PushMessage } from '../domain/push';
import { LINKS } from '../ui/routes';

const ICON = 'pwa-192.png';
const FAILURE_TAG = 'clim-injoignable';

export interface RemoteCall {
  name: string;
  args: unknown[];
}

export interface ActionButton {
  action: string;
  title: string;
}

export interface DisplayOptions extends NotificationOptions {
  actions: ActionButton[];
  timestamp: number;
}

export interface Display {
  title: string;
  options: DisplayOptions;
}

const FORECAST_CHOICES: readonly (ActionButton & { call: RemoteCall })[] = [
  { action: 'start', title: 'Démarrer maintenant', call: { name: 'startNow', args: [] } },
  { action: 'postpone', title: 'Reporter d’1 h', call: { name: 'postpone', args: [POSTPONE_MS] } },
];

const FORECAST_BUTTONS: ActionButton[] = FORECAST_CHOICES.map(({ action, title }) => ({ action, title }));

export const unreadableMessage = (at: number): PushMessage => ({
  kind: 'ready',
  title: SENDER,
  body: 'Nouvelle notification de la clim.',
  at,
  silent: false,
});

export function displayOf({ kind, title, body, at, silent }: PushMessage, scope: string): Display {
  return {
    title,
    options: {
      body,
      tag: pushTopic(kind),
      icon: `${scope}${ICON}`,
      lang: 'fr',
      silent,
      timestamp: at,
      data: kind,
      actions: kind === 'forecast' ? FORECAST_BUTTONS : [],
    },
  };
}

export function failureDisplay(scope: string, at: number): Display {
  return {
    title: 'Clim injoignable',
    options: {
      body: 'L’action n’a pas été transmise : le serveur de la clim ne répond pas.',
      tag: FAILURE_TAG,
      icon: `${scope}${ICON}`,
      lang: 'fr',
      silent: false,
      timestamp: at,
      data: null,
      actions: [],
    },
  };
}

export const callOf = (action: string): RemoteCall | null =>
  FORECAST_CHOICES.find((choice) => choice.action === action)?.call ?? null;

export const linkOf = (kind: unknown): string => (kind === 'forecast' ? LINKS.prevision : LINKS.home);
