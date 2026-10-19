import { beforeEach, expect, it, vi } from 'vitest';
import { geometryEvaluation } from '@hancad/geom';
import { drawingToDxf, readCadFile } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { splineProgram } from './draw-spline';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));

const frame = [
  [0, 0, 0],
  [10, 20, 2],
  [20, -10, 4],
  [30, 0, 6],
] as const;
function splineFitDxf(degree: 2 | 3, closed: boolean, is3D: boolean): string {
  const record = (type: string, ...tags: (string | number)[]): string =>
    [0, type, ...tags].join('\n') + '\n';
  const vertex = (point: readonly number[], flag: number, index: number): string =>
    record(
      'VERTEX',
      5,
      (0x81 + index).toString(16),
      330,
      '80',
      10,
      point[0]!,
      20,
      point[1]!,
      30,
      point[2] ?? 0,
      70,
      flag | (is3D ? 32 : 0),
    );
  return (
    record('SECTION', 2, 'ENTITIES') +
    record(
      'POLYLINE',
      5,
      '80',
      66,
      1,
      10,
      0,
      20,
      0,
      30,
      is3D ? 0 : 7,
      70,
      4 | (closed ? 1 : 0) | (is3D ? 8 : 0),
      75,
      degree === 2 ? 5 : 6,
    ) +
    frame.map((point, index) => vertex(point, 16, index)).join('') +
    // Generated fit vertices are display samples, not the original control frame.
    [
      [0, 0],
      [8, 9],
      [15, 3],
      [24, -2],
      [30, 0],
    ]
      .map((point, index) => vertex(point, 8, index + frame.length))
      .join('') +
    record('SEQEND', 5, '90', 330, '80') +
    record('ENDSEC') +
    record('EOF')
  );
}

it.each([
  [2, false, false],
  [3, false, true],
  [2, true, false],
  [3, true, true],
] as const)(
  'imports real degree %i closed=%s 3D=%s spline-fit POLYLINE for SPLINE Object',
  async (degree, closed, is3D) => {
    const imported = await readCadFile(
      new File([splineFitDxf(degree, closed, is3D)], 'spline-fit.dxf'),
    );
    expect(imported.report).toMatchObject({ imported: 1, skipped: 0, approximated: 0 });
    const entity = imported.state.entities[0]!;
    expect(entity.sourceType).toBe(
      degree === 2 ? 'POLYLINE_SPLINE_QUADRATIC' : 'POLYLINE_SPLINE_CUBIC',
    );
    if (entity.type !== 'polyline' || entity.curve?.type !== 'SPLINE')
      throw new Error('Missing exact spline-fit source');
    expect(entity.points).toHaveLength(frame.length);
    expect(entity.curve.controlPoints.slice(0, frame.length)).toEqual(
      frame.map(([x, y, z]) => ({ x, y, z: is3D ? z : 7 })),
    );
    expect(entity.curve).toMatchObject({ degree, closed, periodic: closed });
    expect(() => drawingToDxf(imported.state)).toThrow(/네이티브 DXF.*지원하지 않습니다/);
    for (const delobj of [0, 1]) {
      const context = outlineContext({ DELOBJ: delobj });
      const result = outlineRun(
        splineProgram,
        ['O', { entity, point: entity.points[0]! }, ''],
        context,
      );
      expect(result.eraseIds).toEqual(delobj ? [entity.id] : []);
      const converted = result.entities[0]!;
      expect(converted.sourceType).toBe('SPLINE');
      expect(converted.curve).toEqual(entity.curve);
      for (const t of [0, 0.25, 0.7, 1])
        expect(geometryEvaluation(converted.curve!, t)).toEqual(
          geometryEvaluation(entity.curve, t),
        );
      imported.state.entities = [converted];
      expect(drawingToDxf(imported.state)).toContain('\r\n0\r\nSPLINE\r\n');
    }
    if (closed) {
      const start = geometryEvaluation(entity.curve, 0),
        end = geometryEvaluation(entity.curve, 1);
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(start.point[axis]).toBeCloseTo(end.point[axis], 10);
        expect(start.derivative[axis]).toBeCloseTo(end.derivative[axis], 10);
      }
    }
  },
);
