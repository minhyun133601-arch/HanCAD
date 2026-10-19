import { describe, expect, it } from 'vitest';
import { evaluateGeometry, geometryEvaluation, type ArcGeometry } from '@hancad/geom';
import type { CadEntity, CadPolyline } from '@hancad/legacy-bridge';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { editCurveEntity } from './modify-curve-geometry';
import { extendJoinPair } from './modify-join-extend';
import { joinEntities, joinProgram } from './modify-topology';
import { peditProgram } from './modify-poly';
import { splineditProgram } from './modify-spline';
import { splineFromPoints } from './draw-spline';
import { peditSpline } from './modify-poly-geometry';

const points = [
  { x: 0, y: 0 },
  { x: 2, y: -3 },
  { x: 4, y: 0 },
  { x: 6, y: -3 },
  { x: 8, y: 0 },
];
const poly: CadPolyline = {
  id: 'poly',
  layer: '0',
  color: '#ffffff',
  lineWidth: 1,
  type: 'polyline',
  points,
  closed: false,
};
const line = (id: string, start: number, end: number): CadEntity => ({
  ...poly,
  id,
  type: 'line',
  a: { x: start, y: 0 },
  b: { x: end, y: 0 },
});
const context = (entities: CadEntity[], selected = [entities[0]!.id]) => ({
  ...outlineContext({ DELOBJ: 1, PEDITACCEPT: 1, SPLINETYPE: 6, SPLINESEGS: 8 }),
  entities,
  selectedIds: selected,
});
const circular = (x: number, y: number, startAngle: number, sweepAngle: number): ArcGeometry => ({
  type: 'ARC',
  center: { x, y, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xAxis: { x: 1, y: 0, z: 0 },
  radius: 5,
  startAngle,
  sweepAngle,
});
describe('requested PEDIT and SPLINEDIT option audit', () => {
  it('JOIN exposes Close after host-selected single ARC and accepts ALL for a LINE source', () => {
    const arc = editCurveEntity(poly, circular(0, 0, 0, Math.PI / 2));
    expect(outlineRun(joinProgram, ['C'], context([arc])).entities[0]?.type).toBe('circle');
    const a = line('a', 0, 2),
      b = line('b', 3, 5);
    const joined = outlineRun(joinProgram, ['ALL', ''], context([a, b], ['a']));
    expect(joined.entities[0]).toMatchObject({
      type: 'line',
      a: { x: 0, y: 0 },
      b: { x: 5, y: 0 },
    });
  });
  it('PEDIT Extend joins a collinear gap and a line to an exact circular endpoint without changing sources', () => {
    const a = line('a', 0, 2),
      b = line('b', 3, 5);
    expect(joinEntities([a, b], true, 2, 'Extend').consumed).toHaveLength(2);
    const first = line('line', 0, 4.9),
      arc = circular(5, 5, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    const second = editCurveEntity(b, arc),
      before = JSON.stringify([first, second]);
    const joined = joinEntities([first, second], true, 1, 'Extend');
    expect(joined.consumed).toHaveLength(2);
    expect(joined.entities[0]?.curve?.type).toBe('LWPOLYLINE');
    expect(JSON.stringify([first, second])).toBe(before);
    const c = joined.entities[0]!.curve;
    if (c?.type !== 'LWPOLYLINE') throw new Error('Expected polyline');
    expect(c.vertices[1]!.position.x).toBeCloseTo(5, 10);
    expect(c.vertices[1]!.bulge).toBeCloseTo(Math.tan(Math.PI / 8), 10);
  });
  it('PEDIT Extend joins two different circular arcs at the nearest common point', () => {
    const result = extendJoinPair(
      circular(0, 0, 0, Math.PI / 2),
      circular(5, 5, Math.PI + 0.05, Math.PI / 2 - 0.05),
    );
    expect(result).toBeDefined();
    const a = evaluateGeometry(result![0], 1),
      b = evaluateGeometry(result![1], 0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-9);
    expect(a.x).toBeCloseTo(0, 10);
    expect(a.y).toBeCloseTo(5, 10);
  });
  it('Edit vertex Break permanently discards spline fitting while preserving both surviving paths', () => {
    const spline = peditSpline(poly, 6, 8);
    const result = outlineRun(peditProgram, ['E', 'N', 'B', 'N', 'G', 'X', ''], context([spline]));
    expect(result.entities).toHaveLength(2);
    expect(
      result.entities.every((e) => e.sourceType === 'LWPOLYLINE' && !e.curve && !e.drawPaths),
    ).toBe(true);
    expect(result.entities[0]).toMatchObject({ points: points.slice(0, 2) });
    expect(result.entities[1]).toMatchObject({ points: points.slice(2) });
  });
  it('Edit vertex Break opens a closed path while retaining its closing-edge geometry', () => {
    const source = { ...poly, closed: true };
    const result = outlineRun(peditProgram, ['E', 'N', 'B', 'N', 'G', 'X', ''], context([source]));
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({
      closed: false,
      points: [...points.slice(2), ...points.slice(0, 2)],
    });
  });
  it('Edit vertex Straighten Go collapses interior vertices and Regen retains explicit tangent data', () => {
    const result = outlineRun(
      peditProgram,
      ['E', 'T', '0', 'S', 'N', 'N', 'G', 'R', 'X', ''],
      context([poly]),
    );
    expect(result.entities[0]).toMatchObject({
      points: [points[0], ...points.slice(2)],
      peditTangents: { 0: 0 },
    });
  });
  it('Fit data Add/Delete/Purge execute sequentially and vertex Delete/Move still leave valid splines', () => {
    const source = { ...poly, curve: splineFromPoints(poly.points, true, 3, 0) };
    const result = outlineRun(
      splineditProgram,
      [
        'F',
        'A',
        '1',
        'A',
        { x: 1, y: -1 },
        'D',
        '2',
        'P',
        'E',
        'D',
        '2',
        'M',
        '2',
        { x: 2, y: -4 },
        'X',
        'X',
        '',
      ],
      context([source]),
    ).entities[0]?.curve;
    expect(result?.type).toBe('SPLINE');
    if (result?.type !== 'SPLINE') throw new Error('Expected spline');
    expect(result.fitPoints).toEqual([]);
    expect(result.controlPoints[1]).toMatchObject({ x: 2, y: 4 });
    expect(Number.isFinite(geometryEvaluation(result, 0.4).point.x)).toBe(true);
  });
  it('Fit data Tangents System default clears explicit endpoint constraints', () => {
    const source = { ...poly, curve: splineFromPoints(poly.points, true, 3, 0) };
    const result = outlineRun(
      splineditProgram,
      ['F', 'T', '0', '0', 'T', 'S', 'X', ''],
      context([source]),
    ).entities[0]?.curve;
    expect(result?.type).toBe('SPLINE');
    if (result?.type !== 'SPLINE') throw new Error('Expected spline');
    expect(result.startTangent).toBeUndefined();
    expect(result.endTangent).toBeUndefined();
  });
});
