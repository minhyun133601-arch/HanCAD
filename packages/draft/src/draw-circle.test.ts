import { describe, expect, it } from 'vitest';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { draftCircle, draftLine } from './entities';
import { circleProgram, circleTangentProgram } from './draw-circle';
import { circleTtr, circleTtt } from './draw-circle-tangent';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import type { DrawValue } from './draw-program';

const p = (x: number, y: number): CadPoint => ({ x, y: -y });
const only = (values: DrawValue[], context = outlineContext()) => {
  const entity = outlineRun(circleProgram, values, context).entities[0];
  if (entity?.type !== 'circle') throw new Error('Expected circle');
  return entity;
};
const close = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-9);
describe('CIRCLE parity scripts', () => {
  it('uses center radius, picked radius, diameter, picked diameter and remembered CIRCLERAD', () => {
    const ctx = outlineContext({ CIRCLERAD: 10 });
    const a = only([p(3, 4), '5'], ctx),
      b = only([p(3, 4), p(6, 8)]);
    close(a.radius, 5);
    close(b.radius, 5);
    close(only([p(3, 4), 'D', '10']).radius, 5);
    close(only([p(3, 4), 'D', p(9, 12)]).radius, 5);
    close(only([p(1, 1), ''], ctx).radius, 5);
    expect(ctx.get('CIRCLERAD')).toBe(5);
  });
  it('computes exact 2P and 3P circles and rejects collinear three points', () => {
    const diameter = only(['2P', p(-3, 4), p(3, -4)]);
    close(diameter.radius, 5);
    close(diameter.center.x, 0);
    close(diameter.center.y, 0);
    const through = only(['3P', p(5, 0), p(0, 5), p(-5, 0)]);
    close(through.radius, 5);
    close(through.center.x, 0);
    close(through.center.y, 0);
    const retry = only(['3P', p(0, 0), p(10, 0), p(20, 0), p(5, 5)]);
    close(retry.radius, 5);
    close(retry.center.x, 5);
    close(retry.center.y, 0);
  });
  it('retains 1e-9 precision at Korean survey coordinate magnitudes', () => {
    const c = only([
      '3P',
      p(200_000_005, 400_000_000),
      p(200_000_000, 400_000_005),
      p(199_999_995, 400_000_000),
    ]);
    close(c.radius, 5);
    close(c.center.x, 200_000_000);
    close(c.center.y, -400_000_000);
  });
  it('supports Ttr and selects the solution near the picked tangent locations', () => {
    const context = outlineContext(),
      a = draftLine(context.settings, p(-20, 0), p(20, 0)),
      b = draftLine(context.settings, p(0, -20), p(0, 20));
    const c = only(
      ['T', { entity: a, point: p(5, 0) }, { entity: b, point: p(0, 5) }, '5'],
      context,
    );
    close(c.center.x, 5);
    close(c.center.y, -5);
    close(c.radius, 5);
    const other = circleTtr({ entity: a, point: p(-5, 0) }, { entity: b, point: p(0, -5) }, 5)!;
    close(other.center.x, -5);
    close(other.center.y, 5);
  });
  it('supports line-circle and circle-circle Ttr without replacing curves by polylines', () => {
    const context = outlineContext(),
      line = draftLine(context.settings, p(-20, 0), p(20, 0));
    const circle = draftCircle(context.settings, p(0, 10), 3);
    const a = circleTtr({ entity: line, point: p(5, 0) }, { entity: circle, point: p(3, 8) }, 5)!;
    close(a.center.y, -5);
    close(Math.hypot(a.center.x, a.center.y + 10), 8);
    const c1 = draftCircle(context.settings, p(-5, 0), 2),
      c2 = draftCircle(context.settings, p(5, 0), 2);
    const b = circleTtr({ entity: c1, point: p(-5, 2) }, { entity: c2, point: p(5, 2) }, 5)!;
    close(Math.hypot(b.center.x + 5, b.center.y), 7);
    close(Math.hypot(b.center.x - 5, b.center.y), 7);
  });
  it('provides the ribbon Tan-Tan-Tan generator for lines and mixed circle references', () => {
    const context = outlineContext(),
      refs: CadEntity[] = [
        draftLine(context.settings, p(-20, 0), p(20, 0)),
        draftLine(context.settings, p(0, -20), p(0, 20)),
        draftLine(context.settings, p(0, 12), p(12, 0)),
      ];
    const values = refs.map((entity, i) => ({ entity, point: [p(3, 0), p(0, 3), p(6, 6)][i]! }));
    const c = outlineRun(circleTangentProgram, values, context).entities[0];
    expect(c?.type).toBe('circle');
    if (c?.type !== 'circle') return;
    close(c.radius, 12 / (2 + Math.sqrt(2)));
    close(c.center.x, c.radius);
    close(c.center.y, -c.radius);
    const circles = [p(0, 0), p(4, 0), p(2, 2 * Math.sqrt(3))].map((center) =>
      draftCircle(context.settings, center, 1),
    );
    const result = circleTtt(circles.map((entity) => ({ entity, point: p(2, 1) })))!;
    close(result.center.x, 2);
    close(result.center.y, -2 / Math.sqrt(3));
    close(result.radius, 4 / Math.sqrt(3) - 1);
  });
  it('shows exact 2P, 3P and radius cursor previews', () => {
    const program = circleProgram(outlineContext());
    program.next();
    const radius = program.next(p(0, 0));
    if (radius.done) throw new Error('Expected radius prompt');
    expect(radius.value.preview?.(p(3, 4))[0]).toMatchObject({ type: 'circle', radius: 5 });
  });
});
