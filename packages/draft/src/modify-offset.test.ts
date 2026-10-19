import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  evaluateGeometry,
  closestGeometryPoint,
  geometryEvaluation,
  loadGeometryWasm,
  type EllipseGeometry,
} from '@hancad/geom';
import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { draftLine, draftPolyline } from './entities';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { offsetProgram } from './modify-offset';
import { offsetModifyEntity, offsetSpline } from './modify-offset-curves';
import { offsetPolylineKernel } from './modify-offset-polyline';
import { splineFromPoints } from './draw-spline';

beforeAll(async () => {
  await loadGeometryWasm(
    await readFile(new URL('../../geom/wasm/geometry_wasm_bg.wasm', import.meta.url)),
  );
});
const p = (x: number, y: number): CadPoint => ({ x, y });
const close = (a: number, b: number, t = 1e-8) => expect(Math.abs(a - b)).toBeLessThanOrEqual(t);
function rectangle(): CadPolyline {
  const entity = draftPolyline(
    outlineContext().settings,
    [p(0, 0), p(10, 0), p(10, 10), p(0, 10)],
    true,
  );
  if (entity.type !== 'polyline' && entity.type !== 'rect') throw new Error('Expected polyline');
  return entity;
}
const offset = (e: CadEntity, point: CadPoint, distance = 2, gapType = 0) =>
  offsetModifyEntity(e, { point, distance, gapType, id: 'new' });
describe('Phase 07 OFFSET geometry and coroutine', () => {
  it.each([0, 1, 2])(
    'offsets outward corners with OFFSETGAPTYPE %i through the actual WASM kernel',
    (gap) => {
      const result = offsetPolylineKernel(rectangle(), p(5, -3), 2, gap, 'new')[0]!;
      expect(result.closed).toBe(true);
      expect(result.points).toHaveLength(gap === 0 ? 4 : 8);
      const bulges = result.bulges!.filter((v) => Math.abs(v) > 1e-8);
      expect(bulges).toHaveLength(gap === 1 ? 4 : 0);
      if (gap === 0) {
        expect(new Set(result.points.map((v) => v.x))).toEqual(new Set([-2, 12]));
        expect(new Set(result.points.map((v) => v.y))).toEqual(new Set([-2, 12]));
      }
      if (gap === 1) bulges.forEach((b) => close(Math.abs(b), Math.tan(Math.PI / 8)));
    },
  );
  it('preserves arc segments, splits >180 degree bulges and maintains survey precision', () => {
    const poly = rectangle();
    poly.bulges = [0.2, 0, 0, 0];
    poly.startWidths = [0, 0, 0, 0];
    poly.endWidths = [0, 0, 0, 0];
    for (const gap of [0, 1, 2]) {
      const result = offsetPolylineKernel(poly, p(5, -8), 2, gap, 'new')[0]!;
      expect(result.bulges!.some((b) => Math.abs(b) > 0.01)).toBe(true);
      expect(result.points.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y))).toBe(true);
      expect(result.startWidths).toHaveLength(result.points.length);
      expect(result.endWidths).toHaveLength(result.points.length);
    }
    const major = draftPolyline(outlineContext().settings, [p(0, 0), p(10, 0)], false);
    if (major.type !== 'polyline' && major.type !== 'rect') throw new Error('Expected polyline');
    major.bulges = [2, 0];
    const split = offsetPolylineKernel(major, p(5, -12), 1, 1, 'split')[0]!;
    expect(split.bulges!.every((b) => Math.abs(b) <= 1)).toBe(true);
    const source = rectangle(),
      translated = {
        ...source,
        points: source.points.map((v) => p(v.x + 200000000, v.y - 200000000)),
      };
    const local = offsetPolylineKernel(source, p(5, -3), 2, 0, 'a')[0]!,
      large = offsetPolylineKernel(translated, p(200000005, -200000003), 2, 0, 'b')[0]!;
    local.points.forEach((v, i) => {
      close(large.points[i]!.x - 200000000, v.x);
      close(large.points[i]!.y + 200000000, v.y);
    });
  });
  it('handles concave topology and returns no geometry on collapsed inward offsets', () => {
    const concave = draftPolyline(
      outlineContext().settings,
      [p(0, 0), p(20, 0), p(20, 6), p(8, 6), p(8, 20), p(0, 20)],
      true,
    );
    if (concave.type !== 'polyline' && concave.type !== 'rect')
      throw new Error('Expected polyline');
    expect(offsetPolylineKernel(concave, p(-2, 5), 2, 0, 'out').length).toBeGreaterThan(0);
    expect(offsetPolylineKernel(rectangle(), p(5, 1), 6, 1, 'in')).toEqual([]);
  });
  it('retains nonzero 2D elevation in every kernel gap result and exact LINE offset', () => {
    const poly = { ...rectangle(), elevation: 7 };
    poly.points = poly.points.map((point) => ({ ...point, z: 7 }));
    poly.bulges = [0.2, 0, 0, 0];
    for (const gap of [0, 1, 2]) {
      const result = offsetPolylineKernel(poly, p(5, -8), 2, gap, 'elevated')[0]!;
      expect(result.elevation).toBe(7);
      expect(result.points.every((point) => point.z === 7)).toBe(true);
      const curve = result.curve;
      if (curve?.type !== 'LWPOLYLINE') throw new Error('Expected exact polyline');
      expect(curve.vertices.every((vertex) => vertex.position.z === 7)).toBe(true);
    }
    const line = draftLine(outlineContext().settings, { x: 0, y: 0, z: 7 }, { x: 10, y: 0, z: 7 });
    line.curve = { type: 'LINE', start: { x: 0, y: 0, z: 7 }, end: { x: 10, y: 0, z: 7 } };
    expect(offset(line, p(5, -4))[0]).toMatchObject({
      a: { z: 7 },
      b: { z: 7 },
      curve: { start: { z: 7 }, end: { z: 7 } },
    });
  });
  it('updates exact circle/arc/line and construction-line sources rather than only display outlines', () => {
    const context = outlineContext(),
      line = draftLine(context.settings, p(0, 0), p(10, 0));
    line.curve = { type: 'LINE', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } };
    expect(offset(line, p(5, -4))[0]!.curve).toEqual({
      type: 'LINE',
      start: { x: 0, y: 2, z: 0 },
      end: { x: 10, y: 2, z: 0 },
    });
    const circle: CadEntity = {
      ...line,
      type: 'circle',
      center: p(0, 0),
      radius: 5,
      curve: {
        type: 'CIRCLE',
        center: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        xAxis: { x: 1, y: 0, z: 0 },
        radius: 5,
      },
    };
    expect(offset(circle, p(20, 0))[0]!.curve).toMatchObject({ radius: 7 });
    for (const type of ['XLINE', 'RAY'] as const) {
      const e: CadEntity = {
        ...rectangle(),
        closed: false,
        curve: { type, basePoint: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      };
      expect(offset(e, p(5, -9), -1)[0]!.curve).toMatchObject({
        type,
        basePoint: { x: 0, y: 9, z: 0 },
      });
    }
  });
  it('creates a genuine cubic SPLINE for ellipse and NURBS parallels within explicit residual tolerance', () => {
    const ellipse: EllipseGeometry = {
      type: 'ELLIPSE',
      center: { x: 0, y: 0, z: 0 },
      majorAxis: { x: 20, y: 0, z: 0 },
      minorAxis: { x: 0, y: 10, z: 0 },
      startParameter: 0,
      sweepParameter: 2 * Math.PI,
    };
    const source = splineFromPoints([p(0, 0), p(10, -5), p(20, -3), p(30, -10)], true, 3, 0);
    for (const curve of [ellipse, source]) {
      const result = offsetSpline(curve, p(40, 0), 2);
      expect(result.degree).toBe(3);
      expect(result.fitTolerance).toBe(1e-6);
      for (let i = 0; i <= 80; i++) {
        const t = i / 80,
          original = geometryEvaluation(curve, t),
          shifted = evaluateGeometry(result, t);
        close(Math.hypot(shifted.x - original.point.x, shifted.y - original.point.y), 2, 2e-6);
      }
    }
  });
  it('keeps Through, Layer, Erase, Multiple and Undo provisional until one result', () => {
    const context = outlineContext({ OFFSETDIST: -1, OFFSETGAPTYPE: 0, COMMANDPREVIEW: 1 }),
      line = draftLine(context.settings, p(0, 0), p(10, 0));
    context.entities = [line];
    context.settings.layer = 'Current';
    const result = outlineRun(
      offsetProgram,
      [
        'L',
        'C',
        'E',
        'Y',
        'T',
        { entity: line, point: p(5, 0) },
        'M',
        p(5, 4),
        p(5, 8),
        'U',
        '',
        '',
      ],
      context,
    );
    expect(result.eraseIds).toEqual([line.id]);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({
      type: 'line',
      layer: 'Current',
      a: p(0, 4),
      b: p(10, 4),
    });
    expect(context.get('OFFSETDIST')).toBe(-1);
    expect(context.entities).toEqual([line]);
  });
  it('provides moving previews and respects COMMANDPREVIEW without changing accepted output', () => {
    const context = outlineContext({ OFFSETDIST: 2, COMMANDPREVIEW: 1 }),
      line = draftLine(context.settings, p(0, 0), p(10, 0));
    context.entities = [line];
    const program = offsetProgram(context);
    program.next();
    program.next('');
    const state = program.next({ entity: line, point: p(5, 0) });
    if (state.done) throw new Error('Expected offset side prompt');
    expect(state.value.preview?.(p(4, 6))[0]).toMatchObject({ type: 'line', a: p(0, 2) });
    context.set('COMMANDPREVIEW', 0);
    expect(state.value.preview?.(p(4, 6))).toEqual([]);
  });
  it('trims inward ellipse cusp loops into regular spline pieces instead of refusing the whole offset', () => {
    const source: CadEntity = {
      ...rectangle(),
      curve: {
        type: 'ELLIPSE',
        center: { x: 0, y: 0, z: 0 },
        majorAxis: { x: 20, y: 0, z: 0 },
        minorAxis: { x: 0, y: 10, z: 0 },
        startParameter: 0,
        sweepParameter: 2 * Math.PI,
      },
    };
    const results = offset(source, p(0, 0), 6);
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      const curve = result.curve;
      if (curve?.type !== 'SPLINE' || !source.curve) throw new Error('Expected spline');
      for (let i = 0; i <= 40; i++) {
        const sample = evaluateGeometry(curve, i / 40);
        expect(Math.abs(sample.x)).toBeLessThan(14.01);
        expect(Math.abs(sample.y)).toBeLessThan(4.01);
        expect(closestGeometryPoint(source.curve, sample).distance).toBeGreaterThanOrEqual(
          6 - 2e-6,
        );
      }
    }
  });
});
