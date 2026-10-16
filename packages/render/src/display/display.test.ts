import { describe, expect, it } from 'vitest';
import { geometryFromFields, transformGeometry } from '@hancad/geom';
import { boundsOfGeometry } from './bounds';
import { arcSegmentCount } from './curves';
import { distanceToGeometry, numericalCurveDistance, triangleDistance } from './distance';
import { polylineSegments } from './polyline';
import { arcAt } from './curves';
import { clipInfinite } from './infinite';
import { pointDisplaySize } from './point-symbols';
import { collectGeometry } from './tessellate';
import type { DisplayArc, DisplayPolyline, DisplayText } from './types';

const options = { tolerance: 0.01 };
const circle: DisplayArc = {
  type: 'arc',
  center: { x: 0, y: 0 },
  radius: 10,
  startAngle: 0,
  sweepAngle: Math.PI * 2,
};
const polyline: DisplayPolyline = {
  type: 'polyline',
  vertices: new Float64Array([0, 0, 0, 0, 0, 10, 0, 1, 0, 0, 20, 0, 0, 0, 0]),
  closed: false,
};

describe('adaptive display tessellation', () => {
  it('keeps circle chord error under the chosen model tolerance and exact arc distances', () => {
    for (const tolerance of [1, 0.01, 1e-6]) {
      const run = collectGeometry(circle, { tolerance }).runs[0]!;
      expect(run.closed).toBe(true);
      expect(run.length).toBeCloseTo(Math.PI * 20);
      for (let i = 3; i < run.vertices.length; i += 3) {
        const x = (run.vertices[i - 3]! + run.vertices[i]!) / 2;
        const y = (run.vertices[i - 2]! + run.vertices[i + 1]!) / 2;
        expect(10 - Math.hypot(x, y)).toBeLessThanOrEqual(tolerance + 1e-12);
      }
      expect(run.vertices.at(-1)).toBeCloseTo(run.length);
    }
    expect(arcSegmentCount(10, Math.PI * 2, 100)).toBe(4);
    expect(arcSegmentCount(1e20, 1, 1e-8)).toBe(8192);
  });
  it('clips enormous arcs to the view without restarting their linetype distance', () => {
    const huge = { ...circle, radius: 1e9 };
    const runs = collectGeometry(huge, {
      tolerance: 0.001,
      view: { minX: 1e9 - 1, minY: -10, maxX: 1e9 + 1, maxY: 10 },
    }).runs;
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.reduce((sum, run) => sum + run.vertices.length / 3, 0)).toBeLessThan(100);
    expect(runs[0]!.length).toBeCloseTo(2 * Math.PI * 1e9);
    expect(runs.some((run) => run.vertices[2]! > 0)).toBe(true);
  });
  it('retains bulges and PLINEGEN run phase across straight and curved segments', () => {
    const split = collectGeometry(polyline, options),
      continuous = collectGeometry(polyline, { ...options, plinegen: true });
    expect(split.runs).toHaveLength(2);
    expect(continuous.runs).toHaveLength(1);
    expect(split.runs[1]!.vertices[2]).toBe(0);
    expect(continuous.runs[0]!.length).toBeCloseTo(10 + Math.PI * 5);
    expect(boundsOfGeometry(polyline)).toMatchObject({ minX: 0, maxX: 20 });
    expect(boundsOfGeometry(polyline)!.minY).toBeCloseTo(-5, 12);
    expect(boundsOfGeometry(polyline)!.maxY).toBeCloseTo(0, 12);
  });
  it('anchors shallow positive and negative bulges instead of subtracting enormous radii', () => {
    for (const bulge of [1e-10, -1e-10]) {
      const shallow: DisplayPolyline = {
        type: 'polyline',
        closed: false,
        vertices: new Float64Array([0, 0, bulge, 0, 0, 10, 0, 0, 0, 0]),
      };
      const arc = polylineSegments(shallow)[0]!.geometry;
      if (arc.type !== 'arc') throw new Error('Expected bulge arc');
      expect(arcAt(arc, 0)).toEqual({ x: 0, y: 0 });
      expect(arcAt(arc, 1).x).toBeCloseTo(10, 12);
      expect(Math.abs(arcAt(arc, 1).y)).toBeLessThan(1e-14);
      expect(Math.abs(arcAt(arc, 0.5).y + 5 * bulge)).toBeLessThan(1e-14);
      expect(distanceToGeometry(shallow, { x: 5, y: -5 * bulge })).toBeLessThan(1e-12);
      expect(distanceToGeometry(shallow, { x: 5, y: 1e-6 })).toBeGreaterThan(0.999e-6);
      const bounds = boundsOfGeometry(shallow)!;
      expect(bounds.minY).toBeLessThanOrEqual(Math.min(0, -5 * bulge) + 1e-14);
      expect(bounds.maxY).toBeGreaterThanOrEqual(Math.max(0, -5 * bulge) - 1e-14);
    }
  });
  it('fills tapered polyline ribbons and tangent miter joints, or outlines them for FILLMODE 0', () => {
    const wide: DisplayPolyline = {
      type: 'polyline',
      closed: false,
      vertices: new Float64Array([0, 0, 0, 2, 4, 10, 0, 0, 4, 4, 10, 10, 0, 0, 0]),
    };
    const filled = collectGeometry(wide, options),
      outline = collectGeometry(wide, { ...options, fillmode: false });
    expect(filled.triangles).toHaveLength(6);
    expect(filled.runs).toHaveLength(0);
    expect(outline.triangles).toHaveLength(0);
    expect(outline.runs.length).toBeGreaterThan(0);
    expect(distanceToGeometry(wide, { x: 5, y: 0 })).toBe(0);
    expect(distanceToGeometry(wide, { x: 5, y: 0 }, { fillmode: false })).toBeGreaterThan(1);
    expect(distanceToGeometry(wide, { x: 11.5, y: -1.5 })).toBe(0);
  });
  it('evaluates rational NURBS and oblique/affine curves instead of joining controls', () => {
    const parsed = geometryFromFields('SPLINE', {
      degree: 2,
      knots: [0, 0, 0, 1, 1, 1],
      controlPoints: [
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      weights: [1, Math.SQRT1_2, 1],
    });
    if (parsed.status !== 'ok') throw new Error(parsed.status);
    const transformed = transformGeometry(
      parsed.geometry,
      [2, 0, 0, 2e8, 0, 3, 0, 4.5e8, 0, 0, 1, 0],
    );
    const run = collectGeometry({ type: 'curve', curve: transformed }, { tolerance: 0.001 })
      .runs[0]!;
    expect(run.vertices.length).toBeGreaterThan(20);
    expect(run.vertices[0]).toBe(2e8 + 2);
    expect(run.vertices[1]).toBe(4.5e8);
    expect(run.vertices.at(-3)).toBe(2e8);
    expect(run.vertices.at(-2)).toBe(4.5e8 + 3);
    for (let i = 0; i < run.vertices.length; i += 3) {
      const x = (run.vertices[i]! - 2e8) / 2,
        y = (run.vertices[i + 1]! - 4.5e8) / 3;
      expect(x * x + y * y).toBeCloseTo(1, 6);
    }
  });
  it('projects native oblique widths after the offset and transformed widths after the affine map', () => {
    const parsed = geometryFromFields('LWPOLYLINE', {
      extrusion: [0, 1, 1],
      constantWidth: 4,
      vertices: [{ position: [0, 0] }, { position: [10, 0] }],
    });
    if (parsed.status !== 'ok') throw new Error(parsed.status);
    const result = collectGeometry({ type: 'curve', curve: parsed.geometry }, options);
    expect(result.triangles.length).toBeGreaterThan(0);
    const ys = result.triangles.flat().map((point) => point.y);
    expect(Math.max(...ys)).toBeCloseTo(Math.SQRT2);
    expect(Math.min(...ys)).toBeCloseTo(-Math.SQRT2);
  });
});

describe('POINT and infinite display geometry', () => {
  it('resolves absolute, default and percentage point sizes at the last regen height', () => {
    expect(pointDisplaySize(12, 100)).toBe(12);
    expect(pointDisplaySize(0, 100)).toBe(5);
    expect(pointDisplaySize(-2, 100)).toBe(2);
    const point = { type: 'point' as const, position: { x: 10, y: 20 } };
    expect(collectGeometry(point, { ...options, pdmode: 1 }).points).toHaveLength(0);
    expect(collectGeometry(point, { ...options, pdmode: 2, pdsize: 10 }).runs).toHaveLength(2);
    expect(boundsOfGeometry(point, { pdmode: 98, pdsize: 10 })).toEqual({
      minX: 5,
      minY: 15,
      maxX: 15,
      maxY: 25,
    });
    expect(collectGeometry(point, { ...options, pdmode: 99, pdsize: 10 }).runs).toHaveLength(7);
  });
  it('clips forward rays and complete construction lines, including parallel slab misses', () => {
    const view = { minX: -5, minY: -5, maxX: 5, maxY: 5 },
      basePoint = { x: 0, y: 0 },
      direction = { x: 1, y: 0 };
    expect(clipInfinite({ type: 'ray', basePoint, direction }, view)).toEqual({
      type: 'line',
      start: basePoint,
      end: { x: 5, y: 0 },
    });
    expect(clipInfinite({ type: 'xline', basePoint, direction }, view)?.start).toEqual({
      x: -5,
      y: 0,
    });
    expect(
      clipInfinite({ type: 'ray', basePoint: { x: 10, y: 0 }, direction }, view),
    ).toBeUndefined();
    expect(
      clipInfinite({ type: 'xline', basePoint: { x: 0, y: 6 }, direction }, view),
    ).toBeUndefined();
    expect(distanceToGeometry({ type: 'ray', basePoint, direction }, { x: -3, y: 4 })).toBe(5);
  });
});

describe('display bounds and exact primitive picking', () => {
  it('refines local minima without running a minimizer in every sampled interval', () => {
    let evaluations = 0;
    const distance = numericalCurveDistance(
      { x: 0.123456789, y: 0 },
      (t) => {
        evaluations++;
        return { x: t, y: 100 * (t - 0.123456789) ** 2 };
      },
      [0, 1],
    );
    expect(distance).toBeLessThan(1e-9);
    expect(evaluations).toBeLessThan(100);
  });
  it('uses arc endpoints outside the sweep and radial distance inside it', () => {
    const arc = { ...circle, sweepAngle: Math.PI / 2 };
    expect(distanceToGeometry(arc, { x: -1, y: 10 })).toBeCloseTo(1);
    expect(distanceToGeometry(arc, { x: 10, y: 10 })).toBeCloseTo(Math.sqrt(200) - 10);
    expect(boundsOfGeometry(arc)).toEqual({
      minX: Math.cos(Math.PI / 2) * 10,
      minY: 0,
      maxX: 10,
      maxY: 10,
    });
  });
  it('uses rotated multiline text boxes and filled arrows, with robust degenerate triangles', () => {
    const text: DisplayText = {
      type: 'text',
      position: { x: 100, y: 200 },
      text: '한글\nA',
      height: 10,
      rotation: Math.PI / 2,
      align: 'center',
      width: 20,
    };
    expect(distanceToGeometry(text, { x: 100, y: 200 })).toBe(0);
    expect(boundsOfGeometry(text)).toEqual({ minX: 90, minY: 190, maxX: 115, maxY: 210 });
    expect(
      triangleDistance({ x: 1, y: 1 }, [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 0, y: 5 },
      ]),
    ).toBe(0);
    expect(
      triangleDistance({ x: 3, y: 4 }, [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBe(5);
  });
});
