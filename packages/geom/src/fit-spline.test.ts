import { expect, it } from 'vitest';
import { fitSpline } from './fit-spline';
import { geometryEvaluation, geometryFromFields } from './index';
import type { SplineGeometry, Vec3 } from './curve-types';
import { add3, scale3, subtract3 } from './vector3';

const square: readonly Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 2, y: 0, z: 0 },
  { x: 2, y: 2, z: 0 },
  { x: 0, y: 2, z: 0 },
];
const tangent = { x: 6, y: -6, z: 0 };
function source(overrides: Partial<SplineGeometry> = {}): SplineGeometry {
  return {
    type: 'SPLINE',
    degree: 3,
    controlPoints: [],
    knots: [],
    weights: [],
    fitPoints: square,
    closed: true,
    periodic: true,
    fitTolerance: 0,
    knotParameterization: 'uniform',
    ...overrides,
  };
}
function near(actual: Vec3, expected: Vec3, precision = 10): void {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

it('honors either or both consistent periodic endpoint derivatives and preserves input data', () => {
  for (const derivatives of [
    { startTangent: tangent },
    { endTangent: tangent },
    { startTangent: tangent, endTangent: tangent },
  ]) {
    const input = source(derivatives);
    const before = structuredClone(input);
    const resolved = fitSpline(input);
    expect(input).toEqual(before);
    expect(resolved.controlPoints).toEqual(fitSpline(source()).controlPoints);
    expect(resolved.startTangent).toEqual(input.startTangent);
    expect(resolved.endTangent).toEqual(input.endTangent);
    for (let i = 0; i <= square.length; i++)
      near(geometryEvaluation(resolved, i / square.length).point, square[i % square.length]!);
    near(geometryEvaluation(resolved, 0).derivative, tangent);
    near(geometryEvaluation(resolved, 1).derivative, tangent);
  }
});

it('maintains analytic second-derivative continuity at every periodic cubic join', () => {
  const resolved = fitSpline(source({ startTangent: tangent, endTangent: tangent }));
  const starts: Vec3[] = [],
    ends: Vec3[] = [];
  for (let i = 0; i < square.length; i++) {
    const controls = resolved.controlPoints.slice(3 * i, 3 * i + 4);
    starts.push(scale3(add3(subtract3(controls[0]!, scale3(controls[1]!, 2)), controls[2]!), 96));
    ends.push(scale3(add3(subtract3(controls[1]!, scale3(controls[2]!, 2)), controls[3]!), 96));
  }
  near(starts[0]!, { x: 48, y: 48, z: 0 });
  for (let i = 0; i < square.length; i++) near(ends[i]!, starts[(i + 1) % square.length]!);
});

it('supports duplicated closure points and consistent 3D tangents at survey coordinates', () => {
  const points = square.map(({ x, y }) => ({
    x: 400_000_000 + x,
    y: 300_000_000 + y,
    z: 1_000_000 + 2 * x + y,
  }));
  points.push(points[0]!);
  const derivative = { x: 6, y: -6, z: 6 };
  const resolved = fitSpline(
    source({ fitPoints: points, startTangent: derivative, endTangent: derivative }),
  );
  expect(resolved.controlPoints).toHaveLength(13);
  for (let i = 0; i < points.length; i++)
    near(geometryEvaluation(resolved, i / 4).point, points[i]!, 5);
  near(geometryEvaluation(resolved, 0).derivative, derivative, 5);
  near(geometryEvaluation(resolved, 1).derivative, derivative, 5);
});

it('preserves nonuniform parameterization when matching periodic tangent constraints', () => {
  const fitPoints = [
    { x: 0, y: 0, z: 0 },
    { x: 3, y: 0, z: 1 },
    { x: 4, y: 1, z: 2 },
    { x: 0, y: 2, z: 1 },
  ];
  for (const knotParameterization of ['chord', 'centripetal', 'uniform'] as const) {
    const input = source({ fitPoints, knotParameterization });
    const unconstrained = fitSpline(input);
    const startTangent = geometryEvaluation(unconstrained, 0).derivative;
    const endTangent = geometryEvaluation(unconstrained, 1).derivative;
    const constrained = fitSpline({ ...input, startTangent, endTangent });
    expect(constrained.knots).toEqual(unconstrained.knots);
    expect(constrained.controlPoints).toEqual(unconstrained.controlPoints);
    for (let i = 0; i <= 20; i++)
      near(
        geometryEvaluation(constrained, i / 20).point,
        geometryEvaluation(unconstrained, i / 20).point,
      );
  }
});

it('rejects inconsistent derivatives independently of positional fit tolerance', () => {
  for (const derivatives of [
    { startTangent: { x: 6, y: -5, z: 0 } },
    { endTangent: { x: 6, y: -6, z: 1 } },
    { startTangent: tangent, endTangent: scale3(tangent, 2) },
  ])
    expect(() => fitSpline(source({ ...derivatives, fitTolerance: 1_000_000 }))).toThrow(
      'inconsistent-periodic-fit-tangents',
    );
  expect(() => fitSpline(source({ startTangent: { ...tangent, x: tangent.x + 1e-9 } }))).toThrow(
    'inconsistent-periodic-fit-tangents',
  );
  expect(() =>
    fitSpline(source({ startTangent: { ...tangent, x: tangent.x + 8 * Number.EPSILON } })),
  ).not.toThrow();
});

it('parses matching fit-only constraints while retaining inconsistent metadata as unsupported', () => {
  const fields = {
    flags: 3,
    fitPoints: square.map(({ x, y, z }) => [x, y, z]),
    startTangent: [6, -6, 0],
    endTangent: [6, -6, 0],
  };
  expect(geometryFromFields('SPLINE', fields).status).toBe('ok');
  expect(geometryFromFields('SPLINE', { ...fields, endTangent: [6, -5, 0] })).toEqual({
    status: 'unsupported',
    entityType: 'SPLINE',
    reason: 'inconsistent-periodic-fit-tangents',
  });
  expect(
    geometryFromFields('SPLINE', {
      ...fields,
      fitPoints: [fields.fitPoints[0], fields.fitPoints[0], fields.fitPoints[1]],
    }).status,
  ).toBe('invalid');
});
