import {
  geometryEvaluation,
  geometryLength,
  transformPoint3,
  type CurveGeometry,
} from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { pointInput, model, wcs } from './draw-curve-helpers';
import { parameterAtDrawDistance } from './draw-divide';
import {
  drawEntity,
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawProgram,
} from './draw-program';
import { modifyId, modifyResult, modifySelection } from './modify-common';
import { affineEntity, alignmentMatrix } from './modify-transform-align';
import { legacyEntitySnapSources } from './snap-legacy-sources';
import { deltaPoint, origin, pointDistance, transformEntities } from './modify-transform-geometry';
import {
  arrayAssociative,
  arrayBounds,
  arrayCountValid,
  arrayExit,
  arrayNumber,
  arrayRows,
  editArrayRows,
  type ArrayRows,
} from './modify-array-common';
import { rotateItems } from './modify-array-polar';
import { transformMetadata } from './modify-transform-metadata';

export interface PathArray extends ArrayRows {
  curve: CurveGeometry;
  base: CadPoint;
  tangent: CadPoint;
  items: number;
  spacing: number;
  divide: boolean;
  align: boolean;
  reversed: boolean;
  maintainZ: boolean;
}
const add = (a: CadPoint, b: CadPoint): CadPoint => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: (a.z ?? 0) + (b.z ?? 0),
});
function isClosed(curve: CurveGeometry): boolean {
  return (
    curve.type === 'CIRCLE' ||
    (curve.type === 'ELLIPSE' && Math.abs(curve.sweepParameter) >= 2 * Math.PI - 1e-9) ||
    ('closed' in curve && curve.closed)
  );
}
export function pathArrayPoint(state: PathArray, index: number, point: CadPoint): CadPoint {
  const length = geometryLength(state.curve),
    closed = isClosed(state.curve),
    count = state.divide
      ? state.items
      : Math.min(
          state.items,
          closed ? Math.ceil(length / state.spacing) : Math.floor(length / state.spacing) + 1,
        );
  const item = index % count,
    row = Math.floor(index / count) % state.rows,
    level = Math.floor(index / (count * state.rows));
  const distance = state.divide
    ? (length * item) / (closed ? state.items : Math.max(1, state.items - 1))
    : state.spacing * item;
  const sample = geometryEvaluation(
      state.curve,
      parameterAtDrawDistance(state.curve, state.reversed ? length - distance : distance),
    ),
    p = model(sample.point),
    d = model(sample.derivative),
    direction = state.reversed ? -1 : 1,
    xy = Math.hypot(d.x, d.y);
  const target = {
    x: p.x + (xy ? (direction * d.y) / xy : 0) * row * state.rowSpacing,
    y: p.y - (xy ? (direction * d.x) / xy : 1) * row * state.rowSpacing,
    z: (p.z ?? 0) + level * state.levelSpacing + row * state.rowElevation,
  };
  if (!state.align)
    return {
      x: point.x + target.x - state.base.x,
      y: point.y + target.y - state.base.y,
      z: (point.z ?? 0) + (target.z ?? 0) - (state.base.z ?? 0),
    };
  const tangent = { x: d.x * direction, y: d.y * direction, z: (d.z ?? 0) * direction },
    from = [state.base, add(state.base, state.tangent)],
    to = [target, add(target, tangent)];
  if (
    state.maintainZ &&
    Math.hypot(tangent.x, tangent.y) > 1e-12 &&
    Math.hypot(state.tangent.x, state.tangent.y) > 1e-12
  ) {
    from.push(add(state.base, { x: 0, y: 0, z: 1 }));
    to.push(add(target, { x: 0, y: 0, z: 1 }));
  }
  const matrix = alignmentMatrix(from, to);
  return matrix ? model(transformPoint3(matrix, wcs(point))) : point;
}
export function pathArrayEntities(originals: readonly CadEntity[], state: PathArray): CadEntity[] {
  const length = geometryLength(state.curve),
    closed = isClosed(state.curve),
    entities: CadEntity[] = [];
  if (state.items * state.rows * state.levels * originals.length > 100000) return [];
  for (let level = 0; level < state.levels; level++)
    for (let row = 0; row < state.rows; row++)
      for (let i = 0; i < state.items; i++) {
        const distance = state.divide
          ? (length * i) / (closed ? state.items : Math.max(1, state.items - 1))
          : state.spacing * i;
        if (distance > length + 1e-9 || (!state.divide && closed && distance >= length - 1e-9))
          continue;
        const sample = geometryEvaluation(
          state.curve,
          parameterAtDrawDistance(state.curve, state.reversed ? length - distance : distance),
        );
        const p = model(sample.point),
          d = model(sample.derivative),
          direction = state.reversed ? -1 : 1,
          xy = Math.hypot(d.x, d.y);
        const target = {
          x: p.x + (xy ? (direction * d.y) / xy : 0) * row * state.rowSpacing,
          y: p.y - (xy ? (direction * d.x) / xy : 1) * row * state.rowSpacing,
          z: (p.z ?? 0) + level * state.levelSpacing + row * state.rowElevation,
        };
        if (state.align) {
          const tangent = { x: d.x * direction, y: d.y * direction, z: (d.z ?? 0) * direction },
            from = [state.base, add(state.base, state.tangent)],
            to = [target, add(target, tangent)];
          if (
            state.maintainZ &&
            Math.hypot(tangent.x, tangent.y) > 1e-12 &&
            Math.hypot(state.tangent.x, state.tangent.y) > 1e-12
          ) {
            from.push(add(state.base, { x: 0, y: 0, z: 1 }));
            to.push(add(target, { x: 0, y: 0, z: 1 }));
          }
          const matrix = alignmentMatrix(from, to);
          if (matrix)
            entities.push(
              ...originals.map((e) => ({ ...affineEntity(e, matrix), id: modifyId() })),
            );
        } else
          entities.push(
            ...transformEntities(originals, 'MOVE', origin, deltaPoint(target, state.base), true),
          );
      }
  return entities;
}
export function* arrayPathProgram(context: DrawContext): DrawProgram {
  const originals = modifySelection(context);
  if (!originals.length) return { entities: [] };
  let curve: CurveGeometry | undefined,
    reversed = false;
  while (!curve) {
    const value = yield { kind: 'entity', ko: '경로 곡선 선택:', en: 'Select path curve:' };
    const entity = drawEntity(value),
      candidate = entity ? legacyEntitySnapSources(entity)[0]?.geometry : undefined;
    if (
      candidate &&
      Number.isFinite(geometryLength(candidate)) &&
      geometryLength(candidate) > 1e-12
    ) {
      curve = candidate;
      const p = drawPoint(value),
        first = model(geometryEvaluation(curve, 0).point),
        last = model(geometryEvaluation(curve, 1).point);
      reversed = !!p && !isClosed(curve) && pointDistance(p, last) < pointDistance(p, first);
    }
  }
  const bounds = arrayBounds(originals),
    length = geometryLength(curve),
    spacing = bounds.width * 1.5 || 1;
  const state: PathArray = {
    ...arrayRows(),
    curve,
    base: bounds.base,
    tangent: { x: 1, y: 0, z: 0 },
    items: Math.max(
      1,
      Math.min(
        Math.floor(100000 / Math.max(1, originals.length)),
        Math.floor(length / spacing) + 1,
      ),
    ),
    spacing,
    divide: false,
    align: true,
    reversed,
    maintainZ: true,
  };
  for (;;) {
    const entities = pathArrayEntities(originals, state),
      value = yield {
        kind: 'keyword',
        ko: '배열을 편집할 그립 선택 또는 [연관(AS)/방법(M)/기준점(B)/접선 방향(T)/항목(I)/행(R)/수준(L)/항목 정렬(A)/Z 방향(Z)/종료(X)] <종료>:',
        en: 'Select grip to edit array or [ASsociative/Method/Base point/Tangent direction/Items/Rows/Levels/Align items/Z direction/eXit] <eXit>:',
        previewEntities: entities,
        preview: () => entities,
        previewHiddenIds: originals.map((e) => e.id),
      };
    if (arrayExit(value)) {
      const result =
        Number(context.get('DELOBJ') ?? 1) === 0 ? { entities } : modifyResult(originals, entities);
      return transformMetadata(context, originals, result, (batch, p) =>
        pathArrayPoint(state, batch, p),
      );
    }
    const key = drawKeyword(value);
    if (['AS', 'ASSOCIATIVE'].includes(key)) yield* arrayAssociative();
    else if (['M', 'METHOD'].includes(key)) {
      for (;;) {
        const answer = yield {
            kind: 'keyword',
            ko: `경로상의 간격 지정 방법 입력 [분할(D)/측정(M)] <${state.divide ? '분할' : '측정'}>:`,
            en: `Enter a path spacing method [Divide/Measure] <${state.divide ? 'Divide' : 'Measure'}>:`,
          },
          option = drawKeyword(answer);
        if (answer === '' || ['D', 'DIVIDE', 'M', 'MEASURE'].includes(option)) {
          if (option) state.divide = option === 'D' || option === 'DIVIDE';
          break;
        }
      }
    } else if (['B', 'BASEPOINT', 'BASE'].includes(key))
      state.base = yield* pointInput({ ko: '기준점 지정:', en: 'Specify base point:' });
    else if (['T', 'TANGENTDIRECTION'].includes(key)) {
      const first = yield {
        kind: 'point',
        ko: '접선 방향의 첫 번째 점 지정 또는 [법선(N)]:',
        en: 'Specify first point of tangent direction or [Normal]:',
      };
      if (['N', 'NORMAL'].includes(drawKeyword(first))) state.tangent = { x: 0, y: 0, z: 1 };
      else {
        const a = drawPoint(first);
        if (a) {
          const b = yield* pointInput({
            ko: '접선 방향의 두 번째 점 지정:',
            en: 'Specify second point of tangent direction:',
            base: a,
          });
          if (pointDistance(a, b) > 1e-12) state.tangent = deltaPoint(b, a);
        }
      }
    } else if (['I', 'ITEMS'].includes(key)) {
      const max = 100000 / (originals.length * state.rows * state.levels);
      if (state.divide)
        state.items = yield* arrayNumber(
          context,
          '경로상의 항목 수 입력',
          'Enter number of items along path',
          state.items,
          (n) => arrayCountValid(n) && n <= max,
        );
      else {
        state.spacing = yield* arrayNumber(
          context,
          '경로상의 항목 사이 거리 지정',
          'Specify distance between items along path',
          state.spacing,
          (n) => n > 0,
        );
        const count = Math.max(
          1,
          Math.floor((length - (isClosed(curve) ? 1e-9 : 0)) / state.spacing) + 1,
        );
        state.items = yield* arrayNumber(
          context,
          '항목 수 입력 또는 [전체 경로 채우기(F)]',
          'Enter number of items or [Fill entire path]',
          Math.min(count, max),
          (n) => arrayCountValid(n) && n <= count && n <= max,
        );
      }
    } else if (['R', 'ROWS'].includes(key))
      yield* editArrayRows(context, state, false, state.items * originals.length);
    else if (['L', 'LEVELS'].includes(key))
      yield* editArrayRows(context, state, true, state.items * originals.length);
    else if (['A', 'ALIGNITEMS'].includes(key)) state.align = yield* rotateItems(state.align);
    else if (['Z', 'ZDIRECTION'].includes(key)) {
      for (;;) {
        const answer = yield {
            kind: 'keyword',
            ko: 'Z 방향 유지 [예(Y)/아니오(N)] <예>:',
            en: 'Maintain Z direction? [Yes/No] <Yes>:',
          },
          option = drawKeyword(answer);
        if (answer === '' || ['Y', 'YES', 'N', 'NO'].includes(option)) {
          state.maintainZ = !['N', 'NO'].includes(option);
          break;
        }
      }
    }
  }
}
