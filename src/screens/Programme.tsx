import { useState } from 'react';
import { SETPOINT_RANGE, currentSetpoint, hasSetpoint } from '../domain/capabilities';
import { formatMinute, formatTemp } from '../domain/format';
import {
  DAYS,
  applyDayToWeek,
  canAddSlot,
  dayIndexOf,
  daySegments,
  describeDay,
  isSameAllWeek,
  newSlotId,
  removeSlot,
  saveSlot,
  type OneShotTimer,
  type Slot,
} from '../domain/schedule';
import { useApp, useController } from '../store/hooks';
import { Section, Stepper, SubHeader, Switch, TimeField } from '../ui/controls';
import { Icon } from '../ui/icons';
import { DayBar } from '../ui/panels';
import { LINKS } from '../ui/routes';
import { Sheet } from '../ui/Sheet';

interface SlotSheetProps {
  initial: Slot;
  isNew: boolean;
  range: { min: number; max: number };
  defaultTemp: number;
  onSave: (slot: Slot) => void;
  onDelete: () => void;
  onClose: () => void;
}

function SlotSheet({ initial, isNew, range, defaultTemp, onSave, onDelete, onClose }: SlotSheetProps) {
  const [slot, setSlot] = useState(initial);
  const temp = slot.temp ?? defaultTemp;
  return (
    <Sheet label={isNew ? 'Nouveau créneau' : 'Créneau'} onClose={onClose}>
      <div className="fcard">
        <div className="fcard__head">
          <h2 className="sheet__title">{isNew ? 'Nouveau créneau' : 'Créneau'}</h2>
          <button type="button" className="sheet__close" aria-label="Fermer" onClick={onClose}>
            <Icon name="close" size={16} strokeWidth={1.8} />
          </button>
        </div>
        <div className="sheet__row">
          <span className="sheet__label">Heure</span>
          <TimeField
            label="Heure du créneau"
            minute={slot.minute}
            onChange={(minute) => setSlot({ ...slot, minute })}
          />
        </div>
        <div className="grid-2">
          <button
            type="button"
            className="pill pill--14"
            aria-pressed={slot.action === 'on'}
            onClick={() => setSlot({ ...slot, action: 'on', temp })}
          >
            Marche
          </button>
          <button
            type="button"
            className="pill pill--14"
            aria-pressed={slot.action === 'off'}
            onClick={() => setSlot({ ...slot, action: 'off', temp: null })}
          >
            Arrêt
          </button>
        </div>
        {slot.action === 'on' && (
          <Stepper
            label="Consigne"
            value={formatTemp(temp)}
            canDecrease={temp > range.min}
            canIncrease={temp < range.max}
            onStep={(delta) => setSlot({ ...slot, temp: temp + delta })}
          />
        )}
        <div className="actions">
          <button type="button" className="action action--light" onClick={() => onSave(slot)}>
            Enregistrer
          </button>
          {!isNew && (
            <button type="button" className="action" onClick={onDelete}>
              Supprimer
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

interface CopySheetProps {
  dayName: string;
  onConfirm: () => void;
  onClose: () => void;
}

function CopySheet({ dayName, onConfirm, onClose }: CopySheetProps) {
  return (
    <Sheet label="Appliquer aux autres jours" onClose={onClose}>
      <div className="fcard">
        <div className="fcard__head">
          <h2 className="sheet__title">Appliquer aux autres jours</h2>
          <button type="button" className="sheet__close" aria-label="Fermer" onClick={onClose}>
            <Icon name="close" size={16} strokeWidth={1.8} />
          </button>
        </div>
        <div className="notif__body">
          Les créneaux du {dayName.toLowerCase()} remplaceront ceux des six autres jours de la semaine.
        </div>
        <div className="actions">
          <button type="button" className="action action--light" onClick={onConfirm}>
            Appliquer
          </button>
          <button type="button" className="action" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function Programme() {
  const { schedule, now, clim } = useApp();
  const controller = useController();
  const [day, setDay] = useState(() => dayIndexOf(now));
  const [editing, setEditing] = useState<{ slot: Slot; isNew: boolean } | null>(null);
  const [copying, setCopying] = useState(false);

  const { settings } = clim;
  const range = SETPOINT_RANGE[hasSetpoint(settings.mode) ? settings.mode : 'heat'];
  const defaultTemp = currentSetpoint(settings) ?? 21;
  const slots = schedule.days[day];

  const setTimer = (key: 'timerOn' | 'timerOff', patch: Partial<OneShotTimer>): void =>
    controller.setSchedule({ ...schedule, [key]: { ...schedule[key], ...patch } });

  const timers: { key: 'timerOn' | 'timerOff'; name: string }[] = [
    { key: 'timerOn', name: 'Mise en marche' },
    { key: 'timerOff', name: 'Arrêt' },
  ];

  return (
    <main className="screen">
      <SubHeader title="Programmation" back={LINKS.home} backLabel="Retour à l’accueil" />

      <Section label="Minuterie">
        <div className="card card--tight rows">
          {timers.map(({ key, name }) => (
            <div key={key} className="timer-row">
              <span className="row__text">
                <span className="row__title">{name}</span>
                <span className="row__sub">Une seule fois</span>
              </span>
              <TimeField
                label={`${name}, régler l’heure`}
                minute={schedule[key].minute}
                active={schedule[key].enabled}
                onChange={(minute) => setTimer(key, { minute })}
              />
              <Switch label={name} checked={schedule[key].enabled} onChange={(enabled) => setTimer(key, { enabled })} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        label="Programme hebdomadaire"
        right={
          <Switch
            label="Programme hebdomadaire"
            checked={schedule.weeklyEnabled}
            onChange={(weeklyEnabled) => controller.setSchedule({ ...schedule, weeklyEnabled })}
          />
        }
      >
        <div className="days">
          {DAYS.map((item, index) => (
            <button
              key={item.name}
              type="button"
              className="day"
              aria-label={item.name}
              aria-pressed={index === day}
              onClick={() => setDay(index)}
            >
              {item.letter}
            </button>
          ))}
        </div>
        <div className="timeline">
          <div className="timeline__text">{describeDay(schedule.days, day)}</div>
          <DayBar segments={daySegments(schedule.days, day)} />
        </div>
        <div className="card card--tight rows">
          {slots.map((slot) => {
            const on = slot.action === 'on';
            const temp = on && slot.temp !== null ? `${formatTemp(slot.temp)}°` : '';
            const time = formatMinute(slot.minute);
            return (
              <button
                key={slot.id}
                type="button"
                className="slot"
                aria-label={on ? `${time}, marche à ${temp}` : `${time}, arrêt`}
                onClick={() => setEditing({ slot, isNew: false })}
              >
                <span className="slot__time">{time}</span>
                <span className={on ? 'tag tag--on' : 'tag'}>{on ? 'Marche' : 'Arrêt'}</span>
                <span className="slot__temp">{temp}</span>
                <span className="row__chevron">
                  <Icon name="right" size={18} strokeWidth={1.8} />
                </span>
              </button>
            );
          })}
          {canAddSlot(schedule, day) && (
            <button
              type="button"
              className="slot slot--add"
              onClick={() =>
                setEditing({ slot: { id: newSlotId(), minute: 12 * 60, action: 'on', temp: defaultTemp }, isNew: true })
              }
            >
              <Icon name="plus" size={20} strokeWidth={1.8} />
              <span>Ajouter un créneau</span>
            </button>
          )}
        </div>
        {!isSameAllWeek(schedule, day) && (
          <button type="button" className="action" onClick={() => setCopying(true)}>
            Appliquer aux autres jours
          </button>
        )}
        <p className="note">Jusqu’à 4 créneaux par jour, soit 28 par semaine.</p>
      </Section>

      {editing && (
        <SlotSheet
          key={editing.slot.id}
          initial={editing.slot}
          isNew={editing.isNew}
          range={range}
          defaultTemp={defaultTemp}
          onSave={(slot) => {
            controller.setSchedule(saveSlot(schedule, day, slot));
            setEditing(null);
          }}
          onDelete={() => {
            controller.setSchedule(removeSlot(schedule, day, editing.slot.id));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {copying && (
        <CopySheet
          dayName={DAYS[day].name}
          onConfirm={() => {
            controller.setSchedule(applyDayToWeek(schedule, day));
            setCopying(false);
          }}
          onClose={() => setCopying(false)}
        />
      )}
    </main>
  );
}
