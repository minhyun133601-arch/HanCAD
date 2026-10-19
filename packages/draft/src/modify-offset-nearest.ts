import { evaluateGeometry, splineBreakpoints, type CurveGeometry, type Vec3 } from '@hancad/geom';

interface Span {
  lo: number;
  hi: number;
  a: Vec3;
  b: Vec3;
}
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function chordDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const x = b.x - a.x,
    y = b.y - a.y,
    z = b.z - a.z,
    length = x * x + y * y + z * z,
    t = length
      ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y + (p.z - a.z) * z) / length))
      : 0;
  return Math.hypot(p.x - a.x - x * t, p.y - a.y - y * t, p.z - a.z - z * t);
}
/** Prepare a bounded adaptive cover once, then refine only local candidate intervals. */
export function offsetNearestDistance(
  curve: CurveGeometry,
  tolerance: number,
): (point: Vec3) => number {
  const spans: Span[] = [],
    breaks = curve.type === 'SPLINE' ? splineBreakpoints(curve) : [0, 0.25, 0.5, 0.75, 1];
  const prepare = (lo: number, hi: number, a: Vec3, b: Vec3, depth: number): void => {
    const mid = (lo + hi) / 2,
      p = evaluateGeometry(curve, mid),
      error = Math.max(
        chordDistance(p, a, b),
        chordDistance(evaluateGeometry(curve, lo + (hi - lo) / 4), a, b),
        chordDistance(evaluateGeometry(curve, lo + (3 * (hi - lo)) / 4), a, b),
      );
    if (error > tolerance) {
      if (depth >= 18 || spans.length >= 16384) throw new Error('Offset spline complexity limit.');
      prepare(lo, mid, a, p, depth + 1);
      prepare(mid, hi, p, b, depth + 1);
    } else spans.push({ lo, hi, a, b });
  };
  for (let i = 1; i < breaks.length; i++)
    prepare(
      breaks[i - 1]!,
      breaks[i]!,
      evaluateGeometry(curve, breaks[i - 1]!),
      evaluateGeometry(curve, breaks[i]!),
      0,
    );
  return (point) => {
    const best: { span: Span; distance: number }[] = [];
    for (const span of spans) {
      const d = chordDistance(point, span.a, span.b);
      if (best.length < 8 || d < best.at(-1)!.distance) {
        best.push({ span, distance: d });
        best.sort((a, b) => a.distance - b.distance);
        if (best.length > 8) best.pop();
      }
    }
    let result = Infinity;
    for (const { span, distance: approximate } of best) {
      if (approximate > result + tolerance * 2) continue;
      let lo = span.lo,
        hi = span.hi;
      const ratio = (Math.sqrt(5) - 1) / 2;
      let a = hi - ratio * (hi - lo),
        b = lo + ratio * (hi - lo),
        fa = distance(evaluateGeometry(curve, a), point),
        fb = distance(evaluateGeometry(curve, b), point);
      for (let step = 0; step < 40; step++) {
        if (fa <= fb) {
          hi = b;
          b = a;
          fb = fa;
          a = hi - ratio * (hi - lo);
          fa = distance(evaluateGeometry(curve, a), point);
        } else {
          lo = a;
          a = b;
          fa = fb;
          b = lo + ratio * (hi - lo);
          fb = distance(evaluateGeometry(curve, b), point);
        }
      }
      result = Math.min(result, fa, fb, distance(span.a, point), distance(span.b, point));
    }
    return result;
  };
}
