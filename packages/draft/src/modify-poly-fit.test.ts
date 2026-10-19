import { describe, expect, it } from 'vitest';
import { evaluateGeometry, geometryEvaluation } from '@hancad/geom';
import type { CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { peditProgram } from './modify-poly';
import { peditSpline } from './modify-poly-geometry';
import { splineObject } from './draw-spline';
import { reverseProgram } from './modify-topology';

const p = (x: number, y = 0): CadPoint => ({ x, y: -y || 0 });
const source: CadPolyline = {
  id: 'poly',
  type: 'polyline',
  layer: '0',
  color: '#ffffff',
  lineWidth: 1,
  points: [p(0), p(3, 4), p(6), p(10, 2)],
  closed: false,
};
const context = (entity = source) => ({
  ...outlineContext({ SPLINETYPE: 6, SPLINESEGS: 8, PLINEREVERSEWIDTHS: 1 }),
  entities: [entity],
  selectedIds: [entity.id],
});
describe('retained PEDIT fitting data', () => {
  it('stores tangent directions across independent PEDIT commands and remaps insertion/reversal', () => {
    const first = outlineRun(peditProgram, ['E', 'T', '90', 'I', p(1, 2), 'X', ''], context())
      .entities[0] as CadPolyline;
    expect(first.peditTangents?.['0']).toBeCloseTo(Math.PI / 2);
    const fitted = outlineRun(peditProgram, ['F', ''], context(first)).entities[0] as CadPolyline;
    expect(fitted.sourceType).toBe('POLYLINE_FIT');
    const tangent = geometryEvaluation(fitted.curve!, 0).derivative;
    expect(Math.abs(tangent.x)).toBeLessThan(1e-8);
    expect(tangent.y).toBeGreaterThan(0);
    const reversed = outlineRun(reverseProgram, [], context(fitted)).entities[0] as CadPolyline;
    expect(reversed.points.map(({ x, y }) => ({ x, y }))).toEqual(
      [...first.points].reverse().map(({ x, y }) => ({ x, y })),
    );
    expect(reversed.peditTangents?.[String(first.points.length - 1)]).toBeCloseTo(Math.PI * 1.5);
  });
  it('SPLINESEGS changes real segment counts and negative values fit arcs', () => {
    const sparse = peditSpline(source, 6, 4),
      dense = peditSpline(source, 6, 12),
      arc = peditSpline(source, 6, -4);
    expect(sparse.curve?.type).toBe('LWPOLYLINE');
    expect(dense.curve?.type).toBe('LWPOLYLINE');
    if (
      sparse.curve?.type !== 'LWPOLYLINE' ||
      dense.curve?.type !== 'LWPOLYLINE' ||
      arc.curve?.type !== 'LWPOLYLINE'
    )
      throw new Error('Expected fitted polylines');
    expect(sparse.curve.vertices).toHaveLength(5);
    expect(dense.curve.vertices).toHaveLength(13);
    expect(arc.curve.vertices.some((v) => Math.abs(v.bulge) > 1e-9)).toBe(true);
    expect(arc.points).toEqual(source.points);
    const restored = splineObject(arc)!;
    expect(restored.type).toBe('SPLINE');
    expect(evaluateGeometry(restored, 0)).toMatchObject({ x: 0, y: 0 });
    expect(evaluateGeometry(restored, 1)).toMatchObject({ x: 10, y: 2 });
  });
  it('DELOBJ=0 retains a converted source with a stable new polyline identity', () => {
    const line = { ...source, type: 'line' as const, a: p(0), b: p(5) };
    const ctx = {
      ...outlineContext({ DELOBJ: 0, PEDITACCEPT: 1 }),
      entities: [line],
      selectedIds: [line.id],
    };
    const generator = peditProgram(ctx);
    const first = generator.next();
    if (first.done) throw new Error('Expected options');
    const second = generator.next('R');
    if (second.done) throw new Error('Expected options');
    expect(second.value.partial?.[0]?.id).toBe(first.value.partial?.[0]?.id);
    const result = generator.next('');
    if (!result.done) throw new Error('Expected completion');
    expect(result.value.eraseIds).toEqual([]);
    expect(result.value.entities[0]?.id).not.toBe(line.id);
  });
});
