import { describe, expect, it } from 'vitest';
import { geometryFromFields } from '@hancad/geom';
import { collectGeometry } from './tessellate';
import type { DisplayPolyline } from './types';

const options = { tolerance: 0.01 };
const wide: DisplayPolyline = {
  type: 'polyline',
  closed: false,
  vertices: new Float64Array([0, 0, 0, 2, 2, 10, 0, 0, 2, 2, 10, 20, 0, 0, 0]),
};

describe('wide-polyline linetype coordinates', () => {
  it('associates strip triangles and miters with the correct per-segment PLINEGEN 0 run', () => {
    const collection = collectGeometry(wide, options);
    expect(collection.triangleRuns).toHaveLength(collection.triangles.length);
    expect(collection.triangleRuns.slice(0, 4)).toEqual([
      { distances: [0, 0, 10], length: 10 },
      { distances: [0, 10, 10], length: 10 },
      { distances: [0, 0, 20], length: 20 },
      { distances: [0, 20, 20], length: 20 },
    ]);
    expect(collection.triangleRuns.slice(4)).toEqual([
      { distances: [10, 10, 10], length: 10 },
      { distances: [10, 10, 10], length: 10 },
    ]);
  });
  it('carries PLINEGEN 1 centerline distances through all strips and tangent joints', () => {
    const collection = collectGeometry(wide, { ...options, plinegen: true });
    expect(collection.triangleRuns.slice(2, 4)).toEqual([
      { distances: [10, 10, 30], length: 30 },
      { distances: [10, 30, 30], length: 30 },
    ]);
    expect(collection.triangleRuns.every((run) => run?.length === 30)).toBe(true);
    expect(collection.triangleRuns.at(-1)?.distances).toEqual([10, 10, 10]);
  });
  it('uses analytic centerline arc length for curved ribbons and preserves ordinary solid polygon tuples', () => {
    const curved: DisplayPolyline = {
      type: 'polyline',
      closed: false,
      vertices: new Float64Array([0, 0, 1, 2, 4, 10, 0, 0, 0, 0]),
    };
    const collection = collectGeometry(
      {
        type: 'composite',
        parts: [curved],
        triangles: [
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
        ],
      },
      options,
    );
    expect(collection.triangleRuns).toHaveLength(collection.triangles.length);
    expect(collection.triangleRuns[0]?.distances.slice(0, 2)).toEqual([0, 0]);
    const lastRibbon = collection.triangleRuns.at(-2)!;
    expect(lastRibbon.length).toBeCloseTo(5 * Math.PI);
    expect(lastRibbon.distances[1]).toBeCloseTo(5 * Math.PI);
    expect(collection.triangleRuns.at(-1)).toBeUndefined();
  });
  it('keeps FILLMODE 0 longitudinal outlines in the centerline phase instead of restarting a perimeter run', () => {
    const collection = collectGeometry(wide, { ...options, plinegen: true, fillmode: false });
    expect(collection.triangles).toHaveLength(0);
    expect(collection.runs.every((run) => run.length === 30)).toBe(true);
    expect(
      collection.runs.some((run) => run.vertices[2] === 10 && run.vertices.at(-1) === 30),
    ).toBe(true);
    expect(
      collection.runs.some((run) => run.vertices[2] === 30 && run.vertices.at(-1) === 10),
    ).toBe(false);
  });
  it('retains aligned linetype metadata on oblique projected native width strips', () => {
    const parsed = geometryFromFields('LWPOLYLINE', {
      extrusion: [0, 1, 1],
      constantWidth: 4,
      vertices: [{ position: [0, 0] }, { position: [10, 0] }, { position: [10, 20] }],
    });
    if (parsed.status !== 'ok') throw new Error(parsed.status);
    const collection = collectGeometry(
      { type: 'curve', curve: parsed.geometry },
      { ...options, plinegen: true },
    );
    expect(collection.triangleRuns).toHaveLength(collection.triangles.length);
    expect(collection.triangleRuns.every((run) => run !== undefined)).toBe(true);
    const total = 10 + 20 / Math.SQRT2;
    expect(collection.triangleRuns.every((run) => Math.abs(run!.length - total) < 1e-10)).toBe(
      true,
    );
    expect(collection.triangleRuns.at(-1)!.distances).toEqual([10, 10, 10]);
  });
});
