import { describe, expect, it } from 'vitest';
import {
  applyDayToWeek,
  dayIndexOf,
  daySegments,
  defaultSchedule,
  describeDay,
  describeEvent,
  eventsBetween,
  isSameAllWeek,
  nextEvent,
  removeSlot,
  saveSlot,
  type Schedule,
} from './schedule';

const at = (hour: number, minute = 0, day = 15): number => new Date(2026, 10, day, hour, minute).getTime();
const weekly = (): Schedule => ({ ...defaultSchedule(), weeklyEnabled: true });

describe('programme hebdomadaire', () => {
  it('place le lundi en premier', () => {
    expect(dayIndexOf(at(12))).toBe(6);
    expect(dayIndexOf(at(12, 0, 16))).toBe(0);
  });

  it('décrit les périodes de marche de la journée', () => {
    const { days } = defaultSchedule();
    expect(daySegments(days, 6)).toEqual([
      { start: 480, end: 750 },
      { start: 1050, end: 1380 },
    ]);
    expect(describeDay(days, 6)).toBe('Allumée de 08:00 à 12:30, puis de 17:30 à 23:00');
  });

  it('hérite de l’état de la veille quand la journée commence allumée', () => {
    const base = defaultSchedule();
    const days = base.days.map((slots, index) => (index === 5 ? slots.slice(0, 3) : index === 6 ? [] : slots));
    expect(describeDay(days, 6)).toBe('Allumée toute la journée');
    expect(
      describeDay(
        days.map(() => []),
        2,
      ),
    ).toBe('Éteinte toute la journée');
  });

  it('limite une journée à 4 créneaux', () => {
    const schedule = defaultSchedule();
    const extra = { id: 'extra', minute: 600, action: 'off' as const, temp: null };
    expect(saveSlot(schedule, 0, extra)).toBe(schedule);
    const lighter = removeSlot(schedule, 0, schedule.days[0][0].id);
    expect(saveSlot(lighter, 0, extra).days[0].map((slot) => slot.minute)).toEqual([600, 750, 1050, 1380]);
  });

  it('joue les créneaux dans l’intervalle demandé', () => {
    const events = eventsBetween(weekly(), at(7, 59), at(12, 30));
    expect(events.map((event) => [event.action, event.temp])).toEqual([
      ['on', 21],
      ['off', null],
    ]);
    expect(eventsBetween(defaultSchedule(), at(7, 59), at(12, 30))).toEqual([]);
  });

  it('donne la priorité à la minuterie simple', () => {
    const schedule: Schedule = { ...weekly(), timerOff: { enabled: true, minute: 9 * 60 } };
    const events = eventsBetween(schedule, at(7, 59), at(12, 30));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'off', source: 'timer-off', at: at(9) });
  });

  it('annonce le prochain événement', () => {
    const tonight = nextEvent(weekly(), at(18));
    expect(tonight && describeEvent(tonight, at(18))).toBe('arrêt à 23:00');
    const tomorrow = nextEvent(weekly(), at(23, 30));
    expect(tomorrow && describeEvent(tomorrow, at(23, 30))).toBe('marche demain à 08:00');
    expect(nextEvent(defaultSchedule(), at(18))).toBeNull();
  });

  it('applique les créneaux d’un jour aux six autres', () => {
    const base = defaultSchedule();
    const edited = saveSlot(removeSlot(base, 2, base.days[2][3].id), 2, {
      ...base.days[2][0],
      minute: 6 * 60,
      temp: 20,
    });
    expect(isSameAllWeek(base, 2)).toBe(true);
    expect(isSameAllWeek(edited, 2)).toBe(false);

    const applied = applyDayToWeek(edited, 2);
    expect(isSameAllWeek(applied, 2)).toBe(true);
    expect(applied.days[2]).toBe(edited.days[2]);
    for (const slots of applied.days) {
      expect(slots.map(({ minute, action, temp }) => [minute, action, temp])).toEqual([
        [6 * 60, 'on', 20],
        [12 * 60 + 30, 'off', null],
        [17 * 60 + 30, 'on', 21],
      ]);
    }
    expect(new Set(applied.days.flat().map((slot) => slot.id)).size).toBe(21);
    expect(applied).toMatchObject({
      weeklyEnabled: base.weeklyEnabled,
      timerOn: base.timerOn,
      timerOff: base.timerOff,
    });
  });
});
