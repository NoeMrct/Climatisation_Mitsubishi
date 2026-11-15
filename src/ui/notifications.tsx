import type { CSSProperties } from 'react';
import { SENDER } from '../domain/notify';
import type { AutoMode } from '../domain/regulation';
import { Icon } from './icons';

function AppIcon() {
  return (
    <span aria-hidden="true" className="app-icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeLinecap="round">
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

export function NotifTitle({ mode, title, large = false }: TitleProps) {
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
}

export function NotifCard({ mode, when, title, body }: NotifCardProps) {
  const accent = { '--notif-acc': mode === 'heat' ? 'var(--heat)' : 'var(--cool)' } as CSSProperties;
  return (
    <article className="notif" style={accent}>
      <AppIcon />
      <div className="notif__main">
        <div className="notif__meta">
          <span>{SENDER}</span>
          <span>{when}</span>
        </div>
        <NotifTitle mode={mode} title={title} />
        <div className="notif__body">{body}</div>
      </div>
    </article>
  );
}
