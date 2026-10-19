import { geometryEvaluation, splineBreakpoints, helixBreakpoints } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { Bounds2, DisplayArc, Vec2 } from './types';

const tau = Math.PI * 2;
export function arcSegmentCount(
  radius: number,
  sweep: number,
  tolerance: number,
  cap = 8192,
): number {
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) throw new Error('Invalid chord tolerance');
  // asin avoids acos(1 - tolerance/radius) collapsing to zero for survey-scale radii.
  const step = 4 * Math.asin(Math.sqrt(Math.min(2, tolerance / Math.max(radius, tolerance)) / 2));
  return Math.min(
    cap,
    Math.max(Math.abs(sweep) >= tau - 1e-12 ? 4 : 1, Math.ceil(Math.abs(sweep) / step)),
  );
}
export function arcAt(arc: DisplayArc, t: number): Vec2 {
  const angle = arc.startAngle + arc.sweepAngle * t;
  if (arc.startPoint) {
    const local = arc.sweepAngle * t,
      cosineMinusOne = -2 * Math.sin(local / 2) ** 2;
    const cosine = Math.cos(arc.startAngle),
      sine = Math.sin(arc.startAngle);
    return {
      x: arc.startPoint.x + arc.radius * (cosine * cosineMinusOne - sine * Math.sin(local)),
      y: arc.startPoint.y + arc.radius * (sine * cosineMinusOne + cosine * Math.sin(local)),
    };
  }
  return {
    x: arc.center.x + arc.radius * Math.cos(angle),
    y: arc.center.y + arc.radius * Math.sin(angle),
  };
}
export function arcParameterAtPoint(arc: DisplayArc, point: Vec2): number {
  const tau = Math.PI * 2;
  let local: number;
  if (arc.startPoint) {
    const dx = point.x - arc.startPoint.x,
      dy = point.y - arc.startPoint.y;
    const cosine = Math.cos(arc.startAngle),
      sine = Math.sin(arc.startAngle);
    local = Math.atan2(-sine * dx + cosine * dy, arc.radius + cosine * dx + sine * dy);
  } else local = Math.atan2(point.y - arc.center.y, point.x - arc.center.x) - arc.startAngle;
  const signed = Math.sign(arc.sweepAngle) * local;
  const directed = signed >= 0 && signed < tau ? signed : ((signed % tau) + tau) % tau;
  return directed / Math.abs(arc.sweepAngle);
}
export function visibleArcIntervals(arc: DisplayArc, view: Bounds2): [number, number][] {
  const cuts = [0, 1],
    magnitude = Math.abs(arc.sweepAngle);
  if (!magnitude || !arc.radius) return [[0, 1]];
  const add = (angle: number) => {
    const directed = (((Math.sign(arc.sweepAngle) * (angle - arc.startAngle)) % tau) + tau) % tau;
    if (directed > 0 && directed < magnitude) cuts.push(directed / magnitude);
  };
  for (const x of [view.minX, view.maxX]) {
    const cosine = (x - arc.center.x) / arc.radius;
    if (Math.abs(cosine) <= 1) {
      const angle = Math.acos(cosine);
      add(angle);
      add(-angle);
    }
  }
  for (const y of [view.minY, view.maxY]) {
    const sine = (y - arc.center.y) / arc.radius;
    if (Math.abs(sine) <= 1) {
      const angle = Math.asin(sine);
      add(angle);
      add(Math.PI - angle);
    }
  }
  cuts.sort((a, b) => a - b);
  const result: [number, number][] = [];
  for (let i = 1; i < cuts.length; i++) {
    const low = cuts[i - 1]!,
      high = cuts[i]!,
      point = arcAt(arc, (low + high) / 2);
    if (
      point.x >= view.minX &&
      point.x <= view.maxX &&
      point.y >= view.minY &&
      point.y <= view.maxY
    )
      result.push([low, high]);
  }
  return result;
}
export function curveBreaks(curve: CurveGeometry): number[] {
  if (curve.type === 'TRANSFORMED') return curveBreaks(curve.source);
  if (curve.type === 'SPLINE') return splineBreakpoints(curve);
  if (curve.type === 'HELIX') return helixBreakpoints(curve);
  if (curve.type === 'POLYLINE' || curve.type === 'LWPOLYLINE') {
    const count = curve.vertices.length - (curve.closed ? 0 : 1);
    return Array.from({ length: count + 1 }, (_, index) => index / count);
  }
  return [0, 0.25, 0.5, 0.75, 1];
}
export function adaptivePoints(
  evaluate: (t: number) => Vec2,
  breaks: readonly number[],
  tolerance: number,
  cap = 8192,
): { point: Vec2; parameter: number }[] {
  const result = [{ point: evaluate(breaks[0] ?? 0), parameter: breaks[0] ?? 0 }];
  const visit = (a: number, b: number, start: Vec2, end: Vec2, depth: number) => {
    const middle = (a + b) / 2,
      mid = evaluate(middle);
    let error = 0;
    for (const fraction of [0.25, 0.5, 0.75]) {
      const actual = fraction === 0.5 ? mid : evaluate(a + (b - a) * fraction);
      error = Math.max(
        error,
        Math.hypot(
          actual.x - start.x - (end.x - start.x) * fraction,
          actual.y - start.y - (end.y - start.y) * fraction,
        ),
      );
    }
    if (error <= tolerance || depth >= 24 || result.length >= cap)
      result.push({ point: end, parameter: b });
    else {
      visit(a, middle, start, mid, depth + 1);
      visit(middle, b, mid, end, depth + 1);
    }
  };
  for (let i = 1; i < breaks.length; i++) {
    const a = breaks[i - 1]!,
      b = breaks[i]!;
    // Multiple seeds per knot span also detect inflections whose midpoint is on the chord.
    for (let j = 0; j < 4; j++) {
      const low = a + ((b - a) * j) / 4,
        high = a + ((b - a) * (j + 1)) / 4;
      visit(low, high, result.at(-1)!.point, evaluate(high), 0);
    }
  }
  return result;
}
export function projectedCurvePoints(curve: CurveGeometry, tolerance: number, cap = 8192) {
  return adaptivePoints(
    (t) => geometryEvaluation(curve, t).point,
    curveBreaks(curve),
    tolerance,
    cap,
  );
}
