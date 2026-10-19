import { describe, expect, it } from 'vitest';
import {
  evaluateGeometry,
  geometryLength,
  type CurveGeometry,
  type PolylineGeometry,
} from '@hancad/geom';
import type { CadEntity } from '@hancad/legacy-bridge';
import { editCurveEntity } from './modify-curve-geometry';
import { overkillEntities, type OverkillOptions } from './modify-overkill';
import {
  mergeOverkillArcs,
  optimizeOverkillPolyline,
  subtractOverkillCurve,
} from './modify-overkill-geometry';

const options = (overrides: Partial<OverkillOptions> = {}): OverkillOptions => ({
  tolerance: 1e-8,
  ignore: new Set(),
  optimizePolylines: true,
  ignoreWidths: false,
  keepPolylines: true,
  partialOverlap: true,
  endToEnd: true,
  maintainAssociativity: true,
  ...overrides,
});
const point = (x: number, y = 0, z = 0) => ({ x, y, z });
const arc = (a: number, b: number): CurveGeometry => ({
  type: 'ARC',
  center: point(0),
  normal: point(0, 0, 1),
  xAxis: point(1),
  radius: 10,
  startAngle: (a * Math.PI) / 180,
  sweepAngle: ((b - a) * Math.PI) / 180,
});
const polyline = (points: number[], widths?: number[]): PolylineGeometry => ({
  type: 'LWPOLYLINE',
  closed: false,
  is3D: false,
  normal: point(0, 0, 1),
  constantWidth: 0,
  vertices: points.map((x, i) => ({
    position: point(x),
    bulge: 0,
    startWidth: widths?.[i] ?? 0,
    endWidth: widths?.[i + 1] ?? 0,
  })),
});
const entity = (id: string, curve: CurveGeometry): CadEntity =>
  editCurveEntity(
    {
      id,
      type: 'line',
      layer: '0',
      color: '#ffffff',
      lineWidth: 1,
      a: { x: 0, y: 0 },
      b: { x: 1, y: 0 },
    },
    curve,
  );
describe('OVERKILL circular and polyline cleanup', () => {
  it('merges arcs through the 360-degree seam and respects combine flags', () => {
    const a = arc(300, 380),
      b = arc(-10, 70),
      merged = mergeOverkillArcs(a, b, options());
    expect(merged?.type).toBe('ARC');
    expect(geometryLength(merged!)).toBeCloseTo((10 * 130 * Math.PI) / 180);
    expect(mergeOverkillArcs(a, b, options({ partialOverlap: false }))).toBeUndefined();
    expect(
      mergeOverkillArcs(arc(0, 90), arc(90, 180), options({ endToEnd: false })),
    ).toBeUndefined();
    const circle = mergeOverkillArcs(arc(0, 200), arc(180, 360), options());
    expect(circle?.type).toBe('CIRCLE');
  });
  it('never discards an arc drawn in another plane merely because the centers and radii match', () => {
    const first = entity('circle', {
      type: 'CIRCLE',
      center: point(0),
      normal: point(0, 0, 1),
      xAxis: point(1),
      radius: 10,
    });
    const other = arc(0, 90);
    if (other.type !== 'ARC') throw new Error('Expected arc');
    other.normal = point(0, 1);
    other.xAxis = point(1);
    expect(overkillEntities([first, entity('arc', other)], options())).toHaveLength(2);
  });
  it('optimizes zero and collinear segments while preserving polyline identity by default', () => {
    const source = polyline([0, 0, 2, 5, 10]);
    const result = optimizeOverkillPolyline(source, options());
    expect(result?.vertices.map((v) => v.position.x)).toEqual([0, 10]);
    const entities = overkillEntities([entity('poly', source)], options());
    expect(entities).toHaveLength(1);
    expect(entities[0]?.id).toBe('poly');
    expect(entities[0]?.curve?.type).toBe('LWPOLYLINE');
  });
  it('does not erase a significant width kink unless segment widths are ignored', () => {
    const source = polyline([0, 5, 10], [0, 2, 10]);
    expect(optimizeOverkillPolyline(source, options())?.vertices).toHaveLength(3);
    const ignored = optimizeOverkillPolyline(source, options({ ignoreWidths: true }));
    expect(ignored?.vertices).toHaveLength(2);
    expect(ignored?.vertices[0]).toMatchObject({ startWidth: 0, endWidth: 10 });
  });
  it('removes coincident straight intervals while retaining both free extensions', () => {
    const source: CurveGeometry = { type: 'LINE', start: point(-5), end: point(15) },
      cover: CurveGeometry = { type: 'LINE', start: point(0), end: point(10) };
    const pieces = subtractOverkillCurve(source, cover, 1e-8);
    expect(pieces).toHaveLength(2);
    expect(pieces.map(geometryLength)).toEqual([5, 5]);
    const cleaned = overkillEntities(
      [entity('line', source), entity('poly', polyline([0, 10]))],
      options(),
    );
    expect(cleaned).toHaveLength(3);
    expect(cleaned.filter((e) => e.type === 'line').map((e) => geometryLength(e.curve!))).toEqual([
      5, 5,
    ]);
  });
  it('subtracts only circular overlap, including clockwise arcs and seam intervals', () => {
    const pieces = subtractOverkillCurve(arc(300, 420), arc(-10, 10), 1e-8);
    expect(pieces).toHaveLength(2);
    expect(pieces.reduce((sum, c) => sum + geometryLength(c), 0)).toBeCloseTo(
      (10 * 100 * Math.PI) / 180,
    );
    const clockwise = subtractOverkillCurve(arc(180, 0), arc(50, 100), 1e-8);
    expect(clockwise).toHaveLength(2);
    expect(clockwise.every((c) => c.type === 'ARC' && c.sweepAngle < 0)).toBe(true);
    expect(evaluateGeometry(clockwise[0]!, 1).x).toBeCloseTo(10, 8);
  });
  it('honors width eligibility when comparing polylines with overlapping independent lines', () => {
    const poly = polyline([0, 10]);
    poly.constantWidth = 3;
    const line: CurveGeometry = { type: 'LINE', start: point(0), end: point(10) };
    expect(overkillEntities([entity('line', line), entity('poly', poly)], options())).toHaveLength(
      2,
    );
    expect(
      overkillEntities(
        [entity('line', line), entity('poly', poly)],
        options({ ignoreWidths: true }),
      ),
    ).toHaveLength(1);
  });
  it('Break allowed removes retraced duplicate segments and never forces a break without redundancy', () => {
    expect(
      overkillEntities([entity('poly', polyline([0, 10, 0]))], options({ keepPolylines: false })),
    ).toHaveLength(1);
    const result = overkillEntities(
      [entity('poly', polyline([0, 5, 10]))],
      options({ keepPolylines: false }),
    );
    expect(result[0]?.curve?.type).toBe('LWPOLYLINE');
  });
});
