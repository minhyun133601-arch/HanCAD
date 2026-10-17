import { getLegacyRuntime } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { lineBoundaryParameters } from './trim-geometry';
import { validDraftPoint } from './coordinates';
import { bulgeArc } from '@hancad/geom';
import { arcSweep } from './snap-geometry';

export type SelectionPathMode = 'window' | 'crossing' | 'fence';
function onSegment(p: CadPoint, a: CadPoint, b: CadPoint): boolean {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const tolerance = 1e-9 * Math.max(1, length);
  return (
    Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) <= tolerance * length &&
    p.x >= Math.min(a.x, b.x) - tolerance &&
    p.x <= Math.max(a.x, b.x) + tolerance &&
    p.y >= Math.min(a.y, b.y) - tolerance &&
    p.y <= Math.max(a.y, b.y) + tolerance
  );
}
export function selectionPolygonContains(points: readonly CadPoint[], p: CadPoint): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!,
      b = points[j]!;
    if (onSegment(p, a, b)) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
type Curve = Extract<CadEntity, { type: 'arc' | 'circle' }>;
interface Shape {
  points: CadPoint[];
  edges: [CadPoint, CadPoint][];
  curves: Curve[];
}
function geometry(entity: CadEntity): Shape {
  if (entity.type === 'line')
    return { points: [entity.a, entity.b], edges: [[entity.a, entity.b]], curves: [] };
  if (entity.type === 'polyline' || entity.type === 'rect') {
    const edges: [CadPoint, CadPoint][] = [];
    const curves: Curve[] = [];
    for (let i = 0; i < entity.points.length - (entity.closed ? 0 : 1); i++) {
      const a = entity.points[i]!,
        b = entity.points[(i + 1) % entity.points.length]!;
      const arc = bulgeArc(a, b, entity.bulges?.[i] ?? 0);
      if (arc)
        curves.push({
          ...entity,
          type: 'arc',
          center: arc.center,
          radius: arc.radius,
          startAngle: arc.startAngle,
          endAngle: arc.startAngle + arc.sweepAngle,
          clockwise: arc.sweepAngle > 0,
        });
      else edges.push([a, b]);
    }
    return { points: entity.points, edges, curves };
  }
  if (entity.type === 'dimension') {
    const value = getLegacyRuntime().core.cadEngine.dimensionGeometry(entity);
    return {
      points: value?.points ?? [],
      edges: [
        ...(value?.lines ?? []),
        ...(value?.arrows.flatMap((triangle) =>
          triangle.map((p, i): [CadPoint, CadPoint] => [p, triangle[(i + 1) % triangle.length]!]),
        ) ?? []),
      ],
      curves: value?.arcs.map((arc) => ({ ...entity, ...arc, type: 'arc' as const })) ?? [],
    };
  }
  if (entity.type === 'text') {
    const bounds = getLegacyRuntime().core.cadEngine.bounds(entity);
    if (!bounds) return { points: [entity.point], edges: [], curves: [] };
    const points = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ];
    return {
      points,
      edges: points.map((p, i) => [p, points[(i + 1) % points.length]!]),
      curves: [],
    };
  }
  if (entity.type !== 'circle' && entity.type !== 'arc')
    return { points: [], edges: [], curves: [] };
  return { points: [], edges: [], curves: [entity] };
}
function curveIntervals(
  curve: Curve,
  path: readonly [CadPoint, CadPoint][],
): { samples: CadPoint[]; touches: boolean } {
  const start = curve.type === 'circle' ? 0 : curve.startAngle;
  const sweep = curve.type === 'circle' ? Math.PI * 2 : arcSweep(curve);
  const turn = Math.PI * 2,
    parameters = [0, 1];
  let touches = false;
  for (const [a, b] of path)
    for (const t of lineBoundaryParameters(
      { type: 'line', id: '', layer: '', color: '', lineWidth: 1, a, b },
      curve,
    )) {
      if (t < 0 || t > 1) continue;
      touches = true;
      const angle = Math.atan2(
        a.y + (b.y - a.y) * t - curve.center.y,
        a.x + (b.x - a.x) * t - curve.center.x,
      );
      const offset = (((sweep >= 0 ? angle - start : start - angle) % turn) + turn) % turn;
      parameters.push(Math.max(0, Math.min(1, offset / Math.abs(sweep))));
    }
  parameters.sort((a, b) => a - b);
  const values = [...parameters, ...parameters.slice(1).map((t, i) => (t + parameters[i]!) / 2)];
  return {
    touches,
    samples: values.map((t) => ({
      x: curve.center.x + curve.radius * Math.cos(start + sweep * t),
      y: curve.center.y + curve.radius * Math.sin(start + sweep * t),
    })),
  };
}
function lineSamples(a: CadPoint, b: CadPoint, path: readonly [CadPoint, CadPoint][]): CadPoint[] {
  const parameters = [0, 1];
  const line = { type: 'line' as const, id: '', layer: '', color: '', lineWidth: 1, a, b };
  for (const [c, d] of path)
    parameters.push(
      ...lineBoundaryParameters(line, { ...line, a: c, b: d }).filter((t) => t >= 0 && t <= 1),
    );
  parameters.sort((left, right) => left - right);
  return parameters.slice(1).map((t, i) => ({
    x: a.x + ((b.x - a.x) * (t + parameters[i]!)) / 2,
    y: a.y + ((b.y - a.y) * (t + parameters[i]!)) / 2,
  }));
}
function intersects(a: CadPoint, b: CadPoint, c: CadPoint, d: CadPoint): boolean {
  if (onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b))
    return true;
  const cross = (p: CadPoint, q: CadPoint, r: CadPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}
/** Boundary intersections are analytic for circles/arcs, and exact for straight segments. */
export function selectCadPath(
  state: LegacyCadState,
  points: readonly CadPoint[],
  mode: SelectionPathMode,
  includeLocked = false,
): string[] {
  if (points.length < (mode === 'fence' ? 2 : 3) || !points.every(validDraftPoint)) return [];
  const blocked = new Set(
    state.layers
      .filter((layer) => !layer.visible || (!includeLocked && layer.locked))
      .map((layer) => layer.name),
  );
  const pathEdges: [CadPoint, CadPoint][] = points.slice(1).map((p, i) => [points[i]!, p]);
  if (mode !== 'fence') pathEdges.push([points.at(-1)!, points[0]!]);
  return state.entities
    .filter((entity) => {
      if (blocked.has(entity.layer)) return false;
      const shape = geometry(entity);
      const curves = shape.curves.map((curve) => curveIntervals(curve, pathEdges));
      const touches =
        curves.some((curve) => curve.touches) ||
        pathEdges.some(([a, b]) => shape.edges.some(([c, d]) => intersects(a, b, c, d)));
      if (mode === 'fence') return touches;
      const contains = [
        ...shape.points,
        ...curves.flatMap((curve) => curve.samples),
        ...shape.edges.flatMap(([a, b]) => lineSamples(a, b, pathEdges)),
      ].map((point) => selectionPolygonContains(points, point));
      return mode === 'crossing'
        ? touches || contains.some(Boolean)
        : contains.length > 0 && contains.every(Boolean);
    })
    .map((entity) => entity.id);
}
