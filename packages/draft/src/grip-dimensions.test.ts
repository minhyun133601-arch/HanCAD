import { describe, expect, it } from 'vitest';
import type {
  CadArc,
  CadCircle,
  CadEntity,
  CadLine,
  CadPoint,
  CadPolyline,
} from '@hancad/legacy-bridge';
import { defaultGripProvider } from './grip-providers';
import type { EntityGrip } from './grip-types';
import {
  gripDimensionContext,
  gripDimensionValues,
  resolveGripDimensionPoint,
  updateGripDimensionContext,
  visibleGripDimensions,
} from './grip-dimensions';
import type { GripDimensionContext } from './grip-dimensions';

const base = { id: 'shape', layer: '0', color: '#ffffff', lineWidth: 1 };
const line: CadLine = { ...base, type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0, z: 8 } };
const circle: CadCircle = { ...base, type: 'circle', center: { x: 20, y: -30 }, radius: 5 };
const arc: CadArc = {
  ...base,
  type: 'arc',
  center: { x: 0, y: 0 },
  radius: 5,
  startAngle: Math.PI,
  endAngle: 0,
  clockwise: true,
};
function grip(entity: CadEntity, key: string): EntityGrip {
  const result = defaultGripProvider.grips(entity, true).find((candidate) => candidate.key === key);
  if (!result) throw new Error(`Missing ${key} grip`);
  return result;
}
function context(entity: CadEntity, key: string, point: CadPoint): GripDimensionContext {
  const anchor = grip(entity, key),
    result = gripDimensionContext([entity], [anchor], anchor, point);
  if (!result) throw new Error(`Missing ${key} dimension context`);
  return result;
}
function expectPoint(actual: CadPoint | undefined, expected: CadPoint): void {
  expect(actual).toBeDefined();
  expect(actual!.x).toBeCloseTo(expected.x, 9);
  expect(actual!.y).toBeCloseTo(expected.y, 9);
  if (expected.z !== undefined) expect(actual!.z).toBe(expected.z);
}

describe('shape-result dynamic dimensions for grip editing', () => {
  it('measures a line from its fixed endpoint and resolves result/delta and WCS angles along the live direction', () => {
    const active = context(line, 'b', { x: 3, y: -4 });
    expect(active.origin).toEqual(line.a);
    expect(active.originalLength).toBe(10);
    const values = gripDimensionValues(active);
    expect(values).toMatchObject({
      result: 5,
      lengthChange: -5,
    });
    expect(values.absoluteAngle).toBeCloseTo(Math.atan2(4, 3), 12);
    expect(values.angleChange).toBeCloseTo(Math.atan2(4, 3), 12);
    expectPoint(resolveGripDimensionPoint(active, { result: 20 }), { x: 12, y: -16, z: 8 });
    expectPoint(resolveGripDimensionPoint(active, { lengthChange: -2 }), { x: 4.8, y: -6.4, z: 8 });
    expectPoint(resolveGripDimensionPoint(active, { result: 12, absoluteAngle: Math.PI / 2 }), {
      x: 0,
      y: -12,
      z: 8,
    });
    expectPoint(resolveGripDimensionPoint(active, { lengthChange: 2, angleChange: -Math.PI / 2 }), {
      x: 0,
      y: 12,
      z: 8,
    });
    const first = context(line, 'a', { x: 10, y: -6 });
    expect(first.origin).toEqual(line.b);
    expect(first.originalAngle).toBeCloseTo(Math.PI);
    expectPoint(resolveGripDimensionPoint(first, { result: 4 }), { x: 10, y: -4 });
    const changed = updateGripDimensionContext(active, { x: 0, y: -15 });
    expect(gripDimensionValues(changed)).toMatchObject({
      result: 15,
      lengthChange: 5,
      absoluteAngle: Math.PI / 2,
    });
    expect(active.length).toBe(5);
    expect(resolveGripDimensionPoint(active, {})).toBeUndefined();
    for (const invalid of [
      { result: 0 },
      { result: -1 },
      { result: Infinity },
      { lengthChange: -10 },
      { absoluteAngle: NaN },
    ])
      expect(resolveGripDimensionPoint(active, invalid)).toBeUndefined();
  });

  it('uses the adjacent polyline vertex and suppresses dimensions for multi-hot or whole-object grips', () => {
    const polyline: CadPolyline = {
      ...base,
      type: 'polyline',
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: -10 },
      ],
    };
    const first = context(polyline, 'v0', { x: 0, y: -5 });
    expect(first.origin).toEqual(polyline.points[1]);
    const middle = context(polyline, 'v1', { x: 6, y: -8 });
    expect(middle.origin).toEqual(polyline.points[0]);
    expect(gripDimensionValues(middle).result).toBe(10);
    expectPoint(resolveGripDimensionPoint(middle, { result: 20 }), { x: 12, y: -16 });
    const closed = { ...polyline, closed: true };
    expect(context(closed, 'v0', { x: 0, y: 0 }).origin).toEqual(polyline.points[2]);
    const anchor = grip(line, 'b');
    expect(
      gripDimensionContext([line], [anchor, grip(line, 'a')], anchor, anchor.point),
    ).toBeUndefined();
    const whole = { ...anchor, entityIds: ['shape', 'other'] };
    expect(gripDimensionContext([line], [whole], whole, whole.point)).toBeUndefined();
    const midpoint = grip(line, 'mid');
    expect(gripDimensionContext([line], [midpoint], midpoint, midpoint.point)).toBeUndefined();
    const curved = { ...polyline, bulges: [0.5, 0, 0] },
      vertex = grip(curved, 'v1');
    expect(gripDimensionContext([curved], [vertex], vertex, vertex.point)).toBeUndefined();
  });

  it('shows circle radius as the result and applies DYNDIVIS/mask only to available provider dimensions', () => {
    const circular = context(circle, 'q0', { x: 20, y: -40 });
    expect(gripDimensionValues(circular)).toMatchObject({ result: 10, lengthChange: 5 });
    expectPoint(resolveGripDimensionPoint(circular, { result: 7 }), { x: 20, y: -37 });
    const linear = context(line, 'b', { x: 3, y: -4 });
    const curved = context(arc, 'mid', { x: 0, y: -5 });
    for (const candidate of [linear, circular, curved]) {
      expect(visibleGripDimensions(candidate, 0, 0)).toEqual(['lengthChange']);
      expect(visibleGripDimensions(candidate, 0, 31)).toEqual(['lengthChange']);
      expect(visibleGripDimensions(candidate, 1, 0)).toEqual(['lengthChange', 'result']);
      expect(visibleGripDimensions(candidate, 1, 16)).toEqual(['lengthChange', 'result']);
      expect(visibleGripDimensions(candidate, 2, 0)).toEqual([]);
    }
    expect(visibleGripDimensions(linear, 2, 31)).toEqual([
      'lengthChange',
      'result',
      'absoluteAngle',
      'angleChange',
    ]);
    expect(visibleGripDimensions(circular, 2, 31)).toEqual(['lengthChange', 'result']);
    expect(visibleGripDimensions(curved, 2, 31)).toEqual([
      'lengthChange',
      'result',
      'absoluteAngle',
      'angleChange',
      'radius',
    ]);
    expect(visibleGripDimensions(curved, 2, 17)).toEqual(['result', 'radius']);
    expect(visibleGripDimensions(linear, 2, 16)).toEqual([]);
    expect(visibleGripDimensions(circular, 2, 12)).toEqual([]);
  });

  it.each(['arc', 'polyline'] as const)(
    'inverts %s arc length, sweep, radius and deltas into a midpoint that preserves endpoints',
    (type) => {
      const entity: CadArc | CadPolyline =
        type === 'arc'
          ? arc
          : {
              ...base,
              type: 'polyline',
              closed: false,
              points: [
                { x: -5, y: 0 },
                { x: 5, y: 0 },
              ],
              bulges: [1, 0],
            };
      const active = context(entity, type === 'arc' ? 'mid' : 's0', { x: 0, y: -5 });
      expect(gripDimensionValues(active).result).toBeCloseTo(5 * Math.PI);
      expect(gripDimensionValues(active).absoluteAngle).toBeCloseTo(Math.PI);
      expect(gripDimensionValues(active).radius).toBeCloseTo(5);
      const radiusPoint = resolveGripDimensionPoint(active, { radius: 6 });
      expectPoint(radiusPoint, { x: 0, y: -(6 - Math.sqrt(11)) });
      const radiusContext = updateGripDimensionContext(active, radiusPoint!);
      expect(gripDimensionValues(radiusContext).radius).toBeCloseTo(6);
      expect(gripDimensionValues(radiusContext).result).toBeCloseTo(12 * Math.asin(5 / 6));
      const sweepPoint = resolveGripDimensionPoint(active, { absoluteAngle: Math.PI / 3 });
      expectPoint(sweepPoint, { x: 0, y: -5 * Math.tan(Math.PI / 12) });
      expect(
        gripDimensionValues(updateGripDimensionContext(active, sweepPoint!)).radius,
      ).toBeCloseTo(10);
      const targetLength = (10 * Math.PI) / 3;
      expectPoint(resolveGripDimensionPoint(active, { result: targetLength }), sweepPoint!);
      expectPoint(
        resolveGripDimensionPoint(active, { lengthChange: targetLength - 5 * Math.PI }),
        sweepPoint!,
      );
      const anglePoint = resolveGripDimensionPoint(active, { angleChange: -Math.PI / 2 });
      expectPoint(anglePoint, { x: 0, y: -5 * Math.tan(Math.PI / 8) });
      const opposite = updateGripDimensionContext(active, { x: 0, y: 5 });
      expectPoint(resolveGripDimensionPoint(opposite, { radius: 6 }), {
        x: 0,
        y: 6 - Math.sqrt(11),
      });
    },
  );

  it('keeps the major-arc branch when constraining a curved polyline radius or length', () => {
    const major: CadPolyline = {
      ...base,
      type: 'polyline',
      closed: false,
      points: [
        { x: -5, y: 0 },
        { x: 5, y: 0 },
      ],
      bulges: [2, 0],
    };
    const active = context(major, 's0', { x: 0, y: -10 });
    expect(active.angle).toBeGreaterThan(Math.PI);
    const radiusPoint = resolveGripDimensionPoint(active, { radius: 8 });
    expectPoint(radiusPoint, { x: 0, y: -(8 + Math.sqrt(39)) });
    const radiusContext = updateGripDimensionContext(active, radiusPoint!);
    expect(radiusContext.angle).toBeGreaterThan(Math.PI);
    expect(radiusContext.radius).toBeCloseTo(8);
    const sweep = (3 * Math.PI) / 2,
      radius = 5 * Math.SQRT2;
    const lengthPoint = resolveGripDimensionPoint(active, { result: sweep * radius });
    expectPoint(lengthPoint, { x: 0, y: -5 * (1 + Math.SQRT2) });
    const result = updateGripDimensionContext(active, lengthPoint!);
    expect(result.angle).toBeCloseTo(sweep);
    expect(result.length).toBeCloseTo(sweep * radius);
  });

  it('rejects impossible and nonfinite arc constraints without generating a synthetic point', () => {
    const active = context(arc, 'mid', { x: 0, y: -5 });
    for (const invalid of [
      { radius: 4.99 },
      { radius: -5 },
      { radius: Infinity },
      { radius: NaN },
      { result: 9.99 },
      { result: Infinity },
      { result: NaN },
      { lengthChange: Infinity },
      { absoluteAngle: -1 },
      { absoluteAngle: 2 * Math.PI },
      { absoluteAngle: Infinity },
    ])
      expect(resolveGripDimensionPoint(active, invalid), JSON.stringify(invalid)).toBeUndefined();
    const zeroChord = { ...active, start: { x: 1, y: 2 }, end: { x: 1, y: 2 } };
    expect(resolveGripDimensionPoint(zeroChord, { radius: 5 })).toBeUndefined();
  });

  it('clears the previous radius when an arc midpoint becomes collinear, then can constrain a radius again', () => {
    const active = context(arc, 'mid', { x: 0, y: -5 });
    const straight = updateGripDimensionContext(active, { x: 0, y: 0 });
    expect(gripDimensionValues(straight)).toMatchObject({ result: 10, absoluteAngle: 0 });
    expect(straight.radius).toBeUndefined();
    expect(gripDimensionValues(straight).radius).toBeUndefined();
    expect(active.radius).toBe(5);
    expectPoint(resolveGripDimensionPoint(straight, { radius: 5 }), { x: 0, y: -5 });
  });
});
