import { describe, expect, it } from 'vitest';
import {
  closestGeometryPoint,
  evaluateGeometry,
  geometryArea,
  geometryBounds,
  geometryEvaluation,
  geometryFromFields,
  geometryLength,
  helixBreakpoints,
  transformGeometry,
  type HelixGeometry,
} from './index';

const source = (extra: Partial<HelixGeometry> = {}): HelixGeometry => ({
  type: 'HELIX',
  center: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xAxis: { x: 1, y: 0, z: 0 },
  baseRadius: 2,
  topRadius: 6,
  turns: 2,
  height: 0,
  clockwise: false,
  startAngle: 0,
  ...extra,
});
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-9);
describe('analytic conical helix and planar spiral', () => {
  it('evaluates radius growth and winding independently of tessellation', () => {
    const curve = source();
    expect(evaluateGeometry(curve, 0)).toEqual({ x: 2, y: 0, z: 0 });
    const quarter = evaluateGeometry(curve, 0.125);
    near(quarter.x, 0);
    near(quarter.y, 2.5);
    const finish = evaluateGeometry(curve, 1);
    near(finish.x, 6);
    near(finish.y, 0);
    near(evaluateGeometry(source({ clockwise: true }), 0.125).y, -2.5);
  });
  it('evaluates analytic first derivatives and cylinder length to 1e-9', () => {
    const curve = source({ topRadius: 2, turns: 3, height: 7 });
    const derivative = geometryEvaluation(curve, 0).derivative;
    near(derivative.x, 0);
    near(derivative.y, 12 * Math.PI);
    near(derivative.z, 7);
    near(geometryLength(curve), Math.hypot(12 * Math.PI, 7));
    near(geometryArea(source({ baseRadius: 2, topRadius: 2, turns: 1 }))!, 4 * Math.PI);
    expect(geometryArea(curve)).toBeUndefined();
  });
  it('bounds every orientation and nonuniform affine transform conservatively', () => {
    const curve = source({
      center: { x: 200_000_000, y: 400_000_000, z: 25 },
      normal: { x: 0, y: 1, z: 0 },
      height: -10,
    });
    const bounds = geometryBounds(curve);
    for (let i = 0; i <= 128; i++) {
      const point = evaluateGeometry(curve, i / 128);
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(point[axis]).toBeGreaterThanOrEqual(bounds.min[axis]);
        expect(point[axis]).toBeLessThanOrEqual(bounds.max[axis]);
      }
    }
    const transformed = transformGeometry(source(), [2, 0, 0, 3, 0, -3, 0, 7, 0, 0, 1, 0]);
    const before = evaluateGeometry(source(), 0.2),
      after = evaluateGeometry(transformed, 0.2);
    near(after.x, before.x * 2 + 3);
    near(after.y, before.y * -3 + 7);
    expect(transformed.type).toBe('TRANSFORMED');
  });
  it('samples quarter-turn spans at 500 turns and finds the nearest winding', () => {
    const curve = source({ turns: 50 });
    expect(helixBreakpoints(source({ turns: 500 }))).toHaveLength(2001);
    const point = evaluateGeometry(curve, 0.173);
    const closest = closestGeometryPoint(curve, point);
    expect(closest.distance).toBeLessThan(1e-9);
  });
  it('parses and validates native fields instead of treating HELIX as unsupported', () => {
    const fields = { center: [0, 0, 0], baseRadius: 2, topRadius: 6, turns: 2, height: 0 };
    expect(geometryFromFields('HELIX', fields).status).toBe('ok');
    for (const invalid of [
      { turns: 501 },
      { turns: 0 },
      { baseRadius: 0, topRadius: 0 },
      { baseRadius: -1 },
      { xAxis: [0, 0, 1] },
    ])
      expect(geometryFromFields('HELIX', { ...fields, ...invalid }).status).toBe('invalid');
  });
});
