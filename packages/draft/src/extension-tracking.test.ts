import { expect, it } from 'vitest';
import { transformGeometry } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import { extensionTrackingPoints } from './extension-tracking';
import { arc, ellipse, polyline, source, v } from './snap-fixtures';

it('draws the acquired arc continuation on its circle within the requested chord error', () => {
  const points = extensionTrackingPoints(source(arc()), { x: 0, y: -10 }, { x: -10, y: 0 }, 0.01)!;
  expect(points.length).toBeGreaterThan(3);
  expect(points[0]).toEqual({ x: 0, y: -10 });
  expect(points.at(-1)).toEqual({ x: -10, y: 0 });
  for (const point of points) {
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(10, 10);
    expect(point.x).toBeLessThanOrEqual(1e-9);
    expect(point.y).toBeLessThanOrEqual(1e-9);
  }
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!,
      b = points[index]!;
    expect(10 - Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2)).toBeLessThanOrEqual(0.01);
  }
});
it('extends backwards from the acquired start instead of crossing the existing arc', () => {
  const points = extensionTrackingPoints(source(arc()), { x: 10, y: 0 }, { x: 0, y: 10 }, 0.01)!;
  expect(points.length).toBeGreaterThan(3);
  for (const point of points) {
    expect(point.x).toBeGreaterThanOrEqual(-1e-9);
    expect(point.y).toBeGreaterThanOrEqual(-1e-9);
  }
});
it('keeps a rotated elliptical continuation on the actual ellipse', () => {
  const rotation = Math.PI / 6,
    c = Math.cos(rotation),
    s = Math.sin(rotation),
    geometry = { ...ellipse(rotation), sweepParameter: Math.PI / 2 } as CurveGeometry;
  const acquired = { x: -5 * s, y: -5 * c },
    target = { x: -10 * c, y: 10 * s };
  const points = extensionTrackingPoints(source(geometry), acquired, target, 0.01)!;
  expect(points.length).toBeGreaterThan(3);
  for (const point of points) {
    const x = point.x * c - point.y * s,
      y = -point.x * s - point.y * c;
    expect((x * x) / 100 + (y * y) / 25).toBeCloseTo(1, 10);
  }
});
it('draws nonuniformly transformed bulged polyline extension as an ellipse', () => {
  const poly = polyline([v(-10, 0), v(10, 0)], false);
  if (poly.type !== 'LWPOLYLINE') throw Error('fixture');
  poly.vertices = [{ ...poly.vertices[0]!, bulge: 1 }, poly.vertices[1]!];
  const transformed = transformGeometry(poly, [2, 0, 0, 100, 0, 3, 0, 200, 0, 0, 1, 0]);
  expect(transformed.type).toBe('TRANSFORMED');
  const points = extensionTrackingPoints(
    source(transformed),
    { x: 80, y: -200 },
    { x: 100, y: -230 },
    0.01,
  )!;
  expect(points.length).toBeGreaterThan(3);
  for (const point of points)
    expect((point.x - 100) ** 2 / 400 + (point.y + 200) ** 2 / 900).toBeCloseTo(1, 10);
});
it('leaves straight extensions to the regular line path renderer', () => {
  expect(
    extensionTrackingPoints(
      source({ type: 'LINE', start: v(0, 0), end: v(10, 0) }),
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      0.01,
    ),
  ).toBeUndefined();
});
it('bounds broad giant-radius paths and clips extreme-zoom continuation to accurate visible points', () => {
  const radius = 1e9,
    geometry = { ...arc(), radius } as CurveGeometry,
    acquired = { x: 0, y: -radius },
    target = { x: -radius, y: 0 },
    tolerance = 0.25 / 262144;
  const broad = extensionTrackingPoints(source(geometry), acquired, target, tolerance)!;
  expect(broad.length).toBeLessThanOrEqual(4097);
  const viewport = { minX: -radius - 0.002, maxX: -radius + 0.002, minY: -0.002, maxY: 0.002 };
  const durations: number[] = [];
  for (let iteration = 0; iteration < 100; iteration++) {
    const start = performance.now();
    const points = extensionTrackingPoints(
      source(geometry),
      acquired,
      target,
      tolerance,
      viewport,
    )!;
    durations.push(performance.now() - start);
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.length).toBeLessThan(128);
    expect(points.at(-1)).toEqual(target);
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1]!,
        b = points[index]!;
      expect(Math.abs(radius - Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2))).toBeLessThanOrEqual(
        tolerance,
      );
      expect(Math.abs(b.y)).toBeLessThan(0.0021);
    }
  }
  durations.sort((a, b) => a - b);
  expect(durations[95]).toBeLessThan(4);
});
it('never joins two separate visible conic intervals with a false chord', () => {
  const points = extensionTrackingPoints(source(arc()), { x: 0, y: -10 }, { x: 0, y: 10 }, 0.001, {
    minX: -1,
    maxX: 1,
    minY: -11,
    maxY: 11,
  })!;
  expect(points.length).toBeGreaterThan(1);
  for (const point of points) expect(point.y).toBeGreaterThan(9.9);
  expect(points.at(-1)).toEqual({ x: 0, y: 10 });
});
it('marks a wholly invisible conic continuation as an empty display path', () => {
  expect(
    extensionTrackingPoints(source(arc()), { x: 0, y: -10 }, { x: -10, y: 0 }, 0.001, {
      minX: 100,
      maxX: 200,
      minY: 100,
      maxY: 200,
    }),
  ).toEqual([]);
});
