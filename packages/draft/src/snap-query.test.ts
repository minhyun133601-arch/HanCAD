import { describe, expect, it } from 'vitest';
import { evaluateGeometry, geometryEvaluation, transformGeometry } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import { SnapIndex } from './snap-index';
import { querySnapCandidates } from './snap-query';
import { resolveDeferredPair, resolveDeferredSnap } from './snap-deferred';
import { snapModeBits, snapModel, type DraftSnapKind, type SnapSource } from './snap-types';
import { arc, circle, ellipse, line, normal, polyline, source, spline, v } from './snap-fixtures';

const pick = (geometry: CurveGeometry, kind: DraftSnapKind, x: number, y: number, options = {}) =>
  querySnapCandidates(
    new SnapIndex([source(geometry)]),
    { x, y: -y },
    1e-5,
    snapModeBits[kind],
    options,
  );
const exact = (point: { x: number; y: number } | undefined, x: number, y: number) => {
  expect(point).toBeDefined();
  expect(point!.x).toBeCloseTo(x, 7);
  expect(point!.y).toBeCloseTo(-y, 7);
};

describe('static snap modes use exact geometry', () => {
  it.each([
    ['LINE', line(), v(0, 0), v(5, 0)],
    ['ARC', arc(), v(10, 0), v(Math.SQRT1_2 * 10, Math.SQRT1_2 * 10)],
    [
      'ELLIPSE ARC',
      { ...ellipse(), startParameter: 0, sweepParameter: Math.PI / 2 } as CurveGeometry,
      v(10, 0),
      v(Math.SQRT1_2 * 10, Math.SQRT1_2 * 5),
    ],
    ['SPLINE', spline(), v(0, 0), v(5, 5)],
    ['POLYLINE', polyline(), v(0, 0), v(5, 0)],
  ] as const)('%s endpoint and midpoint', (_name, geometry, end, mid) => {
    exact(pick(geometry, 'endpoint', end.x, end.y)[0]?.point, end.x, end.y);
    exact(pick(geometry, 'midpoint', mid.x, mid.y)[0]?.point, mid.x, mid.y);
  });
  it.each([circle(), arc(), ellipse(Math.PI / 6)])(
    'finds centers and axis quadrants on $type',
    (geometry) => {
      exact(pick(geometry, 'center', 0, 0)[0]?.point, 0, 0);
      const q = evaluateGeometry(geometry, 0);
      exact(pick(geometry, 'quadrant', q.x, q.y)[0]?.point, q.x, q.y);
    },
  );
  it('keeps circular quadrants on WCS axes after a block rotation', () => {
    const rotated = transformGeometry(circle(), [
      Math.SQRT1_2,
      -Math.SQRT1_2,
      0,
      0,
      Math.SQRT1_2,
      Math.SQRT1_2,
      0,
      0,
      0,
      0,
      1,
      0,
    ]);
    exact(pick(rotated, 'quadrant', 10, 0)[0]?.point, 10, 0);
    expect(pick(rotated, 'quadrant', Math.SQRT1_2 * 10, Math.SQRT1_2 * 10)).toEqual([]);
  });
  it('computes exact curved polygon centroids and transformed centroids at survey coordinates', () => {
    const square = polyline();
    exact(pick(square, 'geometricCenter', 5, 5)[0]?.point, 5, 5);
    const transformed = transformGeometry(
      square,
      [2, 0, 0, 200000000, 0, 3, 0, 500000000, 0, 0, 1, 0],
    );
    exact(
      pick(transformed, 'geometricCenter', 200000010, 500000015)[0]?.point,
      200000010,
      500000015,
    );
    const semicircle = polyline([v(-10, 0), v(10, 0)], true);
    if (semicircle.type !== 'LWPOLYLINE') throw Error('fixture');
    semicircle.vertices = [{ ...semicircle.vertices[0]!, bulge: 1 }, semicircle.vertices[1]!];
    exact(
      pick(semicircle, 'geometricCenter', 0, -40 / (3 * Math.PI))[0]?.point,
      0,
      -40 / (3 * Math.PI),
    );
  });
  it('distinguishes node and insertion-only objects', () => {
    exact(pick({ type: 'POINT', position: v(3, 4) }, 'node', 3, 4)[0]?.point, 3, 4);
    const text: SnapSource = {
      id: 'TEXT',
      geometry: { type: 'POINT', position: v(3, 4) },
      insertion: v(3, 4),
      node: false,
    };
    const index = new SnapIndex([text]);
    expect(querySnapCandidates(index, { x: 3, y: -4 }, 1, 8 | 512)).toEqual([]);
    expect(querySnapCandidates(index, { x: 3, y: -4 }, 1, 64)[0]?.kind).toBe('insertion');
  });
  it('computes a closed spline centroid and bulged polyline tangent/perpendicular points', () => {
    const closed: CurveGeometry = {
      type: 'SPLINE',
      degree: 1,
      controlPoints: [v(0, 0), v(10, 0), v(10, 10), v(0, 10), v(0, 0)],
      weights: [1, 1, 1, 1, 1],
      knots: [0, 0, 1, 2, 3, 4, 4],
      fitPoints: [],
      closed: true,
      periodic: false,
      fitTolerance: 1e-10,
      knotParameterization: 'chord',
    };
    exact(pick(closed, 'geometricCenter', 5, 5)[0]?.point, 5, 5);
    const curved = polyline([v(-10, 0), v(10, 0)], false);
    if (curved.type !== 'LWPOLYLINE') throw Error('fixture');
    curved.vertices = [{ ...curved.vertices[0]!, bulge: 1 }, curved.vertices[1]!];
    const { point, derivative } = geometryEvaluation(curved, 0.3);
    exact(
      pick(curved, 'perpendicular', point.x, point.y, {
        basePoint: snapModel(v(point.x - derivative.y * 0.1, point.y + derivative.x * 0.1)),
      })[0]?.point,
      point.x,
      point.y,
    );
    exact(
      pick(curved, 'tangent', point.x, point.y, {
        basePoint: snapModel(v(point.x + derivative.x * 0.1, point.y + derivative.y * 0.1)),
      })[0]?.point,
      point.x,
      point.y,
    );
  });
  it('rejects invalid input and honors suppression without mutating the sources', () => {
    const sources = [source(line())],
      before = structuredClone(sources),
      index = new SnapIndex(sources);
    for (const [point, tolerance, mode] of [
      [{ x: NaN, y: 0 }, 1, 1],
      [{ x: 0, y: 0 }, Infinity, 1],
      [{ x: 0, y: 0 }, 1, 16385],
      [{ x: 0, y: 0 }, 1, 0],
    ] as const)
      expect(querySnapCandidates(index, point, tolerance, mode)).toEqual([]);
    expect(sources).toEqual(before);
  });
});

describe('normal and nearest snaps across curve families', () => {
  it('allows radial perpendiculars from a circular center using the cursor direction', () => {
    exact(pick(circle(), 'perpendicular', 6, 8, { basePoint: { x: 0, y: 0 } })[0]?.point, 6, 8);
  });
  it.each([line(), arc(), circle(), ellipse(Math.PI / 5), spline(), polyline()])(
    'nearest on $type',
    (geometry) => {
      const on = evaluateGeometry(geometry, 0.3);
      exact(pick(geometry, 'nearest', on.x, on.y)[0]?.point, on.x, on.y);
    },
  );
  it.each([line(), arc(), circle(), ellipse(Math.PI / 7), spline()])(
    'perpendicular on $type',
    (geometry) => {
      const t = 0.27,
        { point, derivative } = geometryEvaluation(geometry, t),
        base = v(point.x - derivative.y * 0.1, point.y + derivative.x * 0.1);
      exact(
        pick(geometry, 'perpendicular', point.x, point.y, { basePoint: snapModel(base) })[0]?.point,
        point.x,
        point.y,
      );
    },
  );
  it.each([arc(), circle(), ellipse(Math.PI / 7), spline()])('tangent on $type', (geometry) => {
    const t = 0.31,
      { point, derivative } = geometryEvaluation(geometry, t),
      base = v(point.x + derivative.x * 0.1, point.y + derivative.y * 0.1);
    exact(
      pick(geometry, 'tangent', point.x, point.y, { basePoint: snapModel(base) })[0]?.point,
      point.x,
      point.y,
    );
  });
  it.each(['perpendicular', 'tangent'] as const)(
    'resolves deferred %s using the second point',
    (kind) => {
      const geometry = circle(),
        on = kind === 'perpendicular' ? v(10, 0) : v(5, Math.sqrt(75)),
        base = v(20, 0);
      const hit = pick(geometry, kind, on.x, on.y)[0];
      expect(hit?.deferred).toBeDefined();
      exact(resolveDeferredSnap(hit!.deferred!, snapModel(base)), on.x, on.y);
    },
  );
  it('resolves two deferred tangencies and a perpendicular pair', () => {
    const a = source(circle()),
      b = source(circle(v(30, 0)), 'other');
    const pair = resolveDeferredPair(
      { kind: 'tangent', source: a, near: { x: 0, y: -10 } },
      { kind: 'tangent', source: b, near: { x: 30, y: -10 } },
    );
    exact(pair?.first, 0, 10);
    exact(pair?.second, 30, 10);
    const perpendicular = resolveDeferredPair(
      { kind: 'perpendicular', source: a, near: { x: 10, y: 0 } },
      { kind: 'perpendicular', source: b, near: { x: 20, y: 0 } },
    );
    exact(perpendicular?.first, 10, 0);
    exact(perpendicular?.second, 20, 0);
  });
});

describe('eligibility, acquisition and reusable indexing', () => {
  it('applies all OSOPTIONS bits including dynamic UCS gating', () => {
    const hatch = { ...source(line()), hatch: true },
      negative = source(line(v(0, 0, -2), v(10, 0, -2)), 'negative'),
      dimension = { ...source(line(), 'dim'), dimensionExtension: true };
    expect(querySnapCandidates(new SnapIndex([hatch]), { x: 0, y: 0 }, 1, 1)).toEqual([]);
    expect(
      querySnapCandidates(new SnapIndex([hatch]), { x: 0, y: 0 }, 1, 1, { osoptions: 0 }),
    ).toHaveLength(1);
    expect(
      querySnapCandidates(new SnapIndex([negative]), { x: 0, y: 0 }, 1, 1, { dynamicUcs: true }),
    ).toEqual([]);
    expect(querySnapCandidates(new SnapIndex([negative]), { x: 0, y: 0 }, 1, 1)).toHaveLength(1);
    expect(querySnapCandidates(new SnapIndex([dimension]), { x: 0, y: 0 }, 1, 1)).toEqual([]);
    expect(querySnapCandidates(new SnapIndex([dimension]), { x: 5, y: 0 }, 1, 2)).toHaveLength(1);
  });
  it('limits extension and parallel to explicitly acquired geometry', () => {
    const a = source(line()),
      index = new SnapIndex([a]);
    expect(querySnapCandidates(index, { x: 15, y: 0 }, 1, 4096)).toEqual([]);
    exact(
      querySnapCandidates(index, { x: 15, y: 0 }, 1, 4096, { extensions: [a] })[0]?.point,
      15,
      0,
    );
    expect(
      querySnapCandidates(index, { x: 15, y: -5 }, 1, 8192, { basePoint: { x: 0, y: -5 } }),
    ).toEqual([]);
    exact(
      querySnapCandidates(index, { x: 15, y: -5 }, 1, 8192, {
        basePoint: { x: 0, y: -5 },
        parallels: [a],
      })[0]?.point,
      15,
      5,
    );
    expect(querySnapCandidates(index, { x: 5, y: 0 }, 1, 4096, { extensions: [a] })).toEqual([]);
    const c = source(arc());
    exact(
      querySnapCandidates(index, { x: -10, y: 0 }, 1, 4096, { extensions: [c] })[0]?.point,
      -10,
      0,
    );
  });
  it('keeps coincident candidates for deterministic Tab cycling and updates index contents', () => {
    const index = new SnapIndex([source(line(), 'first'), source(line(), 'second')]);
    expect(querySnapCandidates(index, { x: 0, y: 0 }, 1, 1).map((hit) => hit.entityId)).toEqual([
      'first',
      'second',
    ]);
    index.upsert(source(line(v(100, 0), v(110, 0)), 'first'));
    expect(querySnapCandidates(index, { x: 0, y: 0 }, 1, 1).map((hit) => hit.entityId)).toEqual([
      'second',
    ]);
    index.remove('second');
    expect(querySnapCandidates(index, { x: 0, y: 0 }, 1, 1)).toEqual([]);
    const infinite: CurveGeometry = { type: 'XLINE', basePoint: v(0, 3), direction: v(1, 0) };
    index.upsert(source(infinite));
    exact(querySnapCandidates(index, { x: 100000, y: -3 }, 1, 512)[0]?.point, 100000, 3);
    expect(normal.z).toBe(1);
  });
});
