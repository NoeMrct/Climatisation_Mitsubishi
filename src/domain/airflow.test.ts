import { describe, expect, it } from 'vitest';
import { aimLabel, airflowView, beamTransform, colX, rowY, snapToGrid, surfacePoint, swingLabel } from './airflow';

describe('scène du flux d’air', () => {
  it('cale un point sur la position de volets la plus proche', () => {
    expect(snapToGrid({ x: colX(2) + 10, y: rowY(3) - 5 })).toEqual({ col: 2, row: 3 });
    expect(snapToGrid({ x: 0, y: 1000 })).toEqual({ col: 0, row: 4 });
  });

  it('convertit le pointeur en unités de dessin, borné à la zone', () => {
    const rect = { left: 0, top: 0, width: 342, height: 264 };
    expect(surfacePoint(rect, 171, 132)).toEqual({ x: 171, y: 244 });
    expect(surfacePoint(rect, -50, -50)).toEqual({ x: colX(0) - 16, y: rowY(0) - 14 });
  });

  it('incline et étire le jet vers la cible', () => {
    expect(beamTransform(171, rowY(3), 'heat')).toBe('skewX(0.00deg) scaleY(1.086)');
    expect(beamTransform(colX(4), rowY(0), 'cool')).toMatch(/^skewX\(5\d\.\d\ddeg\) scaleY\(0\.381\)$/);
  });

  it('montre un seul jet pour une position fixe', () => {
    const view = airflowView({ v: 3, h: 2, drag: null, look: 'heat', power: true });
    expect(view.beams.map((beam) => beam.opacity)).toEqual([1, 0, 0]);
    expect(view.zone.opacity).toBe(0);
  });

  it('montre la zone balayée et deux jets fantômes en oscillation verticale', () => {
    const view = airflowView({ v: 'swing', h: 2, drag: null, look: 'cool', power: true });
    expect(view.beams.map((beam) => beam.opacity)).toEqual([1, 0.25, 0.25]);
    expect(view.zone.opacity).toBe(1);
  });

  it('coupe le jet en deux pour le soufflage large', () => {
    const view = airflowView({ v: 3, h: 'split', drag: null, look: 'heat', power: true });
    expect(view.beams[0].clipPath).toBe('inset(0 50% 0 0)');
    expect(view.beams[1].clipPath).toBe('inset(0 0 0 50%)');
  });

  it('suit le doigt pendant le glissement et masque tout à l’arrêt', () => {
    const drag = { x: 100, y: 200 };
    const view = airflowView({ v: 'swing', h: 'swing', drag, look: 'heat', power: true });
    expect(view.beams[0].transform).toBe(beamTransform(100, 200, 'heat'));
    expect(view.zone.opacity).toBe(0);
    const off = airflowView({ v: 'swing', h: 2, drag: null, look: 'heat', power: false });
    expect(off.beams.every((beam) => beam.opacity === 0)).toBe(true);
    expect(off.zone.opacity).toBe(0);
  });

  it('nomme la direction du flux', () => {
    expect(aimLabel(3, 2)).toBe('Mi-bas · Centre');
    expect(aimLabel('auto', 'split')).toBe('Hauteur auto · Large');
    expect(aimLabel('swing', 'swing')).toBe('Oscillation verticale · Balayage horizontal');
    expect(swingLabel('swing', 'swing')).toBe('Les deux');
    expect(swingLabel(1, 'split')).toBe('Arrêtée');
  });
});
