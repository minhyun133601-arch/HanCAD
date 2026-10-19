import { describe, expect, it } from 'vitest';
import { evaluateGeometry, geometryEvaluation, type SplineGeometry } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import { draftPolyline } from './entities';
import { splineProgram } from './draw-spline';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import type { DrawValue } from './draw-program';

const p = (x: number, y: number): CadPoint => ({ x, y: -y });
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-9);
const run = (values: DrawValue[], context = outlineContext()): SplineGeometry => {
  const curve = outlineRun(splineProgram, values, context).entities[0]?.curve;
  if (curve?.type !== 'SPLINE') throw new Error('Expected exact spline');
  return curve;
};
describe('SPLINE parity scripts', () => {
  it('exact cubic Fit passes through every fit point with tolerance zero', () => {
    const curve = run([p(0, 0), p(5, 5), p(10, 0), '', '', '']);
    close(evaluateGeometry(curve, 0).x, 0);
    close(evaluateGeometry(curve, 0.5).x, 5);
    close(evaluateGeometry(curve, 0.5).y, 5);
    close(evaluateGeometry(curve, 1).x, 10);
    expect(curve.fitTolerance).toBe(0);
    expect(curve.degree).toBe(3);
  });
  it.each([
    ['C', 0, 'chord'],
    ['S', 1, 'centripetal'],
    ['U', 2, 'uniform'],
  ] as const)('remembers Knots %s and preserves exact fit points', (choice, value, name) => {
    const context = outlineContext();
    const curve = run(['K', choice, p(0, 0), p(2, 3), p(10, 0), '', '', ''], context);
    expect(context.get('SPLKNOTS')).toBe(value);
    expect(curve.knotParameterization).toBe(name);
    const interval =
      value === 2
        ? 0.5
        : value === 1
          ? Math.sqrt(Math.sqrt(13)) / (Math.sqrt(Math.sqrt(13)) + Math.sqrt(Math.sqrt(73)))
          : Math.sqrt(13) / (Math.sqrt(13) + Math.sqrt(73));
    close(evaluateGeometry(curve, interval).x, 2);
    close(evaluateGeometry(curve, interval).y, 3);
  });
  it('supports CV degree 1..10 with clamped end knots', () => {
    for (let degree = 1; degree <= 10; degree++) {
      const context = outlineContext(),
        points = Array.from({ length: degree + 1 }, (_, i) => p(i, i % 2));
      const curve = run(['M', 'CV', 'D', String(degree), ...points, ''], context);
      expect(curve.degree).toBe(degree);
      if (degree <= 5) expect(context.get('SPLDEGREE')).toBe(degree);
      expect(context.memory?.get('SPLINE.DEGREE')).toBe(degree);
      expect(context.get('SPLMETHOD')).toBe(1);
      close(evaluateGeometry(curve, 0).x, 0);
      close(evaluateGeometry(curve, 1).x, degree);
      expect(curve.knots.slice(0, degree + 1)).toEqual(Array(degree + 1).fill(0));
    }
  });
  it('creates periodic closed Fit and CV curves and supports Undo', () => {
    const fit = run([p(0, 0), p(1, 0), p(1, 99), 'U', p(1, 1), p(0, 1), 'C']);
    const cv = run(['M', 'CV', p(0, 0), p(1, 0), p(1, 1), p(0, 1), 'C']);
    for (const curve of [fit, cv]) {
      expect(curve.periodic).toBe(true);
      expect(curve.closed).toBe(true);
      const start = geometryEvaluation(curve, 0),
        end = geometryEvaluation(curve, 1);
      close(start.point.x, end.point.x);
      close(start.point.y, end.point.y);
      close(start.derivative.x, end.derivative.x);
      close(start.derivative.y, end.derivative.y);
    }
  });
  it('supports endpoint tangency and fit tolerance without moving the endpoints', () => {
    const curve = run([p(0, 0), p(5, 5), p(10, 0), 'T', '0.25', '', p(5, 0), p(5, 0)]);
    expect(curve.fitTolerance).toBe(0.25);
    close(geometryEvaluation(curve, 0).derivative.y, 0);
    close(geometryEvaluation(curve, 1).derivative.y, 0);
    expect(geometryEvaluation(curve, 0).derivative.x).toBeGreaterThan(0);
    expect(geometryEvaluation(curve, 1).derivative.x).toBeGreaterThan(0);
    close(evaluateGeometry(curve, 0).x, 0);
    close(evaluateGeometry(curve, 1).x, 10);
  });
  it('SPLPERIODIC zero retains legacy closed curves without imposing periodic derivatives', () => {
    for (const cv of [false, true]) {
      const context = outlineContext({ SPLPERIODIC: 0 });
      const curve = run(
        [...(cv ? ['M', 'CV'] : []), p(0, 0), p(3, 0), p(2, 1), p(0, 2), 'C'],
        context,
      );
      expect(curve.closed).toBe(true);
      expect(curve.periodic).toBe(false);
      const start = evaluateGeometry(curve, 0),
        finish = evaluateGeometry(curve, 1);
      close(start.x, finish.x);
      close(start.y, finish.y);
    }
  });
  it('converts only spline-fit polylines and honors DELOBJ', () => {
    for (const delobj of [0, 1]) {
      const context = outlineContext({ DELOBJ: delobj });
      const entity = {
        ...draftPolyline(context.settings, [p(0, 0), p(1, 1), p(2, 1), p(3, 0)]),
        sourceType: 'POLYLINE_SPLINE_CUBIC',
      };
      const result = outlineRun(splineProgram, ['O', { entity, point: p(1, 1) }, ''], context);
      expect(result.entities[0]?.curve?.type).toBe('SPLINE');
      expect(result.eraseIds).toEqual(delobj ? [entity.id] : []);
      const rejected = outlineRun(
        splineProgram,
        ['O', { entity: { ...entity, sourceType: 'LWPOLYLINE' }, point: p(1, 1) }, ''],
        context,
      );
      expect(rejected.entities).toHaveLength(0);
    }
  });
});
