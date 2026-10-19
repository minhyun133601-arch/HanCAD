import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { evaluateGeometry, type CurveGeometry } from '@hancad/geom';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { draftCircle, draftPolyline } from './entities';
import { trimExtendEntity } from './trim-curves';
import { editCurveEntity } from './modify-curve-geometry';
import { draftLine } from './entities';
import { TrimExtendSession } from './trim-session';
import { editCurve } from './modify-curve-geometry';
import { geometryLength } from '@hancad/geom';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const axis: CurveGeometry = {
  type: 'LINE',
  start: { x: -20, y: 0, z: 0 },
  end: { x: 20, y: 0, z: 0 },
};
describe('TRIM review seam regressions', () => {
  it('retains a true circle intersection at its parameter-zero seam', () => {
    const state = createEmptyCadState(),
      circle = draftCircle(state.settings, { x: 0, y: 0 }, 10, 'circle'),
      result = trimExtendEntity(circle, { x: 0, y: -10 }, [axis], 'TRIM');
    expect(result).toHaveLength(1);
    const curve = result?.[0]?.curve;
    if (curve?.type !== 'ARC') throw new Error('Expected ARC');
    expect(curve.sweepAngle).toBeCloseTo(Math.PI, 10);
    expect(evaluateGeometry(curve, 0.5).y).toBeCloseTo(-10, 9);
  });
  it('retains closed-polyline vertex seam intersections without deleting the whole boundary', () => {
    const state = createEmptyCadState(),
      poly = draftPolyline(
        state.settings,
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: -10 },
          { x: 0, y: -10 },
        ],
        true,
      ),
      diagonal: CurveGeometry = {
        type: 'LINE',
        start: { x: -5, y: -5, z: 0 },
        end: { x: 15, y: 15, z: 0 },
      };
    const result = trimExtendEntity(poly, { x: 5, y: 0 }, [diagonal], 'TRIM', false, true);
    expect(result).toHaveLength(1);
    const curve = result?.[0]?.curve;
    if (curve?.type !== 'LWPOLYLINE') throw new Error('Expected LWPOLYLINE');
    expect(curve.closed).toBe(false);
    expect(curve.vertices).toHaveLength(3);
    expect(curve.vertices[0]!.position).toEqual({ x: 10, y: 10, z: 0 });
    expect(curve.vertices.at(-1)!.position).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('extends either rational SPLINE end with an exact straight tangent section', () => {
    const state = createEmptyCadState(),
      base = draftLine(state.settings, { x: 0, y: 0 }, { x: 10, y: 0 }),
      source: CurveGeometry = {
        type: 'SPLINE',
        degree: 2,
        knots: [0, 0, 0, 1, 1, 1],
        controlPoints: [
          { x: 0, y: 0, z: 0 },
          { x: 5, y: 5, z: 0 },
          { x: 10, y: 0, z: 0 },
        ],
        weights: [1, 0.7, 1],
        fitPoints: [],
        closed: false,
        periodic: false,
        fitTolerance: 0,
        knotParameterization: 'chord',
      },
      entity = editCurveEntity(base, source);
    for (const start of [false, true]) {
      const x = start ? -10 : 20,
        boundary: CurveGeometry = {
          type: 'LINE',
          start: { x, y: -30, z: 0 },
          end: { x, y: 30, z: 0 },
        },
        result = trimExtendEntity(entity, { x: start ? 0 : 10, y: 0 }, [boundary], 'EXTEND'),
        curve = result?.[0]?.curve;
      if (curve?.type !== 'SPLINE') throw new Error('Expected spline');
      expect(evaluateGeometry(curve, start ? 0 : 1).x).toBeCloseTo(x, 9);
      expect(evaluateGeometry(curve, start ? 0.25 : 0.75).y).toBeCloseTo(-5, 9);
      expect(evaluateGeometry(curve, start ? 0.75 : 0.25).y).toBeCloseTo(
        evaluateGeometry(source, 0.5).y,
        9,
      );
    }
  });
  it('fence trims all three crossings of a single polyline through new fragment identities', () => {
    const state = createEmptyCadState(),
      poly = draftPolyline(
        state.settings,
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: -10 },
          { x: 0, y: -10 },
          { x: 0, y: -20 },
          { x: 100, y: -20 },
        ],
        false,
      ),
      a = draftLine(state.settings, { x: 30, y: 5 }, { x: 30, y: -25 }, 'a'),
      b = draftLine(state.settings, { x: 70, y: 5 }, { x: 70, y: -25 }, 'b');
    state.entities = [poly, a, b];
    const session = new TrimExtendSession('TRIM', state, { mode: 0 });
    session.acceptPick({ x: 30, y: 0 }, a);
    session.acceptPick({ x: 70, y: 0 }, b);
    session.acceptText('');
    session.acceptFence([
      { x: 50, y: 5 },
      { x: 50, y: -25 },
    ]);
    const result = session.getSnapshot().state.entities.filter((e) => e.id !== 'a' && e.id !== 'b');
    expect(result).toHaveLength(4);
    expect(result.reduce((sum, e) => sum + geometryLength(editCurve(e)!), 0)).toBeCloseTo(200, 8);
    session.acceptText('U');
    expect(session.getSnapshot().state.entities).toEqual(state.entities);
  });
});
