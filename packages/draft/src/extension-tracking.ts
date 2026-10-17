import { conicComponents } from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import { crossXY, snapCurveParts, squaredXY } from './snap-curves';
import { snapModel, snapWcs, type SnapSource } from './snap-types';

type Conic = Extract<CurveGeometry, { type: 'ARC' | 'ELLIPSE' }>;
const tau = Math.PI * 2;
const modulo = (value: number): number => ((value % tau) + tau) % tau;
const maxDisplaySegments = 4096;
export interface ExtensionTrackingViewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Display-only path: bounded work, with exact chord tolerance on the visible cursor-side interval. */
export function extensionTrackingPoints(
  source: SnapSource,
  acquired: CadPoint,
  target: CadPoint,
  tolerance: number,
  viewport?: ExtensionTrackingViewport,
): CadPoint[] | undefined {
  if (!Number.isFinite(tolerance) || tolerance <= 0) return;
  const near = snapWcs(acquired),
    end = snapWcs(target);
  let chosen: { curve: Conic; fromAngle: number; toAngle: number; score: number } | undefined;
  for (const part of snapCurveParts(source.geometry)) {
    if (part.type !== 'ARC' && part.type !== 'ELLIPSE') continue;
    const { start, sweep } = conicComponents(part),
      span = Math.abs(sweep),
      sign = Math.sign(sweep);
    if (span >= tau - 1e-10 || !sign) continue;
    const fromAngle = angleAt(part, near),
      toAngle = angleAt(part, end);
    if (fromAngle === undefined || toAngle === undefined) continue;
    const directed = modulo(sign * (toAngle - start));
    if (directed <= span + 1e-10) continue;
    const targetOn = at(part, toAngle),
      targetError = squaredXY(targetOn, end);
    const coordinatePrecision = Number.EPSILON * Math.max(Math.abs(end.x), Math.abs(end.y), 1) * 32;
    if (targetError > Math.max(tolerance * 1e-3, coordinatePrecision) ** 2) continue;
    const projected = modulo(sign * (fromAngle - start));
    const startPoint = at(part, start),
      endPoint = at(part, start + sweep);
    const fromStart = squaredXY(near, startPoint) <= squaredXY(near, endPoint);
    const fromDirected =
      projected <= span + 1e-10 ? Math.min(span, projected) : fromStart ? 0 : span;
    const on = at(part, start + sign * fromDirected),
      score = squaredXY(on, near) + targetError;
    if (!chosen || score < chosen.score)
      chosen = {
        curve: part,
        fromAngle: start + sign * fromDirected,
        toAngle: start + sign * (fromStart ? directed - tau : directed),
        score,
      };
  }
  if (!chosen) return;
  const { a, b } = conicComponents(chosen.curve),
    radius = Math.hypot(a.x, a.y, b.x, b.y);
  const step = Math.max(
    Number.EPSILON,
    radius > 0
      ? Math.min(Math.PI / 8, 4 * Math.asin(Math.sqrt(Math.min(1, tolerance / (2 * radius)))))
      : Math.PI / 8,
  );
  const visible = viewport
    ? visibleInterval(chosen.curve, chosen.fromAngle, chosen.toAngle, viewport, tolerance)
    : ([chosen.fromAngle, chosen.toAngle] as const);
  if (!visible) return [];
  let fromAngle = visible[0];
  const toAngle = visible[1];
  // Keep cursor-side accuracy if a non-browser viewport asks for an excessive visible span.
  if (viewport && Math.abs(toAngle - fromAngle) > step * maxDisplaySegments)
    fromAngle = toAngle - Math.sign(toAngle - fromAngle) * step * maxDisplaySegments;
  const count = Math.min(
    maxDisplaySegments,
    Math.max(1, Math.ceil(Math.abs(toAngle - fromAngle) / step)),
  );
  const points: CadPoint[] = [
    fromAngle === chosen.fromAngle ? { ...acquired } : snapModel(at(chosen.curve, fromAngle)),
  ];
  for (let index = 1; index < count; index++)
    points.push(snapModel(at(chosen.curve, fromAngle + ((toAngle - fromAngle) * index) / count)));
  points.push(toAngle === chosen.toAngle ? { ...target } : snapModel(at(chosen.curve, toAngle)));
  return points;
}
/** A conic can leave and re-enter the view. Return the last visible connected interval
 * so an invisible gap never becomes a false straight chord through the drawing. */
function visibleInterval(
  curve: Conic,
  from: number,
  to: number,
  viewport: ExtensionTrackingViewport,
  tolerance: number,
): readonly [number, number] | undefined {
  const { a, b } = conicComponents(curve),
    parameters = [0, 1],
    low = Math.min(from, to),
    high = Math.max(from, to),
    delta = to - from;
  const margin =
    tolerance * 2 +
    Number.EPSILON *
      Math.max(
        Math.abs(curve.center.x),
        Math.abs(curve.center.y),
        Math.hypot(a.x, a.y, b.x, b.y),
        1,
      ) *
      8;
  const bounds = {
    minX: viewport.minX - margin,
    maxX: viewport.maxX + margin,
    minY: -viewport.maxY - margin,
    maxY: -viewport.minY + margin,
  };
  for (const axis of ['x', 'y'] as const)
    for (const bound of axis === 'x' ? [bounds.minX, bounds.maxX] : [bounds.minY, bounds.maxY]) {
      const amplitude = Math.hypot(a[axis], b[axis]);
      if (!amplitude) continue;
      const ratio = (bound - curve.center[axis]) / amplitude;
      if (ratio < -1 || ratio > 1) continue;
      const phase = Math.atan2(b[axis], a[axis]),
        offset = Math.acos(Math.max(-1, Math.min(1, ratio)));
      for (const root of [phase - offset, phase + offset]) {
        const first = Math.ceil((low - root) / tau),
          last = Math.floor((high - root) / tau);
        for (let index = 0; index < 3; index++) {
          const turn = first + index;
          if (turn > last) break;
          const parameter = (root + turn * tau - from) / delta;
          if (parameter > 0 && parameter < 1) parameters.push(parameter);
        }
      }
    }
  parameters.sort((a, b) => a - b);
  let result: readonly [number, number] | undefined;
  for (let index = 1; index < parameters.length; index++) {
    const start = parameters[index - 1]!,
      end = parameters[index]!;
    if (end - start < Number.EPSILON) continue;
    const point = at(curve, from + (delta * (start + end)) / 2);
    if (
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.y >= bounds.minY &&
      point.y <= bounds.maxY
    )
      result = [from + delta * start, from + delta * end];
  }
  return result;
}
function angleAt(curve: Conic, point: Vec3): number | undefined {
  const { a, b } = conicComponents(curve),
    det = crossXY(a, b);
  if (Math.abs(det) <= Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) * 1e-14) return;
  const delta = { x: point.x - curve.center.x, y: point.y - curve.center.y };
  return Math.atan2(crossXY(a, delta) / det, crossXY(delta, b) / det);
}
function at(curve: Conic, angle: number): Vec3 {
  const { a, b } = conicComponents(curve),
    c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    x: curve.center.x + a.x * c + b.x * s,
    y: curve.center.y + a.y * c + b.y * s,
    z: curve.center.z + a.z * c + b.z * s,
  };
}
