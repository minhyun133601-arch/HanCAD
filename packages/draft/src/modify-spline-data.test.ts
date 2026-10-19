import { expect, test } from 'vitest';
import { evaluateGeometry, geometryEvaluation, type SplineGeometry } from '@hancad/geom';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { splineFromPoints } from './draw-spline';
import { splineditProgram } from './modify-spline';
import type { CadPolyline } from '@hancad/legacy-bridge';
import { DrawSession } from './draw-session';
import type { DrawResult } from './draw-program';

const source: CadPolyline = {
  id: 'spline',
  layer: '0',
  color: '#ffffff',
  lineWidth: 1,
  type: 'polyline',
  points: [
    { x: 0, y: 0 },
    { x: 25, y: -50 },
    { x: 75, y: -50 },
    { x: 100, y: 0 },
  ],
  closed: false,
};
source.curve = splineFromPoints(source.points, false, 3, 2);
const context = () => ({ ...outlineContext(), entities: [source], selectedIds: ['spline'] });
test('entering Fit data on a cubic control spline preserves its existing equation', () => {
  const result = outlineRun(splineditProgram, ['F', 'X', ''], context()).entities[0]
    ?.curve as SplineGeometry;
  expect(result.fitPoints).toHaveLength(4);
  for (let i = 0; i <= 10; i++)
    expect(evaluateGeometry(result, i / 10)).toEqual(evaluateGeometry(source.curve!, i / 10));
});
test('Kink adds retained fit data and later Move can still address its fit points', () => {
  const result = outlineRun(
    splineditProgram,
    ['F', 'K', { x: 50, y: -37.5 }, 'M', '3', { x: 55, y: -45 }, 'X', 'X', ''],
    context(),
  ).entities[0]?.curve as SplineGeometry;
  expect(result.fitPoints).toHaveLength(5);
  expect(result.fitPoints[2]).toMatchObject({ x: 55, y: 45 });
});
test('interactive REFINE is not captured by the Reverse abbreviation', () => {
  let result: DrawResult | undefined;
  const session = new DrawSession('SPLINEDIT', splineditProgram, {
    context: context(),
    onComplete: (value) => {
      result = value;
    },
  });
  session.acceptText('REFINE');
  expect(session.getRequest()?.en).toContain('knot refinement');
  session.acceptPoint({ x: 50, y: -37.5 });
  session.acceptText('');
  const spline = result?.entities[0]?.curve;
  expect(spline?.type).toBe('SPLINE');
  if (spline?.type !== 'SPLINE') throw new Error('Expected spline');
  expect(spline.controlPoints).toHaveLength(5);
  expect(evaluateGeometry(spline, 0)).toEqual(evaluateGeometry(source.curve!, 0));
});
test('a closed fit spline accepts one closure tangent and retains a coincident C1 seam', () => {
  const result = outlineRun(splineditProgram, ['C', 'F', 'T', '90', 'X', ''], context()).entities[0]
    ?.curve as SplineGeometry;
  expect(result.closed).toBe(true);
  const first = geometryEvaluation(result, 0),
    last = geometryEvaluation(result, 1);
  expect(first.point).toEqual(last.point);
  expect(first.derivative.x).toBeCloseTo(0, 8);
  expect(first.derivative.y).toBeGreaterThan(0);
  expect(last.derivative.x).toBeCloseTo(first.derivative.x, 8);
  expect(last.derivative.y).toBeCloseTo(first.derivative.y, 8);
});
