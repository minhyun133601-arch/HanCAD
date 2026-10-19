import { describe, expect, it } from 'vitest';
import { evaluateGeometry } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import { helixProgram } from './draw-helix';
import { sketchProgram } from './draw-sketch';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import type { DrawValue } from './draw-program';

const p = (x: number, y: number, z?: number): CadPoint => ({
  x,
  y: -y,
  ...(z === undefined ? {} : { z }),
});
const sample = (x: number, y: number): DrawValue => ({ sample: p(x, y) });
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-9);
describe('HELIX and SKETCH parity scripts', () => {
  it('constructs a zero-height analytic spiral with radius and diameter input', () => {
    const context = outlineContext();
    const entity = outlineRun(helixProgram, [p(3, 4), 'D', '4', 'D', '12', 'T', '2', '0'], context)
      .entities[0];
    const curve = entity?.curve;
    if (curve?.type !== 'HELIX') throw new Error('Expected analytic HELIX');
    expect(curve).toMatchObject({ baseRadius: 2, topRadius: 6, turns: 2, height: 0 });
    close(evaluateGeometry(curve, 0.125).x, 3);
    close(evaluateGeometry(curve, 0.125).y, 6.5);
    expect(context.memory?.get('HELIX_TURNS')).toBe(2);
  });
  it('supports twist, turn height and axis endpoint direction', () => {
    const turn = outlineRun(helixProgram, [p(0, 0), '2', '4', 'W', 'CW', 'H', '2', '8']).entities[0]
      ?.curve;
    if (turn?.type !== 'HELIX') throw new Error('Expected analytic HELIX');
    expect(turn).toMatchObject({ clockwise: true, turns: 4, height: 8 });
    const axis = outlineRun(helixProgram, [p(0, 0, 0), '2', '4', 'A', p(0, 0, 10)]).entities[0]
      ?.curve;
    if (axis?.type !== 'HELIX') throw new Error('Expected analytic HELIX');
    expect(axis.normal).toEqual({ x: 0, y: 0, z: 1 });
    close(axis.height, 10);
  });
  it('rejects zero radii together, turns above 500, and remembers base defaults', () => {
    const context = outlineContext();
    const curve = outlineRun(
      helixProgram,
      [p(0, 0), '0', '0', '3', 'T', '501', '500', '0'],
      context,
    ).entities[0]?.curve;
    expect(curve?.type).toBe('HELIX');
    if (curve?.type !== 'HELIX') return;
    expect(curve.turns).toBe(500);
    expect(curve.topRadius).toBe(3);
    expect(context.memory?.get('HELIX_BASERADIUS')).toBe(0);
  });
  it('streams only pen-down samples greater than SKETCHINC and supports pen-up travel', () => {
    const context = outlineContext({ SKETCHINC: 1, SKPOLY: 0 });
    const result = outlineRun(
      sketchProgram,
      [
        sample(99, 99),
        p(0, 0),
        sample(0.5, 0),
        sample(1, 0),
        sample(2, 0),
        sample(4, 0),
        p(4, 0),
        sample(99, 99),
        p(10, 0),
        sample(12, 0),
        p(12, 0),
        '',
      ],
      context,
    );
    expect(result.entities).toHaveLength(3);
    expect(result.entities[0]).toMatchObject({ type: 'line', a: p(0, 0), b: p(2, 0) });
    expect(result.entities[2]).toMatchObject({ type: 'line', a: p(10, 0), b: p(12, 0) });
  });
  it('supports Type Polyline/Spline, Increment, tolerance, previews and Escape partial geometry', () => {
    const context = outlineContext();
    const result = outlineRun(
      sketchProgram,
      [
        'T',
        'P',
        'I',
        '0.5',
        p(0, 0),
        sample(1, 0),
        sample(2, 1),
        p(2, 1),
        'T',
        'S',
        'L',
        '0.1',
        p(5, 0),
        sample(6, 1),
        sample(7, 0),
        '',
      ],
      context,
    );
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]?.type).toBe('polyline');
    const curve = result.entities[1]?.curve;
    expect(curve?.type).toBe('SPLINE');
    if (curve?.type === 'SPLINE') {
      expect(curve.fitTolerance).toBe(0.1);
      close(evaluateGeometry(curve, 0.5).x, 6);
      close(evaluateGeometry(curve, 0.5).y, 1);
    }
    expect(context.get('SKPOLY')).toBe(2);
    expect(context.get('SKETCHINC')).toBe(0.5);
    const program = sketchProgram(context);
    program.next();
    program.next(p(0, 0));
    const prompt = program.next(sample(1, 1));
    if (prompt.done) throw new Error('Expected sketch sample prompt');
    expect(prompt.value.partial).toHaveLength(1);
    expect(prompt.value.preview?.(p(99, 99))).toHaveLength(1);
  });
});
