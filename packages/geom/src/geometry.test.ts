import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  arcBounds,
  bulgeArc,
  closestPointOnLine,
  distance,
  lineIntersection,
  loadGeometryWasm,
  midpoint,
  polylineArea,
  polylineBounds,
  polylineLength,
} from './index';

describe('pure double precision geometry', () => {
  it('computes lengths and closest points at survey coordinates', () => {
    expect(distance({ x: 1e8, y: 2e8 }, { x: 1e8 + 3, y: 2e8 + 4 })).toBe(5);
    expect(
      closestPointOnLine({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, { x: 20, y: 2 }),
    ).toEqual({ x: 10, y: 0 });
    expect(
      closestPointOnLine({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, { x: 20, y: 2 }, 'ray'),
    ).toEqual({ x: 20, y: 0 });
    expect(
      lineIntersection(
        { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
        { start: { x: 0, y: 10 }, end: { x: 10, y: 0 } },
      ),
    ).toEqual({ x: 5, y: 5 });
  });

  it('includes bulge circular segments in polyline bounds, length and signed area', () => {
    const polyline = {
      vertices: [
        { x: 0, y: 0, bulge: 1 },
        { x: 10, y: 0 },
      ],
      closed: true,
    };
    expect(
      bulgeArc(polyline.vertices[0] ?? { x: 0, y: 0 }, polyline.vertices[1] ?? { x: 0, y: 0 }, 1)
        ?.radius,
    ).toBe(5);
    expect(polylineLength(polyline)).toBeCloseTo(Math.PI * 5 + 10);
    expect(polylineArea(polyline)).toBeCloseTo((Math.PI * 25) / 2);
    expect(polylineBounds(polyline)?.min.y).toBeCloseTo(-5);
    expect(
      arcBounds({ center: { x: 0, y: 0 }, radius: 5, startAngle: 0, sweepAngle: Math.PI * 2 }),
    ).toEqual({ min: { x: -5, y: -5 }, max: { x: 5, y: 5 } });
  });

  it('preserves square and bulge area/length/bounds after a large survey-coordinate translation', () => {
    const origin = { x: 200000000, y: 450000000 };
    for (const bulge of [0, 0.5]) {
      const local = {
        vertices: [
          { x: 0, y: 0, bulge },
          { x: 3, y: 0 },
          { x: 3, y: 4 },
          { x: 0, y: 4 },
        ],
        closed: true,
      };
      const translated = {
        ...local,
        vertices: local.vertices.map((vertex) => ({
          ...vertex,
          x: vertex.x + origin.x,
          y: vertex.y + origin.y,
        })),
      };
      expect(polylineArea(translated)).toBeCloseTo(polylineArea(local), 10);
      expect(polylineLength(translated)).toBeCloseTo(polylineLength(local), 10);
      const localBounds = polylineBounds(local);
      const translatedBounds = polylineBounds(translated);
      expect((translatedBounds?.min.x ?? 0) - origin.x).toBeCloseTo(localBounds?.min.x ?? 0, 6);
      expect((translatedBounds?.min.y ?? 0) - origin.y).toBeCloseTo(localBounds?.min.y ?? 0, 6);
      expect((translatedBounds?.max.x ?? 0) - origin.x).toBeCloseTo(localBounds?.max.x ?? 0, 6);
      expect((translatedBounds?.max.y ?? 0) - origin.y).toBeCloseTo(localBounds?.max.y ?? 0, 6);
    }
  });
});

describe('TypeScript to actual Rust WASM round trip', () => {
  it('loads the compiled .wasm bytes through the package loader and calls double precision exports', async () => {
    const bytes = new Uint8Array(
      await readFile(new URL('../wasm/geometry_wasm_bg.wasm', import.meta.url)),
    );
    const kernel = await loadGeometryWasm(bytes);
    expect(kernel.distance2d(1, 2, 4, 6)).toBe(5);
    expect(Array.from(kernel.midpoint2d(1, 2, 4, 6))).toEqual([2.5, 4]);
    expect(kernel.distance2d(100000001, 200000002, 100000004, 200000006)).toBe(5);
    expect(Array.from(kernel.midpoint2d(100000001, 200000002, 100000004, 200000006))).toEqual([
      100000002.5, 200000004,
    ]);
    expect(
      midpoint(
        { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
        { x: -Number.MAX_VALUE, y: Number.MAX_VALUE },
      ),
    ).toEqual({ x: 0, y: Number.MAX_VALUE });
    expect(
      Array.from(
        kernel.midpoint2d(Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE),
      ),
    ).toEqual([0, Number.MAX_VALUE]);
  });
});
