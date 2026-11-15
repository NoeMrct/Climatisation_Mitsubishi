import type { CSSProperties } from 'react';
import { leadLabel, type LeadMinutes, type NotificationPrefs } from '../domain/notify';
import { useApp, useController } from '../store/hooks';
import { Section, SubHeader, Switch } from '../ui/controls';
import { LINKS } from '../ui/hooks';
import { NotifCard } from '../ui/notifications';

const LEADS: LeadMinutes[] = [15, 30, 60];
const ON_CARD = { '--pill-off': 'var(--s1)' } as CSSProperties;

interface PrefRowProps {
  title: string;
  sub: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function PrefRow({ title, sub, checked, onChange }: PrefRowProps) {
  return (
    <div className="row row--flex">
      <span className="row__text">
        <span className="row__title">{title}</span>
        <span className="row__sub">{sub}</span>
      </span>
      <Switch label={title} checked={checked} onChange={onChange} />
    </div>
  );
}

export function NotificationSettings() {
  const { notificationPrefs: prefs, permission, regulation } = useApp();
  const controller = useController();
  const set = (patch: Partial<NotificationPrefs>): void => controller.setNotificationPrefs(patch);

  return (
    <main className="screen screen--tight">
      <SubHeader title="Notifications" back={LINKS.auto} backLabel="Retour à la régulation" />

      <Section label="Prévision">
        <div className="card card--tight rows">
          <PrefRow
            title="Prévenir à l’avance"
            sub="Avant chaque déclenchement prévu"
            checked={prefs.forecast}
            onChange={(forecast) => set({ forecast })}
          />
          <div className="lead-row" style={{ opacity: prefs.forecast ? 1 : 0.4 }}>
            <span className="lead-row__label">Délai</span>
            <div className="pill-row">
              {LEADS.map((lead) => (
                <button
                  key={lead}
                  type="button"
                  className="pill pill--40 pill--14"
                  aria-pressed={prefs.lead === lead}
                  onClick={() => set({ lead })}
                >
                  {leadLabel(lead)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section label="Événements">
        <div className="card card--tight rows">
          <PrefRow
            title="Lancement automatique"
            sub="Chauffage ou froid qui démarre seul"
            checked={prefs.onStart}
            onChange={(onStart) => set({ onStart })}
          />
          <PrefRow
            title="Objectif atteint"
            sub="La clim se coupe"
            checked={prefs.onStop}
            onChange={(onStop) => set({ onStop })}
          />
        </div>
      </Section>

      <Section label="Recevoir sur">
        <div className="grid-2" style={ON_CARD}>
          <button
            type="button"
            className="pill pill--48 pill--14"
            aria-pressed={prefs.phone}
            onClick={() => set({ phone: !prefs.phone })}
          >
            Téléphone
          </button>
          <button
            type="button"
            className="pill pill--48 pill--14"
            aria-pressed={prefs.pc}
            onClick={() => set({ pc: !prefs.pc })}
          >
            PC
          </button>
        </div>
      </Section>

      <Section label="La nuit">
        <div className="card card--tight rows">
          <PrefRow
            title="Ne pas déranger"
            sub="Notifications muettes de 22:30 à 07:00"
            checked={prefs.quiet}
            onChange={(quiet) => set({ quiet })}
          />
        </div>
      </Section>

      <Section label="Aperçu">
        <div className="fade" style={{ opacity: prefs.forecast ? 1 : 0.4 }}>
          <NotifCard
            mode="heat"
            when="exemple"
            title="Chauffage prévu vers 17:40"
            body={`La pièce passera sous ${regulation.heat.low}° d’ici ${leadLabel(prefs.lead)}. Il fait 4° dehors.`}
          />
        </div>
      </Section>

      {permission === 'default' && (
        <p className="note">
          Hors de l’appli, les notifications passent par le navigateur.{' '}
          <button type="button" className="text-button" onClick={() => void controller.requestNotifications()}>
            Autoriser
          </button>
        </p>
      )}
      {permission === 'denied' && (
        <p className="note">Notifications bloquées dans le navigateur : les bannières restent visibles dans l’appli.</p>
      )}
    </main>
  );
}
