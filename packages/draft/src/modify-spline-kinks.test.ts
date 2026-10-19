import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateGeometry,
  geometryEvaluation,
  resolveSpline,
  transformGeometry,
  type SplineGeometry,
} from '@hancad/geom';
import {
  createEmptyCadState,
  normalizeCadState,
  drawingToDxf,
  readCadFile,
  type CadPoint,
  type CadPolyline,
} from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { splineFromPoints } from './draw-spline';
import { splineditProgram } from './modify-spline';
import { reverseEditCurve } from './modify-curve-geometry';
import { refitEditSpline } from './modify-spline-refit';
import { splineClose } from './modify-spline-data';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const p = (x: number, y = 0): CadPoint => ({ x, y: -y || 0 });
const entity: CadPolyline = {
  id: 'spline',
  type: 'polyline',
  layer: '0',
  color: '#ffffff',
  lineWidth: 1,
  points: [p(0), p(20, 30), p(40), p(60, 20), p(80)],
  closed: false,
};
entity.curve = splineFromPoints(entity.points, true, 3, 0);
const context = (source = entity) => ({
  ...outlineContext({ SPLPERIODIC: 1 }),
  entities: [source],
  selectedIds: [source.id],
});
function kinkAngle(source: SplineGeometry, index: number): number {
  const point = source.fitPoints[index]!,
    low = source.knots[source.degree]!,
    high = source.knots[source.controlPoints.length]!;
  const parameter = [...new Set(source.knots)]
    .map((k) => (k - low) / (high - low))
    .find(
      (t) =>
        t > 0 &&
        t < 1 &&
        Math.hypot(
          evaluateGeometry(source, t).x - point.x,
          evaluateGeometry(source, t).y - point.y,
        ) < 1e-8,
    );
  if (parameter === undefined) throw new Error('Expected retained kink knot');
  const left = geometryEvaluation(source, parameter - 1e-7).derivative,
    right = geometryEvaluation(source, parameter + 1e-7).derivative;
  return (
    Math.abs(left.x * right.y - left.y * right.x) /
    Math.hypot(left.x, left.y) /
    Math.hypot(right.x, right.y)
  );
}
function edited(): CadPolyline {
  const result = outlineRun(
    splineditProgram,
    ['F', 'K', p(20, 30), 'M', '2', p(20, 70), 'X', 'L', '0.5', 'X', ''],
    context(),
  ).entities[0];
  if (result?.type !== 'polyline' || result.curve?.type !== 'SPLINE')
    throw new Error('Expected spline');
  return result;
}
describe('persistent SPLINEDIT kink constraints', () => {
  it('Move and Tolerance preserve independent tangents instead of smoothing away Kink', () => {
    const curve = edited().curve as SplineGeometry;
    expect(curve.kinkFitIndices).toEqual([1]);
    expect(curve.fitPoints[1]).toMatchObject({ x: 20, y: 70 });
    expect(curve.fitTolerance).toBe(0.5);
    expect(kinkAngle(curve, 1)).toBeGreaterThan(0.1);
  });
  it('survives complete recovery and affine transformations with the same fit-point index', () => {
    const source = edited();
    const recovered = normalizeCadState(
      JSON.parse(JSON.stringify({ ...createEmptyCadState(), entities: [source] })),
    ).entities[0]!.curve as SplineGeometry;
    expect(recovered.kinkFitIndices).toEqual([1]);
    const transformed = transformGeometry(
      recovered,
      [0, -2, 0, 100, 2, 0, 0, 50, 0, 0, 1, 0],
    ) as SplineGeometry;
    expect(transformed.kinkFitIndices).toEqual([1]);
    const refit = refitEditSpline(transformed);
    expect(kinkAngle(refit, 1)).toBeGreaterThan(0.1);
  });
  it('remaps the kink when reversing and refitting the spline', () => {
    const reversed = reverseEditCurve(edited().curve!) as SplineGeometry;
    expect(reversed.kinkFitIndices).toEqual([3]);
    expect(kinkAngle(refitEditSpline(reversed), 3)).toBeGreaterThan(0.1);
  });
  it('preserves kink indices and the original start point through Close/Open', () => {
    const source = edited().curve as SplineGeometry,
      closed = splineClose(source, true, true);
    expect(closed.kinkFitIndices).toEqual([1]);
    expect(evaluateGeometry(closed, 0)).toMatchObject({ x: 0, y: 0 });
    expect(evaluateGeometry(closed, 1)).toMatchObject({ x: 0, y: 0 });
    expect(kinkAngle(closed, 1)).toBeGreaterThan(0.1);
    const opened = splineClose(closed, false, false);
    expect(opened.kinkFitIndices).toEqual([1]);
    expect(kinkAngle(opened, 1)).toBeGreaterThan(0.1);
  });
  it('remaps Add/Delete and purges kink intent when switching to a control frame', () => {
    const source = edited();
    const added = outlineRun(
      splineditProgram,
      ['F', 'A', '1', 'B', p(-10), 'X', ''],
      context(source),
    ).entities[0]?.curve as SplineGeometry;
    expect(added.kinkFitIndices).toEqual([2]);
    const removed = outlineRun(
      splineditProgram,
      ['F', 'D', '3', 'P', ''],
      context({ ...source, curve: added }),
    ).entities[0]?.curve as SplineGeometry;
    expect(removed.kinkFitIndices).toBeUndefined();
    expect(removed.fitPoints).toEqual([]);
  });
  it('rejects invalid persisted kink indices at the same boundary as other NURBS data', () => {
    const source = edited().curve as SplineGeometry;
    expect(() => resolveSpline({ ...source, kinkFitIndices: [-1] })).toThrow(
      'invalid-spline-kink-indices',
    );
    expect(() => resolveSpline({ ...source, kinkFitIndices: [1, 1] })).toThrow(
      'invalid-spline-kink-indices',
    );
    expect(() => resolveSpline({ ...source, kinkFitIndices: [source.fitPoints.length] })).toThrow(
      'invalid-spline-kink-indices',
    );
  });
  it('round-trips kink intent through native SPLINE DXF plus validated owned metadata', async () => {
    const state = normalizeCadState({ ...createEmptyCadState(), entities: [edited()] });
    const dxf = drawingToDxf(state);
    expect(dxf).toContain('\r\n0\r\nSPLINE\r\n');
    const recovered = await readCadFile(new File([dxf], 'kink.dxf'));
    const curve = recovered.state.entities[0]?.curve as SplineGeometry;
    expect(curve.kinkFitIndices).toEqual([1]);
    expect(kinkAngle(refitEditSpline(curve), 1)).toBeGreaterThan(0.1);
  });
});
