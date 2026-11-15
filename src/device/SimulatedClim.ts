import { RESTART_DELAY_MS, hasSetpoint } from '../domain/capabilities';
import { applyCommand, settleOptions } from '../domain/clim';
import { effectiveFan, effectiveSetpoint } from '../domain/options';
import type { Activity, ClimCommand, ClimSettings, ClimState, FanSpeed } from '../domain/types';
import type { ClimDevice } from './ClimDevice';

export interface SimSnapshot {
  settings: ClimSettings;
  roomTemp: number;
  outdoorTemp: number;
}

const LOSS = 0.07;
const HEAT_GAIN = 3.6;
const COOL_GAIN = 3.3;
const DRY_OUTPUT = 0.3;
const DRY_FLOOR = 18;
const AUTO_SWITCH_GAP = 2;
const AUTO_SWITCH_DELAY_MS = 15 * 60_000;
const STEP_MS = 15_000;
const MAX_CATCH_UP_MS = 6 * 3_600_000;
const HOUR_MS = 3_600_000;

const FAN_CAPACITY: Record<FanSpeed, number> = { auto: 1, quiet: 0.6, 1: 0.7, 2: 0.8, 3: 0.9, 4: 1 };

export function modulation(gap: number): number {
  if (gap >= 0.3) return 1;
  if (gap >= 0) return 0.5 + (gap / 0.3) * 0.5;
  if (gap > -1) return 0.5 * (gap + 1);
  return 0;
}

export class SimulatedClim implements ClimDevice {
  readonly kind = 'simulator' as const;
  readonly label = 'Simulateur';

  private settings: ClimSettings;
  private roomTemp: number;
  private outdoorTemp: number;
  private output = 0;
  private activity: Activity = 'off';
  private autoPhase: 'heat' | 'cool' | null = null;
  private wrongSideSince: number | null = null;
  private compressorStoppedAt: number | null = null;
  private clock: number;
  private state: ClimState;
  private readonly listeners = new Set<(state: ClimState) => void>();

  constructor(initial: SimSnapshot, now: number) {
    this.settings = initial.settings;
    this.roomTemp = initial.roomTemp;
    this.outdoorTemp = initial.outdoorTemp;
    this.clock = now;
    this.step(now, 0);
    this.state = this.buildState();
  }

  getState(): ClimState {
    return this.state;
  }

  send(command: ClimCommand): Promise<void> {
    this.settings = applyCommand(this.settings, command, this.clock);
    this.step(this.clock, 0);
    this.emit();
    return Promise.resolve();
  }

  subscribe(listener: (state: ClimState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  tick(now: number): void {
    const elapsed = now - this.clock;
    this.clock = now;
    if (elapsed <= 0) return;
    let remaining = Math.min(elapsed, MAX_CATCH_UP_MS);
    while (remaining > 0) {
      const step = Math.min(remaining, STEP_MS);
      remaining -= step;
      this.step(now - remaining, step);
    }
    this.emit();
  }

  setOutdoorTemp(value: number): void {
    this.outdoorTemp = value;
    this.emit();
  }

  setRoomTemp(value: number): void {
    this.roomTemp = value;
    this.step(this.clock, 0);
    this.emit();
  }

  reset(initial: SimSnapshot, now: number): void {
    this.settings = initial.settings;
    this.roomTemp = initial.roomTemp;
    this.outdoorTemp = initial.outdoorTemp;
    this.clock = now;
    this.output = 0;
    this.autoPhase = null;
    this.wrongSideSince = null;
    this.compressorStoppedAt = null;
    this.step(now, 0);
    this.emit();
  }

  snapshot(): SimSnapshot {
    return { settings: this.settings, roomTemp: this.roomTemp, outdoorTemp: this.outdoorTemp };
  }

  private emit(): void {
    this.state = this.buildState();
    for (const listener of this.listeners) listener(this.state);
  }

  private buildState(): ClimState {
    return {
      settings: this.settings,
      roomTemp: this.roomTemp,
      outdoorTemp: this.outdoorTemp,
      activity: this.activity,
      autoPhase: this.autoPhase,
      output: this.output,
      online: true,
    };
  }

  private pickAutoPhase(setpoint: number, at: number): 'heat' | 'cool' {
    if (this.autoPhase === null) {
      this.autoPhase = this.roomTemp < setpoint ? 'heat' : 'cool';
      this.wrongSideSince = null;
      return this.autoPhase;
    }
    const wrongSide =
      this.autoPhase === 'heat'
        ? this.roomTemp > setpoint + AUTO_SWITCH_GAP
        : this.roomTemp < setpoint - AUTO_SWITCH_GAP;
    if (!wrongSide) {
      this.wrongSideSince = null;
    } else if (this.wrongSideSince === null) {
      this.wrongSideSince = at;
    } else if (at - this.wrongSideSince >= AUTO_SWITCH_DELAY_MS) {
      this.autoPhase = this.autoPhase === 'heat' ? 'cool' : 'heat';
      this.wrongSideSince = null;
    }
    return this.autoPhase;
  }

  private step(at: number, durationMs: number): void {
    this.settings = settleOptions(this.settings, this.roomTemp, at);
    const settings = this.settings;
    let direction: 'heat' | 'cool' | null = null;
    let wanted = 0;
    let activity: Activity = 'off';

    if (settings.mode !== 'auto' || !settings.power) {
      this.autoPhase = null;
      this.wrongSideSince = null;
    }
    if (settings.power) {
      if (settings.mode === 'fan') {
        activity = 'fan';
      } else if (settings.mode === 'dry') {
        direction = 'cool';
        wanted = this.roomTemp > DRY_FLOOR ? DRY_OUTPUT : 0;
        activity = 'drying';
      } else if (hasSetpoint(settings.mode)) {
        const setpoint = effectiveSetpoint(settings, at) ?? settings.setpoints[settings.mode];
        direction = settings.mode === 'auto' ? this.pickAutoPhase(setpoint, at) : settings.mode;
        wanted = modulation(direction === 'heat' ? setpoint - this.roomTemp : this.roomTemp - setpoint);
        activity = 'idle';
      }
    }

    const resting = this.compressorStoppedAt !== null && at - this.compressorStoppedAt < RESTART_DELAY_MS;
    const output = wanted > 0 && !resting ? wanted : 0;
    if (this.output > 0 && output === 0) this.compressorStoppedAt = at;

    let effect = 0;
    if (direction !== null && output > 0) {
      const capacity = FAN_CAPACITY[effectiveFan(settings, at)];
      effect = (direction === 'heat' ? HEAT_GAIN : -COOL_GAIN) * output * capacity;
      if (settings.mode !== 'dry') activity = direction === 'heat' ? 'heating' : 'cooling';
    } else if (wanted > 0 && settings.mode !== 'dry') {
      activity = 'standby';
    }

    const drift = -LOSS * (this.roomTemp - this.outdoorTemp);
    this.roomTemp += (drift + effect) * (durationMs / HOUR_MS);
    this.output = output;
    this.activity = activity;
  }
}
