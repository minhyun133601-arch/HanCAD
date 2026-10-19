import type { CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { drawEntity, drawPoint } from './draw-program';
import type { DrawContext, DrawProgram } from './draw-program';
import { length, outlineEditable, outlinePoint, outlineSourceStyle } from './draw-outline-common';
import { cloudDirectionReversed, cloudEntity } from './draw-cloud-geometry';
import type { CloudOptions } from './draw-cloud-geometry';

function nearest(points: readonly CadPoint[], point: CadPoint): number {
  let index = 0;
  for (let i = 1; i < points.length; i++)
    if (length(points[i]!, point) < length(points[index]!, point)) index = i;
  return index;
}
function route(points: readonly CadPoint[], a: number, b: number): CadPoint[] {
  const result = [{ ...points[a]! }];
  for (let i = (a + 1) % points.length; i !== (b + 1) % points.length; i = (i + 1) % points.length)
    result.push({ ...points[i]! });
  return result;
}
function routeDistance(points: readonly CadPoint[], point: CadPoint): number {
  let result = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!,
      b = points[i + 1]!,
      dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    result = Math.min(result, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
  }
  return result;
}
export function* modifyCloud(context: DrawContext, options: CloudOptions): DrawProgram {
  let source: CadPolyline | undefined, picked: CadPoint | undefined;
  while (!source) {
    const value = yield { kind: 'entity', ko: '폴리선 선택:', en: 'Select polyline:' };
    const entity = drawEntity(value);
    if (
      (entity?.type === 'polyline' || entity?.type === 'rect') &&
      entity.sourceType === 'REVCLOUD' &&
      entity.closed &&
      outlineEditable(context, entity)
    ) {
      source = entity;
      picked = drawPoint(value);
    }
  }
  context = outlineSourceStyle(context, source);
  options = {
    ...options,
    chord: source.cloudArcLength ?? options.chord,
    calligraphy: source.cloudStyle ? source.cloudStyle === 'Calligraphy' : options.calligraphy,
    variance: source.cloudVariance ?? options.variance,
    reversed: cloudDirectionReversed(source),
  };
  const old = source.cloudVertices ?? source.points,
    startIndex = nearest(old, picked ?? old[0]!);
  const replacement: CadPoint[] = [{ ...old[startIndex]! }];
  let endIndex = startIndex;
  while (true) {
    const point = yield* outlinePoint('다음 점 지정:', 'Specify next point:', {
      base: replacement.at(-1)!,
      preview: (p) => [cloudEntity(context, [...replacement, p], false, options)],
    });
    const index = nearest(old, point),
      closeEnough = length(old[index]!, point) <= Math.max(1e-9, options.chord / 10);
    if (closeEnough && index !== startIndex) {
      endIndex = index;
      replacement.push({ ...old[index]! });
      break;
    }
    replacement.push(point);
  }
  const forward = route(old, startIndex, endIndex),
    backward = route(old, endIndex, startIndex);
  const build = (pick: CadPoint) => {
    const eraseForward = routeDistance(forward, pick) <= routeDistance(backward, pick);
    const boundary = eraseForward
      ? [...replacement, ...backward.slice(1, -1)]
      : [...forward, ...replacement.slice(1, -1).reverse()];
    return cloudEntity(context, boundary, true, options);
  };
  const side = yield* outlinePoint('지울 쪽 선택:', 'Pick a side to erase:', {
    preview: (p) => [build(p)],
  });
  let entity = build(side);
  while (true) {
    const answer = yield {
      kind: 'keyword',
      ko: '방향을 반전시키시겠습니까? [예(Y)/아니오(N)] <아니오>:',
      en: 'Reverse direction [Yes/No] <No>:',
      preview: () => [entity],
    };
    if (typeof answer !== 'string') continue;
    const key = answer.trim().toUpperCase();
    if (key === 'Y' || key === 'YES') {
      entity = { ...entity, bulges: entity.bulges?.map((b) => -b) ?? [] };
      break;
    }
    if (key === '' || key === 'N' || key === 'NO') break;
  }
  return { entities: [entity], eraseIds: [source.id] };
}
