import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { geometryEvaluation, geometryFromFields } from '@hancad/geom';
import { decodeDxfFields } from '@hancad/db';
import type { DxfGroup } from '@hancad/db';
import type { CurveGeometry, Vec3 } from '@hancad/geom';
import {
  createEmptyCadState,
  drawingBounds,
  drawingToDxf,
  drawingToSvg,
  normalizeCadState,
  readCadFile,
} from './bridge';
import { drawingExportHooks } from './draw-export-hooks';
import { createTestRuntime } from './test-runtime';
import type { CadEntity } from './types';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const p = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const spline: CurveGeometry = {
  type: 'SPLINE',
  degree: 2,
  knots: [0, 0, 0, 1, 1, 1],
  controlPoints: [p(0, 0), p(50, 100), p(100, 0)],
  weights: [1, 1, 1],
  fitPoints: [],
  closed: false,
  periodic: false,
  fitTolerance: 1e-10,
  knotParameterization: 'chord',
};
function entity(curve: CurveGeometry, id: string = curve.type): CadEntity {
  return {
    id,
    layer: '0',
    color: '#ffffff',
    lineWidth: 1,
    type: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: -100 },
    ],
    closed: false,
    curve,
    sourceType: curve.type,
  };
}
function fixture() {
  const state = createEmptyCadState();
  state.entities = [
    entity({ type: 'POINT', position: p(10, 20, 3) }),
    entity({ type: 'XLINE', basePoint: p(5, 6), direction: p(1, 0) }),
    entity({ type: 'RAY', basePoint: p(7, 8), direction: p(0, 1) }),
    entity({
      type: 'ELLIPSE',
      center: p(50, 40),
      majorAxis: p(20, 0),
      minorAxis: p(0, 10),
      startParameter: 0,
      sweepParameter: Math.PI * 2,
    }),
    entity(spline),
    entity(
      {
        type: 'POLYLINE',
        vertices: [
          { position: p(1, 2, 3), bulge: 0, startWidth: 0, endWidth: 0 },
          { position: p(4, 5, 3), bulge: 0, startWidth: 0, endWidth: 0 },
        ],
        closed: false,
        is3D: true,
        normal: p(0, 0, 1),
        constantWidth: 0,
      },
      '3DPOLY',
    ),
  ];
  return state;
}
function firstRecord(dxf: string, type: string): DxfGroup[] {
  const lines = dxf.split('\r\n'),
    result: DxfGroup[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    if (lines[i] === '0' && lines[i + 1] === type) {
      for (i += 2; i < lines.length - 1 && lines[i] !== '0'; i += 2) {
        const code = Number(lines[i]),
          value = lines[i + 1]!;
        const numeric =
          (code >= 10 && code <= 99) ||
          (code >= 210 && code <= 239) ||
          (code >= 270 && code <= 299);
        result.push({ code, value: numeric ? Number(value) : value });
      }
      return result;
    }
  }
  throw new Error(`Missing native record ${type}`);
}
it('independently decodes native curve group codes without using the HanCAD extension metadata', () => {
  const state = fixture();
  state.entities.push(
    entity({
      type: 'ARC',
      center: p(12, 34, 7),
      normal: p(0, 0, 1),
      xAxis: p(1, 0),
      radius: 5,
      startAngle: 0,
      sweepAngle: -Math.PI / 2,
    }),
  );
  const dxf = drawingToDxf(state);
  for (const type of ['POINT', 'XLINE', 'RAY', 'ELLIPSE', 'SPLINE', 'ARC']) {
    const decoded = geometryFromFields(type, decodeDxfFields(type, firstRecord(dxf, type)));
    expect(decoded.status, type).toBe('ok');
    if (decoded.status !== 'ok') throw new Error('Invalid native export');
    const source = state.entities.find((item) => item.curve?.type === type)!.curve!;
    for (const t of [0, 0.37, 1]) {
      const a = geometryEvaluation(source, t).point,
        b = geometryEvaluation(decoded.geometry, t).point;
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
      expect(b.z).toBeCloseTo(a.z, 9);
    }
  }
});
it('writes the native SOLID/TRACE vertex order from their canonical filled boundary', () => {
  for (const sourceType of ['SOLID', 'TRACE']) {
    const state = createEmptyCadState();
    state.entities = [
      {
        id: 'fill',
        type: 'polyline',
        layer: '0',
        color: '#ffffff',
        lineWidth: 1,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: -10 },
          { x: 0, y: -10 },
        ],
        closed: true,
        sourceType,
        drawFill: [
          [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: -10 },
            { x: 0, y: -10 },
          ],
        ],
      },
    ];
    const record = firstRecord(drawingToDxf(state), sourceType);
    const value = (code: number) => record.find((group) => group.code === code)?.value;
    expect([
      value(10),
      value(20),
      value(11),
      value(21),
      value(12),
      value(22),
      value(13),
      value(23),
    ]).toEqual([0, 0, 10, 0, 0, 10, 10, 10]);
  }
});
it('writes real native primitives and restores exact own-DXF geometry from owned extension records', async () => {
  const state = normalizeCadState(fixture()),
    dxf = drawingToDxf(state);
  for (const type of ['POINT', 'XLINE', 'RAY', 'ELLIPSE', 'SPLINE', 'POLYLINE', 'VERTEX', 'SEQEND'])
    expect(dxf).toContain(`\r\n0\r\n${type}\r\n`);
  expect(dxf).not.toContain('\r\nLWPOLYLINE\r\n');
  expect(dxf).toContain('HANCAD_DRAW');
  const result = await readCadFile(new File([dxf], 'curves.dxf'));
  expect(result.report).toMatchObject({ imported: 6, skipped: 0, approximated: 0 });
  expect(result.state.entities.map((item) => item.curve?.type)).toEqual(
    state.entities.map((item) => item.curve?.type),
  );
  for (let i = 0; i < state.entities.length; i++) {
    const expected = geometryEvaluation(state.entities[i]!.curve!, 0.37).point;
    const actual = geometryEvaluation(result.state.entities[i]!.curve!, 0.37).point;
    expect(actual.x).toBeCloseTo(expected.x, 10);
    expect(actual.y).toBeCloseTo(expected.y, 10);
    expect(actual.z).toBeCloseTo(expected.z, 10);
  }
});
it('transforms exact metadata through a real DXF block INSERT while keeping member identity', async () => {
  const state = createEmptyCadState();
  state.entities = [entity(spline, 'spline')];
  state.clipboardBlocks = [{ name: 'CURVES', basePoint: { x: 100, y: 0 }, entityIds: ['spline'] }];
  const source = drawingToDxf(state),
    changed = source.replace(/(100\r\nAcDbBlockReference\r\n2\r\nCURVES\r\n10\r\n)100/, '$1200');
  expect(changed).not.toBe(source);
  const result = await readCadFile(new File([changed], 'insert.dxf'));
  expect(result.state.clipboardBlocks?.[0]?.entityIds).toEqual([result.state.entities[0]!.id]);
  const actual = geometryEvaluation(result.state.entities[0]!.curve!, 0.5).point;
  expect(actual).toMatchObject({ x: 150, y: 50, z: 0 });
});
it('uses externally edited native geometry instead of resurrecting stale extension metadata', async () => {
  const state = fixture();
  state.entities = state.entities.filter((item) => item.curve?.type === 'ELLIPSE');
  const source = drawingToDxf(state),
    changed = source.replace('AcDbEllipse\r\n10\r\n50\r\n', 'AcDbEllipse\r\n10\r\n60\r\n');
  expect(changed).not.toBe(source);
  const read = await readCadFile(new File([changed], 'externally-edited.dxf'));
  const actual = read.state.entities[0];
  expect(actual?.curve).toBeUndefined();
  expect(read.report.warnings).toContain('외부에서 수정한 객체의 최신 DXF 형상을 사용합니다.');
  if (actual?.type !== 'polyline') throw new Error('Expected current native ellipse projection');
  expect(Math.min(...actual.points.map((point) => point.x))).toBeCloseTo(40, 8);
  expect(Math.max(...actual.points.map((point) => point.x))).toBeCloseTo(80, 8);
  const styled = source.replace(
    'AcDbEntity\r\n8\r\n0\r\n62\r\n7\r\n420\r\n16777215',
    'AcDbEntity\r\n8\r\n0\r\n62\r\n7\r\n420\r\n255',
  );
  const recolored = await readCadFile(new File([styled], 'recolored.dxf'));
  expect(recolored.state.entities[0]).toMatchObject({
    color: '#0000ff',
    curve: { type: 'ELLIPSE' },
  });
  const scaledStyle = source.replace(
    /(0\r\nELLIPSE\r\n[\s\S]*?100\r\nAcDbEntity\r\n)/,
    (match) => `${match}48\r\n2.5\r\n`,
  );
  expect(scaledStyle).not.toBe(source);
  const rescaled = await readCadFile(new File([scaledStyle], 'linetype-scale.dxf'));
  expect(rescaled.state.entities[0]).toMatchObject({
    linetypeScale: 2.5,
    curve: { type: 'ELLIPSE' },
  });
  expect(rescaled.report.warnings).not.toContain(
    '외부에서 수정한 객체의 최신 DXF 형상을 사용합니다.',
  );
});
it('retains taper, constant width, elevation and thickness in supported DXF round trips', async () => {
  const state = createEmptyCadState();
  state.entities = [
    {
      id: 'width',
      type: 'polyline',
      layer: '0',
      color: '#ffffff',
      lineWidth: 1,
      points: [
        { x: 0, y: 0, z: 7 },
        { x: 100, y: 0, z: 7 },
      ],
      closed: false,
      startWidths: [2, 0],
      endWidths: [8, 0],
      elevation: 7,
      thickness: 3,
    },
  ];
  const dxf = drawingToDxf(state);
  expect(dxf).toContain('38\r\n7\r\n');
  expect(dxf).toContain('39\r\n3\r\n');
  expect(dxf).toContain('40\r\n2\r\n41\r\n8\r\n');
  const read = await readCadFile(new File([dxf], 'widths.dxf'));
  expect(read.state.entities[0]).toMatchObject({
    startWidths: [2, 0],
    endWidths: [8, 0],
    elevation: 7,
    thickness: 3,
  });
  const bounds = drawingBounds(state);
  expect(bounds.minY).toBe(-4);
  expect(bounds.maxY).toBe(4);
  expect(drawingToSvg(state)).toContain('fill-rule="evenodd"');
});
it('retains zero-width segments alongside filled wide segments in vector and raster output', () => {
  const state = createEmptyCadState();
  state.entities = [
    {
      id: 'mixed',
      type: 'polyline',
      layer: '0',
      color: '#ffffff',
      lineWidth: 1,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      closed: false,
      startWidths: [0, 2, 0],
      endWidths: [0, 4, 0],
    },
  ];
  const svg = drawingToSvg(state);
  expect(svg).toContain('fill-rule="evenodd"');
  expect(svg).toContain('d="M0,0 L0.625,0');
  const points: number[][] = [];
  const context = {
    beginPath: () => {},
    moveTo: (x: number, y: number) => points.push([x, y]),
    lineTo: (x: number, y: number) => points.push([x, y]),
    stroke: () => {},
    closePath: () => {},
    fill: () => {},
  } as unknown as CanvasRenderingContext2D;
  drawingExportHooks.draw(context, state.entities[0]!, { scale: 1 });
  expect(points.some(([x, y]) => x === 0 && y === 0)).toBe(true);
  expect(points.some(([x, y]) => x === 10 && y === 0)).toBe(true);
});
it('exports the analytic ellipse and evaluated NURBS rather than their compatibility control polygons', () => {
  const state = fixture();
  state.entities = state.entities.filter(
    (item) => item.curve?.type === 'ELLIPSE' || item.curve?.type === 'SPLINE',
  );
  const svg = drawingToSvg(state);
  expect(svg).toContain('transform="matrix(20 0 0 -10 50 -40)"');
  expect(svg).not.toContain('points="0,0 100,-100"');
  const points: [number, number][] = [];
  const context = {
    beginPath: () => {},
    moveTo: (x: number, y: number) => points.push([x, y]),
    lineTo: (x: number, y: number) => points.push([x, y]),
    stroke: () => {},
  } as unknown as CanvasRenderingContext2D;
  expect(drawingExportHooks.draw(context, entity(spline), { scale: 10 })).toBe(true);
  expect(points.length).toBeGreaterThan(20);
  expect(Math.min(...points.map((point) => point[1]))).toBeCloseTo(-50, 8);
});
it('refuses unsupported native records without silently exporting their fallback outlines', () => {
  for (const sourceType of ['REGION', 'MLINE', 'WIPEOUT', 'HELIX']) {
    const state = createEmptyCadState();
    state.entities = [{ ...entity(spline), sourceType }];
    expect(() => drawingToDxf(state)).toThrow(/네이티브 DXF.*지원하지 않습니다/);
    expect(normalizeCadState(state).entities[0]!.sourceType).toBe(sourceType);
  }
});
