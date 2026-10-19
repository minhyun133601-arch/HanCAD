import { arcAt, arcSegmentCount, visibleArcIntervals } from './curves';
import { clipInfinite } from './infinite';
import { tessellateNativeCurve } from './native-curve';
import { pointSymbolGeometry } from './point-symbols';
import {
  polylineJointTriangles,
  polylineSegments,
  segmentAt,
  segmentLength,
  segmentTriangles,
} from './polyline';
import type {
  DisplayArc,
  DisplayGeometry,
  GeometryCollection,
  GeometrySink,
  TessellationOptions,
  Vec2,
} from './types';

export function tessellateGeometry(
  geometry: DisplayGeometry,
  sink: GeometrySink,
  options: TessellationOptions,
): void {
  if (!(options.tolerance > 0) || !Number.isFinite(options.tolerance))
    throw new Error('Invalid chord tolerance');
  switch (geometry.type) {
    case 'line': {
      const length = Math.hypot(
        geometry.end.x - geometry.start.x,
        geometry.end.y - geometry.start.y,
      );
      sink.beginRun(length);
      sink.vertex(geometry.start.x, geometry.start.y, 0);
      sink.vertex(geometry.end.x, geometry.end.y, length);
      sink.endRun(false);
      return;
    }
    case 'arc':
      emitArc(geometry, sink, options);
      return;
    case 'point': {
      const symbol = pointSymbolGeometry(geometry.position, options);
      if (symbol.type !== 'composite') return;
      for (const part of symbol.parts) {
        if (part.type === 'point') sink.point(part.position.x, part.position.y);
        else tessellateGeometry(part, sink, options);
      }
      return;
    }
    case 'text':
      sink.text(geometry);
      return;
    case 'xline':
    case 'ray': {
      if (!options.view) return;
      const clipped = clipInfinite(geometry, options.view);
      if (clipped) tessellateGeometry(clipped, sink, options);
      return;
    }
    case 'curve':
      tessellateNativeCurve(geometry.curve, sink, options);
      return;
    case 'composite':
      for (const part of geometry.parts) tessellateGeometry(part, sink, options);
      if (!geometry.fillControlled || options.fillmode !== false)
        for (const [a, b, c] of geometry.triangles) sink.triangle(a, b, c);
      return;
    case 'polyline': {
      const segments = polylineSegments(geometry),
        continuous = options.plinegen ?? false;
      const total = segments.reduce((sum, segment) => sum + segmentLength(segment), 0);
      let offset = 0,
        open = false;
      for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
        const segment = segments[segmentIndex]!;
        const wide = segment.startWidth > 0 || segment.endWidth > 0;
        if (wide) {
          if (open) {
            sink.endRun(false);
            open = false;
          }
          const triangles = segmentTriangles(segment, options.tolerance, options.maxSegments);
          if (options.fillmode === false) {
            // Adjacent strip triangles share their diagonal; display just the ribbon boundary.
            const top: Vec2[] = [],
              bottom: Vec2[] = [];
            for (let i = 0; i < triangles.length; i += 2) {
              const [a, b, c] = triangles[i]!,
                d = triangles[i + 1]![2];
              if (!i) {
                top.push(a);
                bottom.push(b);
              }
              top.push(d);
              bottom.push(c);
            }
            const length = segmentLength(segment),
              hint = continuous ? total : length;
            const distances = top.map(
              (_, index) => (continuous ? offset : 0) + (length * index) / (top.length - 1),
            );
            emitMeasuredRun(top, distances, hint, sink);
            emitMeasuredRun(bottom, distances, hint, sink);
            const previous = segments[(segmentIndex + segments.length - 1) % segments.length]!;
            const next = segments[(segmentIndex + 1) % segments.length]!;
            if ((segmentIndex === 0 && !geometry.closed) || previous.endWidth === 0)
              emitMeasuredRun([top[0]!, bottom[0]!], [distances[0]!, distances[0]!], hint, sink);
            if ((segmentIndex === segments.length - 1 && !geometry.closed) || next.startWidth === 0)
              emitMeasuredRun(
                [top.at(-1)!, bottom.at(-1)!],
                [distances.at(-1)!, distances.at(-1)!],
                hint,
                sink,
              );
          } else {
            const length = segmentLength(segment),
              intervals = triangles.length / 2;
            for (let index = 0; index < triangles.length; index++) {
              const low = (continuous ? offset : 0) + (length * Math.floor(index / 2)) / intervals;
              const high =
                (continuous ? offset : 0) + (length * (Math.floor(index / 2) + 1)) / intervals;
              const triangle = triangles[index]!;
              sink.triangle(triangle[0], triangle[1], triangle[2], {
                distances: index % 2 ? [low, high, high] : [low, low, high],
                length: continuous ? total : length,
              });
            }
          }
        } else {
          const length = segmentLength(segment),
            curve = segment.geometry;
          const continuing = continuous && open;
          if (!continuous || !open) {
            sink.beginRun(continuous ? total : length);
            open = true;
          }
          const count =
            curve.type === 'arc'
              ? arcSegmentCount(
                  curve.radius,
                  curve.sweepAngle,
                  options.tolerance,
                  options.maxSegments,
                )
              : 1;
          for (let i = continuing ? 1 : 0; i <= count; i++) {
            const point = segmentAt(segment, i / count).point;
            sink.vertex(point.x, point.y, (continuous ? offset : 0) + (length * i) / count);
          }
          if (!continuous) {
            sink.endRun(false);
            open = false;
          }
        }
        offset += segmentLength(segment);
      }
      if (open) sink.endRun(geometry.closed);
      const offsets = [0];
      for (const segment of segments) offsets.push(offsets.at(-1)! + segmentLength(segment));
      polylineJointTriangles(segments, geometry.closed, (triangle, beforeSegment) => {
        const length = segmentLength(segments[beforeSegment]!);
        const distance = continuous ? offsets[beforeSegment + 1]! : length;
        if (options.fillmode === false)
          emitMeasuredRun(
            triangle,
            [distance, distance, distance],
            continuous ? total : length,
            sink,
          );
        else {
          sink.triangle(triangle[0], triangle[1], triangle[2], {
            distances: [distance, distance, distance],
            length: continuous ? total : length,
          });
        }
      });
    }
  }
}
function emitArc(arc: DisplayArc, sink: GeometrySink, options: TessellationOptions): void {
  const length = Math.abs(arc.radius * arc.sweepAngle),
    cap = options.maxSegments ?? 8192;
  const fullCount = arcSegmentCount(
    arc.radius,
    arc.sweepAngle,
    options.tolerance,
    Number.MAX_SAFE_INTEGER,
  );
  const view = options.view;
  const intervals =
    fullCount > cap && view
      ? visibleArcIntervals(arc, {
          minX: view.minX - options.tolerance,
          minY: view.minY - options.tolerance,
          maxX: view.maxX + options.tolerance,
          maxY: view.maxY + options.tolerance,
        })
      : ([[0, 1]] as [number, number][]);
  for (const [low, high] of intervals) {
    const count = arcSegmentCount(
      arc.radius,
      arc.sweepAngle * (high - low),
      options.tolerance,
      cap,
    );
    sink.beginRun(length);
    for (let i = 0; i <= count; i++) {
      const t = low + ((high - low) * i) / count,
        point = arcAt(arc, t);
      sink.vertex(point.x, point.y, length * t);
    }
    sink.endRun(low === 0 && high === 1 && Math.abs(arc.sweepAngle) >= Math.PI * 2 - 1e-12);
  }
}
function emitMeasuredRun(
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
export function collectGeometry(
  geometry: DisplayGeometry,
  options: TessellationOptions,
): GeometryCollection {
  const result: GeometryCollection = {
    runs: [],
    points: [],
    triangles: [],
    triangleRuns: [],
    texts: [],
  };
  let vertices: number[] = [],
    hint: number | undefined;
  tessellateGeometry(
    geometry,
    {
      beginRun: (length) => {
        vertices = [];
        hint = length;
      },
      vertex: (x, y, distance) => vertices.push(x, y, distance),
      endRun: (closed) => {
        if (vertices.length >= 6)
          result.runs.push({
            vertices: new Float64Array(vertices),
            length: hint ?? vertices.at(-1) ?? 0,
            closed,
          });
      },
      point: (x, y) => result.points.push({ x, y }),
      triangle: (a, b, c, run) => {
        result.triangles.push([a, b, c]);
        result.triangleRuns.push(run);
      },
      text: (text) => result.texts.push(text),
    },
    options,
  );
  return result;
}
