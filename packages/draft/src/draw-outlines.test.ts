import { describe, expect, it } from 'vitest';
import type { CadPolyline } from '@hancad/legacy-bridge';
import { drawDonut, drawPolygon } from './draw-outlines';
import { drawRectang } from './draw-rect';
import { outlineContext, outlineOnly, outlineRun } from './draw-outline-fixtures';

const origin = { x: 0, y: 0 };
function area(polyline: CadPolyline): number {
  let result = 0;
  for (let i = 0; i < polyline.points.length; i++) {
    const a = polyline.points[i]!,
      b = polyline.points[(i + 1) % polyline.points.length]!;
    result += (a.x * b.y - a.y * b.x) / 2;
    const bulge = polyline.bulges?.[i] ?? 0;
    if (bulge) {
      const theta = 4 * Math.atan(bulge),
        chord = Math.hypot(b.x - a.x, b.y - a.y);
      const radius = chord / (2 * Math.sin(Math.abs(theta) / 2));
      result += (radius * radius * (theta - Math.sin(theta))) / 2;
    }
  }
  return Math.abs(result);
}
describe('RECTANG headless parity scripts', () => {
  it('creates exact fillet bulges and remembers the radius for the next command', () => {
    const context = outlineContext();
    const first = outlineOnly(drawRectang, ['F', '5', origin, { x: 100, y: -50 }], context);
    const second = outlineOnly(drawRectang, [origin, { x: 100, y: -50 }], context);
    expect(first.points).toHaveLength(8);
    expect(first.points[0]).toEqual({ x: 5, y: 0 });
    expect(first.bulges).toEqual(second.bulges);
    for (const index of [1, 3, 5, 7])
      expect(first.bulges?.[index]).toBeCloseTo(-Math.tan(Math.PI / 8), 12);
    expect(area(first)).toBeCloseTo(5000 - (4 - Math.PI) * 25, 9);
  });
  it('creates chamfered corners with remembered elevation, thickness and width', () => {
    const context = outlineContext();
    const entity = outlineOnly(
      drawRectang,
      ['C', '3', '4', 'E', '12', 'T', '-2', 'W', '1.5', origin, { x: 100, y: -50 }],
      context,
    );
    expect(entity.points).toHaveLength(8);
    expect(entity.points[0]).toEqual({ x: 3, y: 0, z: 12 });
    expect(entity.points[2]).toEqual({ x: 100, y: -4, z: 12 });
    expect(area(entity)).toBeCloseTo(5000 - 24, 9);
    expect(entity.constantWidth).toBe(1.5);
    expect(entity.elevation).toBe(12);
    expect(entity.thickness).toBe(-2);
    expect(context.get('ELEVATION')).toBe(12);
    expect(context.get('THICKNESS')).toBe(-2);
  });
  it('calculates requested actual Area with fillets or chamfers and either known dimension', () => {
    const fillet = outlineOnly(drawRectang, ['F', '5', origin, 'A', '1000', 'L', '50']);
    expect(area(fillet)).toBeCloseTo(1000, 9);
    const chamfer = outlineOnly(drawRectang, ['C', '3', '4', origin, 'A', '1000', 'W', '20']);
    expect(area(chamfer)).toBeCloseTo(1000, 9);
    for (const [prefix, target, dimension, known] of [
      [['F', '5'], 10, 'L', '1'],
      [['F', '5'], 10, 'L', '20'],
      [['C', '3', '4'], 20, 'W', '2'],
      [['C', '3', '4'], 1, 'L', '20'],
    ] as const) {
      const undersized = outlineOnly(drawRectang, [
        ...prefix,
        origin,
        'A',
        String(target),
        dimension,
        known,
      ]);
      expect(undersized.points).toHaveLength(4);
      expect(area(undersized)).toBeCloseTo(target, 9);
    }
  });
  it('orients Dimensions by the chosen quadrant and applies remembered rotation', () => {
    const context = outlineContext();
    const entity = outlineOnly(
      drawRectang,
      [origin, 'R', '90', 'D', '40', '20', { x: 1, y: -1 }],
      context,
    );
    expect(entity.points[1]?.x).toBeCloseTo(0, 11);
    expect(entity.points[1]?.y).toBeCloseTo(-40, 11);
    expect(entity.points[2]?.x).toBeCloseTo(20, 11);
    expect(entity.points[2]?.y).toBeCloseTo(-40, 11);
    const repeated = outlineOnly(drawRectang, [origin, { x: 20, y: -40 }], context);
    expect(repeated.points[2]?.x).toBeCloseTo(20, 11);
    expect(repeated.points[2]?.y).toBeCloseTo(-40, 11);
  });
  it('supports two-point Rotation and generates preview without committing geometry', () => {
    const context = outlineContext();
    const rotated = outlineOnly(
      drawRectang,
      [origin, 'R', 'P', origin, { x: 10, y: -10 }, { x: 10, y: -10 }],
      context,
    );
    expect(rotated.points[2]?.x).toBeCloseTo(10, 12);
    expect(rotated.points[2]?.y).toBeCloseTo(-10, 12);
    const program = drawRectang(context);
    program.next();
    const state = program.next(origin);
    if (state.done) throw new Error('Expected rectangle preview request');
    expect(state.value.preview?.({ x: 20, y: -10 })).toHaveLength(1);
    expect(state.value.partial).toBeUndefined();
  });
});

describe('POLYGON headless parity scripts', () => {
  it('creates inscribed and circumscribed polygons at exact radii and remembers mode', () => {
    const context = outlineContext();
    const inscribed = outlineOnly(drawPolygon, ['4', origin, 'I', '10'], context);
    for (const point of inscribed.points) expect(Math.hypot(point.x, point.y)).toBeCloseTo(10, 12);
    expect(inscribed.points[0]?.y).toBeCloseTo(inscribed.points[1]?.y ?? NaN, 12);
    const circum = outlineOnly(drawPolygon, ['', origin, 'C', '10'], context);
    expect(area(circum)).toBeCloseTo(400, 9);
    const repeated = outlineOnly(drawPolygon, ['', origin, '', '10'], context);
    expect(area(repeated)).toBeCloseTo(400, 9);
  });
  it('uses cursor direction to orient the selected vertex or side midpoint', () => {
    const inside = outlineOnly(drawPolygon, ['4', origin, 'I', { x: 10, y: 0 }]);
    expect(inside.points[0]).toEqual({ x: 10, y: 0 });
    const outside = outlineOnly(drawPolygon, ['4', origin, 'C', { x: 10, y: 0 }]);
    expect(outside.points[0]?.x).toBeCloseTo(10, 11);
    expect(outside.points[0]?.y).toBeCloseTo(10, 11);
    expect(outside.points[1]?.x).toBeCloseTo(10, 11);
    expect(outside.points[1]?.y).toBeCloseTo(-10, 11);
  });
  it('constructs the first Edge endpoints exactly with the interior to the left in WCS', () => {
    const entity = outlineOnly(drawPolygon, ['3', 'E', origin, { x: 10, y: 0 }]);
    expect(entity.points[0]?.x).toBeCloseTo(0, 12);
    expect(entity.points[0]?.y).toBeCloseTo(0, 12);
    expect(entity.points[1]?.x).toBeCloseTo(10, 12);
    expect(entity.points[1]?.y).toBeCloseTo(0, 12);
    expect(entity.points[2]?.x).toBeCloseTo(5, 12);
    expect(entity.points[2]?.y).toBeCloseTo(-5 * Math.sqrt(3), 12);
  });
  it('rejects noninteger/out-of-range sides and aligns numeric radii with SNAPANG', () => {
    const entity = outlineOnly(
      drawPolygon,
      ['2', '1025', '3.2', '4', origin, 'I', '10'],
      outlineContext({ SNAPANG: Math.PI / 2 }),
    );
    expect(entity.points).toHaveLength(4);
    expect(entity.points[0]?.x).toBeCloseTo(entity.points[1]?.x ?? NaN, 11);
  });
});

describe('DONUT headless parity scripts', () => {
  it('creates an annulus as two exact semicircles with the correct centerline and width', () => {
    const context = outlineContext();
    const entity = outlineOnly(drawDonut, ['10', '20', { x: 30, y: -40 }, ''], context);
    expect(entity.points).toEqual([
      { x: 37.5, y: -40 },
      { x: 22.5, y: -40 },
    ]);
    expect(entity.bulges).toEqual([-1, -1]);
    expect(entity.constantWidth).toBe(5);
    expect(context.get('DONUTID')).toBe(10);
    expect(context.get('DONUTOD')).toBe(20);
  });
  it('swaps inverted diameters, supports solid circles and retains repeated placements', () => {
    const context = outlineContext();
    const swapped = outlineOnly(drawDonut, ['20', '10', origin, ''], context);
    expect(swapped.constantWidth).toBe(5);
    const filled = outlineRun(drawDonut, ['0', '20', origin, { x: 100, y: 0 }, ''], context);
    expect(filled.entities).toHaveLength(2);
    expect(filled.entities[0]).toMatchObject({ constantWidth: 10, bulges: [-1, -1] });
    expect(filled.entities[0]?.id).not.toBe(filled.entities[1]?.id);
    const program = drawDonut(context);
    program.next();
    program.next('');
    program.next('');
    const state = program.next(origin);
    if (state.done) throw new Error('Expected repeated donut prompt');
    expect(state.value.partial).toHaveLength(1);
    expect(state.value.preview?.({ x: 50, y: 50 })).toHaveLength(2);
  });
});
