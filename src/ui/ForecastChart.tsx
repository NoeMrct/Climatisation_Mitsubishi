import { driftTemp } from '../domain/forecast';
import { formatClock, formatTemp } from '../domain/format';
import type { ForecastDetail } from '../domain/notify';

const LEFT = 34;
const RIGHT = 302;
const BOTTOM = 118;
const TOP = 14;
const HALF_HOUR = 30 * 60_000;
const HOUR_MS = 3_600_000;
const HEAT = '#FF6B45';
const COOL = '#4CA3FF';

function floorHalfHour(timestamp: number): number {
  const date = new Date(timestamp);
  date.setMinutes(date.getMinutes() < 30 ? 0 : 30, 0, 0);
  return date.getTime();
}

function ceilHalfHour(timestamp: number): number {
  const floor = floorHalfHour(timestamp);
  return floor === timestamp ? floor : floor + HALF_HOUR;
}

const round = (value: number): number => Math.round(value * 10) / 10;

export function ForecastChart({ detail }: { detail: ForecastDetail }) {
  const { prediction, samples, roomTemp, outdoor, loss, sentAt } = detail;
  const heat = prediction.mode === 'heat';
  const accent = heat ? HEAT : COOL;
  const start = floorHalfHour(sentAt - 45 * 60_000);
  const end = ceilHalfHour(prediction.reachAt + 15 * 60_000);
  const low = Math.min(prediction.threshold, prediction.target) - 0.5;
  const high = Math.max(prediction.threshold, prediction.target) + 0.5;

  const x = (timestamp: number): number => round(LEFT + ((timestamp - start) * (RIGHT - LEFT)) / (end - start));
  const y = (temp: number): number => {
    const bounded = Math.max(low, Math.min(high, temp));
    return round(BOTTOM - ((bounded - low) * (BOTTOM - TOP)) / (high - low));
  };

  const measured = [
    ...samples.filter((sample) => sample.at >= start && sample.at < sentAt),
    { at: sentAt, temp: roomTemp },
  ];
  const measuredPath = `M${measured.map((sample) => `${x(sample.at)} ${y(sample.temp)}`).join('L')}`;
  const now = { x: x(sentAt), y: y(roomTemp) };
  const cross = { x: x(prediction.crossAt), y: y(prediction.threshold) };
  const reach = { x: x(prediction.reachAt), y: y(prediction.target) };
  const run = prediction.reachAt - prediction.crossAt;
  const delta = prediction.target - prediction.threshold;

  const c1 = { x: x(prediction.crossAt + run * (10 / 48)), y: y(prediction.threshold + delta * 0.39) };
  const c2 = { x: x(prediction.crossAt + run * (30 / 48)), y: y(prediction.threshold + delta * 0.87) };
  const after = { x: x(end), y: y(driftTemp(prediction.target, outdoor, loss, (end - prediction.reachAt) / HOUR_MS)) };

  const step = (end - start) / HALF_HOUR <= 6 ? HALF_HOUR : 2 * HALF_HOUR;
  const ticks: number[] = [];
  for (let tick = start; tick <= end; tick += step) ticks.push(tick);

  const crossBelow = prediction.threshold < prediction.target;
  const label =
    `Température du salon : ${formatTemp(roomTemp)}° à ${formatClock(sentAt)}, ` +
    `${formatTemp(prediction.threshold)}° prévus à ${formatClock(prediction.crossAt)}, ` +
    `puis ${formatTemp(prediction.target)}° vers ${formatClock(prediction.reachAt)} une fois ` +
    (heat ? 'le chauffage lancé' : 'la clim lancée');

  return (
    <svg viewBox="0 0 310 150" fill="none" role="img" aria-label={label}>
      {[prediction.threshold, prediction.target].map((temp) => (
        <g key={temp}>
          <path d={`M${LEFT} ${y(temp)}H${RIGHT}`} stroke="#3A3F47" strokeWidth="1" strokeDasharray="3 4" />
          <text x={LEFT - 8} y={y(temp) + 4} fontSize="11" fontWeight="700" fill="#8B919A" textAnchor="end">
            {formatTemp(temp)}°
          </text>
        </g>
      ))}
      <path d={`M${now.x} 18V${BOTTOM}`} stroke="#3A3F47" strokeWidth="1" />
      <text x={now.x} y="12" fontSize="11" fontWeight="600" fill="#A9AEB6" textAnchor="middle">
        maintenant
      </text>
      <path d={measuredPath} stroke="#F3F4F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={`M${now.x} ${now.y}L${cross.x} ${cross.y}`}
        stroke="#A9AEB6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 5"
      />
      <path
        d={`M${cross.x} ${cross.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${reach.x} ${reach.y}`}
        stroke={accent}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d={`M${reach.x} ${reach.y}L${after.x} ${after.y}`}
        stroke="#A9AEB6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 5"
      />
      <circle cx={now.x} cy={now.y} r="3.5" fill="#F3F4F6" />
      <circle cx={cross.x} cy={cross.y} r="4.5" fill={accent} stroke="#131518" strokeWidth="2" />
      <circle cx={reach.x} cy={reach.y} r="4.5" fill={accent} stroke="#131518" strokeWidth="2" />
      <text
        x={cross.x}
        y={crossBelow ? cross.y + 16 : cross.y - 9}
        fontSize="11"
        fontWeight="700"
        fill={accent}
        textAnchor="middle"
      >
        {formatClock(prediction.crossAt)}
      </text>
      <text
        x={reach.x}
        y={crossBelow ? reach.y - 9 : reach.y + 16}
        fontSize="11"
        fontWeight="700"
        fill={accent}
        textAnchor="middle"
      >
        {formatClock(prediction.reachAt)}
      </text>
      {ticks.map((tick, index) => {
        const last = index === ticks.length - 1 && tick === end;
        return (
          <text
            key={tick}
            x={last ? 310 : x(tick)}
            y="140"
            fontSize="11"
            fontWeight="600"
            fill="#8B919A"
            textAnchor={last ? 'end' : 'middle'}
          >
            {formatClock(tick).replace(/^0/, '')}
          </text>
        );
      })}
    </svg>
  );
}
