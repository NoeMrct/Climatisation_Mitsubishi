import { formatClock, formatTemp } from '../domain/format';
import { DAYS, dayIndexOf } from '../domain/schedule';
import { useApp, useController } from '../store/hooks';
import { ACTIVITY_LABEL } from '../store/view';
import { Section, Stepper, SubHeader } from '../ui/controls';
import { LINKS } from '../ui/routes';

const SPEEDS = [1, 10, 60];

export function Simulator() {
  const { clim, now, simulator } = useApp();
  const controller = useController();
  const outdoor = clim.outdoorTemp ?? 0;

  if (!simulator) {
    return (
      <main className="screen screen--tight">
        <SubHeader title="Simulateur" back={LINKS.home} backLabel="Retour à l’accueil" />
        <p className="summary">La vraie clim est branchée : il n’y a plus rien à simuler.</p>
      </main>
    );
  }

  return (
    <main className="screen screen--tight">
      <SubHeader title="Simulateur" back={LINKS.home} backLabel="Retour à l’accueil" />
      <p className="summary">
        La clim est simulée tant que la vraie liaison n’est pas branchée. Règle ici la météo, et accélère le temps pour
        voir la régulation travailler.
      </p>

      <Section label="Horloge">
        <div className="card card--tight">
          <div className="lead-row">
            <span className="row__text">
              <span className="sim-clock">{formatClock(now)}</span>
              <span className="row__sub">{DAYS[dayIndexOf(now)].name}</span>
            </span>
            <div className="pill-row">
              {SPEEDS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className="pill pill--40 pill--14"
                  aria-label={`Vitesse du temps ×${speed}`}
                  aria-pressed={simulator.speed === speed}
                  onClick={() => controller.setSpeed(speed)}
                >
                  ×{speed}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section label="Températures">
        <div className="auto-card">
          <div className="grid-2 grid-2--wide">
            <Stepper
              label="Extérieur"
              value={formatTemp(outdoor)}
              canDecrease={outdoor > -20}
              canIncrease={outdoor < 45}
              onStep={(delta) => controller.setOutdoorTemp(Math.round(outdoor) + delta)}
            />
            <Stepper
              label="Pièce"
              value={formatTemp(clim.roomTemp)}
              canDecrease={clim.roomTemp > 5}
              canIncrease={clim.roomTemp < 35}
              onStep={(delta) => controller.setRoomTemp(Math.round((clim.roomTemp + delta * 0.5) * 2) / 2)}
            />
          </div>
        </div>
      </Section>

      <Section label="Clim simulée">
        <div className="card card--tight rows">
          <div className="row row--flex">
            <span className="row__title row__title--compact">Activité</span>
            <span className="sim-value">{ACTIVITY_LABEL[clim.activity]}</span>
          </div>
          <div className="row row--flex">
            <span className="row__title row__title--compact">Compresseur</span>
            <span className="sim-value">{Math.round(clim.output * 100)} %</span>
          </div>
        </div>
      </Section>

      <button type="button" className="action" onClick={() => controller.resetSimulator()}>
        Réinitialiser le simulateur
      </button>
    </main>
  );
}
