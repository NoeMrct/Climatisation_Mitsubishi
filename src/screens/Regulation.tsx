import type { CSSProperties } from 'react';
import { formatClock } from '../domain/format';
import {
  bandLimits,
  bandPosition,
  bandValue,
  regulationConflict,
  regulationSummary,
  stepBand,
  type AutoMode,
  type BandKey,
} from '../domain/regulation';
import { useApp, useController } from '../store/hooks';
import { LinkRow, Stepper, SubHeader, Switch } from '../ui/controls';
import { LINKS } from '../ui/hooks';
import { Icon, type IconName } from '../ui/icons';

const INACTIVE = '#5A606A';
const TICKS: [number, number][] = [
  [0, 15],
  [33.333, 19],
  [66.667, 23],
  [100, 27],
];

interface CardInfo {
  title: string;
  icon: IconName;
  color: string;
  low: { key: BandKey; label: string };
  high: { key: BandKey; label: string };
}

const CARDS: Record<AutoMode, CardInfo> = {
  heat: {
    title: 'Chauffage',
    icon: 'sun',
    color: 'var(--heat)',
    low: { key: 'heat.low', label: 'Relance sous' },
    high: { key: 'heat.high', label: 'Arrêt à' },
  },
  cool: {
    title: 'Rafraîchissement',
    icon: 'snow',
    color: 'var(--cool)',
    low: { key: 'cool.low', label: 'Arrêt à' },
    high: { key: 'cool.high', label: 'Déclenche à' },
  },
};

interface GaugeProps {
  low: number;
  high: number;
  color: string;
  active: boolean;
}

function BandGauge({ low, high, color, active }: GaugeProps) {
  const from = bandPosition(low);
  const to = bandPosition(high);
  return (
    <div aria-hidden="true" className="band">
      <div className="band__values" style={{ color: active ? 'var(--t1)' : 'var(--t3)' }}>
        <span style={{ left: `${from}%` }}>{low}°</span>
        <span style={{ left: `${to}%` }}>{high}°</span>
      </div>
      <div className="band__track">
        <span className="band__rail" />
        <span className="band__fill" style={{ left: `${from}%`, width: `${to - from}%`, background: color }} />
        <span className="band__handle" style={{ left: `${from}%`, borderColor: color }} />
        <span className="band__handle" style={{ left: `${to}%`, borderColor: color }} />
      </div>
      <div className="band__ticks">
        {TICKS.map(([position, temp]) => (
          <span key={temp} style={{ left: `${position}%` }}>
            {temp}°
          </span>
        ))}
      </div>
    </div>
  );
}

function AutoCard({ mode }: { mode: AutoMode }) {
  const { regulation } = useApp();
  const controller = useController();
  const info = CARDS[mode];
  const band = regulation[mode];
  const active = regulation.enabled && band.enabled;

  const stepper = ({ key, label }: { key: BandKey; label: string }) => {
    const value = bandValue(regulation, key);
    const { min, max } = bandLimits(regulation, key);
    return (
      <Stepper
        label={label}
        value={String(value)}
        canDecrease={value > min}
        canIncrease={value < max}
        onStep={(delta) => controller.setRegulation(stepBand(regulation, key, delta))}
      />
    );
  };

  return (
    <section className="auto-card" style={{ '--band': info.color } as CSSProperties}>
      <div className="auto-card__head">
        <span className={active ? 'auto-card__icon auto-card__icon--on' : 'auto-card__icon'}>
          <Icon name={info.icon} size={20} strokeWidth={1.8} />
        </span>
        <h2 className="auto-card__title">{info.title}</h2>
        <Switch
          label={info.title}
          checked={band.enabled}
          onChange={(enabled) => controller.setRegulation({ ...regulation, [mode]: { ...band, enabled } })}
        />
      </div>
      <div className="auto-card__body" style={{ opacity: active ? 1 : 0.5 }}>
        <BandGauge low={band.low} high={band.high} color={active ? info.color : INACTIVE} active={active} />
        <div className="grid-2 grid-2--wide">
          {stepper(info.low)}
          {stepper(info.high)}
        </div>
      </div>
    </section>
  );
}

export function Regulation() {
  const { regulation, pausedUntil } = useApp();
  const controller = useController();
  const conflict = regulationConflict(regulation);

  return (
    <main className="screen screen--tight">
      <SubHeader
        title="Régulation auto"
        back={LINKS.home}
        backLabel="Retour à l’accueil"
        right={
          <Switch
            label="Régulation automatique"
            checked={regulation.enabled}
            onChange={(enabled) => controller.setRegulation({ ...regulation, enabled })}
          />
        }
      />
      <p className="summary">
        {pausedUntil === null ? (
          regulationSummary(regulation)
        ) : (
          <>
            En pause jusqu’à {formatClock(pausedUntil)} : rien ne se lancera d’ici là.{' '}
            <button type="button" className="text-button" onClick={() => controller.resumeRegulation()}>
              Reprendre
            </button>
          </>
        )}
      </p>
      <AutoCard mode="heat" />
      <AutoCard mode="cool" />
      {conflict && (
        <div className="warn" role="status">
          <span className="warn__icon">
            <Icon name="alert" size={18} strokeWidth={1.8} />
          </span>
          <span>{conflict}</span>
        </div>
      )}
      <LinkRow href={LINKS.notifications} icon="bell" title="Notifications" sub="Prévision, lancement et arrêt" />
    </main>
  );
}
