import type { ClimDevice, DeviceKind } from '../device/ClimDevice';
import { SimClock, type Clock } from '../device/clock';
import { SimulatedClim, type SimSnapshot } from '../device/SimulatedClim';
import { DEFAULT_SETTINGS } from '../domain/clim';
import {
  DEFAULT_THERMAL,
  fitLoss,
  hoursToReach,
  learnRate,
  predict,
  type Prediction,
  type Sample,
  type ThermalModel,
} from '../domain/forecast';
import {
  DEFAULT_NOTIFICATION_PREFS,
  DEVICE_CLASSES,
  forecastText,
  isQuietTime,
  startText,
  stopText,
  type AppNotification,
  type NotificationKind,
  type NotificationPrefs,
  type NotificationText,
} from '../domain/notify';
import { activeRegulation } from '../domain/options';
import type { PushStatus } from '../domain/push';
import {
  DEFAULT_REGULATION,
  IDLE_RUNTIME,
  decide,
  targetOf,
  triggerOf,
  type AutoMode,
  type AutoSession,
  type RegulationRuntime,
  type RegulationSettings,
} from '../domain/regulation';
import { defaultSchedule, eventsBetween, nextEvent, type Schedule, type ScheduleEvent } from '../domain/schedule';
import type { ClimCommand, ClimState } from '../domain/types';
import { browserStore, loadState, saveState, type KeyValueStore, type PersistedState } from './storage';

const TICK_MS = 1000;
const SAVE_EVERY_MS = 5000;
const SAMPLE_EVERY_MS = 60_000;
const HISTORY_MS = 3 * 3_600_000;
const IDLE_WINDOW_MS = 2 * 3_600_000;
const CHART_WINDOW_MS = 45 * 60_000;
const HOUR_MS = 3_600_000;
const FORECAST_QUIET_LEADS = 2;

export const MANUAL_PAUSE_MS = HOUR_MS;

const FIRST_ROOM: SimSnapshot = { settings: DEFAULT_SETTINGS, roomTemp: 19.5, outdoorTemp: 4 };
const firstRuntime = (now: number): RegulationRuntime => ({
  session: { mode: 'heat', startedAt: now - 15 * 60_000, startTemp: 18.9 },
  pausedUntil: null,
  lastStop: null,
});

export interface Snapshot {
  now: number;
  clim: ClimState;
  device: { kind: DeviceKind; label: string };
  regulation: RegulationSettings;
  session: AutoSession | null;
  pausedUntil: number | null;
  prediction: Prediction | null;
  history: Sample[];
  notificationPrefs: NotificationPrefs;
  push: PushStatus;
  schedule: Schedule;
  nextEvent: ScheduleEvent | null;
  thermal: ThermalModel;
  simulator: { speed: number } | null;
}

type Announcer = (notification: AppNotification) => void;

export interface ControllerOptions {
  device: ClimDevice;
  clock: Clock;
  store: KeyValueStore;
  simulator?: { device: SimulatedClim; clock: SimClock } | null;
  saved?: PersistedState | null;
  runtime?: RegulationRuntime;
  announce?: Announcer;
}

export class AppController {
  private readonly device: ClimDevice;
  private readonly clock: Clock;
  private readonly store: KeyValueStore;
  private readonly sim: { device: SimulatedClim; clock: SimClock } | null;
  private readonly announce: Announcer;
  private readonly listeners = new Set<() => void>();

  private regulation: RegulationSettings;
  private runtime: RegulationRuntime;
  private prefs: NotificationPrefs;
  private schedule: Schedule;
  private thermal: ThermalModel;
  private history: Sample[] = [];
  private idle: Sample[] = [];
  private prediction: Prediction | null = null;
  private forecastSent = false;
  private forecastQuietUntil = Number.NEGATIVE_INFINITY;
  private lastTick: number;
  private lastSampleAt = Number.NEGATIVE_INFINITY;
  private lastSavedAt = 0;
  private needsSave = false;
  private depth = 0;
  private dirty = false;
  private snapshot: Snapshot;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(options: ControllerOptions) {
    const saved = options.saved ?? null;
    this.device = options.device;
    this.clock = options.clock;
    this.store = options.store;
    this.sim = options.simulator ?? null;
    this.announce = options.announce ?? (() => {});
    this.regulation = saved?.regulation ?? DEFAULT_REGULATION;
    this.runtime = options.runtime ?? saved?.runtime ?? IDLE_RUNTIME;
    this.prefs = saved?.notifications ?? DEFAULT_NOTIFICATION_PREFS;
    this.schedule = saved?.schedule ?? defaultSchedule();
    this.thermal = saved?.thermal ?? DEFAULT_THERMAL;
    this.lastTick = this.clock.now();
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Snapshot => this.snapshot;

  start(): void {
    if (this.timer !== null) return;
    this.unsubscribe = this.device.subscribe(() => this.touch());
    this.timer = setInterval(() => this.tick(), TICK_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    this.tick();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.save();
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.tick();
    else this.save();
  };

  tick(): void {
    this.batch(() => {
      const now = this.clock.now();
      this.device.tick?.(now);
      this.runSchedule(now);
      this.sample(now);
      this.regulate(now);
      this.forecast(now);
      this.lastTick = now;
      if (this.needsSave || Date.now() - this.lastSavedAt >= SAVE_EVERY_MS) this.save();
    });
  }

  private runSchedule(now: number): void {
    const events = eventsBetween(this.schedule, this.lastTick, now);
    if (events.length === 0) return;
    this.needsSave = true;

    for (const event of events) {
      if (event.source === 'timer-on')
        this.schedule = { ...this.schedule, timerOn: { ...this.schedule.timerOn, enabled: false } };
      if (event.source === 'timer-off')
        this.schedule = { ...this.schedule, timerOff: { ...this.schedule.timerOff, enabled: false } };
    }

    const last = events[events.length - 1];
    this.applyManual({ type: 'power', on: last.action === 'on' }, now);
    if (last.action === 'on' && last.temp !== null) this.applyManual({ type: 'setpoint', value: last.temp }, now);
  }

  private sample(now: number): void {
    if (now - this.lastSampleAt < SAMPLE_EVERY_MS) return;
    this.lastSampleAt = now;
    const state = this.device.getState();
    const sample: Sample = { at: now, temp: state.roomTemp };
    this.history = [...this.history.filter((item) => item.at > now - HISTORY_MS), sample];
    if (state.settings.power) {
      this.idle = [];
      return;
    }
    this.idle = [...this.idle.filter((item) => item.at > now - IDLE_WINDOW_MS), sample];
    if (state.outdoorTemp === null) return;
    const loss = fitLoss(this.idle, state.outdoorTemp);
    if (loss !== null) this.thermal = { ...this.thermal, loss };
  }

  private activeRegulation(): RegulationSettings {
    return activeRegulation(this.regulation, this.device.getState().settings);
  }

  private regulate(now: number): void {
    const state = this.device.getState();

    const session = this.runtime.session;
    if (session && (!state.settings.power || state.settings.mode !== session.mode)) {
      this.runtime = { ...this.runtime, session: null };
    }
    const decision = decide(this.activeRegulation(), this.runtime, {
      now,
      roomTemp: state.roomTemp,
      power: state.settings.power,
    });
    if (decision.type === 'start') this.startAuto(decision.mode, now, true);
    else if (decision.type === 'stop') this.stopAuto(now);
  }

  private startAuto(mode: AutoMode, now: number, announce: boolean): void {
    const before = this.device.getState();
    const target = targetOf(this.activeRegulation(), mode);
    this.needsSave = true;
    void this.device.send({ type: 'mode', mode });
    void this.device.send({ type: 'setpoint', value: targetOf(this.regulation, mode) });
    void this.device.send({ type: 'power', on: true });
    this.runtime = {
      ...this.runtime,
      session: { mode, startedAt: now, startTemp: before.roomTemp },
      pausedUntil: null,
    };
    this.prediction = null;
    this.forecastSent = false;
    this.forecastQuietUntil = Number.NEGATIVE_INFINITY;
    this.idle = [];
    if (announce && this.prefs.onStart) {
      this.notify('start', now, startText(mode, before.roomTemp, target, before.outdoorTemp));
    }
  }

  private stopAuto(now: number): void {
    const session = this.runtime.session;
    if (!session) return;
    const state = this.device.getState();
    const target = targetOf(this.activeRegulation(), session.mode);
    const duration = now - session.startedAt;
    this.needsSave = true;
    void this.device.send({ type: 'power', on: false });
    this.thermal = learnRate(this.thermal, session.mode, state.roomTemp - session.startTemp, duration);
    this.runtime = { ...this.runtime, session: null, lastStop: { mode: session.mode, at: now } };
    this.idle = [];
    this.forecastSent = false;

    const reached = session.mode === 'heat' ? state.roomTemp >= target - 0.05 : state.roomTemp <= target + 0.05;
    if (!reached || !this.prefs.onStop) return;
    const hours =
      session.mode === 'heat' && state.outdoorTemp !== null
        ? hoursToReach(state.roomTemp, triggerOf(this.activeRegulation(), 'heat'), state.outdoorTemp, this.thermal.loss)
        : null;
    const nextStartAt = hours === null ? null : now + hours * HOUR_MS;
    this.notify('stop', now, stopText(session.mode, target, duration, state.outdoorTemp, nextStartAt));
  }

  private forecast(now: number): void {
    const state = this.device.getState();
    const paused = this.runtime.pausedUntil !== null && now < this.runtime.pausedUntil;
    const watching = !state.settings.power && this.runtime.session === null && !paused;
    const prediction = watching
      ? predict({
          regulation: this.activeRegulation(),
          roomTemp: state.roomTemp,
          outdoor: state.outdoorTemp,
          model: this.thermal,
          now,
        })
      : null;
    this.prediction = prediction;

    if (!prediction || prediction.minutes > this.prefs.lead * 1.5) this.forecastSent = false;
    if (!prediction) return;
    const due = prediction.minutes <= this.prefs.lead && prediction.minutes >= 2;
    if (!this.prefs.forecast || this.forecastSent || !due || now < this.forecastQuietUntil) return;
    this.forecastSent = true;
    this.forecastQuietUntil = now + this.prefs.lead * FORECAST_QUIET_LEADS * 60_000;
    this.notify('forecast', now, forecastText(prediction, state.outdoorTemp));
  }

  private notify(kind: NotificationKind, at: number, { title, body }: NotificationText): void {
    const devices = DEVICE_CLASSES.filter((device) => this.prefs[device]);
    if (devices.length === 0) return;
    this.announce({ kind, at, title, body, silent: isQuietTime(this.prefs, at), devices });
  }

  command(command: ClimCommand): void {
    this.act((now) => this.applyManual(command, now));
  }

  private applyManual(command: ClimCommand, now: number): void {
    const session = this.runtime.session;
    if (command.type === 'power') {
      this.idle = [];
      this.forecastSent = false;
      if (command.on) {
        const mode = this.device.getState().settings.mode;
        if (this.regulation.enabled && (mode === 'heat' || mode === 'cool') && this.regulation[mode].enabled) {
          this.startAuto(mode, now, false);
          return;
        }
        this.runtime = { ...this.runtime, session: null, pausedUntil: null };
      } else {
        this.runtime = {
          session: null,
          lastStop: session ? { mode: session.mode, at: now } : this.runtime.lastStop,
          pausedUntil: this.regulation.enabled ? now + MANUAL_PAUSE_MS : null,
        };
      }
    } else if (session && (command.type === 'mode' || command.type === 'setpoint')) {
      this.runtime = { ...this.runtime, session: null };
    }
    void this.device.send(command);
  }

  setRegulation(next: RegulationSettings): void {
    this.act(() => {
      const wasEnabled = this.regulation.enabled;
      this.regulation = next;
      if (!next.enabled) this.runtime = { ...this.runtime, session: null, pausedUntil: null };
      else if (!wasEnabled) this.runtime = { ...this.runtime, pausedUntil: null };
      this.forecastSent = false;
    });
  }

  resumeRegulation(): void {
    this.act(() => {
      this.runtime = { ...this.runtime, pausedUntil: null };
    });
  }

  setNotificationPrefs(patch: Partial<NotificationPrefs>): void {
    this.act(() => {
      this.prefs = { ...this.prefs, ...patch };
      if (patch.lead !== undefined || patch.forecast !== undefined) this.forecastSent = false;
    });
  }

  setSchedule(next: Schedule): void {
    this.act(() => {
      this.schedule = next;
    });
  }

  startNow(): void {
    this.act((now) => {
      const mode = this.prediction?.mode;
      if (mode && !this.device.getState().settings.power) this.startAuto(mode, now, false);
    });
  }

  postpone(durationMs: number): void {
    this.act((now) => {
      this.pauseUntil(now + durationMs);
    });
  }

  skipUntilMorning(): void {
    this.act((now) => {
      const morning = new Date(now);
      if (morning.getHours() >= 6) morning.setDate(morning.getDate() + 1);
      morning.setHours(6, 0, 0, 0);
      this.pauseUntil(morning.getTime());
    });
  }

  private pauseUntil(until: number): void {
    this.runtime = { ...this.runtime, pausedUntil: until };
    this.prediction = null;
    this.forecastSent = false;
  }

  enablePush(): Promise<void> {
    return Promise.resolve();
  }

  disablePush(): Promise<void> {
    return Promise.resolve();
  }

  setOutdoorTemp(value: number): void {
    this.act(() => {
      this.sim?.device.setOutdoorTemp(Math.max(-20, Math.min(45, value)));
      this.idle = [];
      this.forecastSent = false;
    });
  }

  setRoomTemp(value: number): void {
    this.act(() => {
      this.sim?.device.setRoomTemp(Math.max(5, Math.min(35, value)));
      this.idle = [];
      this.forecastSent = false;
    });
  }

  setSpeed(speed: number): void {
    this.act(() => {
      this.sim?.clock.setSpeed(speed);
    });
  }

  resetSimulator(): void {
    if (!this.sim) return;
    const { device, clock } = this.sim;
    this.batch(() => {
      clock.reset(Date.now());
      const now = clock.now();
      device.reset(FIRST_ROOM, now);
      this.runtime = firstRuntime(now);
      this.thermal = DEFAULT_THERMAL;
      this.history = [];
      this.idle = [];
      this.prediction = null;
      this.forecastSent = false;
      this.forecastQuietUntil = Number.NEGATIVE_INFINITY;
      this.lastTick = now;
      this.lastSampleAt = Number.NEGATIVE_INFINITY;
      this.dirty = true;
      this.save();
    });
  }

  private act(action: (now: number) => void): void {
    this.batch(() => {
      const now = this.clock.now();
      action(now);
      this.forecast(now);
      this.dirty = true;
      this.save();
    });
  }

  private batch(work: () => void): void {
    this.depth += 1;
    try {
      work();
      this.dirty = true;
    } finally {
      this.depth -= 1;
      if (this.depth === 0 && this.dirty) this.publish();
    }
  }

  private touch(): void {
    if (this.depth > 0) this.dirty = true;
    else this.publish();
  }

  private publish(): void {
    this.dirty = false;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): Snapshot {
    const now = this.clock.now();
    const { pausedUntil } = this.runtime;
    return {
      now,
      clim: this.device.getState(),
      device: { kind: this.device.kind, label: this.device.label },
      regulation: this.regulation,
      session: this.runtime.session,
      pausedUntil: this.regulation.enabled && pausedUntil !== null && pausedUntil > now ? pausedUntil : null,
      prediction: this.prediction,
      history: this.history.filter((sample) => sample.at >= now - CHART_WINDOW_MS),
      notificationPrefs: this.prefs,
      push: 'unsupported',
      schedule: this.schedule,
      nextEvent: nextEvent(this.schedule, now),
      thermal: this.thermal,
      simulator: this.sim ? { speed: this.sim.clock.speed } : null,
    };
  }

  private save(): void {
    this.lastSavedAt = Date.now();
    this.needsSave = false;
    saveState(this.store, {
      regulation: this.regulation,
      runtime: this.runtime,
      notifications: this.prefs,
      schedule: this.schedule,
      thermal: this.thermal,
      simulator: this.sim ? { ...this.sim.device.snapshot(), clockOffset: this.sim.clock.offset } : null,
    });
  }
}

export function createApp(store: KeyValueStore = browserStore): AppController {
  const saved = loadState(store);
  const clock = new SimClock(Date.now() + (saved?.simulator?.clockOffset ?? 0));
  const now = clock.now();
  const device = new SimulatedClim(saved?.simulator ?? FIRST_ROOM, now);
  return new AppController({
    device,
    clock,
    store,
    simulator: { device, clock },
    saved,
    runtime: saved ? undefined : firstRuntime(now),
  });
}
