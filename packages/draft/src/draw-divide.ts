import { cross3, geometryEvaluation, geometryLength, magnitude3 } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { CadClipboardBlock, CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { parseDraftNumber } from './coordinates';
import { drawEntity, drawKeyword } from './draw-program';
import type { DrawContext, DrawProgram } from './draw-program';
import { drawNode } from './draw-basic';
import { legacyEntitySnapSources } from './snap-legacy-sources';
import { transformGripEntity } from './grip-transform';

/** Adaptive arc-length integration, split at corners before bisection. */
function lengthTo(curve: CurveGeometry, end: number): number {
  if (curve.type === 'LINE' || curve.type === 'ARC' || curve.type === 'CIRCLE')
    return geometryLength(curve) * end;
  const speed = (t: number) => magnitude3(geometryEvaluation(curve, t).derivative);
  const integrate = (
    a: number,
    b: number,
    fa: number,
    fm: number,
    fb: number,
    prior: number,
    depth: number,
  ): number => {
    const middle = (a + b) / 2,
      left = speed((a + middle) / 2),
      right = speed((middle + b) / 2);
    const l = ((middle - a) * (fa + 4 * left + fm)) / 6,
      r = ((b - middle) * (fm + 4 * right + fb)) / 6;
    if (!depth || Math.abs(l + r - prior) < 1e-11 * Math.max(1, l + r))
      return l + r + (l + r - prior) / 15;
    return (
      integrate(a, middle, fa, left, fm, l, depth - 1) +
      integrate(middle, b, fm, right, fb, r, depth - 1)
    );
  };
  const count =
    curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE'
      ? curve.vertices.length - (curve.closed ? 0 : 1)
      : 1;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const a = i / count,
      b = Math.min(end, (i + 1) / count);
    if (b <= a) break;
    const fa = speed(a + 1e-14),
      fb = speed(b - 1e-14),
      fm = speed((a + b) / 2);
    total += integrate(a, b, fa, fm, fb, ((b - a) * (fa + 4 * fm + fb)) / 6, 18);
  }
  return total;
}
export function parameterAtDrawDistance(curve: CurveGeometry, distance: number): number {
  const length = geometryLength(curve);
  if (!(distance > 0)) return 0;
  if (distance >= length) return 1;
  if (['LINE', 'ARC', 'CIRCLE'].includes(curve.type)) return distance / length;
  let low = 0,
    high = 1;
  for (let i = 0; i < 52; i++) {
    const middle = (low + high) / 2;
    if (lengthTo(curve, middle) < distance) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
function* intervals(context: DrawContext, measure: boolean): DrawProgram {
  let curve: CurveGeometry | undefined;
  let reversed = false;
  while (!curve) {
    const value = yield {
      kind: 'entity',
      ko: `${measure ? '길이를 지정할' : '등분할'} 객체 선택:`,
      en: `Select object to ${measure ? 'measure' : 'divide'}:`,
    };
    const entity = drawEntity(value);
    if (
      entity &&
      !['REGION', 'WIPEOUT', 'SOLID', 'TRACE', 'MLINE'].includes(entity.sourceType ?? '')
    ) {
      const candidate = legacyEntitySnapSources(entity)[0]?.geometry;
      if (
        candidate &&
        Number.isFinite(geometryLength(candidate)) &&
        geometryLength(candidate) > 1e-12
      ) {
        curve = candidate;
        const closed =
          curve.type === 'CIRCLE' ||
          (curve.type === 'ELLIPSE' && Math.abs(curve.sweepParameter) >= 2 * Math.PI - 1e-12) ||
          ('closed' in curve && curve.closed);
        if (curve.type === 'CIRCLE') {
          const angle = Number(context.get('SNAPANG')),
            normal = cross3(curve.normal, curve.xAxis),
            axis = curve.xAxis;
          curve = {
            ...curve,
            xAxis: {
              x: axis.x * Math.cos(angle) + normal.x * Math.sin(angle),
              y: axis.y * Math.cos(angle) + normal.y * Math.sin(angle),
              z: axis.z * Math.cos(angle) + normal.z * Math.sin(angle),
            },
          };
        } else if (measure && !closed && typeof value !== 'string' && 'entity' in value) {
          const first = geometryEvaluation(curve, 0).point,
            last = geometryEvaluation(curve, 1).point,
            p = value.point;
          reversed =
            Math.hypot(p.x - last.x, p.y + last.y) < Math.hypot(p.x - first.x, p.y + first.y);
        }
      }
    }
  }
  let block: CadClipboardBlock | undefined,
    align = false,
    spacing = 0,
    count = 0;
  for (;;) {
    const value = yield {
      kind: 'number',
      ko: measure ? '세그먼트 길이 지정 또는 [블록(B)]:' : '세그먼트 수 입력 또는 [블록(B)]:',
      en: measure
        ? 'Specify length of segment or [Block]:'
        : 'Enter number of segments or [Block]:',
    };
    const key = drawKeyword(value);
    if (key === 'B' || key === 'BLOCK') {
      while (!block) {
        const name = yield {
          kind: 'text',
          ko: '삽입할 블록 이름 입력:',
          en: 'Enter name of block to insert:',
        };
        if (typeof name === 'string')
          block = context.blocks?.find(
            (item) => item.name.toUpperCase() === name.trim().toUpperCase(),
          );
      }
      for (;;) {
        const answer = yield {
          kind: 'keyword',
          ko: '블록을 객체에 정렬하시겠습니까? [예(Y)/아니오(N)] <예>:',
          en: 'Align block with object? [Yes/No] <Yes>:',
        };
        const option = drawKeyword(answer);
        if (
          typeof answer === 'string' &&
          (!option || ['Y', 'YES', '예', 'N', 'NO', '아니오'].includes(option))
        ) {
          align = !['N', 'NO', '아니오'].includes(option);
          break;
        }
      }
      continue;
    }
    const n =
      typeof value === 'string' ? parseDraftNumber(value, context.coordinates()) : undefined;
    if (n === undefined || n <= 0 || (!measure && (!Number.isInteger(n) || n < 2 || n > 32767)))
      continue;
    const length = geometryLength(curve);
    spacing = measure ? n : length / n;
    count = measure ? Math.floor((length - 1e-12) / spacing) : n - 1;
    if (count > 32767) continue;
    break;
  }
  const entities: CadEntity[] = [],
    clipboardBlocks: CadClipboardBlock[] = [];
  for (let i = 1; i <= count; i++) {
    const length = geometryLength(curve);
    const sample = geometryEvaluation(
      curve,
      parameterAtDrawDistance(curve, reversed ? length - spacing * i : spacing * i),
    );
    const target: CadPoint = { x: sample.point.x, y: -sample.point.y, z: sample.point.z };
    if (!block) entities.push(drawNode(context, target));
    else {
      const ids = new Set(block.entityIds),
        copies = context.entities
          .filter((entity) => ids.has(entity.id))
          .map((entity) => {
            const rotated = align
              ? transformGripEntity(
                  entity,
                  'ROTATE',
                  block.basePoint,
                  -Math.atan2(
                    (reversed ? -1 : 1) * sample.derivative.y,
                    (reversed ? -1 : 1) * sample.derivative.x,
                  ),
                )
              : entity;
            return {
              ...transformGripEntity(rotated, 'MOVE', block.basePoint, {
                x: target.x - block.basePoint.x,
                y: target.y - block.basePoint.y,
                z: (target.z ?? 0) - (block.basePoint.z ?? 0),
              }),
              id: `interval-${crypto.randomUUID()}`,
            };
          });
      entities.push(...copies);
      clipboardBlocks.push({
        name: `A$C${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`,
        basePoint: target,
        entityIds: copies.map((entity) => entity.id),
      });
    }
  }
  return {
    entities,
    previousIds: entities.map((entity) => entity.id),
    ...(block ? { clipboardBlocks } : {}),
  };
}
export const divideProgram = (context: DrawContext): DrawProgram => intervals(context, false);
export const measureProgram = (context: DrawContext): DrawProgram => intervals(context, true);
