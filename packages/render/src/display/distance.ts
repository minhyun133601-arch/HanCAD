import {
  cross3,
  dot3,
  geometryEvaluation,
  magnitude3,
  objectAxes,
  transformPoint3,
} from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';
import { arcAt, arcParameterAtPoint, curveBreaks } from './curves';
import { pointSymbolGeometry } from './point-symbols';
import {
  polylineJointTriangles,
  polylineSegments,
  segmentSide,
  segmentTriangles,
} from './polyline';
import { textLocalBox } from './text';
import type {
  DisplayGeometry,
  DisplayPolyline,
  DisplayTriangle,
  TessellationOptions,
  Vec2,
} from './types';

export function pointDistance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function lineDistance(
  point: Vec2,
  start: Vec2,
  end: Vec2,
  extent: 'segment' | 'ray' | 'infinite' = 'segment',
): number {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    denominator = dx * dx + dy * dy;
  let t = denominator ? ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator : 0;
  if (extent !== 'infinite') t = Math.max(0, t);
  if (extent === 'segment') t = Math.min(1, t);
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}
export function triangleDistance(point: Vec2, triangle: DisplayTriangle): number {
  const [a, b, c] = triangle;
  const cross = (p: Vec2, q: Vec2) =>
    (p.x - point.x) * (q.y - point.y) - (p.y - point.y) * (q.x - point.x);
  const ab = cross(a, b),
    bc = cross(b, c),
    ca = cross(c, a);
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (area !== 0 && ((ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0))) return 0;
  return Math.min(lineDistance(point, a, b), lineDistance(point, b, c), lineDistance(point, c, a));
}
export function numericalCurveDistance(
  point: Vec2,
  evaluate: (t: number) => Vec2,
  breaks: readonly number[],
): number {
  let best = Infinity;
  for (let i = 1; i < breaks.length; i++) {
    const start = breaks[i - 1]!,
      step = (breaks[i]! - start) / 32;
    const distances = Array.from({ length: 33 }, (_, index) =>
      pointDistance(point, evaluate(start + step * index)),
    );
    best = Math.min(best, ...distances);
    // Refine only brackets around sampled local minima; knot boundaries remain candidates.
    for (let span = 0; span <= 32; span++) {
      const value = distances[span]!,
        before = distances[span - 1] ?? Infinity,
        after = distances[span + 1] ?? Infinity;
      if (value > before || value > after || (value === before && value === after)) continue;
      let low = start + step * Math.max(0, span - 1);
      let high = start + step * Math.min(32, span + 1);
      const ratio = (Math.sqrt(5) - 1) / 2;
      let a = high - ratio * (high - low),
        b = low + ratio * (high - low);
      let da = pointDistance(point, evaluate(a)),
        db = pointDistance(point, evaluate(b));
      for (let step = 0; step < 42; step++) {
        if (da <= db) {
          high = b;
          b = a;
          db = da;
          a = high - ratio * (high - low);
          da = pointDistance(point, evaluate(a));
        } else {
          low = a;
          a = b;
          da = db;
          b = low + ratio * (high - low);
          db = pointDistance(point, evaluate(b));
        }
      }
      best = Math.min(best, da, db);
    }
  }
  return best;
}
/** Analytic for primitive geometry; arbitrary projected NURBS use numerical minimization. */
export function distanceToGeometry(
  geometry: DisplayGeometry,
  point: Vec2,
  options: Partial<TessellationOptions> = {},
): number {
  switch (geometry.type) {
    case 'line':
      return lineDistance(point, geometry.start, geometry.end);
    case 'xline':
    case 'ray':
      return lineDistance(
        point,
        geometry.basePoint,
        {
          x: geometry.basePoint.x + geometry.direction.x,
          y: geometry.basePoint.y + geometry.direction.y,
        },
        geometry.type === 'ray' ? 'ray' : 'infinite',
      );
    case 'arc': {
      const parameter = arcParameterAtPoint(geometry, point);
      return parameter <= 1 + 1e-14
        ? geometry.startPoint
          ? pointDistance(point, arcAt(geometry, Math.min(parameter, 1)))
          : Math.abs(pointDistance(point, geometry.center) - geometry.radius)
        : Math.min(
            pointDistance(point, arcAt(geometry, 0)),
            pointDistance(point, arcAt(geometry, 1)),
          );
    }
    case 'point': {
      const symbol = pointSymbolGeometry(geometry.position, options);
      if (symbol.type !== 'composite') return Infinity;
      return symbol.parts.reduce(
        (best, part) =>
          Math.min(
            best,
            part.type === 'point'
              ? pointDistance(point, part.position)
              : distanceToGeometry(part, point, options),
          ),
        Infinity,
      );
    }
    case 'text': {
      const dx = point.x - geometry.position.x,
        dy = point.y - geometry.position.y;
      const x = dx * Math.cos(geometry.rotation) + dy * Math.sin(geometry.rotation);
      const y = -dx * Math.sin(geometry.rotation) + dy * Math.cos(geometry.rotation),
        box = textLocalBox(geometry);
      return Math.hypot(
        Math.max(box.minX - x, 0, x - box.maxX),
        Math.max(box.minY - y, 0, y - box.maxY),
      );
    }
    case 'composite': {
      let best = Infinity;
      for (const part of geometry.parts)
        best = Math.min(best, distanceToGeometry(part, point, options));
      for (const triangle of geometry.triangles)
        best = Math.min(best, triangleDistance(point, triangle));
      return best;
    }
    case 'polyline': {
      const segments = polylineSegments(geometry);
      let best = Infinity;
      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index]!;
        const startCap =
          (index === 0 && !geometry.closed) ||
          segments[(index + segments.length - 1) % segments.length]!.endWidth === 0;
        const endCap =
          (index === segments.length - 1 && !geometry.closed) ||
          segments[(index + 1) % segments.length]!.startWidth === 0;
        if (!segment.startWidth && !segment.endWidth)
          best = Math.min(best, distanceToGeometry(segment.geometry, point, options));
        else if (segment.geometry.type === 'line') {
          if (options.fillmode === false) {
            const a = segmentSide(segment, 0, 1),
              b = segmentSide(segment, 0, -1);
            const c = segmentSide(segment, 1, -1),
              d = segmentSide(segment, 1, 1);
            best = Math.min(
              best,
              startCap ? lineDistance(point, a, b) : Infinity,
              lineDistance(point, b, c),
              endCap ? lineDistance(point, c, d) : Infinity,
              lineDistance(point, d, a),
            );
          } else
            for (const triangle of segmentTriangles(segment, 1))
              best = Math.min(best, triangleDistance(point, triangle));
        } else {
          const arc = segment.geometry,
            t = arcParameterAtPoint(arc, point);
          const half = (segment.startWidth + (segment.endWidth - segment.startWidth) * t) / 2;
          if (t <= 1 && distanceToGeometry(arc, point) <= half && options.fillmode !== false)
            return 0;
          for (const side of [-1, 1])
            best = Math.min(
              best,
              numericalCurveDistance(
                point,
                (parameter) => segmentSide(segment, parameter, side),
                [0, 1],
              ),
            );
          best = Math.min(
            best,
            startCap || options.fillmode !== false
              ? lineDistance(point, segmentSide(segment, 0, 1), segmentSide(segment, 0, -1))
              : Infinity,
            endCap || options.fillmode !== false
              ? lineDistance(point, segmentSide(segment, 1, 1), segmentSide(segment, 1, -1))
              : Infinity,
          );
        }
      }
      for (const triangle of polylineJointTriangles(segments, geometry.closed))
        best = Math.min(
          best,
          options.fillmode === false
            ? Math.min(
                lineDistance(point, triangle[0], triangle[1]),
                lineDistance(point, triangle[1], triangle[2]),
              )
            : triangleDistance(point, triangle),
        );
      return best;
    }
    case 'curve':
      return nativeCurveDistance(geometry.curve, point, options);
  }
}

function nativeCurveDistance(
  curve: CurveGeometry,
  point: Vec2,
  options: Partial<TessellationOptions>,
  project: (point: Vec3) => Vec2 = (value) => value,
): number {
  if (curve.type === 'TRANSFORMED')
    return nativeCurveDistance(curve.source, point, options, (value) =>
      project(transformPoint3(curve.matrix, value)),
    );
  if (curve.type === 'POINT') return pointDistance(point, project(curve.position));
  if (curve.type === 'LINE') return lineDistance(point, project(curve.start), project(curve.end));
  if (curve.type === 'XLINE' || curve.type === 'RAY')
    return lineDistance(
      point,
      project(curve.basePoint),
      project({
        x: curve.basePoint.x + curve.direction.x,
        y: curve.basePoint.y + curve.direction.y,
        z: curve.basePoint.z + curve.direction.z,
      }),
      curve.type === 'RAY' ? 'ray' : 'infinite',
    );
  if (curve.type !== 'POLYLINE' && curve.type !== 'LWPOLYLINE')
    return numericalCurveDistance(
      point,
      (t) => project(geometryEvaluation(curve, t).point),
      curveBreaks(curve),
    );
  const axes = objectAxes(curve.normal),
    origin = curve.vertices[0]!.position;
  const fromLocal = (value: Vec2): Vec2 =>
    project({
      x: origin.x + axes.x.x * value.x + axes.y.x * value.y,
      y: origin.y + axes.x.y * value.x + axes.y.y * value.y,
      z: origin.z + axes.x.z * value.x + axes.y.z * value.y,
    });
  const local: DisplayPolyline = {
    type: 'polyline',
    closed: curve.closed,
    vertices: new Float64Array(curve.vertices.length * 5),
  };
  curve.vertices.forEach((vertex, i) => {
    const delta = {
      x: vertex.position.x - origin.x,
      y: vertex.position.y - origin.y,
      z: vertex.position.z - origin.z,
    };
    local.vertices.set(
      [
        dot3(delta, axes.x),
        dot3(delta, axes.y),
        curve.is3D ? 0 : vertex.bulge,
        curve.is3D ? 0 : vertex.startWidth,
        curve.is3D ? 0 : vertex.endWidth,
      ],
      i * 5,
    );
  });
  const base = fromLocal({ x: 0, y: 0 }),
    px = fromLocal({ x: 1, y: 0 }),
    py = fromLocal({ x: 0, y: 1 });
  const ax = px.x - base.x,
    ay = px.y - base.y,
    bx = py.x - base.x,
    by = py.y - base.y;
  const determinant = ax * by - ay * bx,
    dx = point.x - base.x,
    dy = point.y - base.y;
  if (
    !curve.is3D &&
    determinant &&
    options.fillmode !== false &&
    distanceToGeometry(
      local,
      {
        x: (dx * by - dy * bx) / determinant,
        y: (ax * dy - ay * dx) / determinant,
      },
      options,
    ) === 0
  )
    return 0;
  let best = Infinity;
  const count = curve.vertices.length - (curve.closed ? 0 : 1);
  for (let i = 0; i < count; i++) {
    const a = curve.vertices[i]!,
      b = curve.vertices[(i + 1) % curve.vertices.length]!;
    const startCap =
      (i === 0 && !curve.closed) || curve.vertices[(i + count - 1) % count]!.endWidth === 0;
    const endCap = (i === count - 1 && !curve.closed) || b.startWidth === 0;
    const segment = { ...curve, vertices: [a, b], closed: false };
    if (curve.is3D || (!a.startWidth && !a.endWidth)) {
      best = Math.min(
        best,
        a.bulge && !curve.is3D
          ? numericalCurveDistance(
              point,
              (t) => project(geometryEvaluation(segment, t).point),
              [0, 1],
            )
          : lineDistance(point, project(a.position), project(b.position)),
      );
      continue;
    }
    const side = (t: number, sign: number): Vec2 => {
      const evaluation = geometryEvaluation(segment, t),
        normal = cross3(curve.normal, evaluation.derivative);
      const length = magnitude3(normal),
        half = (a.startWidth + (a.endWidth - a.startWidth) * t) / 2;
      return project({
        x: evaluation.point.x + (length ? (normal.x / length) * half * sign : 0),
        y: evaluation.point.y + (length ? (normal.y / length) * half * sign : 0),
        z: evaluation.point.z + (length ? (normal.z / length) * half * sign : 0),
      });
    };
    for (const sign of [-1, 1])
      best = Math.min(
        best,
        numericalCurveDistance(point, (t) => side(t, sign), [0, 1]),
      );
    best = Math.min(
      best,
      startCap || options.fillmode !== false
        ? lineDistance(point, side(0, 1), side(0, -1))
        : Infinity,
      endCap || options.fillmode !== false
        ? lineDistance(point, side(1, 1), side(1, -1))
        : Infinity,
    );
  }
  for (const triangle of polylineJointTriangles(polylineSegments(local), curve.closed)) {
    const projected: DisplayTriangle = [
      fromLocal(triangle[0]),
      fromLocal(triangle[1]),
      fromLocal(triangle[2]),
    ];
    best = Math.min(
      best,
      options.fillmode === false
        ? Math.min(
            lineDistance(point, projected[0], projected[1]),
            lineDistance(point, projected[1], projected[2]),
          )
        : triangleDistance(point, projected),
    );
  }
  return best;
}
