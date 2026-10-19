import { describe, expect, it } from 'vitest';
import { evaluateGeometry, geometryArea } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import { ellipseProgram, isocircleGeometry } from './draw-ellipse';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import type { DrawValue } from './draw-program';

const p = (x: number, y: number): CadPoint => ({ x, y: -y });
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-9);
const run = (values: DrawValue[], context = outlineContext()) => {
  const curve = outlineRun(ellipseProgram, values, context).entities[0]?.curve;
  if (curve?.type !== 'ELLIPSE') throw new Error('Expected ellipse');
  return curve;
};
describe('ELLIPSE parity scripts', () => {
  it('constructs axis-end, center and picked second axis methods', () => {
    for (const values of [
      [p(-10, 0), p(10, 0), '5'],
      ['C', p(0, 0), p(10, 0), '5'],
      ['C', p(0, 0), p(10, 0), p(0, 5)],
    ] satisfies DrawValue[][]) {
      const curve = run(values);
      close(curve.center.x, 0);
      close(curve.center.y, 0);
      close(curve.majorAxis.x, 10);
      close(curve.minorAxis.y, 5);
      close(geometryArea(curve)!, 50 * Math.PI);
    }
  });
  it('rotation derives the second axis from projected circle and rejects near-flat input', () => {
    const curve = run([p(-10, 0), p(10, 0), 'R', '90', '60']);
    close(curve.minorAxis.y, 5);
    close(run([p(-10, 0), p(10, 0), 'R', '0']).minorAxis.y, 10);
  });
  it('accepts an initially shorter first axis and arbitrary rotated geometry', () => {
    const curve = run(['C', p(4, 7), p(7, 11), '10']);
    close(curve.majorAxis.x, 3);
    close(curve.majorAxis.y, 4);
    close(curve.minorAxis.x, -8);
    close(curve.minorAxis.y, 6);
  });
  it('angle and parameter modes have different correct endpoints', () => {
    const angle = run(['A', p(-10, 0), p(10, 0), '5', '0', '45']);
    const parameter = run(['A', 'C', p(0, 0), p(10, 0), '5', 'P', '0', '45']);
    const end = evaluateGeometry(angle, 1),
      paramEnd = evaluateGeometry(parameter, 1);
    close(end.x, Math.sqrt(20));
    close(end.y, Math.sqrt(20));
    close(paramEnd.x, 5 * Math.sqrt(2));
    close(paramEnd.y, 2.5 * Math.sqrt(2));
    const switched = run(['A', p(-10, 0), p(10, 0), '5', 'P', '0', 'A', '45']);
    close(evaluateGeometry(switched, 1).x, end.x);
  });
  it('supports included angle, included parameter and signed sweeps', () => {
    const curve = run(['A', p(-10, 0), p(10, 0), '5', '0', 'I', '90']);
    close(curve.sweepParameter, Math.PI / 2);
    const negative = run(['A', p(-10, 0), p(10, 0), '5', 'P', '45', 'I', '-90']);
    close(negative.startParameter, Math.PI / 4);
    close(negative.sweepParameter, -Math.PI / 2);
  });
  it('previews the same signed included sweep that a pointer pick accepts from a nonzero start', () => {
    for (const parametric of [false, true])
      for (const degrees of [30, -30]) {
        const program = ellipseProgram(outlineContext());
        let request = program.next();
        for (const input of [
          'A',
          p(-10, 0),
          p(10, 0),
          '5',
          ...(parametric ? ['P'] : []),
          '60',
          'I',
        ])
          request = program.next(input);
        if (request.done) throw new Error('Expected included-angle request');
        const radians = (degrees * Math.PI) / 180,
          cursor = p(10 * Math.cos(radians), 10 * Math.sin(radians)),
          preview = request.value.preview?.(cursor)[0]?.curve;
        const accepted = program.next(cursor);
        if (!accepted.done) throw new Error('Expected accepted ellipse');
        expect(preview).toEqual(accepted.value.entities[0]?.curve);
        if (preview?.type !== 'ELLIPSE') throw new Error('Expected preview ellipse');
        expect(Math.sign(preview.sweepParameter)).toBe(Math.sign(degrees));
        expect(Math.abs(preview.sweepParameter)).toBeLessThan(Math.PI / 2);
      }
  });
  it('isocircle is offered only with isometric snap and honors all three isoplanes', () => {
    for (const plane of [0, 1, 2]) {
      const context = outlineContext({ SNAPSTYL: 1, SNAPISOPAIR: plane });
      const curve = run(['I', p(3, 4), 'D', '10'], context);
      const expected = isocircleGeometry(context, p(3, 4), 5);
      close(curve.majorAxis.x, expected.majorAxis.x);
      close(curve.majorAxis.y, expected.majorAxis.y);
      close(Math.hypot(curve.majorAxis.x, curve.majorAxis.y), 5 * Math.sqrt(1.5));
      close(Math.hypot(curve.minorAxis.x, curve.minorAxis.y), 5 / Math.sqrt(2));
    }
    const program = ellipseProgram(outlineContext());
    const initial = program.next();
    if (initial.done) throw new Error('Expected ellipse prompt');
    expect(initial.value.en).not.toContain('Isocircle');
  });
});
