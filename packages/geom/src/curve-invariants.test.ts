import { expect, it } from 'vitest';
import {
  evaluateGeometry,
  geometryArea,
  geometryBounds,
  geometryFromFields,
  geometryLength,
  polylineArea,
  transformGeometry,
  transformPoint3,
} from './index';
import type { Affine3, CurveGeometry } from './index';

function parse(type: string, fields: Readonly<Record<string, unknown>>): CurveGeometry {
  const result = geometryFromFields(type, fields);
  if (result.status !== 'ok') throw new Error(JSON.stringify(result));
  return result.geometry;
}
it('reports inconsistent periodic endpoint-tangent constraints without ignoring them', () => {
  const fields = {
    flags: 3,
    fitPoints: [
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
      [0, 2, 0],
    ],
    startTangent: [3, 1, 0],
  };
  expect(geometryFromFields('SPLINE', fields)).toEqual({
    status: 'unsupported',
    entityType: 'SPLINE',
    reason: 'inconsistent-periodic-fit-tangents',
  });
  expect(
    geometryFromFields('SPLINE', {
      ...fields,
      degree: 1,
      knots: [0, 0, 1, 1],
      controlPoints: [
        [0, 0, 0],
        [2, 0, 0],
      ],
    }).status,
  ).toBe('ok');
});
it('keeps tiny bulge endpoint, sagitta and area without radius cancellation', () => {
  for (const bulge of [1e-6, -1e-8, 1e-12]) {
    const polyline = parse('LWPOLYLINE', {
      vertices: [{ position: [0, 0], bulge }, { position: [10, 0] }],
    });
    const midpoint = evaluateGeometry(polyline, 0.5),
      endpoint = evaluateGeometry(polyline, 1);
    expect(midpoint.x).toBeCloseTo(5, 10);
    expect(Math.abs(midpoint.y / (-5 * bulge) - 1)).toBeLessThan(1e-9);
    expect(endpoint.x).toBeCloseTo(10, 10);
    expect(Math.abs(endpoint.y)).toBeLessThan(1e-15);
    expect(geometryLength(polyline)).toBeCloseTo(10, 9);
    const expectedArea = (100 * Math.abs(bulge)) / 3;
    expect(Math.abs(geometryArea(polyline)! / expectedArea - 1)).toBeLessThan(1e-10);
    const oldArea = polylineArea({
      vertices: [
        { x: 0, y: 0, bulge },
        { x: 10, y: 0 },
      ],
      closed: false,
    });
    expect(Math.abs(Math.abs(oldArea) / expectedArea - 1)).toBeLessThan(1e-10);
  }
});

it('contains sampled conic/NURBS geometry in bounds through 100 deterministic affine transforms', () => {
  let seed = 110715;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const shapes = [
    parse('ARC', { center: [2, 3, 4], radius: 7, startAngle: 330, endAngle: 80 }),
    parse('ELLIPSE', {
      center: [0, 0, 0],
      majorAxis: [3, 4, 0],
      ratio: 0.2,
      startParameter: 2,
      endParameter: 5,
    }),
    parse('SPLINE', {
      degree: 3,
      knots: [0, 0, 0, 0, 1, 1, 1, 1],
      controlPoints: [
        [0, 0, 0],
        [1, 5, 0],
        [5, -2, 3],
        [10, 0, 4],
      ],
      weights: [1, 3, 0.7, 2],
    }),
  ];
  for (let iteration = 0; iteration < 100; iteration++) {
    const matrix: Affine3 = [
      0.2 + random() * 3,
      random() - 0.5,
      random() - 0.5,
      random() * 1e8,
      0,
      0.2 + random() * 3,
      random() - 0.5,
      random() * 1e8,
      0,
      0,
      0.2 + random() * 3,
      random() * 1e8,
    ];
    for (const source of shapes) {
      const transformed = transformGeometry(source, matrix),
        bounds = geometryBounds(transformed);
      for (let i = 0; i <= 32; i++) {
        const actual = evaluateGeometry(transformed, i / 32),
          expected = transformPoint3(matrix, evaluateGeometry(source, i / 32));
        for (const axis of ['x', 'y', 'z'] as const) {
          expect(Math.abs(actual[axis] - expected[axis])).toBeLessThan(1e-6);
          expect(actual[axis]).toBeGreaterThanOrEqual(bounds.min[axis] - 1e-7);
          expect(actual[axis]).toBeLessThanOrEqual(bounds.max[axis] + 1e-7);
        }
      }
    }
  }
});
