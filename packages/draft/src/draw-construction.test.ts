import { describe, expect, it } from 'vitest';
import type { CadPoint } from '@hancad/legacy-bridge';
import { draftLine } from './entities';
import { xlineProgram, rayProgram } from './draw-construction';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import type { DrawValue } from './draw-program';

const p = (x: number, y: number): CadPoint => ({ x, y: -y });
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-9);
const run = (values: DrawValue[], context = outlineContext()) => {
  const curve = outlineRun(xlineProgram, values, context).entities[0]?.curve;
  if (curve?.type !== 'XLINE') throw new Error('Expected XLINE');
  return curve;
};
describe('XLINE and RAY parity scripts', () => {
  it('uses exact unbounded geometry for point, Hor, Ver, Ang and repeated rays', () => {
    const through = run([p(1, 2), p(4, 6), '']);
    close(through.direction.x, 0.6);
    close(through.direction.y, 0.8);
    close(run(['H', p(1, 2), '']).direction.x, 1);
    close(run(['H', p(1, 2), '']).direction.y, 0);
    close(run(['V', p(1, 2), '']).direction.x, 0);
    close(run(['V', p(1, 2), '']).direction.y, 1);
    const angle = run(['A', '30', p(1, 2), '']);
    close(angle.direction.x, Math.sqrt(3) / 2);
    close(angle.direction.y, 0.5);
    const rays = outlineRun(rayProgram, [p(0, 0), p(1, 0), p(0, 1), '']).entities;
    expect(rays).toHaveLength(2);
    expect(rays.every((e) => e.curve?.type === 'RAY')).toBe(true);
  });
  it('Ang Reference measures CCW from the chosen line', () => {
    const context = outlineContext(),
      entity = draftLine(context.settings, p(0, 0), p(1, 1));
    const curve = run(['A', 'R', { entity, point: p(0.5, 0.5) }, '45', p(4, 5), '']);
    close(curve.direction.x, 0);
    close(curve.direction.y, 1);
  });
  it('bisects the angle and permits further end points from the same vertex', () => {
    const curves = outlineRun(xlineProgram, [
      'B',
      p(0, 0),
      p(1, 0),
      p(0, 1),
      p(0, -1),
      '',
    ]).entities;
    expect(curves).toHaveLength(2);
    const a = curves[0]?.curve,
      b = curves[1]?.curve;
    if (a?.type !== 'XLINE' || b?.type !== 'XLINE') throw new Error('Expected XLINE');
    close(a.direction.x, Math.SQRT1_2);
    close(a.direction.y, Math.SQRT1_2);
    close(b.direction.x, Math.SQRT1_2);
    close(b.direction.y, -Math.SQRT1_2);
  });
  it('Offset distance, side, Through and remembered OFFSETDIST match their constructions', () => {
    const context = outlineContext(),
      entity = draftLine(context.settings, p(0, 0), p(10, 0)),
      selected = { entity, point: p(5, 0) };
    const a = run(['O', '5', selected, p(5, 100), ''], context);
    close(a.basePoint.y, 5);
    expect(context.get('OFFSETDIST')).toBe(5);
    const b = run(['O', '', selected, p(5, -100), ''], context);
    close(b.basePoint.y, -5);
    const c = run(['O', 'T', selected, p(100, 12), ''], context);
    close(c.basePoint.y, 12);
    expect(context.get('OFFSETDIST')).toBe(-1);
  });
  it('retains accepted repeated geometry on Escape and previews the next entity', () => {
    const program = rayProgram(outlineContext());
    program.next();
    program.next(p(0, 0));
    const prompt = program.next(p(1, 0));
    if (prompt.done) throw new Error('Expected ray through prompt');
    expect(prompt.value.partial).toHaveLength(1);
    expect(prompt.value.preview?.(p(0, 1))).toHaveLength(2);
  });
});
