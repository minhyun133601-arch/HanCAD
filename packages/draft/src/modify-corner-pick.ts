import { closestGeometryPoint } from '@hancad/geom';
import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { distance, wcs } from './draw-curve-helpers';
import { arcAt, trimAt, support, type CornerSolution } from './modify-corner-math';
import { cornerPolylineSegment } from './modify-corner-polyline';
import { bulgeSupport } from './modify-offset-polyline';
import { remapPolylineWidths } from './modify-polyline-widths';

export interface CornerPick {
  owner: CadEntity;
  part: CadEntity;
  index?: number;
}
export interface CornerEdit {
  replacements: CadEntity[];
  eraseIds: string[];
  connector?: CadEntity;
}
const isPolyline = (entity: CadEntity): entity is CadPolyline =>
  (entity.type === 'polyline' || entity.type === 'rect') &&
  (!entity.curve || entity.curve.type === 'LWPOLYLINE' || entity.curve.type === 'POLYLINE');
export function cornerPick(owner: CadEntity, point: CadPoint): CornerPick | undefined {
  if (!isPolyline(owner)) return support(owner) ? { owner, part: owner } : undefined;
  let best: CornerPick | undefined,
    min = Infinity;
  for (let i = 0; i < (owner.closed ? owner.points.length : owner.points.length - 1); i++) {
    const part = cornerPolylineSegment(owner, i),
      curve = part.curve;
    if (!curve) continue;
    const d = closestGeometryPoint(curve, wcs(point)).distance;
    if (d < min) {
      min = d;
      best = { owner, part, index: i };
    }
  }
  return best;
}
function polyline(base: CadPolyline, points: CadPoint[], bulges: number[]): CadPolyline {
  return remapPolylineWidths(base, {
    ...base,
    type: 'polyline',
    points,
    bulges,
    sourceType: 'LWPOLYLINE',
    curve: {
      type: 'LWPOLYLINE',
      vertices: points.map((p, i) => ({
        position: wcs(p),
        bulge: -(bulges[i] ?? 0),
        startWidth: base.constantWidth ?? 0,
        endWidth: base.constantWidth ?? 0,
      })),
      closed: base.closed,
      is3D: false,
      normal: { x: 0, y: 0, z: 1 },
      constantWidth: base.constantWidth ?? 0,
    },
  });
}
function adjustedBulge(original: CadPolyline, index: number, a: CadPoint, b: CadPoint): number {
  const before = original.bulges?.[index] ?? 0,
    s = bulgeSupport(
      original.points[index]!,
      original.points[(index + 1) % original.points.length]!,
      before,
    );
  if (s.kind === 'line') return 0;
  const arc = arcAt(original, s.center, s.radius, a, b, Math.sign(before));
  return Math.tan((arc.endAngle - arc.startAngle) / 4);
}
function connectorBulge(solution: CornerSolution, reverse = false): number {
  const c = solution.connector;
  return c?.type === 'arc' ? Math.tan((c.endAngle - c.startAngle) / 4) * (reverse ? -1 : 1) : 0;
}
/** Preserve the polyline identity and replace the adjacent vertex or one intervening segment. */
function samePolyline(
  first: CornerPick,
  second: CornerPick,
  solution: CornerSolution,
  pickedA: CadPoint,
  pickedB: CadPoint,
): CadPolyline | undefined {
  if (!isPolyline(first.owner) || first.index === undefined || second.index === undefined) return;
  const entity = first.owner,
    count = entity.points.length,
    segments = entity.closed ? count : count - 1;
  let prev = first.index,
    next = second.index,
    pa = solution.first,
    pb = solution.second,
    reverse = false;
  if (
    !entity.closed &&
    segments > 3 &&
    new Set([first.index, second.index]).has(0) &&
    new Set([first.index, second.index]).has(segments - 1)
  ) {
    const startIsFirst = first.index === 0,
      atStart = startIsFirst ? pickedA : pickedB,
      atEnd = startIsFirst ? pickedB : pickedA;
    if (
      distance(atStart, entity.points[0]!) < distance(atStart, entity.points[1]!) &&
      distance(atEnd, entity.points.at(-1)!) < distance(atEnd, entity.points.at(-2)!)
    ) {
      const start = startIsFirst ? solution.first : solution.second,
        end = startIsFirst ? solution.second : solution.first,
        points = [start, ...entity.points.slice(1, -1), end],
        bulges = points.map((_, i) => entity.bulges?.[i] ?? 0);
      bulges[0] = adjustedBulge(entity, 0, start, points[1]!);
      bulges[segments - 1] = adjustedBulge(entity, segments - 1, points[segments - 1]!, end);
      bulges[segments] = connectorBulge(solution, startIsFirst);
      if (!solution.connector && distance(start, end) < 1e-8) {
        points.pop();
        bulges.pop();
      }
      return polyline({ ...entity, closed: true }, points, bulges);
    }
  }
  const forward = (a: number, b: number) => (entity.closed ? (b - a + count) % count : b - a);
  if (![1, 2].includes(forward(prev, next))) {
    if (![1, 2].includes(forward(next, prev))) return;
    [prev, next] = [next, prev];
    [pa, pb] = [pb, pa];
    reverse = true;
  }
  const skip = forward(prev, next) === 2 ? (prev + 1) % count : -1,
    points: CadPoint[] = [],
    bulges: number[] = [];
  for (let i = 0; i < segments; i++) {
    if (i === skip) continue;
    const a = i === next ? pb : entity.points[i]!,
      b = i === prev ? pa : entity.points[(i + 1) % count]!;
    points.push(a);
    bulges.push(adjustedBulge(entity, i, a, b));
    if (i === prev && solution.connector) {
      points.push(pa);
      bulges.push(connectorBulge(solution, reverse));
    }
    if (!entity.closed && i === segments - 1) {
      points.push(b);
      bulges.push(0);
    }
  }
  return polyline(entity, points, bulges);
}
/** Keep the selected side of the picked segment and its connected polyline path. */
function trimPolyline(
  pick: CornerPick,
  point: CadPoint,
  selected: CadPoint,
): CadPolyline | undefined {
  if (!isPolyline(pick.owner) || pick.index === undefined) return;
  const entity = pick.owner,
    index = pick.index,
    count = entity.points.length;
  const trimmed = trimAt(pick.part, point, selected);
  let keepStart: boolean;
  if (trimmed.type === 'line') keepStart = distance(trimmed.a, entity.points[index]!) < 1e-8;
  else if (trimmed.type === 'arc') {
    const start = {
      x: trimmed.center.x + trimmed.radius * Math.cos(trimmed.startAngle),
      y: trimmed.center.y + trimmed.radius * Math.sin(trimmed.startAngle),
    };
    keepStart = distance(start, entity.points[index]!) < 1e-8;
  } else return;
  let points: CadPoint[], bulges: number[];
  if (entity.closed) {
    // A selected closed boundary becomes an open path at the trimmed segment.
    if (keepStart) {
      points = Array.from(
        { length: count },
        (_, i) => entity.points[(index + 1 + i) % count]!,
      ).concat([point]);
      bulges = Array.from(
        { length: count },
        (_, i) => entity.bulges?.[(index + 1 + i) % count] ?? 0,
      ).concat([0]);
      bulges[count - 1] = adjustedBulge(entity, index, points[count - 1]!, point);
    } else {
      points = [
        point,
        ...Array.from({ length: count }, (_, i) => entity.points[(index + 1 + i) % count]!),
      ];
      bulges = [
        adjustedBulge(entity, index, point, points[1]!),
        ...Array.from({ length: count }, (_, i) => entity.bulges?.[(index + 1 + i) % count] ?? 0),
      ];
      bulges[count] = 0;
    }
  } else if (keepStart) {
    points = [...entity.points.slice(0, index + 1), point];
    bulges = [
      ...entity.points.slice(0, index).map((_, i) => entity.bulges?.[i] ?? 0),
      adjustedBulge(entity, index, entity.points[index]!, point),
      0,
    ];
  } else {
    points = [point, ...entity.points.slice(index + 1)];
    bulges = [
      adjustedBulge(entity, index, point, entity.points[index + 1]!),
      ...entity.points.slice(index + 1).map((_, i) => entity.bulges?.[index + 1 + i] ?? 0),
    ];
  }
  return polyline({ ...entity, closed: false }, points, bulges);
}
function path(
  entity: CadEntity,
  join: CadPoint,
  endsAtJoin: boolean,
): { points: CadPoint[]; bulges: number[] } | undefined {
  let points: CadPoint[], bulges: number[];
  if (entity.type === 'line') {
    points = [entity.a, entity.b];
    bulges = [0, 0];
  } else if (isPolyline(entity) && !entity.closed) {
    points = entity.points;
    bulges = entity.points.map((_, i) => entity.bulges?.[i] ?? 0);
  } else return;
  const joinAtStart = distance(points[0]!, join) < distance(points.at(-1)!, join);
  if (joinAtStart === endsAtJoin) {
    const old = bulges;
    points = [...points].reverse();
    bulges = points.map((_, i) => (i < points.length - 1 ? -(old[old.length - 2 - i] ?? 0) : 0));
  }
  return { points: [...points], bulges: [...bulges] };
}
export function applyCornerPicks(
  first: CornerPick,
  second: CornerPick,
  pointA: CadPoint,
  pointB: CadPoint,
  solution: CornerSolution,
  trim: boolean,
): CornerEdit | undefined {
  if (!trim)
    return {
      replacements: [],
      eraseIds: [],
      ...(solution.connector ? { connector: solution.connector } : {}),
    };
  if (first.owner.id === second.owner.id) {
    const combined = samePolyline(first, second, solution, pointA, pointB);
    return combined ? { replacements: [combined], eraseIds: [first.owner.id] } : undefined;
  }
  const a = isPolyline(first.owner)
      ? trimPolyline(first, solution.first, pointA)
      : trimAt(first.owner, solution.first, pointA),
    b = isPolyline(second.owner)
      ? trimPolyline(second, solution.second, pointB)
      : trimAt(second.owner, solution.second, pointB);
  if (!a || !b) return;
  if (isPolyline(a) || isPolyline(b)) {
    const left = path(a, solution.first, true),
      right = path(b, solution.second, false),
      base = isPolyline(a) ? a : isPolyline(b) ? b : undefined;
    if (!left || !right || !base) return;
    const points = [...left.points],
      bulges = [...left.bulges];
    if (solution.connector) {
      bulges[bulges.length - 1] = connectorBulge(solution);
      points.push(...right.points);
      bulges.push(...right.bulges);
    } else {
      points.push(...right.points.slice(1));
      bulges.splice(-1, 1, ...right.bulges);
    }
    return {
      replacements: [polyline(base, points, bulges)],
      eraseIds: [first.owner.id, second.owner.id],
    };
  }
  const replacements = [a, b].filter((e, i) => e !== (i ? second.owner : first.owner));
  return {
    replacements,
    eraseIds: replacements.map((e) => e.id),
    ...(solution.connector ? { connector: solution.connector } : {}),
  };
}
