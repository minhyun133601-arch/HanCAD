import { collectGeometry } from '../display/tessellate';
import { boundsOfGeometry } from '../display/bounds';
import type {
  Bounds2,
  DisplayEntity,
  DisplayText,
  TessellationOptions,
  Vec2,
} from '../display/types';
import { clipPolygon, clipSegment } from './clip';
import { encodeDashSegment } from './dash-distance';
import { measuredFill } from './measured-fill';
import type { DashPattern } from './measured-fill';

export interface MeshData {
  origin: Vec2;
  bounds: Bounds2;
  lines: Float32Array;
  wide: Float32Array;
  fills: Float32Array;
  points?: Float32Array;
  entities: number;
  texts?: { text: DisplayText; slot: number }[];
  viewDependent?: boolean;
}
export interface SlottedEntity {
  entity: DisplayEntity;
  slot: number;
}
export interface MeshOptions extends TessellationOptions {
  dash?: (entity: DisplayEntity) => DashPattern | undefined;
  /** Resolved maximum screen half-width plus antialias fringe, in model units. */
  strokePadding?: number;
}
export function expandStrokeView(view: Bounds2, padding: number): Bounds2 {
  return {
    minX: view.minX - padding,
    minY: view.minY - padding,
    maxX: view.maxX + padding,
    maxY: view.maxY + padding,
  };
}

/** Coordinates are translated in double precision before the float32 conversion. */
export function buildMesh(entries: readonly SlottedEntity[], options: MeshOptions): MeshData {
  const bounds: Bounds2 = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { entity } of entries) {
    const box = boundsOfGeometry(entity.geometry, options);
    if (!box || !Number.isFinite(box.minX)) continue;
    bounds.minX = Math.min(bounds.minX, box.minX);
    bounds.minY = Math.min(bounds.minY, box.minY);
    bounds.maxX = Math.max(bounds.maxX, box.maxX);
    bounds.maxY = Math.max(bounds.maxY, box.maxY);
  }
  if (!Number.isFinite(bounds.minX))
    Object.assign(bounds, options.view ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 });
  const view = options.view;
  const strokeView = view ? expandStrokeView(view, options.strokePadding ?? 0) : undefined;
  const precise = Boolean(
    view &&
    Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 2 ** -22 > options.tolerance,
  );
  const reference = precise && view ? view : bounds;
  const origin = {
    x: reference.minX + (reference.maxX - reference.minX) / 2,
    y: reference.minY + (reference.maxY - reference.minY) / 2,
  };
  let viewDependent = precise;
  const lines: number[] = [],
    wide: number[] = [],
    fills: number[] = [];
  const points: number[] = [];
  const texts: { text: DisplayText; slot: number }[] = [];
  const vertex = (out: number[], x: number, y: number, d: number, length: number, slot: number) =>
    out.push(x - origin.x, y - origin.y, d, length, slot);
  for (const { entity, slot } of entries) {
    const dash = options.dash?.(entity);
    viewDependent ||=
      entity.geometry.type === 'xline' ||
      entity.geometry.type === 'ray' ||
      (entity.geometry.type === 'arc' &&
        Math.abs(entity.geometry.sweepAngle) *
          Math.sqrt(entity.geometry.radius / options.tolerance) >
          8192);
    const collection = collectGeometry(entity.geometry, {
      ...options,
      ...(strokeView ? { view: strokeView } : {}),
      plinegen: entity.plinegen,
    });
    texts.push(...collection.texts.map((text) => ({ text, slot })));
    for (const run of collection.runs) {
      const v = run.vertices;
      for (let i = 3; i < v.length; i += 3) {
        let ax = v[i - 3]!,
          ay = v[i - 2]!,
          bx = v[i]!,
          by = v[i + 1]!,
          da = v[i - 1]!,
          db = v[i + 2]!;
        if ((precise || (dash && db - da > options.tolerance * 2 ** 20)) && strokeView) {
          viewDependent = true;
          const clipped = clipSegment({ x: ax, y: ay }, { x: bx, y: by }, strokeView);
          if (!clipped) continue;
          const [low, high] = clipped,
            dx = bx - ax,
            dy = by - ay,
            dd = db - da;
          bx = ax + dx * high;
          by = ay + dy * high;
          db = da + dd * high;
          ax += dx * low;
          ay += dy * low;
          da += dd * low;
        }
        const pieces = dash
          ? encodeDashSegment(
              Math.max(0, da),
              Math.min(run.length, db),
              run.length,
              dash.length,
              dash.first,
              { maxLocalDistance: options.tolerance * 2 ** 20 },
            )
          : [{ from: 0, to: 1, start: da, end: db, patterned: false }];
        for (const piece of pieces) {
          const x1 = ax + (bx - ax) * piece.from,
            y1 = ay + (by - ay) * piece.from,
            x2 = ax + (bx - ax) * piece.to,
            y2 = ay + (by - ay) * piece.to;
          const length = dash ? (piece.patterned ? -1 : 0) : run.length;
          vertex(lines, x1, y1, piece.start, length, slot);
          vertex(lines, x2, y2, piece.end, length, slot);
          wide.push(
            x1 - origin.x,
            y1 - origin.y,
            x2 - origin.x,
            y2 - origin.y,
            piece.start,
            length,
            slot,
            piece.end,
          );
        }
      }
    }
    for (const p of collection.points) {
      vertex(points, p.x, p.y, 0, 0, slot);
    }
    for (let index = 0; index < collection.triangles.length; index++) {
      const triangle = collection.triangles[index]!,
        run = collection.triangleRuns[index];
      if (dash && run) {
        viewDependent = true;
        for (const piece of measuredFill(triangle, run, dash, options.tolerance, view))
          for (let i = 1; i + 1 < piece.points.length; i++)
            for (const p of [piece.points[0]!, piece.points[i]!, piece.points[i + 1]!])
              vertex(fills, p.x, p.y, p.distance, piece.length, slot);
        continue;
      }
      const polygon = precise && view ? clipPolygon(triangle, view) : triangle;
      for (let i = 1; i + 1 < polygon.length; i++)
        for (const p of [polygon[0]!, polygon[i]!, polygon[i + 1]!])
          vertex(fills, p.x, p.y, 0, 0, slot);
    }
  }
  return {
    origin,
    bounds,
    lines: new Float32Array(lines),
    wide: new Float32Array(wide),
    fills: new Float32Array(fills),
    points: new Float32Array(points),
    entities: entries.length,
    texts,
    viewDependent,
  };
}
