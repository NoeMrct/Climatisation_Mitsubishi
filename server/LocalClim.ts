import type { ClimDevice } from '../src/device/ClimDevice';
import {
  UNIT_TEMP_RANGE,
  buildCommand,
  readStatus,
  type Field,
  type UnitSettings,
  type UnitStatus,
} from '../src/device/mitsubishi';
import { hasSetpoint } from '../src/domain/capabilities';
import { DEFAULT_SETTINGS, applyCommand, settleOptions } from '../src/domain/clim';
import { effectiveFan, effectiveSetpoint } from '../src/domain/options';
import type { Activity, ClimCommand, ClimSettings, ClimState } from '../src/domain/types';
import { attempt } from '../src/lib/attempt';
import type { KeyValueStore } from '../src/store/storage';
import { exchange } from './smart';

const POLL_MS = 10_000;
const SETTLE_MS = 4000;
const FLUSH_MS = 150;
const MAX_FAILURES = 3;
const STORE_KEY = 'clim.local.v1';
const FIELDS: readonly Field[] = ['power', 'mode', 'temp', 'fan', 'vaneV', 'vaneH'];

export interface LocalClimOptions {
  pollMs?: number;
  settleMs?: number;
  flushMs?: number;
  store?: KeyValueStore;
}

interface Saved {
  settings: ClimSettings;
  synced: UnitSettings | null;
}

const clampTemp = (value: number): number =>
  Math.max(UNIT_TEMP_RANGE.min, Math.min(UNIT_TEMP_RANGE.max, Math.round(value)));

export function toUnit(settings: ClimSettings, now: number): UnitSettings {
  return {
    power: settings.power,
    mode: settings.mode,
    temp: clampTemp(effectiveSetpoint(settings, now) ?? settings.setpoints.heat),
    fan: effectiveFan(settings, now),
    vaneV: settings.vaneV,
    vaneH: settings.vaneH,
  };
}

export function differences(from: UnitSettings, to: UnitSettings): Field[] {
  return FIELDS.filter((field) =>
    field === 'temp' ? hasSetpoint(to.mode) && from.temp !== to.temp : from[field] !== to[field],
  );
}

export function adoptUnit(settings: ClimSettings, unit: UnitSettings, now: number): ClimSettings {
  let next = settings;
  if (unit.power !== next.power) next = applyCommand(next, { type: 'power', on: unit.power }, now);
  if (unit.mode !== next.mode) next = applyCommand(next, { type: 'mode', mode: unit.mode }, now);

  const expected = toUnit(next, now);
  const tempChanged = hasSetpoint(unit.mode) && unit.temp !== expected.temp;
  if (tempChanged || unit.fan !== expected.fan) {
    next = { ...next, powerfulUntil: null, econoCool: false, nightMode: false };
    if (hasSetpoint(unit.mode)) next = applyCommand(next, { type: 'setpoint', value: unit.temp }, now);
    if (unit.fan !== next.fan) next = applyCommand(next, { type: 'fan', fan: unit.fan }, now);
  }
  if (unit.vaneV !== next.vaneV || unit.vaneH !== next.vaneH) {
    next = applyCommand(next, { type: 'vanes', v: unit.vaneV, h: unit.vaneH }, now);
  }
  return next;
}

export class LocalClim implements ClimDevice {
  readonly kind = 'local' as const;
  readonly label = 'En ligne';

  private readonly address: string;
  private readonly pollMs: number;
  private readonly settleMs: number;
  private readonly flushMs: number;
  private readonly store: KeyValueStore | null;
  private settings: ClimSettings;
  private synced: UnitSettings | null;
  private roomTemp = 20;
  private unitOutdoor: number | null = null;
  private weatherOutdoor: number | null = null;
  private operating: boolean | null = null;
  private autoPhase: 'heat' | 'cool' | null = null;
  private online = false;
  private failures = 0;
  private lastPollAt = 0;
  private holdUntil = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private state: ClimState;
  private readonly listeners = new Set<(state: ClimState) => void>();

  constructor(address: string, options: LocalClimOptions = {}) {
    this.address = address;
    this.pollMs = options.pollMs ?? POLL_MS;
    this.settleMs = options.settleMs ?? SETTLE_MS;
    this.flushMs = options.flushMs ?? FLUSH_MS;
    this.store = options.store ?? null;
    const saved = this.load();
    this.settings = saved?.settings ?? { ...DEFAULT_SETTINGS, power: false };
    this.synced = saved?.synced ?? null;
    this.state = this.buildState();
  }

  getState(): ClimState {
    return this.state;
  }

  subscribe(listener: (state: ClimState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  tick(): void {
    const now = Date.now();
    this.update(settleOptions(this.settings, this.roomTemp, now));
    if (now - this.lastPollAt >= this.pollMs) this.poll();
  }

  setOutdoorTemp(value: number | null): void {
    this.weatherOutdoor = value;
    this.emit();
  }

  send(command: ClimCommand): Promise<void> {
    this.update(applyCommand(this.settings, command, Date.now()));
    return Promise.resolve();
  }

  private load(): Saved | null {
    const raw = this.store?.get(STORE_KEY);
    const saved = raw ? attempt(() => JSON.parse(raw) as Partial<Saved> | null) : null;
    if (!saved?.settings) return null;
    return { settings: { ...DEFAULT_SETTINGS, ...saved.settings }, synced: saved.synced ?? null };
  }

  private save(): void {
    const saved: Saved = { settings: this.settings, synced: this.synced };
    this.store?.set(STORE_KEY, JSON.stringify(saved));
  }

  private update(next: ClimSettings): void {
    if (next === this.settings) return;
    const now = Date.now();
    this.synced ??= toUnit(this.settings, now);
    this.settings = next;
    this.save();
    this.emit();
    this.holdUntil = now + this.settleMs;
    this.flushTimer ??= setTimeout(() => this.flush(), this.flushMs);
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.synced === null) return;
    const now = Date.now();
    const target = toUnit(this.settings, now);
    const fields = differences(this.synced, target);
    if (fields.length === 0) return;
    this.synced = target;
    this.save();
    this.holdUntil = now + this.settleMs;
    const hex = buildCommand(target, fields);
    this.enqueue(() => exchange(this.address, `<CSV><CODE><VALUE>${hex}</VALUE></CODE></CSV>`));
  }

  private poll(): void {
    this.lastPollAt = Date.now();
    this.enqueue(() => exchange(this.address, '<CSV></CSV>'));
  }

  private enqueue(task: () => Promise<string>): void {
    this.queue = this.queue
      .then(task)
      .then((xml) => this.accept(readStatus(xml)))
      .catch(() => this.fail());
  }

  private fail(): void {
    this.failures += 1;
    if (this.failures >= MAX_FAILURES && this.online) {
      this.online = false;
      this.emit();
    }
  }

  private accept(status: UnitStatus): void {
    this.failures = 0;
    this.online = true;
    if (status.sensors) {
      this.roomTemp = status.sensors.roomTemp;
      this.unitOutdoor = status.sensors.outdoorTemp;
    }
    if (status.operating !== null) this.operating = status.operating;
    this.autoPhase = status.autoPhase;

    const settled = this.flushTimer === null && Date.now() >= this.holdUntil;
    if (status.settings && settled) this.reconcile({ ...status.settings, temp: clampTemp(status.settings.temp) });
    this.emit();
  }

  private reconcile(unit: UnitSettings): void {
    if (this.synced && differences(this.synced, unit).length === 0) return;
    this.settings = adoptUnit(this.settings, unit, Date.now());
    this.synced = unit;
    this.save();
  }

  private activity(): Activity {
    const { settings } = this;
    if (!settings.power) return 'off';
    if (settings.mode === 'fan') return 'fan';
    if (settings.mode === 'dry') return 'drying';
    if (this.operating === false) return 'idle';
    if (settings.mode === 'heat') return 'heating';
    if (settings.mode === 'cool') return 'cooling';
    const phase = this.autoPhase ?? (this.roomTemp < settings.setpoints.auto ? 'heat' : 'cool');
    return phase === 'heat' ? 'heating' : 'cooling';
  }

  private buildState(): ClimState {
    const activity = this.activity();
    return {
      settings: this.settings,
      roomTemp: this.roomTemp,
      outdoorTemp: this.unitOutdoor ?? this.weatherOutdoor,
      activity,
      autoPhase: this.settings.power && this.settings.mode === 'auto' ? this.autoPhase : null,
      output: activity === 'heating' || activity === 'cooling' || activity === 'drying' ? 1 : 0,
      online: this.online,
    };
  }

  private emit(): void {
    const next = this.buildState();
    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}
