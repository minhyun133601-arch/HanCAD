import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { validDraftPoint } from './coordinates';
import type { OffsetError } from './offset-types';

const epsilon = 1e-8;
interface Segment {
  a: CadPoint;
  b: CadPoint;
  direction: CadPoint;
  normal: CadPoint;
}
export interface OffsetGeometryOptions {
  point: CadPoint;
  /** A negative distance means Through, matching OFFSETDIST. */
  distance: number;
  gapType: number;
  id: string;
  layer?: string;
}
export type OffsetGeometryResult = { entity: CadEntity } | { error: OffsetError };

const cross = (a: CadPoint, b: CadPoint): number => a.x * b.y - a.y * b.x;
const subtract = (a: CadPoint, b: CadPoint): CadPoint => ({ x: a.x - b.x, y: a.y - b.y });
const addScaled = (a: CadPoint, b: CadPoint, scale: number): CadPoint => ({
  x: a.x + b.x * scale,
  y: a.y + b.y * scale,
  ...(a.z === undefined ? {} : { z: a.z }),
});
const dot = (a: CadPoint, b: CadPoint): number => a.x * b.x + a.y * b.y;

function segment(a: CadPoint, b: CadPoint): Segment | undefined {
  if (!validDraftPoint(a) || !validDraftPoint(b)) return;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length <= epsilon) return;
  const direction = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  return { a, b, direction, normal: { x: -direction.y, y: direction.x } };
}
function distanceToSegment(point: CadPoint, edge: Segment): number {
  const length = Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y);
  const along = Math.max(0, Math.min(length, dot(subtract(point, edge.a), edge.direction)));
  const nearest = addScaled(edge.a, edge.direction, along);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}
function segmentsOf(points: readonly CadPoint[], closed: boolean): Segment[] | undefined {
  const edges: Segment[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const edge = a && b && segment(a, b);
    if (!edge) return;
    edges.push(edge);
  }
  return edges.length ? edges : undefined;
}
function crosses(a: Segment, b: Segment): boolean {
  const delta = subtract(b.a, a.a);
  const determinant = cross(a.direction, b.direction);
  if (Math.abs(determinant) <= epsilon) {
    if (Math.abs(cross(delta, a.direction)) > epsilon) return false;
    const first = dot(delta, a.direction);
    const second = dot(subtract(b.b, a.a), a.direction);
    const length = Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y);
    return (
      Math.max(Math.min(first, second), 0) <= Math.min(Math.max(first, second), length) + epsilon
    );
  }
  const alongA = cross(delta, b.direction) / determinant;
  const alongB = cross(delta, a.direction) / determinant;
  return (
    alongA >= -epsilon &&
    alongB >= -epsilon &&
    alongA <= Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y) + epsilon &&
    alongB <= Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) + epsilon
  );
}
function selfIntersects(edges: readonly Segment[], closed: boolean): boolean {
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 2; j < edges.length; j++) {
      if (closed && i === 0 && j === edges.length - 1) continue;
      if (crosses(edges[i]!, edges[j]!)) return true;
    }
  }
  return false;
}
function convex(edges: readonly Segment[]): boolean {
  let sign = 0;
  for (let i = 0; i < edges.length; i++) {
    const first = edges[i]!,
      next = edges[(i + 1) % edges.length]!;
    const turn = cross(first.direction, next.direction);
    if (Math.abs(turn) <= epsilon) {
      if (dot(first.direction, next.direction) <= 0) return false;
      continue;
    }
    if (sign && Math.sign(turn) !== sign) return false;
    sign = Math.sign(turn);
  }
  return sign !== 0;
}
function polylineEdges(entity: CadPolyline): Segment[] | OffsetError {
  if (entity.points.length < (entity.closed ? 3 : 2)) return 'invalidGeometry';
  const edges = segmentsOf(entity.points, entity.closed);
  if (!edges) return 'invalidGeometry';
  if (selfIntersects(edges, entity.closed) || (entity.closed && !convex(edges)))
    return 'unsupportedPolyline';
  for (let i = 1; i < edges.length; i++) {
    if (dot(edges[i - 1]!.direction, edges[i]!.direction) < -1 + epsilon)
      return 'unsupportedPolyline';
  }
  return edges;
}

export function offsetEntityError(entity: CadEntity, gapType: number): OffsetError | undefined {
  if (entity.type === 'line') return segment(entity.a, entity.b) ? undefined : 'invalidGeometry';
  if (entity.type === 'circle' || entity.type === 'arc')
    return validDraftPoint(entity.center) &&
      Number.isFinite(entity.radius) &&
      entity.radius > epsilon
      ? undefined
      : 'invalidGeometry';
  if (entity.type !== 'polyline' && entity.type !== 'rect') return 'unsupportedEntity';
  if (gapType !== 0) return 'unsupportedGapType';
  const edges = polylineEdges(entity);
  return typeof edges === 'string' ? edges : undefined;
}

function shiftedVertex(previous: Segment, next: Segment, distance: number): CadPoint | undefined {
  const a = addScaled(previous.b, previous.normal, distance);
  const b = addScaled(next.a, next.normal, distance);
  const determinant = cross(previous.direction, next.direction);
  if (Math.abs(determinant) <= epsilon)
    return dot(previous.direction, next.direction) > 0 ? b : undefined;
  return addScaled(a, previous.direction, cross(subtract(b, a), next.direction) / determinant);
}
function offsetPolyline(entity: CadPolyline, options: OffsetGeometryOptions): OffsetGeometryResult {
  const edges = polylineEdges(entity);
  if (typeof edges === 'string') return { error: edges };
  let nearest = edges[0]!;
  for (const edge of edges)
    if (distanceToSegment(options.point, edge) < distanceToSegment(options.point, nearest))
      nearest = edge;
  const side = cross(nearest.direction, subtract(options.point, nearest.a));
  if (Math.abs(side) <= epsilon) return { error: 'ambiguousSide' };
  const distance = options.distance < 0 ? side : Math.sign(side) * options.distance;
  const points: CadPoint[] = [];
  for (let i = 0; i < entity.points.length; i++) {
    let point: CadPoint | undefined;
    if (!entity.closed && i === 0) point = addScaled(edges[0]!.a, edges[0]!.normal, distance);
    else if (!entity.closed && i === entity.points.length - 1) {
      const last = edges.at(-1)!;
      point = addScaled(last.b, last.normal, distance);
    } else
      point = shiftedVertex(edges[(i - 1 + edges.length) % edges.length]!, edges[i]!, distance);
    if (!point || !validDraftPoint(point)) return { error: 'collapsedOffset' };
    points.push(point);
  }
  const shifted = segmentsOf(points, entity.closed);
  if (
    !shifted ||
    selfIntersects(shifted, entity.closed) ||
    shifted.some((edge, i) => dot(subtract(edge.b, edge.a), edges[i]!.direction) <= epsilon)
  )
    return { error: 'collapsedOffset' };
  if (
    options.distance < 0 &&
    !shifted.some((edge) => distanceToSegment(options.point, edge) <= epsilon)
  )
    return { error: 'throughPoint' };
  return { entity: { ...entity, id: options.id, layer: options.layer ?? entity.layer, points } };
}

/** Exact supporting-line miters only; topology-changing polyline offsets are explicitly rejected. */
export function offsetCadEntity(
  entity: CadEntity,
  options: OffsetGeometryOptions,
): OffsetGeometryResult {
  const error = offsetEntityError(entity, options.gapType);
  if (error) return { error };
  if (!validDraftPoint(options.point)) return { error: 'point' };
  if (!Number.isFinite(options.distance) || options.distance === 0)
    return { error: 'positiveDistance' };
  const base = { id: options.id, layer: options.layer ?? entity.layer };
  if (entity.type === 'line') {
    const edge = segment(entity.a, entity.b)!;
    const side = cross(edge.direction, subtract(options.point, entity.a));
    if (Math.abs(side) <= epsilon) return { error: 'ambiguousSide' };
    const distance = options.distance < 0 ? side : Math.sign(side) * options.distance;
    const a = addScaled(entity.a, edge.normal, distance),
      b = addScaled(entity.b, edge.normal, distance);
    return validDraftPoint(a) && validDraftPoint(b)
      ? { entity: { ...entity, ...base, a, b } }
      : { error: 'invalidGeometry' };
  }
  if (entity.type === 'circle' || entity.type === 'arc') {
    const radialDistance = Math.hypot(
      options.point.x - entity.center.x,
      options.point.y - entity.center.y,
    );
    const difference = radialDistance - entity.radius;
    if (Math.abs(difference) <= epsilon) return { error: 'ambiguousSide' };
    const radius =
      options.distance < 0
        ? radialDistance
        : entity.radius + Math.sign(difference) * options.distance;
    return radius > epsilon && Number.isFinite(radius)
      ? { entity: { ...entity, ...base, center: { ...entity.center }, radius } }
      : { error: 'collapsedOffset' };
  }
  return entity.type === 'polyline' || entity.type === 'rect'
    ? offsetPolyline(entity, options)
    : { error: 'unsupportedEntity' };
}
