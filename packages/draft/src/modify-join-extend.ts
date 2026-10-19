import { conicComponents, evaluateGeometry } from '@hancad/geom';
import type { ArcGeometry, CurveGeometry, Vec3 } from '@hancad/geom';
import { near3 } from './modify-curve-geometry';
import { prepareSnapCurve } from './snap-curves';
import { snapCurveIntersections } from './snap-intersections';

function arcEndpoint(curve: ArcGeometry, point: Vec3, start: boolean): ArcGeometry | undefined {
  const { a, b } = conicComponents(curve),
    det = a.x * b.y - a.y * b.x;
  if (Math.abs(det) < 1e-20) return;
  const x = point.x - curve.center.x,
    y = point.y - curve.center.y;
  let angle = Math.atan2((a.x * y - a.y * x) / det, (x * b.y - y * b.x) / det);
  const original = curve.startAngle + (start ? 0 : curve.sweepAngle);
  angle += Math.round((original - angle) / (Math.PI * 2)) * Math.PI * 2;
  const sweep = start ? curve.startAngle + curve.sweepAngle - angle : angle - curve.startAngle;
  if (sweep * curve.sweepAngle <= 0 || Math.abs(sweep) >= Math.PI * 2 - 1e-12) return;
  const result = { ...curve, startAngle: start ? angle : curve.startAngle, sweepAngle: sweep };
  delete result.startPoint;
  return result;
}
/** PEDIT Extend/Both adjusts exact circular and straight endpoints to their nearest intersection. */
export function extendJoinPair(
  a: CurveGeometry,
  b: CurveGeometry,
): [CurveGeometry, CurveGeometry] | undefined {
  if (!['LINE', 'ARC'].includes(a.type) || !['LINE', 'ARC'].includes(b.type)) return;
  const end = evaluateGeometry(a, 1),
    start = evaluateGeometry(b, 0);
  let points = snapCurveIntersections(prepareSnapCurve(a), prepareSnapCurve(b), true)
    .filter((hit) => near3(hit.point, hit.second))
    .map((hit) => hit.point);
  if (!points.length && a.type === 'LINE' && b.type === 'LINE') {
    const dx = a.end.x - a.start.x,
      dy = a.end.y - a.start.y,
      length = Math.hypot(dx, dy);
    if (
      length &&
      Math.abs((b.start.x - a.start.x) * dy - (b.start.y - a.start.y) * dx) < length * 1e-9
    )
      points = [start];
  }
  const distance = (p: Vec3) =>
    Math.hypot(p.x - end.x, p.y - end.y, p.z - end.z) +
    Math.hypot(p.x - start.x, p.y - start.y, p.z - start.z);
  points.sort((p, q) => distance(p) - distance(q));
  for (const point of points) {
    const left =
      a.type === 'LINE'
        ? { ...a, end: point }
        : a.type === 'ARC'
          ? arcEndpoint(a, point, false)
          : undefined;
    const right =
      b.type === 'LINE'
        ? { ...b, start: point }
        : b.type === 'ARC'
          ? arcEndpoint(b, point, true)
          : undefined;
    if (left && right) return [left, right];
  }
  return;
}
