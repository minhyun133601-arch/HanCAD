import { describe, expect, it } from 'vitest';
import { evaluateGeometry, geometryLength } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import { arcProgram, arcStartEndAngle, arcStartEndRadius, arcTangent } from './draw-arc';
import { draftLine } from './entities';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import type { DrawValue } from './draw-program';

const p = (x: number, y: number): CadPoint => ({ x, y: -y });
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-9);
const run = (values: DrawValue[], context = outlineContext()) => {
  const result = outlineRun(arcProgram, values, context).entities[0]?.curve;
  if (result?.type !== 'ARC') throw new Error('Expected exact ARC');
  return result;
};
describe('ARC eleven construction methods and continuation', () => {
  const start = p(5, 0),
    center = p(0, 0),
    end = p(0, 5),
    half = p(5 / Math.sqrt(2), 5 / Math.sqrt(2));
  const quarterCases: [string, DrawValue[]][] = [
    ['three points', [start, half, end]],
    ['start center end', [start, 'C', center, end]],
    ['start center angle', [start, 'C', center, 'A', '90']],
    ['start center length', [start, 'C', center, 'L', String(5 * Math.sqrt(2))]],
    ['start end center', [start, 'E', end, center]],
    ['start end angle', [start, 'E', end, 'A', '90']],
    ['start end direction', [start, 'E', end, 'D', '90']],
    ['start end radius', [start, 'E', end, 'R', '5']],
    ['center start end', ['C', center, start, end]],
    ['center start angle', ['C', center, start, 'A', '90']],
    ['center start length', ['C', center, start, 'L', String(5 * Math.sqrt(2))]],
  ];
  it.each(quarterCases)('constructs %s to 1e-9', (_, values) => {
    const curve = run(values);
    close(curve.center.x, 0);
    close(curve.center.y, 0);
    close(curve.radius, 5);
    close(curve.startAngle, 0);
    close(curve.sweepAngle, Math.PI / 2);
    close(evaluateGeometry(curve, 1).x, 0);
    close(evaluateGeometry(curve, 1).y, 5);
    close(geometryLength(curve), Math.PI * 2.5);
  });
  it('uses the third point as a ray from center and projects it onto the arc', () => {
    const arc = run([start, 'C', center, p(0, 100)]);
    close(evaluateGeometry(arc, 1).y, 5);
  });
  it('picked included angles match the preview for a rotated start radial', () => {
    const arc = run([p(0, 5), 'C', center, 'A', p(-5, 0)]);
    close(arc.startAngle, Math.PI / 2);
    close(arc.sweepAngle, Math.PI / 2);
    close(evaluateGeometry(arc, 1).x, -5);
  });
  it('negative angle draws clockwise and negative chord or radius draws a major CCW arc', () => {
    close(run([start, 'C', center, 'A', '-90']).sweepAngle, -Math.PI / 2);
    close(run([start, 'C', center, 'L', String(-5 * Math.sqrt(2))]).sweepAngle, Math.PI * 1.5);
    close(run([start, 'E', end, 'R', '-5']).sweepAngle, Math.PI * 1.5);
    close(run([start, p(0, -5), p(-5, 0)]).sweepAngle, -Math.PI);
  });
  it('Enter continues tangent from a line, arc, straight polyline and bulged polyline', () => {
    const ctx = outlineContext();
    ctx.entities = [draftLine(ctx.settings, p(-5, 0), p(0, 0))];
    const arc = run(['', p(5, 5)], ctx);
    close(arc.center.x, 0);
    close(arc.center.y, 5);
    close(arc.radius, 5);
    const previous = outlineRun(arcProgram, [start, 'C', center, end]).entities;
    const next = run(['', p(-5, 0)], { ...ctx, entities: previous });
    close(next.center.x, 0);
    close(next.center.y, 0);
    close(next.sweepAngle, Math.PI / 2);
    const poly = {
      ...draftLine(ctx.settings, p(0, 0), p(1, 0)),
      type: 'polyline' as const,
      points: [p(-5, 0), p(0, 0)],
      closed: false,
    };
    close(run(['', p(5, 5)], { ...ctx, entities: [poly] }).radius, 5);
    const bulged = { ...poly, points: [p(5, 0), p(0, 5)], bulges: [-Math.tan(Math.PI / 8)] };
    close(run(['', p(-5, 0)], { ...ctx, entities: [bulged] }).radius, 5);
  });
  it('rejects geometrically impossible constructions and preserves directed major arcs', () => {
    expect(arcStartEndRadius(p(0, 0), p(10, 0), 4)).toBeUndefined();
    expect(arcStartEndAngle(p(0, 0), p(10, 0), 0)).toBeUndefined();
    expect(arcTangent(p(0, 0), p(10, 0), p(1, 0))).toBeUndefined();
    const arc = arcStartEndAngle(p(0, 0), p(10, 0), -Math.PI * 1.5)!;
    close(arc.sweepAngle, -Math.PI * 1.5);
    close(arc.radius, 5 * Math.sqrt(2));
  });
});
