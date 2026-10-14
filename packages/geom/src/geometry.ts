export interface Vec2 {
  x: number;
  y: number;
}
export interface Bounds2 {
  min: Vec2;
  max: Vec2;
}
export interface Line2 {
  start: Vec2;
  end: Vec2;
}
export interface Circle2 {
  center: Vec2;
  radius: number;
}
export interface Arc2 extends Circle2 {
  startAngle: number;
  sweepAngle: number;
}
export interface PolylineVertex extends Vec2 {
  bulge?: number;
}
export interface Polyline2 {
  vertices: readonly PolylineVertex[];
  closed: boolean;
}
const tau = Math.PI * 2;

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: coordinateMidpoint(a.x, b.x), y: coordinateMidpoint(a.y, b.y) };
}
export function rotate(point: Vec2, angle: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  return {
    x: origin.x + x * Math.cos(angle) - y * Math.sin(angle),
    y: origin.y + x * Math.sin(angle) + y * Math.cos(angle),
  };
}
export function bounds(points: readonly Vec2[]): Bounds2 | undefined {
  if (!points.length) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}
export function closestPointOnLine(
  line: Line2,
  point: Vec2,
  extent: 'segment' | 'ray' | 'infinite' = 'segment',
): Vec2 {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const denominator = dx * dx + dy * dy;
  let t =
    denominator === 0
      ? 0
      : ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / denominator;
  if (extent !== 'infinite') t = Math.max(0, t);
  if (extent === 'segment') t = Math.min(1, t);
  return { x: line.start.x + t * dx, y: line.start.y + t * dy };
}
export function lineIntersection(a: Line2, b: Line2, bounded = true): Vec2 | undefined {
  const ax = a.end.x - a.start.x;
  const ay = a.end.y - a.start.y;
  const bx = b.end.x - b.start.x;
  const by = b.end.y - b.start.y;
  const denominator = ax * by - ay * bx;
  if (Math.abs(denominator) <= Number.EPSILON * Math.hypot(ax, ay) * Math.hypot(bx, by))
    return undefined;
  const dx = b.start.x - a.start.x;
  const dy = b.start.y - a.start.y;
  const t = (dx * by - dy * bx) / denominator;
  const u = (dx * ay - dy * ax) / denominator;
  if (bounded && (t < 0 || t > 1 || u < 0 || u > 1)) return undefined;
  return { x: a.start.x + t * ax, y: a.start.y + t * ay };
}
export function circlePoint(circle: Circle2, angle: number): Vec2 {
  return {
    x: circle.center.x + circle.radius * Math.cos(angle),
    y: circle.center.y + circle.radius * Math.sin(angle),
  };
}
export function circleBounds(circle: Circle2): Bounds2 {
  return {
    min: { x: circle.center.x - circle.radius, y: circle.center.y - circle.radius },
    max: { x: circle.center.x + circle.radius, y: circle.center.y + circle.radius },
  };
}
export function arcLength(arc: Arc2): number {
  return Math.abs(arc.radius * arc.sweepAngle);
}
export function arcPoint(arc: Arc2, parameter: number): Vec2 {
  return circlePoint(arc, arc.startAngle + arc.sweepAngle * parameter);
}
export function arcBounds(arc: Arc2): Bounds2 {
  if (Math.abs(arc.sweepAngle) >= tau) return circleBounds(arc);
  const points = [arcPoint(arc, 0), arcPoint(arc, 1)];
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const directed = normalizeAngle(
      arc.sweepAngle >= 0 ? angle - arc.startAngle : arc.startAngle - angle,
    );
    if (directed <= Math.abs(arc.sweepAngle)) points.push(circlePoint(arc, angle));
  }
  return bounds(points) ?? circleBounds(arc);
}
export function bulgeArc(start: Vec2, end: Vec2, bulge: number): Arc2 | undefined {
  const chord = distance(start, end);
  if (bulge === 0 || chord === 0) return undefined;
  const half = midpoint(start, end);
  const offset = (chord * (1 - bulge * bulge)) / (4 * bulge);
  const center = {
    x: half.x - ((end.y - start.y) * offset) / chord,
    y: half.y + ((end.x - start.x) * offset) / chord,
  };
  return {
    center,
    radius: (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge)),
    startAngle: Math.atan2(start.y - center.y, start.x - center.x),
    sweepAngle: 4 * Math.atan(bulge),
  };
}
export function polylineLength(polyline: Polyline2): number {
  let length = 0;
  forEachSegment(polyline, (start, end) => {
    const arc = bulgeArc(start, end, start.bulge ?? 0);
    length += arc ? arcLength(arc) : distance(start, end);
  });
  return length;
}
/** Signed area includes circular segments; open polylines are closed by a straight chord for inquiry. */
export function polylineArea(polyline: Polyline2): number {
  let area = 0;
  const origin = polyline.vertices[0] ?? { x: 0, y: 0 };
  forEachSegment({ ...polyline, closed: true }, (start, end) => {
    const sx = start.x - origin.x;
    const sy = start.y - origin.y;
    const ex = end.x - origin.x;
    const ey = end.y - origin.y;
    area += (sx * ey - ex * sy) / 2;
    const arc = bulgeArc(start, end, start.bulge ?? 0);
    if (arc) area += (arc.radius * arc.radius * (arc.sweepAngle - Math.sin(arc.sweepAngle))) / 2;
  });
  return area;
}
export function polylineBounds(polyline: Polyline2): Bounds2 | undefined {
  const points: Vec2[] = [...polyline.vertices];
  forEachSegment(polyline, (start, end) => {
    const arc = bulgeArc(start, end, start.bulge ?? 0);
    if (arc) {
      const extent = arcBounds(arc);
      points.push(extent.min, extent.max);
    }
  });
  return bounds(points);
}
function normalizeAngle(value: number): number {
  return ((value % tau) + tau) % tau;
}
function coordinateMidpoint(a: number, b: number): number {
  const difference = b - a;
  return Number.isFinite(difference) ? a + difference / 2 : a / 2 + b / 2;
}
function forEachSegment(
  polyline: Polyline2,
  callback: (start: PolylineVertex, end: PolylineVertex) => void,
): void {
  const count = polyline.vertices.length - (polyline.closed ? 0 : 1);
  for (let index = 0; index < count; index++) {
    const start = polyline.vertices[index];
    const end = polyline.vertices[(index + 1) % polyline.vertices.length];
    if (start && end) callback(start, end);
  }
}
