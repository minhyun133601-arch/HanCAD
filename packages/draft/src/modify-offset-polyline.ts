import { parallelOffsetWasm, type PolylineGeometry } from '@hancad/geom';
import type { CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { distance, difference, wcs } from './draw-curve-helpers';
import { supportIntersections, type Support } from './modify-corner-math';
import { remapPolylineWidths } from './modify-polyline-widths';

interface Vertex extends CadPoint {
  bulge: number;
}
export function bulgeSupport(a: CadPoint, b: CadPoint, bulge: number): Support {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = Math.hypot(dx, dy);
  if (Math.abs(bulge) < 1e-12)
    return { kind: 'line', a, direction: { x: dx / length, y: dy / length } };
  const factor = (1 - bulge * bulge) / (4 * bulge);
  return {
    kind: 'circle',
    center: { x: (a.x + b.x) / 2 - dy * factor, y: (a.y + b.y) / 2 + dx * factor },
    radius: (length * (1 + bulge * bulge)) / (4 * Math.abs(bulge)),
  };
}
function bulgeBetween(source: Support, a: CadPoint, b: CadPoint, previous: number): number {
  if (source.kind === 'line') return 0;
  const start = Math.atan2(a.y - source.center.y, a.x - source.center.x),
    end = Math.atan2(b.y - source.center.y, b.x - source.center.x);
  let sweep = (((end - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (previous < 0) sweep -= Math.PI * 2;
  return Math.tan(sweep / 4);
}
export function splitLargeBulges(input: readonly Vertex[], closed: boolean): Vertex[] {
  const vertices: Vertex[] = [];
  for (let i = 0; i < input.length; i++) {
    const a = input[i]!,
      b = input[(i + 1) % input.length]!;
    if ((!closed && i === input.length - 1) || Math.abs(a.bulge) <= 1 + 1e-12) {
      vertices.push({ ...a });
      continue;
    }
    const source = bulgeSupport(a, b, a.bulge);
    if (source.kind !== 'circle') continue;
    const start = Math.atan2(a.y - source.center.y, a.x - source.center.x),
      sweep = 4 * Math.atan(a.bulge),
      count = Math.ceil(Math.abs(sweep) / Math.PI);
    for (let j = 0; j < count; j++) {
      const angle = start + (sweep * j) / count;
      vertices.push({
        x: source.center.x + source.radius * Math.cos(angle),
        y: source.center.y + source.radius * Math.sin(angle),
        bulge: Math.tan(sweep / count / 4),
      });
    }
  }
  return vertices;
}
function sharpCorners(
  raw: Vertex[],
  closed: boolean,
  original: readonly Vertex[],
  offset: number,
  gap: number,
): Vertex[] {
  if (gap === 1) return raw;
  const removed = new Set<Vertex>();
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]!,
      b = raw[(i + 1) % raw.length]!,
      prev = raw[(i - 1 + raw.length) % raw.length]!,
      next = raw[(i + 2) % raw.length]!;
    if (!closed && (i === 0 || i >= raw.length - 2)) continue;
    if (Math.abs(a.bulge) < 1e-10) continue;
    const join = bulgeSupport(a, b, a.bulge);
    if (
      join.kind !== 'circle' ||
      Math.abs(join.radius - Math.abs(offset)) > 1e-6 * Math.max(1, Math.abs(offset)) ||
      !original.some((v) => distance(v, join.center) < 1e-6 * Math.max(1, Math.abs(offset)))
    )
      continue;
    if (gap === 2) {
      a.bulge = 0;
      continue;
    }
    const prior = bulgeSupport(prev, a, prev.bulge),
      after = bulgeSupport(b, next, b.bulge);
    const intersection = supportIntersections(prior, after).sort(
      (p, q) => distance(p, join.center) - distance(q, join.center),
    )[0];
    if (!intersection) throw new Error('Offset supporting curves do not meet.');
    prev.bulge = bulgeBetween(prior, prev, intersection, prev.bulge);
    a.bulge = bulgeBetween(after, intersection, next, b.bulge);
    a.x = intersection.x;
    a.y = intersection.y;
    removed.add(b);
  }
  return raw.filter((v) => !removed.has(v));
}
/** Cavalier runs relative to the first source vertex to keep its epsilon independent of survey origin. */
export function offsetPolylineKernel(
  entity: CadPolyline,
  point: CadPoint,
  distanceValue: number,
  gap: number,
  id: string,
  layer?: string,
): CadPolyline[] {
  const original = entity.points.map((p, i) => ({ ...p, bulge: entity.bulges?.[i] ?? 0 }));
  const vertices = splitLargeBulges(original, entity.closed),
    origin = vertices[0]!;
  let best = Infinity,
    signedDistance = 0;
  for (let i = 0; i < (entity.closed ? vertices.length : vertices.length - 1); i++) {
    const a = vertices[i]!,
      b = vertices[(i + 1) % vertices.length]!,
      s = bulgeSupport(a, b, a.bulge);
    let nearest: CadPoint, side: number;
    if (s.kind === 'line') {
      const delta = difference(point, a),
        along = Math.max(
          0,
          Math.min(distance(a, b), delta.x * s.direction.x + delta.y * s.direction.y),
        );
      nearest = { x: a.x + s.direction.x * along, y: a.y + s.direction.y * along };
      side = s.direction.x * (point.y - a.y) - s.direction.y * (point.x - a.x);
    } else {
      const delta = difference(point, s.center),
        length = Math.hypot(delta.x, delta.y);
      const radial = length ? s.radius / length : 0;
      nearest = { x: s.center.x + delta.x * radial, y: s.center.y + delta.y * radial };
      // A left offset decreases the radius of a positive-bulge arc.
      side = (s.radius - length) * Math.sign(a.bulge);
      const start = Math.atan2(a.y - s.center.y, a.x - s.center.x),
        angle = Math.atan2(nearest.y - s.center.y, nearest.x - s.center.x),
        tau = 2 * Math.PI;
      const sweep = ((((angle - start) * Math.sign(a.bulge)) % tau) + tau) % tau;
      if (sweep > Math.abs(4 * Math.atan(a.bulge)) + 1e-9)
        nearest = distance(point, a) < distance(point, b) ? a : b;
    }
    const d = distance(point, nearest);
    if (d < best) {
      best = d;
      signedDistance = distanceValue < 0 ? Math.sign(side) * d : Math.sign(side) * distanceValue;
    }
  }
  if (Math.abs(signedDistance) < 1e-10) throw new Error('Ambiguous offset side.');
  const packed = new Float64Array(
    vertices.flatMap((v) => [v.x - origin.x, v.y - origin.y, v.bulge]),
  );
  const results = parallelOffsetWasm(packed, entity.closed, signedDistance);
  return results.map((result, index) => {
    const raw: Vertex[] = [];
    for (let i = 0; i < result.vertices.length; i += 3)
      raw.push({
        x: result.vertices[i]! + origin.x,
        y: result.vertices[i + 1]! + origin.y,
        bulge: result.vertices[i + 2]!,
      });
    const adjusted = splitLargeBulges(
      sharpCorners(raw, result.closed, original, signedDistance, gap),
      result.closed,
    );
    const curve: PolylineGeometry = {
      type: 'LWPOLYLINE',
      vertices: adjusted.map((v) => ({
        position: wcs(v),
        bulge: -v.bulge,
        startWidth: entity.constantWidth ?? 0,
        endWidth: entity.constantWidth ?? 0,
      })),
      closed: result.closed,
      is3D: false,
      normal: { x: 0, y: 0, z: 1 },
      constantWidth: entity.constantWidth ?? 0,
    };
    return remapPolylineWidths(entity, {
      ...entity,
      id: index ? `${id}-${index}` : id,
      layer: layer ?? entity.layer,
      type: 'polyline',
      sourceType: 'LWPOLYLINE',
      points: adjusted.map(({ x, y }) => ({ x, y })),
      bulges: adjusted.map((v) => v.bulge),
      closed: result.closed,
      curve,
    });
  });
}
