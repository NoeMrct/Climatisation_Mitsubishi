import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { formatAgo, formatClock } from '../domain/format';
import { SENDER, type AppNotification } from '../domain/notify';
import type { AutoMode } from '../domain/regulation';
import { useApp, useController } from '../store/hooks';
import { ForecastChart } from './ForecastChart';
import { Icon } from './icons';
import { Sheet } from './Sheet';

const POSTPONE_MS = 60 * 60_000;

const BANNER_MS = 12_000;
const FORECAST_BANNER_MS = 30_000;

const modeStyle = (mode: AutoMode): CSSProperties =>
  ({ '--notif-acc': mode === 'heat' ? 'var(--heat)' : 'var(--cool)' }) as CSSProperties;

export function AppIcon({ size = 38 }: { size?: number }) {
  const glyph = Math.round(size * 0.63);
  return (
    <span
      aria-hidden="true"
      className="app-icon"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="7" rx="2.5" fill="#F3F4F6" />
        <path d="M8 14.5c0 2-.8 3.3-2 5" stroke="#FF6B45" strokeWidth="1.8" />
        <path d="M12 14.5v5.5" stroke="#F3F4F6" strokeWidth="1.8" />
        <path d="M16 14.5c0 2 .8 3.3 2 5" stroke="#4CA3FF" strokeWidth="1.8" />
      </svg>
    </span>
  );
}

interface TitleProps {
  mode: AutoMode;
  title: string;
  large?: boolean;
}

function NotifTitle({ mode, title, large = false }: TitleProps) {
  return (
    <div className={large ? 'notif__title notif__title--lg' : 'notif__title'}>
      <span className="notif__mode">
        <Icon name={mode === 'heat' ? 'sun' : 'snow'} size={large ? 17 : 15} strokeWidth={1.8} />
      </span>
      <span>{title}</span>
    </div>
  );
}

interface NotifCardProps {
  mode: AutoMode;
  when: string;
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}

export function NotifCard({ mode, when, title, body, className = '', children }: NotifCardProps) {
  return (
    <article className={`notif ${className}`.trim()} style={modeStyle(mode)}>
      <AppIcon />
      <div className="notif__main">
        <div className="notif__meta">
          <span>{SENDER}</span>
          <span>{when}</span>
        </div>
        <NotifTitle mode={mode} title={title} />
        <div className="notif__body">{body}</div>
      </div>
      {children}
    </article>
  );
}

interface ForecastActions {
  onStart: () => void;
  onPostpone: () => void;
  onSkip: () => void;
}

function ForecastCard({
  notification,
  onStart,
  onPostpone,
  onSkip,
}: { notification: AppNotification } & ForecastActions) {
  const heat = notification.mode === 'heat';
  const evening = new Date(notification.at).getHours() >= 17;
  return (
    <article className="fcard" style={modeStyle(notification.mode)}>
      <div className="fcard__head">
        <AppIcon />
        <div className="fcard__meta">
          <span>{SENDER}</span>
          <span>{formatClock(notification.at)}</span>
        </div>
      </div>
      <div className="fcard__text">
        <NotifTitle mode={notification.mode} title={notification.title} large />
        <div className="notif__body">{notification.detail ?? notification.body}</div>
      </div>
      {notification.forecast && (
        <div className="fcard__chart">
          <ForecastChart detail={notification.forecast} />
          <div className="legend">
            <span className="legend__item">
              <span className="legend__solid" />
              <span>Mesuré</span>
            </span>
            <span className="legend__item">
              <span className="legend__dashed" />
              <span>Prévu</span>
            </span>
            <span className="legend__item">
              <span className="legend__run" />
              <span>{heat ? 'Chauffage' : 'Clim'}</span>
            </span>
          </div>
        </div>
      )}
      <div className="actions">
        <button type="button" className="action action--primary" onClick={onStart}>
          Démarrer maintenant
        </button>
        <div className="grid-2">
          <button type="button" className="action" onClick={onPostpone}>
            Reporter d’1 h
          </button>
          <button type="button" className="action" onClick={onSkip}>
            {evening ? 'Pas ce soir' : 'Pas aujourd’hui'}
          </button>
        </div>
      </div>
    </article>
  );
}

interface PcToastProps {
  notification: AppNotification;
  onClose: () => void;
  onStart: () => void;
  onPostpone: () => void;
}

function PcToast({ notification, onClose, onStart, onPostpone }: PcToastProps) {
  const body = notification.detail ? notification.detail.replace(/ et elle .*$/, '.') : notification.body;
  return (
    <article className="pc-toast" style={modeStyle(notification.mode)}>
      <div className="pc-toast__head">
        <AppIcon size={28} />
        <div className="pc-toast__meta">
          <span className="pc-toast__sender">{SENDER}</span>
          <span>{formatClock(notification.at)}</span>
        </div>
        <button type="button" className="pc-toast__close" aria-label="Fermer la notification" onClick={onClose}>
          <Icon name="close" size={16} strokeWidth={1.8} />
        </button>
      </div>
      <div className="fcard__text">
        <NotifTitle mode={notification.mode} title={notification.title} />
        <div className="notif__body">{body}</div>
      </div>
      {notification.kind === 'forecast' && (
        <div className="pc-toast__actions">
          <button type="button" className="pc-toast__action pc-toast__action--primary" onClick={onStart}>
            Démarrer maintenant
          </button>
          <button type="button" className="pc-toast__action" onClick={onPostpone}>
            Reporter d’1 h
          </button>
        </div>
      )}
    </article>
  );
}

export function Toasts({ wide }: { wide: boolean }) {
  const { toast, now } = useApp();
  const controller = useController();
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const forecast = toast.kind === 'forecast';
    if (forecast && (wide || openId === toast.id)) return;
    const timer = setTimeout(() => controller.dismissToast(), forecast ? FORECAST_BANNER_MS : BANNER_MS);
    return () => clearTimeout(timer);
  }, [toast, controller, wide, openId]);

  if (!toast) return null;
  const start = (): void => controller.startNow();
  const postpone = (): void => controller.postpone(POSTPONE_MS);

  if (wide) {
    return (
      <div className="toasts toasts--pc" role="status">
        <PcToast notification={toast} onClose={() => controller.dismissToast()} onStart={start} onPostpone={postpone} />
      </div>
    );
  }

  if (toast.kind === 'forecast' && openId === toast.id) {
    return (
      <Sheet
        label={toast.title}
        onClose={() => {
          setOpenId(null);
          controller.dismissToast();
        }}
      >
        <ForecastCard
          notification={toast}
          onStart={start}
          onPostpone={postpone}
          onSkip={() => controller.skipUntilMorning()}
        />
      </Sheet>
    );
  }

  const forecast = toast.kind === 'forecast';
  return (
    <div className="toasts" role="status">
      <NotifCard
        mode={toast.mode}
        when={formatAgo(now - toast.at)}
        title={toast.title}
        body={toast.body}
        className="banner"
      >
        <button
          type="button"
          className="banner__hit"
          aria-label={forecast ? 'Voir la prévision et choisir' : 'Fermer la notification'}
          onClick={() => (forecast ? setOpenId(toast.id) : controller.dismissToast())}
        />
      </NotifCard>
    </div>
  );
}
