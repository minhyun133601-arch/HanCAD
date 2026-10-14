import type { CadEntity, CadLine, CadPoint } from '@hancad/legacy-bridge';
import { validDraftPoint } from './coordinates';
import { arcContains } from './snap-geometry';

const epsilon = Number.EPSILON * 64;
export type TrimExtendTool = 'TRIM' | 'EXTEND';

export function lineParameter(line: CadLine, point: CadPoint): number {
  const dx = line.b.x - line.a.x,
    dy = line.b.y - line.a.y;
  return ((point.x - line.a.x) * dx + (point.y - line.a.y) * dy) / (dx * dx + dy * dy);
}

export function linePoint(line: CadLine, t: number): CadPoint {
  return {
    x: line.a.x + (line.b.x - line.a.x) * t,
    y: line.a.y + (line.b.y - line.a.y) * t,
  };
}

/** Parameters on the infinite target line; boundary extents remain finite unless requested. */
export function lineBoundaryParameters(
  line: CadLine,
  boundary: CadEntity,
  extendEdge = false,
): number[] {
  if (boundary.type === 'line') return segmentParameters(line, boundary.a, boundary.b, extendEdge);
  if (boundary.type === 'polyline' || boundary.type === 'rect') {
    const result: number[] = [];
    for (let i = 1; i < boundary.points.length; i++) {
      const a = boundary.points[i - 1],
        b = boundary.points[i];
      if (a && b) result.push(...segmentParameters(line, a, b, extendEdge));
    }
    const first = boundary.points[0],
      last = boundary.points.at(-1);
    if (boundary.closed && first && last)
      result.push(...segmentParameters(line, last, first, extendEdge));
    return result;
  }
  if (boundary.type !== 'circle' && boundary.type !== 'arc') return [];
  const dx = line.b.x - line.a.x,
    dy = line.b.y - line.a.y;
  const length = Math.hypot(dx, dy);
  if (!length || !(boundary.radius > 0)) return [];
  const ux = dx / length,
    uy = dy / length;
  const cx = boundary.center.x - line.a.x,
    cy = boundary.center.y - line.a.y;
  const along = cx * ux + cy * uy,
    perpendicular = cx * uy - cy * ux;
  const square = boundary.radius * boundary.radius - perpendicular * perpendicular;
  const tolerance = epsilon * (boundary.radius * boundary.radius + perpendicular * perpendicular);
  if (square < -tolerance) return [];
  const offset = Math.sqrt(Math.max(0, square));
  return (
    offset === 0 ? [along / length] : [(along - offset) / length, (along + offset) / length]
  ).filter((t) => {
    const p = linePoint(line, t);
    return (
      boundary.type === 'circle' ||
      extendEdge ||
      arcContains(boundary, Math.atan2(p.y - boundary.center.y, p.x - boundary.center.x))
    );
  });
}

function segmentParameters(line: CadLine, a: CadPoint, b: CadPoint, infinite: boolean): number[] {
  const rx = line.b.x - line.a.x,
    ry = line.b.y - line.a.y;
  const sx = b.x - a.x,
    sy = b.y - a.y;
  const determinant = rx * sy - ry * sx;
  if (Math.abs(determinant) <= epsilon * Math.hypot(rx, ry) * Math.hypot(sx, sy)) return [];
  const dx = a.x - line.a.x,
    dy = a.y - line.a.y;
  const t = (dx * sy - dy * sx) / determinant,
    u = (dx * ry - dy * rx) / determinant;
  return Number.isFinite(t) && (infinite || (u >= -epsilon && u <= 1 + epsilon)) ? [t] : [];
}

/** Returns replacement fragments, an empty deletion, or undefined for an impossible edit. */
export function trimExtendLine(
  line: CadLine,
  point: CadPoint,
  boundaries: readonly CadEntity[],
  tool: TrimExtendTool,
  extendEdge = false,
  deleteUncut = false,
): CadLine[] | undefined {
  if (
    !validDraftPoint(point) ||
    !validDraftPoint(line.a) ||
    !validDraftPoint(line.b) ||
    Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) === 0
  )
    return;
  const parameters = boundaries
    .filter((e) => e.id !== line.id)
    .flatMap((e) => lineBoundaryParameters(line, e, extendEdge))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const pick = lineParameter(line, point);
  if (tool === 'EXTEND') {
    const t =
      pick < 0.5
        ? parameters.filter((t) => t < -epsilon).at(-1)
        : parameters.find((t) => t > 1 + epsilon);
    if (t === undefined) return;
    const p = linePoint(line, t);
    if (!validDraftPoint(p)) return;
    return [{ ...line, ...(pick < 0.5 ? { a: p } : { b: p }) }];
  }
  const cuts = parameters.filter(
    (t, i) =>
      t > epsilon &&
      t < 1 - epsilon &&
      (i === 0 || Math.abs(t - (parameters[i - 1] ?? t)) > epsilon),
  );
  if (!cuts.length) return deleteUncut ? [] : undefined;
  const left = cuts.filter((t) => t <= pick).at(-1) ?? 0;
  const right = cuts.find((t) => t > pick) ?? 1;
  const result: CadLine[] = [];
  if (left > epsilon) result.push({ ...line, a: { ...line.a }, b: linePoint(line, left) });
  if (right < 1 - epsilon) result.push({ ...line, a: linePoint(line, right), b: { ...line.b } });
  return result;
}
