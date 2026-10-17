import { expect, it } from 'vitest';
import { evaluateGeometry, transformGeometry } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import { SnapIndex } from './snap-index';
import { acquiredSnapIntersections, querySnapCandidates } from './snap-query';
import { arc, circle, ellipse, line, polyline, source, spline, v } from './snap-fixtures';

const rotate = (geometry: CurveGeometry, angle: number) =>
  transformGeometry(geometry, [
    Math.cos(angle),
    -Math.sin(angle),
    0,
    0,
    Math.sin(angle),
    Math.cos(angle),
    0,
    0,
    0,
    0,
    1,
    0,
  ]);
const curves = [
  line(),
  { ...arc(), center: v(-10, 0) } as CurveGeometry,
  circle(v(-10, 0)),
  { ...ellipse(), center: v(-10, 0) } as CurveGeometry,
  spline(),
  polyline(),
];
const pairs = curves.flatMap((a, i) =>
  curves.slice(i).map((b, j) => ({
    name: `${a.type}/${b.type}`,
    a: rotate(a, i * 0.19),
    b: rotate(b, 1.07 + j * 0.23),
  })),
);
it.each(pairs)('finds transverse or endpoint intersection for $name', ({ a, b }) => {
  const index = new SnapIndex([source(a, 'a'), source(b, 'b')]);
  const hits = querySnapCandidates(index, { x: 0, y: 0 }, 0.01, 32);
  expect(hits.some((hit) => Math.hypot(hit.point.x, hit.point.y) < 1e-7)).toBe(true);
});
it.each(pairs)('finds an interior crossing for $name', ({ a, b }) => {
  const centered = (curve: CurveGeometry) => {
    const point = evaluateGeometry(curve, 0.37);
    return transformGeometry(curve, [1, 0, 0, -point.x, 0, 1, 0, -point.y, 0, 0, 1, 0]);
  };
  const index = new SnapIndex([source(centered(a), 'a'), source(centered(b), 'b')]);
  const hits = querySnapCandidates(index, { x: 0, y: 0 }, 0.01, 32);
  expect(hits.some((hit) => Math.hypot(hit.point.x, hit.point.y) < 1e-7)).toBe(true);
});
it('finds conic tangencies without sign changes and rational spline tangencies', () => {
  const index = new SnapIndex([source(circle(), 'a'), source(circle(v(20, 0)), 'b')]);
  expect(querySnapCandidates(index, { x: 10, y: 0 }, 1, 32)[0]?.point.x).toBeCloseTo(10, 8);
  const parabola = spline([v(-10, 0), v(0, 10), v(10, 0)]);
  const other = spline([v(-10, 10), v(0, 0), v(10, 10)]);
  const tangent = new SnapIndex([source(parabola, 'a'), source(other, 'b')]);
  const hits = querySnapCandidates(tangent, { x: 0, y: -5 }, 0.01, 32);
  expect(hits[0]?.point.x).toBeCloseTo(0, 6);
  expect(hits[0]?.point.y).toBeCloseTo(-5, 6);
});
it('separates true intersections from view-plane intersections using elevation', () => {
  const index = new SnapIndex([
    source(line(v(0, 0, 2), v(10, 10, 2)), 'a'),
    source(line(v(0, 10, 3), v(10, 0, 3)), 'b'),
  ]);
  expect(querySnapCandidates(index, { x: 5, y: -5 }, 1, 32)).toEqual([]);
  expect(querySnapCandidates(index, { x: 5, y: -5 }, 1, 2048)[0]?.kind).toBe(
    'apparentIntersection',
  );
});
it.each([false, true])(
  'extends both lines and conics independent of source order (reversed %s)',
  (reverse) => {
    const a = source(arc(), 'arc'),
      b = source(line(v(-10, 20), v(-10, 30)), 'line'),
      sources = reverse ? [b, a] : [a, b],
      index = new SnapIndex(sources);
    expect(
      querySnapCandidates(index, { x: -10, y: 0 }, 0.01, 32, { intersectionSources: sources }),
    ).toEqual([]);
    const hit = querySnapCandidates(index, { x: -10, y: 0 }, 0.01, 32, {
      extendedIntersection: true,
      intersectionSources: sources,
    })[0];
    expect(hit?.point.x).toBeCloseTo(-10, 8);
    expect(hit?.point.y).toBeCloseTo(0, 8);
  },
);
it('extends both elliptical arcs and preserves the exact conic point', () => {
  const a = source(
    { ...ellipse(), startParameter: 0, sweepParameter: Math.PI / 2 } as CurveGeometry,
    'ellipse',
  );
  const b = source(line(v(-10, 20), v(-10, 30)), 'line');
  const hit = querySnapCandidates(new SnapIndex([a, b]), { x: -10, y: 0 }, 0.01, 2048, {
    extendedIntersection: true,
    intersectionSources: [a, b],
  })[0];
  expect(hit?.point.x).toBeCloseTo(-10, 8);
  expect(hit?.point.y).toBeCloseTo(0, 8);
});
it('resolves explicitly acquired pairs far outside both apertures', () => {
  const a = source(line(v(0, 0), v(10, 0)), 'a'),
    b = source(line(v(100, 100), v(100, 110)), 'b');
  expect(acquiredSnapIntersections(a, b, 32)[0]?.point).toEqual({ x: 100, y: -0 });
  const conic = source(arc(), 'arc'),
    vertical = source(line(v(-10, 100), v(-10, 110)), 'line');
  const hit = acquiredSnapIntersections(conic, vertical, 32)[0];
  expect(hit?.point.x).toBeCloseTo(-10, 8);
  expect(hit?.point.y).toBeCloseTo(0, 8);
  const elevated = source(line(v(100, 100, 2), v(100, 110, 2)), 'above');
  expect(acquiredSnapIntersections(a, elevated, 32)).toEqual([]);
  expect(acquiredSnapIntersections(a, elevated, 2048)).toHaveLength(1);
});
it('does not extrapolate finite lines without an explicit extended override', () => {
  const index = new SnapIndex([
    source(line(v(0, 0), v(1e10, 0)), 'a'),
    source(line(v(1e10 + 0.1, -10), v(1e10 + 0.1, 10)), 'b'),
  ]);
  expect(querySnapCandidates(index, { x: 1e10 + 0.1, y: 0 }, 1, 32)).toEqual([]);
  const tiny = new SnapIndex([
    source(circle(v(0, 0), 1e-7), 'a'),
    source(line(v(-1e-6, 1.1e-7), v(1e-6, 1.1e-7)), 'b'),
  ]);
  expect(querySnapCandidates(tiny, { x: 0, y: -1.1e-7 }, 1e-7, 32)).toEqual([]);
});
it('queries a cached 20000-entity index within the pointer budget', () => {
  const sources = Array.from({ length: 20000 }, (_, i) =>
    source(
      line(
        v((i % 200) * 100, Math.floor(i / 200) * 100),
        v((i % 200) * 100 + 20, Math.floor(i / 200) * 100 + 20),
      ),
      String(i),
    ),
  );
  const index = new SnapIndex(sources),
    durations: number[] = [];
  for (let i = 0; i < 300; i++) {
    const start = performance.now();
    querySnapCandidates(
      index,
      { x: (i % 200) * 100, y: -Math.floor(i / 200) * 100 },
      10,
      1 | 2 | 32 | 512,
    );
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.floor(durations.length * 0.95)]!;
  console.info(`SnapIndex 20000 entities, 300 queries: p95 ${p95.toFixed(3)} ms`);
  expect(p95).toBeLessThan(4);
});
