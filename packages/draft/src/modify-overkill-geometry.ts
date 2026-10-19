import {
  evaluateGeometry,
  geometryLength,
  polylineSegments,
  cross3,
  dot3,
  normalize3,
  subtract3,
} from '@hancad/geom';
import type { ArcGeometry, CurveGeometry, PolylineGeometry, Vec3, Vertex3 } from '@hancad/geom';
import { near3, polylineCurve, reverseEditCurve } from './modify-curve-geometry';
import type { OverkillOptions } from './modify-overkill';

const tau = Math.PI * 2;
export function mergeOverkillLines(
  a: CurveGeometry,
  b: CurveGeometry,
  options: OverkillOptions,
): CurveGeometry | undefined {
  if (a.type !== 'LINE' || b.type !== 'LINE') return;
  const dx = a.end.x - a.start.x,
    dy = a.end.y - a.start.y,
    dz = a.end.z - a.start.z,
    length = Math.hypot(dx, dy, dz);
  if (length <= options.tolerance) return;
  const u = { x: dx / length, y: dy / length, z: dz / length };
  const along = (point: Vec3) =>
    (point.x - a.start.x) * u.x + (point.y - a.start.y) * u.y + (point.z - a.start.z) * u.z;
  const at = (t: number): Vec3 => ({
    x: a.start.x + u.x * t,
    y: a.start.y + u.y * t,
    z: a.start.z + u.z * t,
  });
  const c = along(b.start),
    d = along(b.end),
    low = Math.min(c, d),
    high = Math.max(c, d);
  if (!near3(at(c), b.start, options.tolerance) || !near3(at(d), b.end, options.tolerance)) return;
  const overlap = Math.min(length, high) - Math.max(0, low);
  if (
    overlap < -options.tolerance ||
    (overlap <= options.tolerance ? !options.endToEnd : !options.partialOverlap)
  )
    return;
  return { ...a, start: at(Math.min(0, low)), end: at(Math.max(length, high)) };
}
function circularFrame(a: ArcGeometry, b: ArcGeometry, tolerance: number): boolean {
  return (
    near3(a.center, b.center, tolerance) &&
    Math.abs(a.radius - b.radius) <= tolerance &&
    Math.hypot(...Object.values(cross3(normalize3(a.normal), normalize3(b.normal)))) <=
      Math.max(1e-12, tolerance / Math.max(a.radius, 1))
  );
}
/** Angular intervals are unwrapped together, so a seam never creates a spurious gap. */
export function mergeOverkillArcs(
  a: CurveGeometry,
  b: CurveGeometry,
  options: OverkillOptions,
): CurveGeometry | undefined {
  if (a.type !== 'ARC' || b.type !== 'ARC' || !circularFrame(a, b, options.tolerance)) return;
  const u = normalize3(a.xAxis),
    v = cross3(normalize3(a.normal), u);
  const angle = (point: Vec3): number => {
    const d = subtract3(point, a.center);
    return Math.atan2(dot3(d, v), dot3(d, u));
  };
  const low = Math.min(a.startAngle, a.startAngle + a.sweepAngle),
    high = low + Math.abs(a.sweepAngle);
  const bLow = angle(evaluateGeometry(b, b.sweepAngle * dot3(a.normal, b.normal) < 0 ? 1 : 0));
  const tolerance = options.tolerance / Math.max(a.radius, 1e-15);
  let union: [number, number] | undefined;
  const centerShift = Math.round((low - bLow) / tau);
  for (let i = centerShift - 1; i <= centerShift + 1; i++) {
    const c = bLow + i * tau,
      d = c + Math.abs(b.sweepAngle),
      overlap = Math.min(high, d) - Math.max(low, c);
    if (
      overlap < -tolerance ||
      (overlap <= tolerance ? !options.endToEnd : !options.partialOverlap)
    )
      continue;
    const candidate: [number, number] = [Math.min(low, c), Math.max(high, d)];
    if (!union || candidate[1] - candidate[0] < union[1] - union[0]) union = candidate;
  }
  if (!union) return;
  if (union[1] - union[0] >= tau - tolerance) {
    const circle = { ...a, type: 'CIRCLE' as const };
    delete circle.startPoint;
    return circle;
  }
  const result = {
    ...a,
    startAngle: a.sweepAngle < 0 ? union[1] : union[0],
    sweepAngle: (a.sweepAngle < 0 ? -1 : 1) * (union[1] - union[0]),
  };
  delete result.startPoint;
  return result;
}
export function circularCurveCovered(
  a: CurveGeometry,
  b: CurveGeometry,
  tolerance: number,
): boolean {
  if ((a.type !== 'ARC' && a.type !== 'CIRCLE') || (b.type !== 'ARC' && b.type !== 'CIRCLE'))
    return false;
  if (!near3(a.center, b.center, tolerance) || Math.abs(a.radius - b.radius) > tolerance)
    return false;
  const na = normalize3(a.normal),
    nb = normalize3(b.normal);
  if (
    Math.hypot(...Object.values(cross3(na, nb))) >
    Math.max(1e-12, tolerance / Math.max(a.radius, 1))
  )
    return false;
  if (b.type === 'CIRCLE') return true;
  if (a.type === 'CIRCLE') return false;
  const merged = mergeOverkillArcs(b, a, {
    tolerance,
    endToEnd: true,
    partialOverlap: true,
  } as OverkillOptions);
  return merged?.type === 'ARC' && geometryLength(merged) <= geometryLength(b) + tolerance;
}
/** Remove just the coincident interval; keep every nonoverlapping extension. */
export function subtractOverkillCurve(
  source: CurveGeometry,
  cover: CurveGeometry,
  tolerance: number,
): CurveGeometry[] {
  const removals: [number, number][] = [];
  if (source.type === 'LINE' && cover.type === 'LINE') {
    const d = subtract3(source.end, source.start),
      length = Math.hypot(d.x, d.y, d.z);
    if (!length) return [];
    const project = (p: Vec3): number => dot3(subtract3(p, source.start), d) / (length * length);
    const at = (t: number): Vec3 => ({
      x: source.start.x + d.x * t,
      y: source.start.y + d.y * t,
      z: source.start.z + d.z * t,
    });
    const a = project(cover.start),
      b = project(cover.end);
    if (!near3(at(a), cover.start, tolerance) || !near3(at(b), cover.end, tolerance))
      return [source];
    removals.push([Math.max(0, Math.min(a, b)), Math.min(1, Math.max(a, b))]);
  } else if (source.type === 'ARC' && (cover.type === 'ARC' || cover.type === 'CIRCLE')) {
    if (cover.type === 'CIRCLE')
      return circularCurveCovered(source, cover, tolerance) ? [] : [source];
    if (!circularFrame(source, cover, tolerance)) return [source];
    const low = Math.min(source.startAngle, source.startAngle + source.sweepAngle),
      high = low + Math.abs(source.sweepAngle);
    const u = normalize3(source.xAxis),
      v = cross3(normalize3(source.normal), u);
    const delta = subtract3(
      evaluateGeometry(cover, cover.sweepAngle * dot3(source.normal, cover.normal) < 0 ? 1 : 0),
      source.center,
    );
    const angle = Math.atan2(dot3(delta, v), dot3(delta, u));
    const shift = Math.round((low - angle) / tau);
    for (let i = shift - 1; i <= shift + 1; i++) {
      const a = Math.max(low, angle + i * tau),
        b = Math.min(high, angle + i * tau + Math.abs(cover.sweepAngle));
      if (b > a) removals.push([(a - low) / (high - low), (b - low) / (high - low)]);
    }
  } else return [source];
  let spans: [number, number][] = [[0, 1]];
  const length = geometryLength(source);
  for (const [lo, hi] of removals) {
    if ((hi - lo) * length <= tolerance) continue;
    spans = spans.flatMap(([a, b]): [number, number][] =>
      hi <= a || lo >= b
        ? [[a, b]]
        : [
            ...(lo > a ? [[a, Math.min(b, lo)] as [number, number]] : []),
            ...(hi < b ? [[Math.max(a, hi), b] as [number, number]] : []),
          ],
    );
  }
  return spans
    .filter(([a, b]) => (b - a) * length > tolerance)
    .map(([a, b]) => {
      if (source.type === 'LINE') {
        const point = (t: number): Vec3 => ({
          x: source.start.x + (source.end.x - source.start.x) * t,
          y: source.start.y + (source.end.y - source.start.y) * t,
          z: source.start.z + (source.end.z - source.start.z) * t,
        });
        return { ...source, start: point(a), end: point(b) };
      }
      if (source.type !== 'ARC') return source;
      const low = Math.min(source.startAngle, source.startAngle + source.sweepAngle),
        size = Math.abs(source.sweepAngle);
      const result = {
        ...source,
        startAngle: low + size * (source.sweepAngle < 0 ? b : a),
        sweepAngle: Math.sign(source.sweepAngle) * size * (b - a),
      };
      delete result.startPoint;
      return result;
    });
}
interface Segment {
  geometry: CurveGeometry;
  startWidth: number;
  endWidth: number;
}
function widthsPermit(a: Segment, b: Segment, options: OverkillOptions): boolean {
  if (options.ignoreWidths) return true;
  if (Math.abs(a.endWidth - b.startWidth) > options.tolerance) return false;
  const first = geometryLength(a.geometry),
    second = geometryLength(b.geometry);
  return (
    Math.abs((a.endWidth - a.startWidth) * second - (b.endWidth - b.startWidth) * first) <=
    options.tolerance * Math.max(1, first + second)
  );
}
/** Keeps width slopes and the object path when removing redundant vertices. */
export function optimizeOverkillPolyline(
  source: PolylineGeometry,
  options: OverkillOptions,
): PolylineGeometry | undefined {
  const segments: Segment[] = polylineSegments(source).flatMap((segment, i) =>
    geometryLength(segment.geometry) <= options.tolerance
      ? []
      : [
          {
            geometry: segment.geometry,
            startWidth: source.vertices[i]!.startWidth,
            endWidth: source.vertices[i]!.endWidth,
          },
        ],
  );
  if (!segments.length) return;
  let changed = true;
  while (changed && segments.length > 1) {
    changed = false;
    for (let i = 0; i < segments.length - (source.closed ? 0 : 1); i++) {
      const j = (i + 1) % segments.length,
        a = segments[i]!,
        b = segments[j]!;
      if (!widthsPermit(a, b, options)) continue;
      const merged =
        mergeOverkillLines(a.geometry, b.geometry, options) ??
        mergeOverkillArcs(a.geometry, b.geometry, options);
      if (!merged || merged.type === 'CIRCLE') continue;
      const start = evaluateGeometry(a.geometry, 0),
        end = evaluateGeometry(b.geometry, 1);
      let direction: CurveGeometry = merged;
      if (!near3(evaluateGeometry(direction, 0), start, options.tolerance))
        direction = reverseEditCurve(direction, true);
      if (
        !near3(evaluateGeometry(direction, 0), start, options.tolerance) ||
        !near3(evaluateGeometry(direction, 1), end, options.tolerance)
      )
        continue;
      const next = { geometry: direction, startWidth: a.startWidth, endWidth: b.endWidth };
      if (!j) {
        segments[0] = next;
        segments.pop();
      } else {
        segments.splice(i, 2, next);
      }
      changed = true;
      break;
    }
  }
  const polyline = polylineCurve(
    segments.map((s) => s.geometry),
    source,
  );
  const vertices: Vertex3[] = polyline.vertices.map((v, i) => ({
    ...v,
    startWidth: segments[i]?.startWidth ?? 0,
    endWidth: segments[i]?.endWidth ?? 0,
  }));
  return { ...polyline, vertices, closed: source.closed };
}
