import {
  cross3,
  dot3,
  geometryEvaluation,
  magnitude3,
  objectAxes,
  transformPoint3,
} from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';
import { adaptivePoints, curveBreaks } from './curves';
import { clipInfinite } from './infinite';
import { polylineJointTriangles, polylineSegments } from './polyline';
import type { DisplayPolyline, GeometrySink, TessellationOptions, Vec2 } from './types';

/** Projection happens after 3D width offsets and affine transforms. */
export function tessellateNativeCurve(
  curve: CurveGeometry,
  sink: GeometrySink,
  options: TessellationOptions,
  project: (point: Vec3) => Vec2 = (point) => point,
): void {
  if (curve.type === 'TRANSFORMED') {
    tessellateNativeCurve(curve.source, sink, options, (point) =>
      project(transformPoint3(curve.matrix, point)),
    );
    return;
  }
  if (curve.type === 'POINT') {
    const point = project(curve.position);
    sink.point(point.x, point.y);
    return;
  }
  if (curve.type === 'XLINE' || curve.type === 'RAY') {
    if (!options.view) return;
    const base = project(curve.basePoint),
      end = project({
        x: curve.basePoint.x + curve.direction.x,
        y: curve.basePoint.y + curve.direction.y,
        z: curve.basePoint.z + curve.direction.z,
      });
    const clipped = clipInfinite(
      {
        type: curve.type === 'XLINE' ? 'xline' : 'ray',
        basePoint: base,
        direction: { x: end.x - base.x, y: end.y - base.y },
      },
      options.view,
    );
    if (clipped) emit([clipped.start, clipped.end], false, sink);
    return;
  }
  if (curve.type === 'POLYLINE' || curve.type === 'LWPOLYLINE') {
    const count = curve.vertices.length - (curve.closed ? 0 : 1);
    const samples = Array.from({ length: count }, (_, i) => {
      const segment = {
        ...curve,
        vertices: [curve.vertices[i]!, curve.vertices[(i + 1) % curve.vertices.length]!],
        closed: false,
      };
      let distance = 0;
      return adaptivePoints(
        (t) => project(geometryEvaluation(segment, t).point),
        [0, 1],
        options.tolerance,
        options.maxSegments,
      ).map((sample, index, all) => {
        if (index)
          distance += Math.hypot(
            sample.point.x - all[index - 1]!.point.x,
            sample.point.y - all[index - 1]!.point.y,
          );
        return { ...sample, distance };
      });
    });
    const lengths = samples.map((points) => points.at(-1)?.distance ?? 0),
      offsets = [0];
    for (const length of lengths) offsets.push(offsets.at(-1)! + length);
    const total = offsets.at(-1)!,
      continuous = options.plinegen ?? false;
    const distanceAt = (segment: number, parameter: number): number => {
      const points = samples[segment]!;
      let low = 0,
        high = points.length - 1;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (points[middle]!.parameter < parameter) low = middle + 1;
        else high = middle;
      }
      const after = low;
      if (after === 0) return 0;
      const a = points[after - 1]!,
        b = points[after]!;
      return (
        a.distance +
        ((b.distance - a.distance) * (parameter - a.parameter)) / (b.parameter - a.parameter)
      );
    };
    let open = false;
    for (let i = 0; i < count; i++) {
      const a = curve.vertices[i]!,
        b = curve.vertices[(i + 1) % curve.vertices.length]!;
      const segment = { ...curve, vertices: [a, b], closed: false };
      const points = samples[i]!,
        length = continuous ? total : lengths[i]!,
        offset = continuous ? offsets[i]! : 0;
      const wide = !curve.is3D && (a.startWidth > 0 || a.endWidth > 0);
      if (wide) {
        if (open) {
          sink.endRun(false);
          open = false;
        }
        const side = (t: number, sign: number): Vec2 => {
          const { point, derivative } = geometryEvaluation(segment, t);
          const normal = cross3(curve.normal, derivative),
            length = magnitude3(normal);
          const half = (a.startWidth + (a.endWidth - a.startWidth) * t) / 2;
          return project({
            x: point.x + (length ? (normal.x / length) * half * sign : 0),
            y: point.y + (length ? (normal.y / length) * half * sign : 0),
            z: point.z + (length ? (normal.z / length) * half * sign : 0),
          });
        };
        const parameters = [
          ...new Set(
            [-1, 1].flatMap((sign) =>
              adaptivePoints(
                (t) => side(t, sign),
                [0, 1],
                options.tolerance,
                options.maxSegments,
              ).map(({ parameter }) => parameter),
            ),
          ),
        ].sort((a, b) => a - b);
        const top: Vec2[] = [],
          bottom: Vec2[] = [];
        for (let j = 1; j < parameters.length; j++) {
          const low = parameters[j - 1]!,
            high = parameters[j]!;
          const p = side(low, 1),
            q = side(low, -1),
            r = side(high, -1),
            s = side(high, 1);
          if (options.fillmode === false) {
            if (j === 1) {
              top.push(p);
              bottom.push(q);
            }
            top.push(s);
            bottom.push(r);
          } else {
            const dl = offset + distanceAt(i, low),
              dh = offset + distanceAt(i, high);
            sink.triangle(p, q, r, { distances: [dl, dl, dh], length });
            sink.triangle(p, r, s, { distances: [dl, dh, dh], length });
          }
        }
        if (top.length) {
          const distances = parameters.map((parameter) => offset + distanceAt(i, parameter));
          emitMeasured(top, distances, length, sink);
          emitMeasured(bottom, distances, length, sink);
          const previous = curve.vertices[(i + count - 1) % count]!,
            next = curve.vertices[(i + 1) % curve.vertices.length]!;
          if ((i === 0 && !curve.closed) || previous.endWidth === 0)
            emitMeasured([top[0]!, bottom[0]!], [distances[0]!, distances[0]!], length, sink);
          if ((i === count - 1 && !curve.closed) || next.startWidth === 0)
            emitMeasured(
              [top.at(-1)!, bottom.at(-1)!],
              [distances.at(-1)!, distances.at(-1)!],
              length,
              sink,
            );
        }
      } else if (continuous) {
        const continuing = open;
        if (!open) {
          sink.beginRun(total);
          open = true;
        }
        for (let index = continuing ? 1 : 0; index < points.length; index++) {
          const sample = points[index]!;
          sink.vertex(sample.point.x, sample.point.y, offset + sample.distance);
        }
      } else
        emit(
          points.map(({ point }) => point),
          false,
          sink,
        );
    }
    if (open) sink.endRun(curve.closed);
    if (!curve.is3D) {
      const axes = objectAxes(curve.normal),
        origin = curve.vertices[0]!.position;
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
            vertex.bulge,
            vertex.startWidth,
            vertex.endWidth,
          ],
          i * 5,
        );
      });
      const fromLocal = (value: Vec2) =>
        project({
          x: origin.x + axes.x.x * value.x + axes.y.x * value.y,
          y: origin.y + axes.x.y * value.x + axes.y.y * value.y,
          z: origin.z + axes.x.z * value.x + axes.y.z * value.y,
        });
      polylineJointTriangles(polylineSegments(local), curve.closed, (triangle, beforeSegment) => {
        const a = fromLocal(triangle[0]),
          b = fromLocal(triangle[1]),
          c = fromLocal(triangle[2]);
        const distance = continuous ? offsets[beforeSegment + 1]! : lengths[beforeSegment]!;
        const length = continuous ? total : lengths[beforeSegment]!;
        if (options.fillmode === false)
          emitMeasured([a, b, c], [distance, distance, distance], length, sink);
        else sink.triangle(a, b, c, { distances: [distance, distance, distance], length });
      });
    }
    return;
  }
  const points = adaptivePoints(
    (t) => project(geometryEvaluation(curve, t).point),
    curveBreaks(curve),
    options.tolerance,
    options.maxSegments,
  );
  const closed =
    curve.type === 'CIRCLE' ||
    (curve.type === 'ELLIPSE' && Math.abs(curve.sweepParameter) >= Math.PI * 2 - 1e-12) ||
    (curve.type === 'SPLINE' && curve.closed);
  emit(
    points.map(({ point }) => point),
    closed,
    sink,
  );
}
function emitMeasured(
  points: readonly Vec2[],
  distances: readonly number[],
  length: number,
  sink: GeometrySink,
): void {
  if (points.length < 2) return;
  sink.beginRun(length);
  points.forEach((point, index) => sink.vertex(point.x, point.y, distances[index]!));
  sink.endRun(false);
}
function emit(points: readonly Vec2[], closed: boolean, sink: GeometrySink): void {
  if (points.length < 2) return;
  sink.beginRun();
  let distance = 0;
  points.forEach((point, index) => {
    if (index)
      distance += Math.hypot(point.x - points[index - 1]!.x, point.y - points[index - 1]!.y);
    sink.vertex(point.x, point.y, distance);
  });
  sink.endRun(closed);
}
