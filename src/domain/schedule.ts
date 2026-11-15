import { MAX_SLOTS_PER_DAY } from './capabilities';
import { formatMinute } from './format';

export type SlotAction = 'on' | 'off';

export interface Slot {
  id: string;
  minute: number;
  action: SlotAction;
  temp: number | null;
}

export interface OneShotTimer {
  enabled: boolean;
  minute: number;
}

export interface Schedule {
  weeklyEnabled: boolean;
  days: Slot[][];
  timerOn: OneShotTimer;
  timerOff: OneShotTimer;
}

export const DAYS = [
  { letter: 'L', name: 'Lundi' },
  { letter: 'M', name: 'Mardi' },
  { letter: 'M', name: 'Mercredi' },
  { letter: 'J', name: 'Jeudi' },
  { letter: 'V', name: 'Vendredi' },
  { letter: 'S', name: 'Samedi' },
  { letter: 'D', name: 'Dimanche' },
] as const;

export const MINUTES_PER_DAY = 1440;

let slotCounter = 0;

export const newSlotId = (): string => `s${Date.now().toString(36)}${(slotCounter++).toString(36)}`;

const exampleDay = (): Slot[] => [
  { id: newSlotId(), minute: 8 * 60, action: 'on', temp: 21 },
  { id: newSlotId(), minute: 12 * 60 + 30, action: 'off', temp: null },
  { id: newSlotId(), minute: 17 * 60 + 30, action: 'on', temp: 21 },
  { id: newSlotId(), minute: 23 * 60, action: 'off', temp: null },
];

export function defaultSchedule(): Schedule {
  return {
    weeklyEnabled: false,
    days: DAYS.map(exampleDay),
    timerOn: { enabled: false, minute: 6 * 60 + 30 },
    timerOff: { enabled: false, minute: 23 * 60 + 30 },
  };
}

export const dayIndexOf = (timestamp: number): number => (new Date(timestamp).getDay() + 6) % 7;

function startOfDay(timestamp: number, offsetDays = 0): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.getTime();
}

function atMinute(dayStart: number, minute: number): number {
  const date = new Date(dayStart);
  date.setHours(0, minute, 0, 0);
  return date.getTime();
}

export const sortSlots = (slots: readonly Slot[]): Slot[] => [...slots].sort((a, b) => a.minute - b.minute);

export const canAddSlot = (schedule: Schedule, day: number): boolean => schedule.days[day].length < MAX_SLOTS_PER_DAY;

export function saveSlot(schedule: Schedule, day: number, slot: Slot): Schedule {
  const current = schedule.days[day];
  const exists = current.some((item) => item.id === slot.id);
  if (!exists && current.length >= MAX_SLOTS_PER_DAY) return schedule;
  const next = exists ? current.map((item) => (item.id === slot.id ? slot : item)) : [...current, slot];
  return { ...schedule, days: schedule.days.map((slots, index) => (index === day ? sortSlots(next) : slots)) };
}

const sameSlots = (a: readonly Slot[], b: readonly Slot[]): boolean =>
  a.length === b.length &&
  a.every((slot, index) => {
    const other = b[index];
    return slot.minute === other.minute && slot.action === other.action && slot.temp === other.temp;
  });

export const isSameAllWeek = (schedule: Schedule, day: number): boolean =>
  schedule.days.every((slots) => sameSlots(sortSlots(slots), sortSlots(schedule.days[day])));

export function applyDayToWeek(schedule: Schedule, day: number): Schedule {
  const source = schedule.days[day];
  return {
    ...schedule,
    days: schedule.days.map((slots, index) =>
      index === day ? slots : source.map((slot) => ({ ...slot, id: newSlotId() })),
    ),
  };
}

export function removeSlot(schedule: Schedule, day: number, id: string): Schedule {
  return {
    ...schedule,
    days: schedule.days.map((slots, index) => (index === day ? slots.filter((s) => s.id !== id) : slots)),
  };
}

function inheritedState(days: readonly Slot[][], day: number): boolean {
  for (let back = 1; back <= 7; back += 1) {
    const slots = sortSlots(days[(day - back + 7) % 7]);
    const last = slots[slots.length - 1];
    if (last) return last.action === 'on';
  }
  return false;
}

export interface Segment {
  start: number;
  end: number;
}

export function daySegments(days: readonly Slot[][], day: number): Segment[] {
  const segments: Segment[] = [];
  let on = inheritedState(days, day);
  let since = 0;
  for (const slot of sortSlots(days[day])) {
    if (slot.action === 'on' && !on) {
      on = true;
      since = slot.minute;
    } else if (slot.action === 'off' && on) {
      on = false;
      if (slot.minute > since) segments.push({ start: since, end: slot.minute });
    }
  }
  if (on) segments.push({ start: since, end: MINUTES_PER_DAY });
  return segments;
}

const bound = (minute: number): string =>
  minute === 0 || minute === MINUTES_PER_DAY ? 'minuit' : formatMinute(minute);

export function describeDay(days: readonly Slot[][], day: number): string {
  const segments = daySegments(days, day);
  if (segments.length === 0) return 'Éteinte toute la journée';
  if (segments.length === 1 && segments[0].start === 0 && segments[0].end === MINUTES_PER_DAY)
    return 'Allumée toute la journée';
  return `Allumée ${segments.map((s) => `de ${bound(s.start)} à ${bound(s.end)}`).join(', puis ')}`;
}

export interface ScheduleEvent {
  at: number;
  action: SlotAction;
  temp: number | null;
  source: 'timer-on' | 'timer-off' | 'weekly';
}

function upcoming(schedule: Schedule, from: number): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const timerArmed = schedule.timerOn.enabled || schedule.timerOff.enabled;

  const pushTimer = (timer: OneShotTimer, source: 'timer-on' | 'timer-off'): void => {
    if (!timer.enabled) return;
    const today = atMinute(startOfDay(from), timer.minute);
    const at = today > from ? today : atMinute(startOfDay(from, 1), timer.minute);
    events.push({ at, action: source === 'timer-on' ? 'on' : 'off', temp: null, source });
  };
  pushTimer(schedule.timerOn, 'timer-on');
  pushTimer(schedule.timerOff, 'timer-off');

  if (schedule.weeklyEnabled && !timerArmed) {
    for (let offset = 0; offset <= 7; offset += 1) {
      const dayStart = startOfDay(from, offset);
      for (const slot of schedule.days[dayIndexOf(dayStart)]) {
        const at = atMinute(dayStart, slot.minute);
        if (at > from) events.push({ at, action: slot.action, temp: slot.temp, source: 'weekly' });
      }
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

export const eventsBetween = (schedule: Schedule, from: number, to: number): ScheduleEvent[] =>
  upcoming(schedule, from).filter((event) => event.at <= to);

export const nextEvent = (schedule: Schedule, now: number): ScheduleEvent | null => upcoming(schedule, now)[0] ?? null;

export function describeEvent(event: ScheduleEvent, now: number): string {
  const verb = event.action === 'on' ? 'marche' : 'arrêt';
  const days = Math.round((startOfDay(event.at) - startOfDay(now)) / 86_400_000);
  const time = formatMinute(new Date(event.at).getHours() * 60 + new Date(event.at).getMinutes());
  if (days <= 0) return `${verb} à ${time}`;
  if (days === 1) return `${verb} demain à ${time}`;
  return `${verb} ${DAYS[dayIndexOf(event.at)].name.toLowerCase()} à ${time}`;
}
