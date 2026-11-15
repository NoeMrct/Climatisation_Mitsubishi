import type { CSSProperties } from 'react';
import { POSTPONE_MS } from '../domain/forecast';
import { forecastText } from '../domain/notify';
import { useApp, useController } from '../store/hooks';
import { forecastDetail } from '../store/view';
import { SubHeader } from '../ui/controls';
import { ForecastChart } from '../ui/ForecastChart';
import { navigate } from '../ui/hooks';
import { NotifTitle } from '../ui/notifications';
import { LINKS } from '../ui/routes';

const EVENING_HOUR = 17;

export function Forecast() {
  const snapshot = useApp();
  const controller = useController();
  const detail = forecastDetail(snapshot);
  const header = <SubHeader title="Prévision" back={LINKS.auto} backLabel="Retour à la régulation" />;

  if (!detail) {
    return (
      <main className="screen screen--tight">
        {header}
        <p className="summary">Aucun démarrage prévu pour l’instant.</p>
      </main>
    );
  }

  const { mode } = detail.prediction;
  const heat = mode === 'heat';
  const text = forecastText(detail.prediction, detail.outdoor);
  const evening = new Date(snapshot.now).getHours() >= EVENING_HOUR;
  const accent = { '--notif-acc': heat ? 'var(--heat)' : 'var(--cool)' } as CSSProperties;

  return (
    <main className="screen screen--tight">
      {header}
      <article className="fcard" style={accent}>
        <div className="fcard__text">
          <NotifTitle mode={mode} title={text.title} large />
          <div className="notif__body">{text.detail}</div>
        </div>
        <div className="fcard__chart">
          <ForecastChart detail={detail} />
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
        <div className="actions">
          <button
            type="button"
            className="action action--primary"
            onClick={() => {
              controller.startNow();
              navigate('home');
            }}
          >
            Démarrer maintenant
          </button>
          <div className="grid-2">
            <button
              type="button"
              className="action"
              onClick={() => {
                controller.postpone(POSTPONE_MS);
                navigate('auto');
              }}
            >
              Reporter d’1 h
            </button>
            <button
              type="button"
              className="action"
              onClick={() => {
                controller.skipUntilMorning();
                navigate('auto');
              }}
            >
              {evening ? 'Pas ce soir' : 'Pas aujourd’hui'}
            </button>
          </div>
        </div>
      </article>
    </main>
  );
}
