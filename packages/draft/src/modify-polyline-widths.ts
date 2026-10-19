import type { CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { distance, difference } from './draw-curve-helpers';
import { bulgeSupport } from './modify-offset-polyline';
import { cross, dot } from './modify-corner-math';
import { preservePolylineElevation } from './modify-polyline-elevation';

/** Carry widths by source supporting segment; gap connectors bridge the adjacent endpoint widths. */
export function remapPolylineWidths(source: CadPolyline, output: CadPolyline): CadPolyline {
  output = preservePolylineElevation(source, output);
  if (!source.startWidths && !source.endWidths) return output;
  const count = output.points.length,
    oldCount = source.closed ? source.points.length : source.points.length - 1,
    segments = output.closed ? count : count - 1;
  const sourceSupports = Array.from({ length: oldCount }, (_, i) =>
    bulgeSupport(
      source.points[i]!,
      source.points[(i + 1) % source.points.length]!,
      source.bulges?.[i] ?? 0,
    ),
  );
  const starts = Array<number>(count).fill(0),
    ends = Array<number>(count).fill(0),
    matched = Array<boolean>(segments).fill(false);
  const nonzero = [...(source.startWidths ?? []), ...(source.endWidths ?? [])].some((v) => v !== 0);
  if (nonzero)
    for (let i = 0; i < segments; i++) {
      const a = output.points[i]!,
        b = output.points[(i + 1) % count]!,
        support = bulgeSupport(a, b, output.bulges?.[i] ?? 0);
      let best = -1,
        error = Infinity;
      sourceSupports.forEach((original, index) => {
        let residual = Infinity;
        if (original.kind === 'line' && support.kind === 'line')
          residual = Math.abs(cross(original.direction, support.direction));
        else if (original.kind === 'circle' && support.kind === 'circle')
          residual = distance(original.center, support.center) / Math.max(1, original.radius);
        if (residual < error) {
          error = residual;
          best = index;
        }
      });
      if (best < 0 || error > 1e-7) continue;
      // Parallel edges can share orientation; choose the closest source support of that orientation.
      if (support.kind === 'line') {
        let nearest = Infinity;
        sourceSupports.forEach((original, index) => {
          if (
            original.kind !== 'line' ||
            Math.abs(cross(original.direction, support.direction)) > 1e-7
          )
            return;
          const d = Math.abs(cross(difference(a, original.a), original.direction));
          if (d < nearest) {
            nearest = d;
            best = index;
          }
        });
      }
      const original = sourceSupports[best]!,
        start = source.points[best]!,
        end = source.points[(best + 1) % source.points.length]!,
        w0 = source.startWidths?.[best] ?? source.constantWidth ?? 0,
        w1 = source.endWidths?.[best] ?? source.constantWidth ?? 0;
      const at = (point: CadPoint): number => {
        let t: number;
        if (original.kind === 'line')
          t = dot(difference(point, start), original.direction) / distance(start, end);
        else {
          const angle =
              Math.atan2(point.y - original.center.y, point.x - original.center.x) -
              Math.atan2(start.y - original.center.y, start.x - original.center.x),
            sweep = 4 * Math.atan(source.bulges?.[best] ?? 0),
            tau = 2 * Math.PI;
          t = ((((angle * Math.sign(sweep)) % tau) + tau) % tau) / Math.abs(sweep);
        }
        return w0 + (w1 - w0) * Math.max(0, Math.min(1, t));
      };
      starts[i] = at(a);
      ends[i] = at(b);
      matched[i] = true;
    }
  if (nonzero)
    for (let i = 0; i < segments; i++)
      if (!matched[i]) {
        let before = -1,
          after = -1;
        for (let step = 1; step < segments; step++) {
          const prior = (i - step + segments) % segments,
            next = (i + step) % segments;
          if (before < 0 && matched[prior]) before = prior;
          if (after < 0 && matched[next]) after = next;
        }
        starts[i] = before >= 0 ? ends[before]! : after >= 0 ? starts[after]! : 0;
        ends[i] = after >= 0 ? starts[after]! : starts[i]!;
      }
  const result = { ...output, startWidths: starts, endWidths: ends };
  if (result.curve?.type === 'LWPOLYLINE' || result.curve?.type === 'POLYLINE')
    result.curve = {
      ...result.curve,
      vertices: result.curve.vertices.map((v, i) => ({
        ...v,
        startWidth: starts[i]!,
        endWidth: ends[i]!,
      })),
    };
  return result;
}
