import type { ReactNode } from 'react';
import { MODEL, ROOM_NAME } from '../domain/capabilities';
import { DAYS, dayIndexOf, daySegments } from '../domain/schedule';
import { useApp } from '../store/hooks';
import { programText, regulationLine } from '../store/view';
import { LinkRow, StatusLine } from '../ui/controls';
import { Icon } from '../ui/icons';
import { AimChips, AimText, ClimStage, DayBar, FanControls, ModeList, OptionList, TempBlock } from '../ui/panels';
import { LINKS } from '../ui/routes';

interface DCardProps {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}

function DCard({ title, aside, children }: DCardProps) {
  const heading = <h2 className="eyebrow eyebrow--muted">{title}</h2>;
  return (
    <section className="dcard">
      {aside ? (
        <div className="section__head">
          {heading}
          <span className="dcard__aside">{aside}</span>
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  );
}

export function Desktop() {
  const snapshot = useApp();
  const { schedule, now, clim, device, simulator } = snapshot;
  const today = dayIndexOf(now);

  return (
    <div className="desk">
      <div className="desk__inner">
        <header className="desk__head">
          <div className="desk__title">
            <h1 className="title">{ROOM_NAME}</h1>
            <StatusLine text={`${clim.online ? device.label : 'Hors ligne'} · ${MODEL}`} online={clim.online} />
          </div>
          <a className="desk__next" href={LINKS.programme}>
            <Icon name="clock" size={15} strokeWidth={1.8} />
            <span>{programText(snapshot)}</span>
          </a>
        </header>
        <main className="desk__main">
          <section aria-label="Pilotage" className="desk__stage">
            <ClimStage desktop />
            <div className="desk__temp">
              <TempBlock />
            </div>
          </section>
          <section aria-label="Réglages" className="desk__controls">
            <div className="desk__col">
              <DCard title="Mode">
                <ModeList compact />
              </DCard>
              <DCard title="Options">
                <OptionList compact />
              </DCard>
              <LinkRow href={LINKS.auto} icon="auto" title="Régulation auto" sub={regulationLine(snapshot)} />
            </div>
            <div className="desk__col">
              <DCard title="Direction du flux" aside={<AimText />}>
                <AimChips />
              </DCard>
              <DCard title="Ventilation">
                <FanControls compact />
              </DCard>
              <a className="dcard" href={LINKS.programme} aria-label="Programme : ouvrir la programmation">
                <div className="section__head">
                  <h2 className="eyebrow eyebrow--muted">Programme</h2>
                  <span className="dcard__aside">{DAYS[today].name}</span>
                </div>
                <div className="dcard__stack">
                  <DayBar segments={schedule.weeklyEnabled ? daySegments(schedule.days, today) : []} small />
                </div>
              </a>
              {simulator && (
                <LinkRow href={LINKS.simulateur} icon="sliders" title="Simulateur" sub="Météo et vitesse du temps" />
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
