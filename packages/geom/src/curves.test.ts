import { describe, expect, it } from 'vitest';
import {
  closestGeometryPoint,
  distance3,
  evaluateGeometry,
  geometryArea,
  geometryBounds,
  geometryEvaluation,
  geometryFromFields,
  geometryLength,
  resolveSpline,
  transformGeometry,
  transformPoint3,
} from './index';
import type { Affine3, CurveGeometry, Vec3 } from './index';

function curve(type: string, fields: Readonly<Record<string, unknown>>): CurveGeometry {
  const result = geometryFromFields(type, fields);
  if (result.status !== 'ok') throw new Error(JSON.stringify(result));
  return result.geometry;
}
function near(actual: Vec3, expected: Vec3, precision = 8): void {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}
const line = () => curve('LINE', { start: [0, 0, 0], end: [3, 4, 12] });
const circle = () => curve('CIRCLE', { center: [10, 20, 0], radius: 5 });
const arc = () => curve('ARC', { center: [0, 0, 0], radius: 2, startAngle: 270, endAngle: 90 });
const ellipse = () => curve('ELLIPSE', { center: [0, 0, 0], majorAxis: [4, 0, 0], ratio: 0.5 });
const polyline = () =>
  curve('LWPOLYLINE', {
    flags: 1,
    vertices: [{ position: [0, 0], bulge: 1 }, { position: [10, 0] }],
  });
const rational = () =>
  curve('SPLINE', {
    degree: 2,
    knots: [0, 0, 0, 1, 1, 1],
    controlPoints: [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
    weights: [1, Math.SQRT1_2, 1],
  });

describe('DXF geometry adapter and pure 3D inquiry', () => {
  it('evaluates finite lines and points with full 3D length and exact closest points', () => {
    const entity = line();
    expect(geometryLength(entity)).toBe(13);
    near(evaluateGeometry(entity, 0.5), { x: 1.5, y: 2, z: 6 });
    near(closestGeometryPoint(entity, { x: -10, y: 0, z: 0 }).point, { x: 0, y: 0, z: 0 });
    expect(geometryBounds(entity)).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 3, y: 4, z: 12 },
      kind: 'finite',
      quality: 'exact',
    });
    expect(geometryArea(entity)).toBeUndefined();
    const point = curve('POINT', { position: [3, 4, 5] });
    near(evaluateGeometry(point, 0.3), { x: 3, y: 4, z: 5 });
    expect(geometryLength(point)).toBe(0);
    expect(closestGeometryPoint(point, { x: 3, y: 4, z: 10 }).distance).toBe(5);
  });

  it('represents ray and xline unbounded extents deliberately and clamps only ray direction', () => {
    for (const type of ['RAY', 'XLINE']) {
      const entity = curve(type, { basePoint: [3, 4, 5], direction: [0, 2, 0] });
      const bounds = geometryBounds(entity);
      expect(bounds.kind).toBe('unbounded');
      expect(bounds.max).toEqual({ x: 3, y: Infinity, z: 5 });
      expect(bounds.min.y).toBe(type === 'RAY' ? 4 : -Infinity);
      expect(geometryLength(entity)).toBe(Infinity);
      expect(geometryArea(entity)).toBeUndefined();
      near(closestGeometryPoint(entity, { x: 4, y: -10, z: 6 }).point, {
        x: 3,
        y: type === 'RAY' ? 4 : -10,
        z: 5,
      });
      near(evaluateGeometry(entity, 2), { x: 3, y: 6, z: 5 });
    }
  });

  it('uses DXF arbitrary object axes and degree-to-radian arc conversion', () => {
    const tilted = curve('CIRCLE', { center: [2, 3, 4], radius: 2, extrusion: [0, 1, 0] });
    near(evaluateGeometry(tilted, 0), { x: -4, y: 4, z: 3 });
    near(evaluateGeometry(tilted, 0.25), { x: -2, y: 4, z: 5 });
    const bounds = geometryBounds(tilted);
    near(bounds.min, { x: -4, y: 4, z: 1 });
    near(bounds.max, { x: 0, y: 4, z: 5 });
    expect(geometryLength(tilted)).toBeCloseTo(4 * Math.PI);
    expect(geometryArea(tilted)).toBeCloseTo(4 * Math.PI);
    const entity = arc();
    expect(geometryLength(entity)).toBeCloseTo(2 * Math.PI);
    expect(geometryArea(entity)).toBeCloseTo(2 * Math.PI);
    near(geometryBounds(entity).min, { x: 0, y: -2, z: 0 });
    near(geometryBounds(entity).max, { x: 2, y: 2, z: 0 });
    near(closestGeometryPoint(entity, { x: -10, y: 1, z: 3 }).point, { x: 0, y: 2, z: 0 });
  });

  it('computes true ellipse extrema, elliptic-arc chord area, numerical length and closest point', () => {
    const entity = ellipse();
    expect(geometryArea(entity)).toBeCloseTo(8 * Math.PI);
    expect(geometryLength(entity)).toBeCloseTo(19.3768964411, 8);
    near(geometryBounds(entity).min, { x: -4, y: -2, z: 0 });
    near(geometryBounds(entity).max, { x: 4, y: 2, z: 0 });
    near(closestGeometryPoint(entity, { x: 0, y: 10, z: 2 }).point, { x: 0, y: 2, z: 0 }, 6);
    const partial = curve('ELLIPSE', {
      center: [0, 0, 0],
      majorAxis: [4, 0, 0],
      ratio: 0.5,
      startParameter: 0,
      endParameter: Math.PI / 2,
    });
    expect(geometryArea(partial)).toBeCloseTo(4 * (Math.PI / 2 - 1));
    near(evaluateGeometry(partial, 1), { x: 0, y: 2, z: 0 });
  });

  it('retains bulge direction, major arcs, tapered widths and centerline area', () => {
    const entity = polyline();
    expect(geometryLength(entity)).toBeCloseTo(5 * Math.PI + 10);
    expect(geometryArea(entity)).toBeCloseTo(12.5 * Math.PI);
    near(evaluateGeometry(entity, 0.25), { x: 5, y: -5, z: 0 });
    near(closestGeometryPoint(entity, { x: 5, y: -7, z: 0 }).point, { x: 5, y: -5, z: 0 });
    const wide = curve('LWPOLYLINE', {
      flags: 1,
      constantWidth: 20,
      vertices: [
        { position: [0, 0], startWidth: 2, endWidth: 4 },
        { position: [10, 0] },
        { position: [10, 10] },
      ],
    });
    expect(geometryArea(wide)).toBe(50);
    expect(geometryBounds(wide).min.y).toBe(-2);
    const major = curve('LWPOLYLINE', {
      vertices: [{ position: [0, 0], bulge: -2 }, { position: [10, 0] }],
    });
    expect(geometryLength(major)).toBeCloseTo(6.25 * 4 * Math.atan(2));
    expect(geometryBounds(major).max.y).toBeCloseTo(10);
    const open = curve('LWPOLYLINE', {
      vertices: [{ position: [0, 0] }, { position: [10, 0] }, { position: [10, 10], bulge: 4 }],
    });
    expect(geometryArea(open)).toBe(50);
  });

  it('distinguishes 2D OCS polylines from 3D WCS polylines and rejects nonplanar area', () => {
    const two = curve('POLYLINE', {
      elevation: 4,
      extrusion: [0, 1, 0],
      vertices: [{ position: [0, 0, 999] }, { position: [3, 4, 999] }],
    });
    near(evaluateGeometry(two, 1), { x: -3, y: 4, z: 4 });
    expect(geometryLength(two)).toBe(5);
    const three = curve('POLYLINE', {
      flags: 8,
      vertices: [{ position: [0, 0, 0], bulge: 1 }, { position: [3, 4, 12] }],
    });
    expect(geometryLength(three)).toBe(13);
    near(evaluateGeometry(three, 0.5), { x: 1.5, y: 2, z: 6 });
    const nonplanar = curve('POLYLINE', {
      flags: 9,
      vertices: [
        { position: [0, 0, 0] },
        { position: [1, 0, 0] },
        { position: [1, 1, 1] },
        { position: [0, 1, 0] },
      ],
    });
    expect(geometryArea(nonplanar)).toBeUndefined();
  });

  it('evaluates rational NURBS with repeated knots without discarding fit metadata', () => {
    const entity = rational();
    near(evaluateGeometry(entity, 0.5), { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 });
    expect(geometryLength(entity)).toBeCloseTo(Math.PI / 2, 8);
    expect(geometryArea(entity)).toBeCloseTo((Math.PI / 2 - 1) / 2, 8);
    near(
      closestGeometryPoint(entity, { x: 2, y: 2, z: 0 }).point,
      { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 },
      6,
    );
    const bounds = geometryBounds(entity);
    expect(bounds.quality).toBe('conservative');
    near(bounds.min, { x: 0, y: 0, z: 0 });
    near(bounds.max, { x: 1, y: 1, z: 0 });
    const repeated = curve('SPLINE', {
      degree: 1,
      knots: [0, 0, 0.5, 1, 1],
      controlPoints: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      fitPoints: [[5, 5, 5]],
    });
    expect(geometryLength(repeated)).toBeCloseTo(2, 8);
    near(evaluateGeometry(repeated, 0.5), { x: 1, y: 0, z: 0 });
    if (repeated.type !== 'SPLINE') throw new Error('Expected a spline.');
    expect(repeated.fitPoints).toEqual([{ x: 5, y: 5, z: 5 }]);
  });

  it('interpolates cubic fit-only data with chord/uniform/centripetal spacing and tangent magnitudes', () => {
    for (const knotParameterization of ['chord', 'uniform', 'centripetal']) {
      const entity = curve('SPLINE', {
        degree: 7,
        knotParameterization,
        fitPoints: [
          [0, 0, 0],
          [1, 2, 0],
          [4, 2, 0],
        ],
        startTangent: [2, 0, 0],
        endTangent: [0, -3, 0],
      });
      const first =
        knotParameterization === 'uniform'
          ? 1
          : knotParameterization === 'chord'
            ? Math.sqrt(5)
            : Math.pow(5, 0.25);
      const second =
        knotParameterization === 'uniform'
          ? 1
          : knotParameterization === 'chord'
            ? 3
            : Math.sqrt(3);
      near(evaluateGeometry(entity, first / (first + second)), { x: 1, y: 2, z: 0 });
      near(geometryEvaluation(entity, 0).derivative, { x: 2, y: 0, z: 0 });
      near(geometryEvaluation(entity, 1).derivative, { x: 0, y: -3, z: 0 });
      if (entity.type !== 'SPLINE') throw new Error('Expected a spline.');
      expect(entity.controlPoints).toHaveLength(0);
      expect(resolveSpline(entity).degree).toBe(3);
      expect(geometryLength(entity)).toBeGreaterThan(Math.sqrt(5) + 3);
    }
    const periodic = curve('SPLINE', {
      flags: 3,
      fitPoints: [
        [0, 0, 0],
        [2, 0, 0],
        [2, 2, 0],
        [0, 2, 0],
      ],
    });
    near(evaluateGeometry(periodic, 0), evaluateGeometry(periodic, 1));
    near(geometryEvaluation(periodic, 0).derivative, geometryEvaluation(periodic, 1).derivative);
    expect(geometryArea(periodic)).toBeGreaterThan(4);
  });

  it('preserves unknown/invalid data responsibility with explicit parse results', () => {
    expect(geometryFromFields('3DSOLID', { opaque: [1, 2, 3] }).status).toBe('unsupported');
    expect(geometryFromFields('POLYLINE', { flags: 64 }).status).toBe('unsupported');
    for (const [type, fields] of [
      ['CIRCLE', { center: [0, 0, 0], radius: -1 }],
      ['RAY', { basePoint: [0, 0, 0], direction: [0, 0, 0] }],
      ['LINE', { start: [0, 0, NaN], end: [1, 2, 3] }],
      ['SPLINE', { degree: 2, controlPoints: [[0, 0, 0]], knots: [] }],
      [
        'SPLINE',
        {
          fitPoints: [
            [0, 0, 0],
            [0, 0, 0],
          ],
        },
      ],
    ] as const)
      expect(geometryFromFields(type, fields).status).toBe('invalid');
    expect(() => transformGeometry(circle(), [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0])).toThrow(
      'singular-transform',
    );
  });
});

describe('immutable affine geometry transforms', () => {
  it('keeps circle/arc under similarities and maps nonuniform/sheared conics to exact ellipses', () => {
    const matrices: Affine3[] = [
      [2, 0, 0, 3, 0, 2, 0, 4, 0, 0, 2, 5],
      [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
      [2, 0.7, 0, 10, 0, 1, 0, 20, 0, 0, 1, 3],
    ];
    for (const entity of [line(), circle(), arc(), ellipse(), polyline(), rational()]) {
      const original = structuredClone(entity);
      for (const matrix of matrices) {
        const transformed = transformGeometry(entity, matrix);
        for (let i = 0; i <= 16; i++)
          near(
            evaluateGeometry(transformed, i / 16),
            transformPoint3(matrix, evaluateGeometry(entity, i / 16)),
            7,
          );
        expect(geometryBounds(transformed).kind).toBe('finite');
      }
      expect(entity).toEqual(original);
    }
    expect(transformGeometry(circle(), matrices[0]!).type).toBe('CIRCLE');
    expect(transformGeometry(arc(), matrices[1]!).type).toBe('ARC');
    expect(transformGeometry(circle(), matrices[2]!).type).toBe('ELLIPSE');
    const scaled = transformGeometry(polyline(), matrices[0]!);
    expect(geometryLength(scaled)).toBeCloseTo(geometryLength(polyline()) * 2);
    expect(geometryArea(scaled)).toBeCloseTo(geometryArea(polyline())! * 4);
    const fit = curve('SPLINE', {
      fitPoints: [
        [0, 0, 0],
        [1, 3, 0],
        [10, 4, 0],
      ],
    });
    const transformed = transformGeometry(fit, matrices[2]!);
    for (let i = 0; i <= 12; i++)
      near(
        evaluateGeometry(transformed, i / 12),
        transformPoint3(matrices[2]!, evaluateGeometry(fit, i / 12)),
        7,
      );
  });

  it('maintains inquiry accuracy at survey coordinates without mutating canonical fields', () => {
    const fields = {
      vertices: [{ position: [0, 0], bulge: 0.5 }, { position: [3, 0] }, { position: [3, 4] }],
      flags: 1,
    };
    const original = structuredClone(fields),
      entity = curve('LWPOLYLINE', fields);
    const matrix: Affine3 = [1, 0, 0, 200000000, 0, 1, 0, 450000000, 0, 0, 1, 0];
    const moved = transformGeometry(entity, matrix);
    expect(geometryLength(moved)).toBeCloseTo(geometryLength(entity), 7);
    expect(geometryArea(moved)).toBeCloseTo(geometryArea(entity)!, 7);
    expect(
      distance3(
        evaluateGeometry(moved, 0.25),
        transformPoint3(matrix, evaluateGeometry(entity, 0.25)),
      ),
    ).toBeLessThan(1e-6);
    expect(fields).toEqual(original);
  });
});
