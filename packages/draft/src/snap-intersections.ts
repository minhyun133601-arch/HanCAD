import { conicComponents, evaluateGeometry, geometryEvaluation } from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';
import {
  crossXY,
  extendedSnapCurves,
  prepareSnapCurve,
  snapScalarRoots,
  squaredXY,
  type PreparedSnapCurve,
} from './snap-curves';

type Linear = Extract<CurveGeometry, { type: 'LINE' | 'RAY' | 'XLINE' }>;
type Conic = Extract<CurveGeometry, { type: 'CIRCLE' | 'ARC' | 'ELLIPSE' }>;
export interface SnapIntersection {
  point: Vec3;
  second: Vec3;
  firstParameter: number;
  secondParameter: number;
}
const isLinear = (curve: CurveGeometry): curve is Linear =>
  curve.type === 'LINE' || curve.type === 'RAY' || curve.type === 'XLINE';
const isConic = (curve: CurveGeometry): curve is Conic =>
  curve.type === 'CIRCLE' || curve.type === 'ARC' || curve.type === 'ELLIPSE';
const domain = (curve: CurveGeometry, t: number, extend: boolean): boolean =>
  extend ||
  curve.type === 'XLINE' ||
  (t >= -Number.EPSILON * 16 && (curve.type === 'RAY' || t <= 1 + Number.EPSILON * 16));
function linear(curve: Linear) {
  const p = curve.type === 'LINE' ? curve.start : curve.basePoint;
  const d =
    curve.type === 'LINE'
      ? { x: curve.end.x - p.x, y: curve.end.y - p.y, z: curve.end.z - p.z }
      : curve.direction;
  return {
    p,
    d,
    at: (t: number): Vec3 => ({ x: p.x + d.x * t, y: p.y + d.y * t, z: p.z + d.z * t }),
  };
}
function conicCoordinates(
  curve: Conic,
  point: Pick<Vec3, 'x' | 'y'>,
): { x: number; y: number } | undefined {
  const { a, b } = conicComponents(curve),
    det = crossXY(a, b);
  if (Math.abs(det) <= Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) * 1e-14) return;
  const delta = { x: point.x - curve.center.x, y: point.y - curve.center.y };
  return { x: crossXY(delta, b) / det, y: crossXY(a, delta) / det };
}
export function conicSnapParameter(
  curve: Conic,
  point: Pick<Vec3, 'x' | 'y'>,
  extend = false,
): number | undefined {
  const local = conicCoordinates(curve, point);
  if (!local) return;
  const { start, sweep } = conicComponents(curve),
    angle = Math.atan2(local.y, local.x);
  let delta =
    (((Math.sign(sweep) * (angle - start)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (Math.abs(delta - 2 * Math.PI) < 1e-10) delta = 0;
  const parameter = delta / Math.abs(sweep);
  if (extend || parameter <= 1 + 1e-12) return Math.min(1, parameter);
  return;
}
function result(a: Vec3, b: Vec3, ta: number, tb: number): SnapIntersection {
  return { point: a, second: b, firstParameter: ta, secondParameter: tb };
}
/** Exact lines and conic implicit equations precede numerical NURBS pair refinement. */
export function snapCurveIntersections(
  a: PreparedSnapCurve,
  b: PreparedSnapCurve,
  extend = false,
): SnapIntersection[] {
  if (extend)
    return extendedSnapCurves(a.geometry).flatMap((ga) =>
      extendedSnapCurves(b.geometry).flatMap((gb) =>
        snapCurveIntersections(prepareSnapCurve(ga), prepareSnapCurve(gb)),
      ),
    );
  const ga = a.geometry,
    gb = b.geometry;
  if (ga.type === 'POINT' || gb.type === 'POINT') return [];
  if (isLinear(ga) && isLinear(gb)) {
    const la = linear(ga),
      lb = linear(gb),
      det = crossXY(la.d, lb.d);
    if (
      Math.abs(det) <=
      Number.EPSILON * Math.hypot(la.d.x, la.d.y) * Math.hypot(lb.d.x, lb.d.y) * 8
    )
      return [];
    const delta = { x: lb.p.x - la.p.x, y: lb.p.y - la.p.y },
      ta = crossXY(delta, lb.d) / det,
      tb = crossXY(delta, la.d) / det;
    return domain(ga, ta, extend) && domain(gb, tb, extend)
      ? [result(la.at(ta), lb.at(tb), ta, tb)]
      : [];
  }
  if (isLinear(gb))
    return snapCurveIntersections(b, a, extend).map((hit) =>
      result(hit.second, hit.point, hit.secondParameter, hit.firstParameter),
    );
  if (isLinear(ga)) {
    const line = linear(ga),
      square = line.d.x ** 2 + line.d.y ** 2;
    if (!square) return [];
    const at = (point: Vec3) =>
      ((point.x - line.p.x) * line.d.x + (point.y - line.p.y) * line.d.y) / square;
    if (isConic(gb)) {
      const local = conicCoordinates(gb, line.p),
        next = conicCoordinates(gb, { x: line.p.x + line.d.x, y: line.p.y + line.d.y });
      if (!local || !next) return [];
      const dx = next.x - local.x,
        dy = next.y - local.y,
        A = dx * dx + dy * dy,
        B = 2 * (local.x * dx + local.y * dy),
        C = local.x ** 2 + local.y ** 2 - 1;
      const discriminant = B * B - 4 * A * C,
        roundoff = Number.EPSILON * (B * B + Math.abs(4 * A * C)) * 16;
      if (!A || discriminant < -roundoff) return [];
      const root = Math.sqrt(Math.max(0, discriminant));
      const q = -0.5 * (B + (B < 0 ? -root : root));
      const roots =
        root === 0
          ? [-B / (2 * A)]
          : q === 0
            ? [(-B - root) / (2 * A), (-B + root) / (2 * A)]
            : [q / A, C / q];
      return roots.flatMap((ta) => {
        if (!domain(ga, ta, extend)) return [];
        const point = line.at(ta),
          tb = conicSnapParameter(gb, point, extend);
        if (tb === undefined) return [];
        return [result(point, evaluateGeometry(gb, tb), ta, tb)];
      });
    }
    return snapScalarRoots(b, (t) => {
      const point = evaluateGeometry(gb, t);
      return crossXY({ x: point.x - line.p.x, y: point.y - line.p.y }, line.d);
    }).flatMap((tb) => {
      const point = evaluateGeometry(gb, tb),
        ta = at(point);
      return domain(ga, ta, extend) ? [result(line.at(ta), point, ta, tb)] : [];
    });
  }
  if (isConic(ga) && !isConic(gb))
    return snapCurveIntersections(b, a, extend).map((hit) =>
      result(hit.second, hit.point, hit.secondParameter, hit.firstParameter),
    );
  if (isConic(gb)) {
    return snapScalarRoots(a, (t) => {
      const point = conicCoordinates(gb, evaluateGeometry(ga, t));
      return point ? point.x ** 2 + point.y ** 2 - 1 : 1;
    }).flatMap((ta) => {
      const point = evaluateGeometry(ga, ta),
        tb = conicSnapParameter(gb, point, extend);
      return tb === undefined ? [] : [result(point, evaluateGeometry(gb, tb), ta, tb)];
    });
  }
  return numericalIntersections(a, b);
}
function numericalIntersections(a: PreparedSnapCurve, b: PreparedSnapCurve): SnapIntersection[] {
  const seeds: { u: number; v: number; distance: number }[] = [];
  for (let i = 1; i < a.samples.length; i++)
    for (let j = 1; j < b.samples.length; j++) {
      const p = a.samples[i - 1]!,
        q = a.samples[i]!,
        r = b.samples[j - 1]!,
        s = b.samples[j]!;
      const da = { x: q.point.x - p.point.x, y: q.point.y - p.point.y },
        db = { x: s.point.x - r.point.x, y: s.point.y - r.point.y };
      const delta = { x: r.point.x - p.point.x, y: r.point.y - p.point.y },
        det = crossXY(da, db);
      if (det) {
        const u = crossXY(delta, db) / det,
          v = crossXY(delta, da) / det;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1)
          seeds.push({
            u: p.parameter + (q.parameter - p.parameter) * u,
            v: r.parameter + (s.parameter - r.parameter) * v,
            distance: 0,
          });
      }
      const distance = squaredXY(q.point, s.point);
      seeds.push({ u: q.parameter, v: s.parameter, distance });
    }
  seeds.sort((a, b) => a.distance - b.distance);
  const hits: SnapIntersection[] = [];
  for (const seed of seeds.slice(0, 64)) {
    const hit = refine(a.geometry, b.geometry, seed.u, seed.v);
    if (
      hit &&
      !hits.some(
        (other) =>
          Math.abs(other.firstParameter - hit.firstParameter) < 1e-7 &&
          Math.abs(other.secondParameter - hit.secondParameter) < 1e-7,
      )
    )
      hits.push(hit);
  }
  return hits;
}
function refine(
  a: CurveGeometry,
  b: CurveGeometry,
  u: number,
  v: number,
): SnapIntersection | undefined {
  for (let step = 0; step < 64; step++) {
    const ea = geometryEvaluation(a, u),
      eb = geometryEvaluation(b, v),
      dx = eb.point.x - ea.point.x,
      dy = eb.point.y - ea.point.y;
    const residual = Math.hypot(dx, dy),
      speed = Math.max(
        Math.hypot(ea.derivative.x, ea.derivative.y),
        Math.hypot(eb.derivative.x, eb.derivative.y),
      );
    const precision = Math.max(
      speed * 1e-11,
      Number.EPSILON * Math.max(Math.abs(ea.point.x), Math.abs(ea.point.y)) * 8,
    );
    if (residual <= precision) return result(ea.point, eb.point, u, v);
    const det = crossXY(ea.derivative, eb.derivative);
    let du: number, dv: number;
    if (Math.abs(det) > speed * speed * 1e-14) {
      du = crossXY({ x: dx, y: dy }, eb.derivative) / det;
      dv = crossXY({ x: dx, y: dy }, ea.derivative) / det;
    } else {
      const damping = speed * speed * 1e-8,
        aa = ea.derivative.x ** 2 + ea.derivative.y ** 2 + damping,
        bb = eb.derivative.x ** 2 + eb.derivative.y ** 2 + damping,
        ab = -(ea.derivative.x * eb.derivative.x + ea.derivative.y * eb.derivative.y),
        ra = dx * ea.derivative.x + dy * ea.derivative.y,
        rb = -(dx * eb.derivative.x + dy * eb.derivative.y),
        normalDet = aa * bb - ab * ab;
      if (!normalDet) return;
      du = (ra * bb - rb * ab) / normalDet;
      dv = (rb * aa - ra * ab) / normalDet;
    }
    const nextU = Math.max(0, Math.min(1, u + du)),
      nextV = Math.max(0, Math.min(1, v + dv));
    if (nextU === u && nextV === v) return;
    u = nextU;
    v = nextV;
  }
  return;
}
