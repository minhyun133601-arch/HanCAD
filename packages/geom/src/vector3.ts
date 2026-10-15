import { GeometryError } from './curve-types';
import type { Affine3, Bounds3, Vec3 } from './curve-types';

export const worldNormal: Readonly<Vec3> = Object.freeze({ x: 0, y: 0, z: 1 });
export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const subtract3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const magnitude3 = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
export const distance3 = (a: Vec3, b: Vec3): number => magnitude3(subtract3(a, b));
export const interpolate3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  add3(a, scale3(subtract3(b, a), t));
export function normalize3(v: Vec3): Vec3 {
  const length = magnitude3(v);
  if (!Number.isFinite(length) || length === 0) throw new GeometryError('invalid-direction');
  return scale3(v, 1 / length);
}
/** Autodesk's arbitrary-axis algorithm; arguments and output use WCS vectors. */
export function objectAxes(normal: Vec3): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = normalize3(normal);
  const reference =
    Math.abs(z.x) < 1 / 64 && Math.abs(z.y) < 1 / 64 ? { x: 0, y: 1, z: 0 } : worldNormal;
  const x = normalize3(cross3(reference, z));
  return { x, y: cross3(z, x), z };
}
export function fromObjectCoordinates(point: Vec3, normal: Vec3): Vec3 {
  const axes = objectAxes(normal);
  return add3(add3(scale3(axes.x, point.x), scale3(axes.y, point.y)), scale3(axes.z, point.z));
}
export function bounds3(points: readonly Vec3[]): Bounds3 | undefined {
  if (!points.length) return undefined;
  const min = { x: Infinity, y: Infinity, z: Infinity },
    max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points)
    for (const axis of ['x', 'y', 'z'] as const) {
      min[axis] = Math.min(min[axis], p[axis]);
      max[axis] = Math.max(max[axis], p[axis]);
    }
  return { min, max };
}
export function transformVector3(matrix: Affine3, p: Vec3): Vec3 {
  return {
    x: matrix[0] * p.x + matrix[1] * p.y + matrix[2] * p.z,
    y: matrix[4] * p.x + matrix[5] * p.y + matrix[6] * p.z,
    z: matrix[8] * p.x + matrix[9] * p.y + matrix[10] * p.z,
  };
}
export function transformPoint3(matrix: Affine3, p: Vec3): Vec3 {
  return add3(transformVector3(matrix, p), { x: matrix[3], y: matrix[7], z: matrix[11] });
}
export function assertAffine(matrix: Affine3): void {
  if (matrix.length !== 12 || matrix.some((value) => !Number.isFinite(value)))
    throw new GeometryError('invalid-transform');
  const determinant =
    matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) -
    matrix[1] * (matrix[4] * matrix[10] - matrix[6] * matrix[8]) +
    matrix[2] * (matrix[4] * matrix[9] - matrix[5] * matrix[8]);
  if (!Number.isFinite(determinant) || determinant === 0)
    throw new GeometryError('singular-transform');
}
export function multiplyAffine3(a: Affine3, b: Affine3): Affine3 {
  const values = Array.from({ length: 12 }, (_, index) => {
    const row = Math.floor(index / 4) * 4,
      col = index % 4;
    return (
      a[row]! * b[col]! +
      a[row + 1]! * b[col + 4]! +
      a[row + 2]! * b[col + 8]! +
      (col === 3 ? a[row + 3]! : 0)
    );
  });
  return values as unknown as Affine3;
}
export const clampUnit = (t: number): number => {
  if (!Number.isFinite(t)) throw new GeometryError('invalid-parameter');
  return Math.max(0, Math.min(1, t));
};
export const normalizedAngle = (angle: number): number =>
  ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
export function positiveSweep(start: number, end: number): number {
  return Math.abs(end - start) >= 2 * Math.PI - 1e-12 ? 2 * Math.PI : normalizedAngle(end - start);
}
