import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  BEAM_ORIGIN,
  COL_PHRASES,
  ROW_PHRASES,
  STAGE,
  SURFACE_HEIGHT,
  VANE_STEPS,
  aimLabel,
  airflowView,
  colX,
  rowY,
  snapToGrid,
  surfacePoint,
  type BeamView,
  type GridCell,
  type Look,
  type Point,
} from '../domain/airflow';
import type { FlowProfile } from '../domain/flow';
import type { VaneH, VaneV } from '../domain/types';
import { attempt } from '../lib/attempt';
import type { Accent } from '../store/view';

const CENTER = STAGE.width / 2;

const FADE: [number, number][] = [
  [0, 0.95],
  [0.45, 0.62],
  [0.78, 0.2],
  [1, 0],
];
const VEIL: [number, number][] = [
  [0, 0.2],
  [0.5, 0.08],
  [1, 0],
];
const STREAK: [number, number][] = [
  [0, 0.9],
  [0.6, 0.5],
  [1, 0],
];

const RIBBONS: [number, number][] = [
  [95, 6],
  [133, 7],
  [171, 7],
  [209, 7],
  [247, 6],
];
const FILAMENTS: [number, number][] = [
  [78, 1.4],
  [108, 2.2],
  [120, 1.4],
  [146, 2.4],
  [158, 1.4],
  [184, 1.4],
  [196, 2.4],
  [222, 1.4],
  [234, 2.2],
  [264, 1.4],
];
const STREAKS: { x: number; seconds: number; phase: number }[] = [
  { x: 95, seconds: 1.9, phase: 0 },
  { x: 171, seconds: 2.5, phase: 0.36 },
  { x: 247, seconds: 2.2, phase: 0.68 },
  { x: 133, seconds: 2.8, phase: 0.14 },
  { x: 209, seconds: 2.1, phase: 0.52 },
  { x: 146, seconds: 2.4, phase: 0.84 },
  { x: 196, seconds: 2, phase: 0.27 },
  { x: 108, seconds: 2.7, phase: 0.6 },
  { x: 234, seconds: 2.3, phase: 0.08 },
  { x: 158, seconds: 2.6, phase: 0.45 },
];

function streakStyle(streak: (typeof STREAKS)[number], flow: FlowProfile): CSSProperties {
  const duration = streak.seconds * flow.pace;
  const style: CSSProperties & Record<'--flow-shift', number> = {
    animationDuration: `${duration.toFixed(2)}s`,
    animationDelay: `${(-streak.phase * duration).toFixed(2)}s`,
    '--flow-shift': -(flow.dash + flow.gap),
  };
  return style;
}

function curve(x: number, length: number): string {
  const end = (CENTER + (x - CENTER) * 0.45).toFixed(1);
  return `M${x} 0C${x} ${(length * 0.45).toFixed(0)} ${end} ${(length * 0.55).toFixed(0)} ${end} ${length}`;
}

interface GradientProps {
  id: string;
  color: string;
  stops: [number, number][];
  length?: number;
}

function Gradient({ id, color, stops, length = 200 }: GradientProps) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={length}>
      {stops.map(([offset, opacity]) => (
        <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
      ))}
    </linearGradient>
  );
}

interface BeamProps {
  id: string;
  view: BeamView;
  look: Look;
  accent: Accent;
  flow: FlowProfile;
  animated: boolean;
  dragging: boolean;
}

function Beam({ id, view, look, accent, flow, animated, dragging }: BeamProps) {
  return (
    <div
      aria-hidden="true"
      className="stage__beam"
      style={{
        top: `${((BEAM_ORIGIN[look] / STAGE.height) * 100).toFixed(3)}%`,
        transform: view.transform,
        opacity: view.opacity,
        transition: dragging ? 'none' : 'transform 0.22s ease, opacity 0.2s ease',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 342 208"
        preserveAspectRatio="none"
        fill="none"
        style={{ clipPath: view.clipPath }}
      >
        <defs>
          <Gradient id={id} color={accent.color} stops={FADE} />
          <Gradient id={`${id}f`} color={accent.color} stops={FADE} length={172} />
          <Gradient id={`${id}v`} color={accent.color} stops={VEIL} />
          <Gradient id={`${id}s`} color={accent.light} stops={STREAK} />
        </defs>
        <path d="M70 0C70 90 124 110 124 200H218C218 110 272 90 272 0Z" fill={`url(#${id}v)`} />
        {RIBBONS.map(([x, width]) => (
          <path
            key={x}
            d={curve(x, 200)}
            stroke={`url(#${id})`}
            strokeWidth={width}
            strokeLinecap="round"
            opacity={0.9}
          />
        ))}
        {FILAMENTS.map(([x, width]) => (
          <path
            key={x}
            d={curve(x, 172)}
            stroke={`url(#${id}f)`}
            strokeWidth={width}
            strokeLinecap="round"
            opacity={0.75}
          />
        ))}
        {animated &&
          STREAKS.slice(0, flow.streaks).map((streak) => (
            <path
              key={streak.x}
              className="stage__streak"
              d={curve(streak.x, 200)}
              stroke={`url(#${id}s)`}
              strokeWidth={flow.width}
              strokeLinecap="round"
              opacity={flow.opacity}
              strokeDasharray={`${flow.dash} ${flow.gap}`}
              style={streakStyle(streak, flow)}
            />
          ))}
      </svg>
    </div>
  );
}

interface UnitProps {
  id: string;
  look: Look;
  power: boolean;
  lamp: string;
  label: string;
}

function Unit({ id, look, power, lamp, label }: UnitProps) {
  return (
    <svg viewBox="0 0 342 376" fill="none" role="img" aria-label={label} className="stage__layer">
      <defs>
        <linearGradient id={`${id}body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#ECEEF1" />
          <stop offset="1" stopColor="#C5C9CF" />
        </linearGradient>
        <linearGradient id={`${id}flap`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7F8F9" />
          <stop offset="1" stopColor="#D2D6DB" />
        </linearGradient>
      </defs>
      <rect x="26" y="2" width="290" height="78" rx="16" fill={`url(#${id}body)`} />
      <path d="M33 26H309" stroke="#C6CAD0" strokeWidth="1" />
      <rect x="42" y="34" width="214" height="30" rx="7" fill={`url(#${id}flap)`} stroke="#C6CAD0" strokeWidth="1" />
      <rect x="272" y="37" width="12" height="12" rx="3" stroke="#AEB3BA" strokeWidth="1.2" />
      <rect x="268" y="55" width="20" height="5" rx="2.5" fill="#8E949C" />
      <circle className="stage__lamp" cx="297" cy="57.5" r="2.6" fill={lamp} />
      {power ? (
        <>
          <rect x="38" y="76" width="266" height="10" rx="5" fill="#101215" />
          <path d={look === 'heat' ? 'M50 84H292L284 96H58Z' : 'M50 84H292L288 90H54Z'} fill={`url(#${id}flap)`} />
        </>
      ) : (
        <rect x="40" y="72" width="262" height="5" rx="2.5" fill="#B4B9C0" />
      )}
    </svg>
  );
}

const percent = (value: number, total: number): string => `${((value / total) * 100).toFixed(3)}%`;

export interface StageProps {
  look: Look;
  accent: Accent;
  unitLabel: string;
  power: boolean;
  v: VaneV;
  h: VaneH;
  flow: FlowProfile;
  desktop?: boolean;
  onAim: (cell: GridCell) => void;
  onTogglePower: () => void;
}

export function Stage({
  look,
  accent,
  unitLabel,
  power,
  v,
  h,
  flow,
  desktop = false,
  onAim,
  onTogglePower,
}: StageProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [drag, setDrag] = useState<Point | null>(null);
  const pressed = useRef(false);
  const view = airflowView({ v, h, drag, look, power });

  const pointOf = (event: ReactPointerEvent<HTMLDivElement>): Point =>
    surfacePoint(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY);

  const release = (point: Point): void => {
    pressed.current = false;
    setDrag(null);
    onAim(snapToGrid(point));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pressed.current = true;
    attempt(() => event.currentTarget.setPointerCapture(event.pointerId));
    setDrag(pointOf(event));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!pressed.current) return;

    if (event.pointerType === 'mouse' && event.buttons === 0) release(pointOf(event));
    else setDrag(pointOf(event));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (pressed.current) release(pointOf(event));
  };

  const onPointerCancel = (): void => {
    if (!pressed.current) return;
    pressed.current = false;
    if (drag) onAim(snapToGrid(drag));
    setDrag(null);
  };

  let caption: ReactNode = null;
  if (power) caption = <div className="stage__readout">{aimLabel(v, h, drag)}</div>;
  else if (desktop) caption = <div className="stage__readout">Éteinte</div>;
  else caption = <div className="stage__invite">Touche la clim pour l’allumer</div>;

  return (
    <div className={desktop ? 'stage stage--fluid' : 'stage'}>
      <span aria-hidden="true" className="stage__zone" style={view.zone} />
      {view.beams.map((beam, index) => (
        <Beam
          key={index}
          id={`${id}b${index}`}
          view={beam}
          look={look}
          accent={accent}
          flow={flow}
          animated={index < 2}
          dragging={drag !== null}
        />
      ))}
      <Unit id={id} look={look} power={power} lamp={power ? accent.color : '#9AA0A8'} label={unitLabel} />
      {power && (
        <div
          className="stage__surface"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {VANE_STEPS.map((row) =>
            VANE_STEPS.map((col) => (
              <button
                key={`${row}-${col}`}
                type="button"
                className="stage__cell"
                aria-label={`Flux ${ROW_PHRASES[row]}, ${COL_PHRASES[col]}`}
                style={{ left: percent(colX(col), STAGE.width), top: percent(rowY(row) - STAGE.top, SURFACE_HEIGHT) }}
                onClick={() => onAim({ row, col })}
              />
            )),
          )}
        </div>
      )}
      <button
        type="button"
        className="stage__power"
        aria-label={power ? 'Éteindre la climatisation' : 'Allumer la climatisation'}
        onClick={onTogglePower}
      />
      {caption}
    </div>
  );
}

interface StageBlockProps {
  hint: string;
  children: ReactNode;
}

export function StageBlock({ hint, children }: StageBlockProps) {
  return (
    <div className="stage-block">
      {children}
      <div className="stage-hint">{hint}</div>
    </div>
  );
}
