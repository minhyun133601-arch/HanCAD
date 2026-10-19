import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { distance, entityDirection, unit } from './draw-curve-helpers';

export type TangentReference = { entity: CadEntity; point: CadPoint };
type Line = { type: 'line'; normal: CadPoint; offset: number };
type Circle = { type: 'circle'; center: CadPoint; radius: number };
type Locus = Line | Circle;
export interface TangentCircle {
  center: CadPoint;
  radius: number;
}
function referenceLocus(reference: TangentReference): Locus | undefined {
  const entity = reference.entity;
  const line = entityDirection(entity);
  if (line) {
    const normal = { x: -line.direction.y, y: line.direction.x };
    return { type: 'line', normal, offset: dot(normal, line.base) };
  }
  if (entity.type === 'circle' || entity.type === 'arc')
    return { type: 'circle', center: entity.center, radius: entity.radius };
  return undefined;
}
const dot = (a: CadPoint, b: CadPoint): number => a.x * b.x + a.y * b.y;
function intersect(a: Locus, b: Locus): CadPoint[] {
  if (a.type === 'line' && b.type === 'line') {
    const det = a.normal.x * b.normal.y - a.normal.y * b.normal.x;
    return Math.abs(det) < 1e-14
      ? []
      : [
          {
            x: (a.offset * b.normal.y - b.offset * a.normal.y) / det,
            y: (a.normal.x * b.offset - b.normal.x * a.offset) / det,
          },
        ];
  }
  if (a.type === 'circle' && b.type === 'line') return intersect(b, a);
  if (a.type === 'line' && b.type === 'circle') {
    const signed = dot(a.normal, b.center) - a.offset;
    const height2 = b.radius * b.radius - signed * signed;
    if (height2 < -1e-10) return [];
    const foot = { x: b.center.x - signed * a.normal.x, y: b.center.y - signed * a.normal.y },
      height = Math.sqrt(Math.max(0, height2));
    return [-1, 1].map((s) => ({
      x: foot.x - s * height * a.normal.y,
      y: foot.y + s * height * a.normal.x,
    }));
  }
  if (a.type !== 'circle' || b.type !== 'circle') return [];
  const delta = { x: b.center.x - a.center.x, y: b.center.y - a.center.y },
    d = Math.hypot(delta.x, delta.y);
  if (!d || d > a.radius + b.radius + 1e-10 || d < Math.abs(a.radius - b.radius) - 1e-10) return [];
  const along = (a.radius * a.radius - b.radius * b.radius + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, a.radius * a.radius - along * along));
  const foot = { x: a.center.x + (along * delta.x) / d, y: a.center.y + (along * delta.y) / d };
  return [-1, 1].map((s) => ({
    x: foot.x - (s * height * delta.y) / d,
    y: foot.y + (s * height * delta.x) / d,
  }));
}
function tangentScore(circle: TangentCircle, references: readonly TangentReference[]): number {
  return references.reduce((sum, reference) => {
    const locus = referenceLocus(reference);
    if (!locus) return Infinity;
    if (locus.type === 'line') {
      const signed = dot(locus.normal, circle.center) - locus.offset;
      return (
        sum +
        distance(reference.point, {
          x: circle.center.x - signed * locus.normal.x,
          y: circle.center.y - signed * locus.normal.y,
        })
      );
    }
    const direction = unit({
      x: circle.center.x - locus.center.x,
      y: circle.center.y - locus.center.y,
    });
    if (!direction) return Infinity;
    const candidates = [-1, 1].map((s) => ({
      x: locus.center.x + s * direction.x * locus.radius,
      y: locus.center.y + s * direction.y * locus.radius,
    }));
    return (
      sum +
      Math.min(
        ...candidates
          .filter(
            (p) =>
              Math.abs(distance(p, circle.center) - circle.radius) <
              1e-7 * Math.max(1, circle.radius),
          )
          .map((p) => distance(p, reference.point)),
      )
    );
  }, 0);
}
export function circleTtr(
  a: TangentReference,
  b: TangentReference,
  radius: number,
): TangentCircle | undefined {
  if (!(radius > 0)) return undefined;
  const refs = [a, b],
    loci = refs.map(referenceLocus);
  if (!loci[0] || !loci[1]) return undefined;
  const offsets = (locus: Locus): Locus[] =>
    locus.type === 'line'
      ? [-1, 1].map((s) => ({ ...locus, offset: locus.offset + s * radius }))
      : [locus.radius + radius, Math.abs(locus.radius - radius)]
          .filter((r) => r > 0)
          .map((r) => ({ ...locus, radius: r }));
  return offsets(loci[0])
    .flatMap((x) => offsets(loci[1]!).flatMap((y) => intersect(x, y)))
    .map((center) => ({ center, radius }))
    .sort((x, y) => tangentScore(x, refs) - tangentScore(y, refs))[0];
}
type Row = [number, number, number, number];
function roots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-14) return Math.abs(b) < 1e-14 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-10) return [];
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(Math.max(0, discriminant)));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
}
/** Intersect two planes in (center.x, center.y, radius) and a circle tangency cone. */
function solveCone(rows: Row[], circle: Circle, sign: number): TangentCircle[] {
  const first = rows[0]!,
    second = rows[1]!;
  let best: [number, number, number] = [0, 1, 2],
    maximum = 0;
  for (const [i, j, k] of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 2, 0],
  ] as const) {
    const det = first[i] * second[j] - first[j] * second[i];
    if (Math.abs(det) > Math.abs(maximum)) {
      maximum = det;
      best = [i, j, k];
    }
  }
  if (Math.abs(maximum) < 1e-14) return [];
  const [i, j, k] = best,
    origin = [0, 0, 0],
    vector = [0, 0, 0];
  origin[i] = (first[3] * second[j]! - first[j]! * second[3]) / maximum;
  origin[j] = (first[i]! * second[3] - first[3] * second[i]!) / maximum;
  vector[k] = 1;
  vector[i] = (-first[k]! * second[j]! + first[j]! * second[k]!) / maximum;
  vector[j] = (-first[i]! * second[k]! + first[k]! * second[i]!) / maximum;
  const x = origin[0]! - circle.center.x,
    y = origin[1]! - circle.center.y,
    r = origin[2]! + sign * circle.radius;
  const solutions = roots(
    vector[0]! ** 2 + vector[1]! ** 2 - vector[2]! ** 2,
    2 * (x * vector[0]! + y * vector[1]! - r * vector[2]!),
    x * x + y * y - r * r,
  );
  return solutions
    .map((t) => ({
      center: { x: origin[0]! + t * vector[0]!, y: origin[1]! + t * vector[1]! },
      radius: origin[2]! + t * vector[2]!,
    }))
    .filter((candidate) => candidate.radius > 1e-12);
}
export function circleTtt(references: readonly TangentReference[]): TangentCircle | undefined {
  const loci = references.map(referenceLocus);
  if (loci.length !== 3 || loci.some((locus) => !locus)) return undefined;
  const complete = loci as Locus[],
    candidates: TangentCircle[] = [];
  for (let mask = 0; mask < 8; mask++) {
    const signs = complete.map((_, i) => (mask & (1 << i) ? 1 : -1));
    const circleIndex = complete.findIndex((locus) => locus.type === 'circle');
    if (circleIndex < 0) {
      const rows = complete.map((locus, i): Row => {
        const line = locus as Line;
        return [line.normal.x, line.normal.y, -signs[i]!, line.offset];
      });
      const a = rows[0]!,
        b = rows[1]!,
        c = rows[2]!;
      const det =
        a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
      if (Math.abs(det) < 1e-14) continue;
      const determinant = (column: number) => {
        const m = rows.map((row) => row.slice(0, 3));
        for (let i = 0; i < 3; i++) m[i]![column] = rows[i]![3];
        return (
          m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
          m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
          m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)
        );
      };
      const radius = determinant(2) / det;
      if (radius > 0)
        candidates.push({ center: { x: determinant(0) / det, y: determinant(1) / det }, radius });
    } else {
      const reference = complete[circleIndex] as Circle,
        sign = signs[circleIndex]!;
      const rows = complete.flatMap((locus, i): Row[] => {
        if (i === circleIndex) return [];
        if (locus.type === 'line')
          return [[locus.normal.x, locus.normal.y, -signs[i]!, locus.offset]];
        return [
          [
            2 * (reference.center.x - locus.center.x),
            2 * (reference.center.y - locus.center.y),
            -2 * (signs[i]! * locus.radius - sign * reference.radius),
            locus.radius ** 2 -
              reference.radius ** 2 -
              dot(locus.center, locus.center) +
              dot(reference.center, reference.center),
          ],
        ];
      });
      candidates.push(...solveCone(rows, reference, sign));
    }
  }
  return candidates
    .filter((c) => Number.isFinite(tangentScore(c, references)))
    .sort((a, b) => tangentScore(a, references) - tangentScore(b, references))[0];
}
