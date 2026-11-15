import type { AutoMode, RegulationSettings } from './regulation';

export interface Sample {
  at: number;
  temp: number;
}

export interface ThermalModel {
  loss: number;
  heatRate: number;
  coolRate: number;
}

export const DEFAULT_THERMAL: ThermalModel = { loss: 0.07, heatRate: 2.4, coolRate: 2.6 };

const HOUR_MS = 3_600_000;

export function driftTemp(temp: number, outdoor: number, loss: number, hours: number): number {
  return outdoor + (temp - outdoor) * Math.exp(-loss * hours);
}

export const driftRate = (temp: number, outdoor: number, loss: number): number => -loss * (temp - outdoor);

export function hoursToReach(temp: number, threshold: number, outdoor: number, loss: number): number | null {
  const from = temp - outdoor;
  const to = threshold - outdoor;
  if (loss <= 0 || from === 0 || to === 0 || Math.sign(from) !== Math.sign(to)) return null;
  if (Math.abs(to) >= Math.abs(from)) return null;
  return Math.log(from / to) / loss;
}

export function fitLoss(samples: readonly Sample[], outdoor: number): number | null {
  const points = samples.filter((sample) => Math.abs(sample.temp - outdoor) > 1);
  if (points.length < 6) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if ((last.at - first.at) / HOUR_MS < 0.2) return null;
  const side = Math.sign(first.temp - outdoor);
  if (points.some((point) => Math.sign(point.temp - outdoor) !== side)) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (const point of points) {
    const x = (point.at - first.at) / HOUR_MS;
    const y = Math.log(Math.abs(point.temp - outdoor));
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
  }
  const n = points.length;
  const spread = n * sumXX - sumX * sumX;
  if (spread <= 0) return null;
  const loss = -(n * sumXY - sumX * sumY) / spread;
  if (!Number.isFinite(loss) || loss <= 0) return null;
  return Math.max(0.01, Math.min(0.6, loss));
}

export interface Prediction {
  mode: AutoMode;
  threshold: number;
  target: number;
  crossAt: number;
  reachAt: number;
  minutes: number;
  rate: number;
}

export interface PredictInput {
  regulation: RegulationSettings;
  roomTemp: number;
  outdoor: number | null;
  model: ThermalModel;
  now: number;
}

export function predict({ regulation, roomTemp, outdoor, model, now }: PredictInput): Prediction | null {
  if (!regulation.enabled || outdoor === null) return null;
  const rate = Math.abs(driftRate(roomTemp, outdoor, model.loss));
  const candidates: Prediction[] = [];

  const { heat, cool } = regulation;
  if (heat.enabled && roomTemp >= heat.low) {
    const hours = hoursToReach(roomTemp, heat.low, outdoor, model.loss);
    if (hours !== null) {
      const crossAt = now + hours * HOUR_MS;
      const reachAt = crossAt + ((heat.high - heat.low) / model.heatRate) * HOUR_MS;
      candidates.push({
        mode: 'heat',
        threshold: heat.low,
        target: heat.high,
        crossAt,
        reachAt,
        minutes: hours * 60,
        rate,
      });
    }
  }
  if (cool.enabled && roomTemp < cool.high) {
    const hours = hoursToReach(roomTemp, cool.high, outdoor, model.loss);
    if (hours !== null) {
      const crossAt = now + hours * HOUR_MS;
      const reachAt = crossAt + ((cool.high - cool.low) / model.coolRate) * HOUR_MS;
      candidates.push({
        mode: 'cool',
        threshold: cool.high,
        target: cool.low,
        crossAt,
        reachAt,
        minutes: hours * 60,
        rate,
      });
    }
  }
  candidates.sort((a, b) => a.crossAt - b.crossAt);
  return candidates[0] ?? null;
}

export function learnRate(model: ThermalModel, mode: AutoMode, deltaTemp: number, durationMs: number): ThermalModel {
  if (durationMs < 10 * 60_000) return model;
  const observed = Math.abs(deltaTemp) / (durationMs / HOUR_MS);
  if (!Number.isFinite(observed) || observed < 0.3 || observed > 10) return model;
  const key = mode === 'heat' ? 'heatRate' : 'coolRate';
  return { ...model, [key]: model[key] * 0.7 + observed * 0.3 };
}
