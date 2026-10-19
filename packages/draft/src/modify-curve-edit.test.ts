import { describe, expect, it } from 'vitest';
import {
  evaluateGeometry,
  geometryLength,
  type CurveGeometry,
  type SplineGeometry,
} from '@hancad/geom';
import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { splineFromPoints } from './draw-spline';
import {
  editCurve,
  editCurveEntity,
  reverseEditCurve,
  sliceEditCurve,
} from './modify-curve-geometry';
import { curveEditFactories } from './modify-curve-edit';
import {
  concatenateSplines,
  curveSpline,
  elevateSpline,
  extendSpline,
  insertSplineKnot,
} from './modify-spline-geometry';
import { joinEntities } from './modify-topology';
import { lengthenCurve } from './modify-lengthen';
import { convertPolyline } from './modify-poly-geometry';
import type { DrawContext, DrawValue } from './draw-program';

const p = (x: number, y = 0): CadPoint => ({ x, y: -y || 0 });
const base = { layer: '0', color: '#ffffff', lineWidth: 1 };
const line = (id: string, a: CadPoint, b: CadPoint): CadEntity => ({
  ...base,
  id,
  type: 'line',
  a,
  b,
});
const polyline = (id = 'poly'): CadPolyline => ({
  ...base,
  id,
  type: 'polyline',
  points: [p(0), p(10), p(10, 10)],
  bulges: [0, -Math.tan(Math.PI / 8), 0],
  closed: false,
  startWidths: [2, 4, 0],
  endWidths: [4, 6, 0],
});
const pick = (entity: CadEntity, point = p(0)): DrawValue => ({ entity, point });
const contextFor = (entities: CadEntity[], values: Record<string, number> = {}): DrawContext => ({
  ...outlineContext({ DELOBJ: 1, PLINECONVERTMODE: 0, PEDITACCEPT: 0, ...values }),
  entities,
  selectedIds: entities.map((e) => e.id),
});
const run = (name: string, inputs: DrawValue[], context = outlineContext()) =>
  outlineRun(curveEditFactories[name]!, inputs, context);
const closePoint = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-8);
function splineEntity(): CadEntity {
  return {
    ...base,
    id: 'spline',
    type: 'polyline',
    points: [p(0), p(3, 4), p(6, -2), p(9, 1), p(12)],
    closed: false,
    curve: {
      ...splineFromPoints([p(0), p(3, 4), p(6, -2), p(9, 1), p(12)], false, 3, 2),
      weights: [1, 0.6, 2, 0.8, 1],
    },
  };
}
describe('exact editable curve geometry', () => {
  it('inserts knots and slices a weighted multi-span NURBS without flattening', () => {
    const curve = splineEntity().curve as SplineGeometry;
    const inserted = insertSplineKnot(curve, 0.37);
    for (let i = 0; i <= 20; i++)
      closePoint(evaluateGeometry(inserted, i / 20), evaluateGeometry(curve, i / 20));
    const sliced = sliceEditCurve(curve, 0.23, 0.79)!;
    for (let i = 0; i <= 20; i++)
      closePoint(evaluateGeometry(sliced, i / 20), evaluateGeometry(curve, 0.23 + (0.56 * i) / 20));
  });
  it('preserves circular arcs, linearly interpolated widths and the endpoint of a polyline slice', () => {
    const curve = editCurve(polyline())!;
    const sliced = sliceEditCurve(curve, 0.625, 0.875);
    expect(sliced?.type).toBe('LWPOLYLINE');
    if (sliced?.type !== 'LWPOLYLINE') throw new Error('Expected polyline');
    expect(sliced.vertices[0]!.startWidth).toBeCloseTo(4.5);
    expect(sliced.vertices[0]!.endWidth).toBeCloseTo(5.5);
    for (let i = 0; i <= 10; i++)
      closePoint(
        evaluateGeometry(sliced, i / 10),
        evaluateGeometry(curve, 0.625 + (0.25 * i) / 10),
      );
  });
  it('elevates the rational degree and extrapolates the last Bezier span exactly', () => {
    const curve = curveSpline({
      type: 'ARC',
      center: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
      radius: 5,
      startAngle: 0,
      sweepAngle: Math.PI / 2,
    })!;
    const elevated = elevateSpline(curve, 5);
    expect(elevated.degree).toBe(5);
    for (let i = 0; i <= 20; i++)
      closePoint(evaluateGeometry(elevated, i / 20), evaluateGeometry(curve, i / 20));
    const linear = curveSpline({
      type: 'LINE',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 10, y: 3, z: 2 },
    })!;
    closePoint(evaluateGeometry(extendSpline(linear, 2)!, 1), { x: 20, y: 6, z: 4 });
    closePoint(evaluateGeometry(extendSpline(linear, -1)!, 0), { x: -10, y: -3, z: -2 });
  });
  it('reverses tapered widths and rational knots without changing the locus', () => {
    const c = editCurve(polyline())!,
      reversed = reverseEditCurve(c, true);
    if (reversed.type !== 'LWPOLYLINE') throw new Error('Expected polyline');
    expect(reversed.vertices[0]!.startWidth).toBe(6);
    expect(reversed.vertices[0]!.endWidth).toBe(4);
    for (let i = 0; i <= 20; i++)
      closePoint(evaluateGeometry(reversed, i / 20), evaluateGeometry(c, 1 - i / 20));
    const spline = splineEntity().curve!;
    for (let i = 0; i <= 10; i++)
      closePoint(
        evaluateGeometry(reverseEditCurve(spline), i / 10),
        evaluateGeometry(spline, 1 - i / 10),
      );
  });
});
describe('BREAK, JOIN, EXPLODE and REVERSE headless commands', () => {
  it('projects break points, overrides the first point, and accepts @ without a gap', () => {
    const entity = line('one', p(0), p(10));
    const broken = run('BREAK', [pick(entity, p(2, 3)), 'F', p(4, 2), p(7, -8)]);
    expect(broken.eraseIds).toEqual(['one']);
    expect(broken.entities).toMatchObject([
      { type: 'line', a: p(0), b: p(4) },
      { type: 'line', a: p(7), b: p(10) },
    ]);
    expect(run('BREAK', [pick(entity, p(4)), '@']).entities).toMatchObject([
      { b: p(4) },
      { a: p(4) },
    ]);
    expect(run('BREAKATPOINT', [pick(entity), p(6, 12)]).entities).toHaveLength(2);
  });
  it('breaks a circle counterclockwise and never treats a circle as two chords', () => {
    const entity: CadEntity = { ...base, id: 'circle', type: 'circle', center: p(0), radius: 10 };
    const result = run('BREAK', [pick(entity, p(10)), p(0, 10)]);
    const c = result.entities[0]?.curve;
    expect(c?.type).toBe('ARC');
    if (c?.type === 'ARC') expect(c.sweepAngle).toBeCloseTo(Math.PI * 1.5);
  });
  it('joins collinear lines across gaps into a LINE and line plus arc into an exact polyline', () => {
    const first = line('a', p(0), p(2)),
      second = line('b', p(7), p(4));
    const joined = run('JOIN', [], contextFor([first, second]));
    expect(joined.entities).toMatchObject([{ type: 'line', a: p(0), b: p(7) }]);
    const arc: CurveGeometry = {
      type: 'ARC',
      center: { x: 2, y: 2, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
      radius: 2,
      startAngle: -Math.PI / 2,
      sweepAngle: Math.PI / 2,
    };
    const mixed = joinEntities([first, editCurveEntity(second, arc)]);
    expect(mixed.consumed).toHaveLength(2);
    expect(mixed.entities[0]?.curve?.type).toBe('LWPOLYLINE');
    expect(geometryLength(mixed.entities[0]!.curve!)).toBeCloseTo(2 + Math.PI);
  });
  it('explodes a wide polyline to centerline LINE/ARC components and warns once', () => {
    const result = run('EXPLODE', [], contextFor([polyline()]));
    expect(result.entities.map((e) => e.type)).toEqual(['line', 'arc']);
    expect(result.messages?.[0]?.ko).toContain('폭');
    expect(result.eraseIds).toEqual(['poly']);
    expect(
      run('REVERSE', [], contextFor([polyline()], { PLINEREVERSEWIDTHS: 1 })).entities[0]?.curve
        ?.type,
    ).toBe('LWPOLYLINE');
  });
});
describe('LENGTHEN, PEDIT and SPLINEDIT command options', () => {
  it('lengthens by delta, percentage, total angle, dynamic cursor and undo', () => {
    const entity = line('one', p(0), p(10));
    const delta = run('LENGTHEN', ['DE', '4', pick(entity, p(9)), ''], contextFor([entity]));
    expect(delta.entities[0]).toMatchObject({ type: 'line', a: p(0), b: p(14) });
    expect(
      run('LENGTHEN', ['P', '50', pick(entity, p(1)), ''], contextFor([entity])).entities[0],
    ).toMatchObject({ a: p(5), b: p(10) });
    expect(
      run('LENGTHEN', ['T', '20', pick(entity), 'U', ''], contextFor([entity])).entities,
    ).toHaveLength(0);
    expect(
      run('LENGTHEN', ['DY', pick(entity, p(9)), p(16, 8), ''], contextFor([entity])).entities[0],
    ).toMatchObject({ b: p(16) });
    const arc: CurveGeometry = {
      type: 'ARC',
      center: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
      radius: 10,
      startAngle: 0,
      sweepAngle: Math.PI / 2,
    };
    const e = editCurveEntity(entity, arc);
    expect(
      run('LENGTHEN', ['T', 'A', '180', pick(e, p(0, 10)), ''], contextFor([e])).entities[0]?.curve,
    ).toMatchObject({ sweepAngle: Math.PI });
    expect(lengthenCurve(arc, 1000, false)).toBeUndefined();
  });
  it('PEDIT converts a LINE, closes it, sets width and continuous linetype, and undoes the last edit', () => {
    const entity = line('one', p(0), p(10));
    const result = run('PEDIT', ['Y', 'W', '3', 'L', 'ON', 'C', 'U', ''], contextFor([entity]));
    expect(result.entities[0]).toMatchObject({
      type: 'polyline',
      constantWidth: 3,
      closed: false,
      plinegen: true,
    });
    expect(result.eraseIds).toEqual(['one']);
  });
  it('PEDIT Multiple honors fuzz distance and Add join type', () => {
    const a = line('a', p(0), p(2)),
      b = line('b', p(3), p(5));
    const context = contextFor([a, b]);
    const result = run(
      'PEDIT',
      ['M', pick(a), pick(b), '', 'Y', 'J', '', 'J', 'A', '2', ''],
      context,
    );
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({
      type: 'polyline',
      points: [p(0), p(2), p(3), p(5)],
    });
  });
  it('PEDIT Fit/Spline preserve the frame for Decurve and edit vertex inserts, moves, straightens and widths', () => {
    const entity = { ...polyline(), points: [p(0), p(3, 4), p(6), p(10, 2)], bulges: [0, 0, 0, 0] };
    const fitted = run('PEDIT', ['F', ''], contextFor([entity])).entities[0];
    expect(fitted?.sourceType).toBe('POLYLINE_FIT');
    expect(fitted?.curve?.type).toBe('LWPOLYLINE');
    const splined = run('PEDIT', ['S', ''], contextFor([entity], { SPLINETYPE: 6, SPLINESEGS: 8 }))
      .entities[0];
    expect(splined?.curve?.type).toBe('LWPOLYLINE');
    expect(run('PEDIT', ['D', ''], contextFor([splined!])).entities[0]).toMatchObject({
      points: entity.points,
      bulges: [0, 0, 0, 0],
    });
    const edited = run(
      'PEDIT',
      ['E', 'N', 'I', p(5, 6), 'M', p(5, 7), 'W', '2', '5', 'X', ''],
      contextFor([entity]),
    );
    expect(edited.entities[0]).toMatchObject({ points: [p(0), p(3, 4), p(5, 7), p(6), p(10, 2)] });
  });
  it('SPLINEDIT refines and reverses exact geometry, edits weights and elevates degree', () => {
    const entity = splineEntity();
    const refined = run('SPLINEDIT', ['REFINE', p(6), 'R', ''], contextFor([entity])).entities[0]
      ?.curve;
    expect(refined?.type).toBe('SPLINE');
    for (let i = 0; i <= 10; i++)
      closePoint(evaluateGeometry(refined!, i / 10), evaluateGeometry(entity.curve!, 1 - i / 10));
    const edited = run(
      'SPLINEDIT',
      ['E', 'W', '2', '3', 'X', 'E', '6', 'X', ''],
      contextFor([entity]),
    ).entities[0]?.curve;
    expect(edited?.type).toBe('SPLINE');
    if (edited?.type === 'SPLINE') expect(edited.degree).toBe(5);
  });
  it('SPLINEDIT conversion obeys precision, arc mode and DELOBJ', () => {
    const entity = splineEntity();
    const result = run(
      'SPLINEDIT',
      ['P', '5'],
      contextFor([entity], { DELOBJ: 0, PLINECONVERTMODE: 1 }),
    );
    expect(result.eraseIds).toBeUndefined();
    expect(result.entities[0]?.id).not.toBe(entity.id);
    const converted = convertPolyline(entity, 5, true)!;
    expect(converted.bulges?.some((b) => b !== 0)).toBe(true);
    expect(converted.curve).toBeUndefined();
  });
  it('concatenates NURBS exactly at a C0 joint and closes/opens fit data', () => {
    const a = curveSpline({
      type: 'LINE',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 2, y: 0, z: 0 },
    })!;
    const b = curveSpline({
      type: 'LINE',
      start: { x: 2, y: 0, z: 0 },
      end: { x: 2, y: 3, z: 0 },
    })!;
    const joined = concatenateSplines([a, b]);
    closePoint(evaluateGeometry(joined, 0.25), { x: 1, y: 0, z: 0 });
    closePoint(evaluateGeometry(joined, 0.75), { x: 2, y: 1.5, z: 0 });
    const entity = {
      ...splineEntity(),
      curve: splineFromPoints([p(0), p(3, 4), p(6), p(9, 3)], true, 3, 0),
    };
    const result = run(
      'SPLINEDIT',
      ['C', 'O', 'F', 'L', '0.01', 'M', '2', p(4, 7), 'X', 'X', ''],
      contextFor([entity]),
    ).entities[0]?.curve;
    expect(result?.type).toBe('SPLINE');
    if (result?.type === 'SPLINE') expect(result.fitTolerance).toBe(0.01);
  });
  it('slices periodic spline domains and preserves both endpoint equations', () => {
    const source = splineFromPoints([p(0), p(5, 8), p(10), p(8, -4), p(2, -4)], false, 3, 2, true);
    const sliced = sliceEditCurve(source, 0.11, 0.88)!;
    for (let i = 0; i <= 20; i++)
      closePoint(
        evaluateGeometry(sliced, i / 20),
        evaluateGeometry(source, 0.11 + (0.77 * i) / 20),
      );
  });
  it('LENGTHEN inquiry consumes no extra input and local Undo never erases an unchanged original', () => {
    const entity = line('one', p(0), p(10));
    const result = run(
      'LENGTHEN',
      [pick(entity), 'DE', '3', pick(entity, p(9)), 'U', ''],
      contextFor([entity]),
    );
    expect(result).toMatchObject({ entities: [], eraseIds: [] });
  });
  it('JOIN source Close and noncoplanar straight paths produce native types', () => {
    const entity = editCurveEntity(line('arc', p(0), p(1)), {
      type: 'ARC',
      center: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
      radius: 5,
      startAngle: 0,
      sweepAngle: 1,
    });
    expect(run('JOIN', [pick(entity), 'C']).entities[0]?.type).toBe('circle');
    const first = line('a', p(0), p(1)),
      second = line('b', p(1), { x: 2, y: 0, z: 3 });
    expect(joinEntities([first, second]).entities[0]?.curve).toMatchObject({
      type: 'POLYLINE',
      is3D: true,
    });
  });
  it('SPLINEDIT and PEDIT undo joins without deleting the restored unjoined object', () => {
    const first = polyline('a'),
      last = first.points.at(-1)!;
    const second = line('b', last, p(20, 10));
    const result = run('PEDIT', ['J', pick(second), '', 'U', ''], {
      ...contextFor([first, second]),
      selectedIds: [first.id],
    });
    expect(result.eraseIds).toEqual(['a']);
    expect(result.entities).toHaveLength(1);
    const spline = splineEntity(),
      endpoint = spline.curve ? evaluateGeometry(spline.curve, 1) : { x: 0, y: 0, z: 0 };
    const segment = line('tail', p(endpoint.x, endpoint.y), p(20));
    const splined = run('SPLINEDIT', ['J', pick(segment), '', 'U', ''], {
      ...contextFor([spline, segment]),
      selectedIds: [spline.id],
    });
    expect(splined.eraseIds).toEqual(['spline']);
  });
  it('EXPLODE removes one Clipboard block membership without changing member identities', () => {
    const a = line('a', p(0), p(4)),
      b = polyline('b');
    const context = {
      ...contextFor([a, b]),
      blocks: [{ name: 'block', basePoint: p(0), entityIds: ['a', 'b'] }],
    };
    const result = run('EXPLODE', [], context);
    expect(result).toMatchObject({ entities: [], eraseIds: [], removedBlockNames: ['block'] });
  });
});
