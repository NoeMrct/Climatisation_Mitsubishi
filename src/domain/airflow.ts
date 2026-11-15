import type { VaneH, VaneStep, VaneV } from './types';

export const STAGE = {
  width: 342,
  height: 376,
  x0: 63,
  dx: 54,
  y0: 160,
  dy: 44,
  top: 112,
  beamLength: 200,
  stretch: 1.12,
} as const;

export const SURFACE_HEIGHT = STAGE.height - STAGE.top;

export type Look = 'heat' | 'cool';

export const BEAM_ORIGIN: Record<Look, number> = { heat: 98, cool: 92 };

const AUTO_ROW: Record<Look, VaneStep> = { heat: 3, cool: 0 };

const MARGIN_X = 16;
const MARGIN_Y = 14;
const ZONE_PADDING = 20;
const GHOST_OPACITY = 0.25;

export interface Point {
  x: number;
  y: number;
}

export interface GridCell {
  row: VaneStep;
  col: VaneStep;
}

export const VANE_STEPS: readonly VaneStep[] = [0, 1, 2, 3, 4];
export const colX = (col: number): number => STAGE.x0 + col * STAGE.dx;
export const rowY = (row: number): number => STAGE.y0 + row * STAGE.dy;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function surfacePoint(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): Point {
  const x = ((clientX - rect.left) / rect.width) * STAGE.width;
  const y = ((clientY - rect.top) / rect.height) * SURFACE_HEIGHT + STAGE.top;
  return {
    x: clamp(x, colX(0) - MARGIN_X, colX(4) + MARGIN_X),
    y: clamp(y, rowY(0) - MARGIN_Y, rowY(4) + MARGIN_Y),
  };
}

export function snapToGrid(point: Point): GridCell {
  return {
    col: clamp(Math.round((point.x - STAGE.x0) / STAGE.dx), 0, 4) as VaneStep,
    row: clamp(Math.round((point.y - STAGE.y0) / STAGE.dy), 0, 4) as VaneStep,
  };
}

export function beamTransform(x: number, y: number, look: Look): string {
  const dy = Math.max(24, y - BEAM_ORIGIN[look]);
  const degrees = (Math.atan2(x - STAGE.width / 2, dy) * 180) / Math.PI;
  const scale = (dy * STAGE.stretch) / STAGE.beamLength;
  return `skewX(${degrees.toFixed(2)}deg) scaleY(${scale.toFixed(3)})`;
}

export interface BeamView {
  transform: string;
  opacity: number;
  clipPath: string;
}

export interface ZoneView {
  left: string;
  top: string;
  width: string;
  height: string;
  opacity: number;
}

export interface AirflowView {
  beams: [BeamView, BeamView, BeamView];
  zone: ZoneView;
}

export interface AirflowInput {
  v: VaneV;
  h: VaneH;
  drag: Point | null;
  look: Look;
  power: boolean;
}

type Target = [x: number, y: number, opacity: number, clipPath: string];

export function airflowView({ v, h, drag, look, power }: AirflowInput): AirflowView {
  const row = v === 'auto' ? AUTO_ROW[look] : v === 'swing' ? 2 : v;
  const col = h === 'swing' || h === 'split' ? 2 : h;
  let x = colX(col);
  let y = rowY(row);
  const targets: Target[] = [];
  let swept: [number, number, number, number] | null = null;
  const swingV = v === 'swing';
  const swingH = h === 'swing';

  if (drag) {
    x = drag.x;
    y = drag.y;
    targets.push([x, y, 1, 'none']);
  } else if (h === 'split') {
    targets.push([colX(0.5), y, 1, 'inset(0 50% 0 0)'], [colX(3.5), y, 1, 'inset(0 0 0 50%)']);
    if (swingV) swept = [colX(0.5), rowY(0), colX(3.5), rowY(4)];
  } else if (swingV && swingH) {
    targets.push([x, y, 1, 'none']);
    swept = [colX(0), rowY(0), colX(4), rowY(4)];
  } else if (swingV) {
    targets.push([x, y, 1, 'none'], [x, rowY(0), GHOST_OPACITY, 'none'], [x, rowY(4), GHOST_OPACITY, 'none']);
    swept = [x, rowY(0), x, rowY(4)];
  } else if (swingH) {
    targets.push([x, y, 1, 'none'], [colX(0), y, GHOST_OPACITY, 'none'], [colX(4), y, GHOST_OPACITY, 'none']);
    swept = [colX(0), y, colX(4), y];
  } else {
    targets.push([x, y, 1, 'none']);
  }

  const beam = (index: number): BeamView => {
    const target = targets[index];
    if (!target) return { transform: beamTransform(x, y, look), opacity: 0, clipPath: 'none' };
    return {
      transform: beamTransform(target[0], target[1], look),
      opacity: power ? target[2] : 0,
      clipPath: target[3],
    };
  };

  const [x1, y1, x2, y2] = swept ?? [x, y, x, y];
  const percent = (value: number, total: number): string => `${((value / total) * 100).toFixed(2)}%`;
  return {
    beams: [beam(0), beam(1), beam(2)],
    zone: {
      left: percent(x1 - ZONE_PADDING, STAGE.width),
      top: percent(y1 - ZONE_PADDING, STAGE.height),
      width: percent(x2 - x1 + 2 * ZONE_PADDING, STAGE.width),
      height: percent(y2 - y1 + 2 * ZONE_PADDING, STAGE.height),
      opacity: swept && power ? 1 : 0,
    },
  };
}

const ROW_NAMES = ['Haut', 'Mi-haut', 'Milieu', 'Mi-bas', 'Bas'] as const;
const COL_NAMES = ['Tout à gauche', 'Gauche', 'Centre', 'Droite', 'Tout à droite'] as const;

export const ROW_PHRASES = ['en haut', 'mi-haut', 'au milieu', 'mi-bas', 'en bas'] as const;
export const COL_PHRASES = ['tout à gauche', 'à gauche', 'au centre', 'à droite', 'tout à droite'] as const;

export function aimLabel(v: VaneV, h: VaneH, drag: Point | null = null): string {
  if (drag) {
    const cell = snapToGrid(drag);
    return `${ROW_NAMES[cell.row]} · ${COL_NAMES[cell.col]}`;
  }
  const vertical = v === 'auto' ? 'Hauteur auto' : v === 'swing' ? 'Oscillation verticale' : ROW_NAMES[v];
  const horizontal = h === 'swing' ? 'Balayage horizontal' : h === 'split' ? 'Large' : COL_NAMES[h];
  return `${vertical} · ${horizontal}`;
}

export function swingLabel(v: VaneV, h: VaneH): string {
  if (v === 'swing' && h === 'swing') return 'Les deux';
  if (v === 'swing') return 'Verticale';
  if (h === 'swing') return 'Horizontale';
  return 'Arrêtée';
}
