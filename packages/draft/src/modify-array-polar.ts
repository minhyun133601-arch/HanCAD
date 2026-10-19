import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { transformPoint3, type Affine3 } from '@hancad/geom';
import { pointInput, model, wcs } from './draw-curve-helpers';
import {
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawProgram,
  type DrawRequest,
  type DrawValue,
} from './draw-program';
import { modifyResult, modifySelection } from './modify-common';
import { transformGripPoint } from './grip-transform';
import { transformMetadata } from './modify-transform-metadata';
import { affineEntity } from './modify-transform-align';
import {
  deltaPoint,
  entityAnchor,
  origin,
  transformAngle,
  transformEntities,
} from './modify-transform-geometry';
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

export interface PolarArray extends ArrayRows {
  center: CadPoint;
  base: CadPoint;
  items: number;
  angle: number;
  rotate: boolean;
  fillAngle?: number;
  axis?: CadPoint;
}
function axisArrayMatrix(state: PolarArray, index: number): Affine3 {
  const center = wcs(state.center),
    end = wcs(state.axis!),
    base = wcs(state.base),
    length = Math.hypot(end.x - center.x, end.y - center.y, end.z - center.z);
  const x = (end.x - center.x) / length,
    y = (end.y - center.y) / length,
    z = (end.z - center.z) / length;
  const item = index % state.items,
    row = Math.floor(index / state.items) % state.rows,
    level = Math.floor(index / (state.items * state.rows)),
    angle = item * state.angle,
    c = Math.cos(angle),
    s = Math.sin(angle),
    t = 1 - c;
  const r = [
    [c + x * x * t, x * y * t - z * s, x * z * t + y * s],
    [y * x * t + z * s, c + y * y * t, y * z * t - x * s],
    [z * x * t - y * s, z * y * t + x * s, c + z * z * t],
  ];
  const v = [base.x - center.x, base.y - center.y, base.z - center.z],
    normal = [x, y, z],
    dot = v[0]! * x + v[1]! * y + v[2]! * z;
  let radial = v.map((n, i) => n - dot * normal[i]!),
    radius = Math.hypot(...radial);
  if (radius < 1e-12) {
    radial = Math.abs(z) < 0.9 ? [-y, x, 0] : [1, 0, 0];
    radius = Math.hypot(...radial);
  }
  const shift = radial.map(
    (n, i) =>
      (n / radius) * row * state.rowSpacing +
      normal[i]! * (level * state.levelSpacing + row * state.rowElevation),
  );
  const cp = [center.x, center.y, center.z],
    bp = [base.x, base.y, base.z];
  const translation = r.map(
    (line, i) => cp[i]! + line.reduce((sum, n, j) => sum + n * (shift[j]! - cp[j]!), 0),
  );
  if (!state.rotate) {
    const target = r.map(
      (line, i) => translation[i]! + line.reduce((sum, n, j) => sum + n * bp[j]!, 0),
    );
    return [
      1,
      0,
      0,
      target[0]! - base.x,
      0,
      1,
      0,
      target[1]! - base.y,
      0,
      0,
      1,
      target[2]! - base.z,
    ];
  }
  return [
    r[0]![0]!,
    r[0]![1]!,
    r[0]![2]!,
    translation[0]!,
    r[1]![0]!,
    r[1]![1]!,
    r[1]![2]!,
    translation[1]!,
    r[2]![0]!,
    r[2]![1]!,
    r[2]![2]!,
    translation[2]!,
  ];
}
export function polarArrayPoint(state: PolarArray, index: number, point: CadPoint): CadPoint {
  if (state.axis) return model(transformPoint3(axisArrayMatrix(state, index), wcs(point)));
  const item = index % state.items,
    row = Math.floor(index / state.items) % state.rows,
    level = Math.floor(index / (state.items * state.rows));
  const vector = deltaPoint(state.base, state.center),
    radius = Math.hypot(vector.x, vector.y),
    ux = radius ? vector.x / radius : 1,
    uy = radius ? vector.y / radius : 0,
    angle = -item * state.angle;
  const shifted = transformGripPoint(point, 'MOVE', origin, {
    x: ux * row * state.rowSpacing,
    y: uy * row * state.rowSpacing,
    z: level * state.levelSpacing + row * state.rowElevation,
  });
  if (state.rotate) return transformGripPoint(shifted, 'ROTATE', state.center, angle);
  const rotated = transformGripPoint(state.base, 'ROTATE', state.center, angle),
    extra = transformGripPoint(
      { x: ux * row * state.rowSpacing, y: uy * row * state.rowSpacing },
      'ROTATE',
      origin,
      angle,
    );
  return {
    ...shifted,
    x: point.x + rotated.x - state.base.x + extra.x,
    y: point.y + rotated.y - state.base.y + extra.y,
  };
}
export function polarEntities(originals: readonly CadEntity[], state: PolarArray): CadEntity[] {
  if (state.axis) {
    if (state.items * state.rows * state.levels * originals.length > 100000) return [];
    return Array.from({ length: state.items * state.rows * state.levels }, (_, index) =>
      originals.map((e) => ({
        ...affineEntity(e, axisArrayMatrix(state, index)),
        id: index ? `modify-${crypto.randomUUID()}` : e.id,
      })),
    ).flat();
  }
  const entities: CadEntity[] = [],
    vector = deltaPoint(state.base, state.center),
    radius = Math.hypot(vector.x, vector.y),
    ux = radius ? vector.x / radius : 1,
    uy = radius ? vector.y / radius : 0;
  if (state.items * state.rows * state.levels * originals.length > 100000) return [];
  for (let level = 0; level < state.levels; level++)
    for (let row = 0; row < state.rows; row++)
      for (let item = 0; item < state.items; item++) {
        const angle = -item * state.angle,
          c = Math.cos(angle),
          s = Math.sin(angle),
          offset = row * state.rowSpacing;
        const shifted = transformEntities(originals, 'MOVE', origin, {
          x: ux * offset,
          y: uy * offset,
          z: level * state.levelSpacing + row * state.rowElevation,
        });
        const target = {
          x: state.center.x + (vector.x + ux * offset) * c - (vector.y + uy * offset) * s,
          y: state.center.y + (vector.x + ux * offset) * s + (vector.y + uy * offset) * c,
        };
        entities.push(
          ...(state.rotate
            ? transformEntities(shifted, 'ROTATE', state.center, angle, !!(level || row || item))
            : transformEntities(
                shifted,
                'MOVE',
                origin,
                {
                  x: target.x - state.base.x - ux * offset,
                  y: target.y - state.base.y - uy * offset,
                },
                !!(level || row || item),
              )),
        );
      }
  return entities;
}
export const polarStep = (fill: number, count: number) =>
  fill / (Math.abs(Math.abs(fill) - Math.PI * 2) < 1e-9 ? count : Math.max(1, count - 1));
export function* arrayPolarProgram(context: DrawContext): DrawProgram {
  const originals = modifySelection(context);
  if (!originals.length) return { entities: [] };
  let base = arrayBounds(originals).base,
    center: CadPoint | undefined,
    axis: CadPoint | undefined;
  while (!center) {
    const value = yield {
      kind: 'point',
      ko: '배열의 중심점 지정 또는 [기준점(B)/회전축(A)] :',
      en: 'Specify center point of array or [Base point/Axis of rotation]:',
    };
    const key = drawKeyword(value);
    if (['B', 'BASEPOINT', 'BASE'].includes(key))
      base = yield* pointInput({ ko: '기준점 지정:', en: 'Specify base point:' });
    else if (['A', 'AXISOFROTATION'].includes(key)) {
      center = yield* pointInput({
        ko: '축의 첫 번째 점 지정:',
        en: 'Specify first point of axis:',
      });
      const end = yield* pointInput({
        ko: '축의 두 번째 점 지정:',
        en: 'Specify second point of axis:',
        base: center,
      });
      if (Math.hypot(end.x - center.x, end.y - center.y, (end.z ?? 0) - (center.z ?? 0)) > 1e-12)
        axis = end;
      else center = undefined;
    } else center = drawPoint(value);
  }
  const state: PolarArray = {
    ...arrayRows(),
    center,
    base,
    items: 6,
    angle: Math.PI / 3,
    rotate: true,
    fillAngle: Math.PI * 2,
    ...(axis ? { axis } : {}),
  };
  for (;;) {
    const entities = polarEntities(originals, state),
      value = yield {
        kind: 'keyword',
        ko: '배열을 편집할 그립 선택 또는 [연관(AS)/기준점(B)/항목(I)/사이 각도(A)/채울 각도(F)/행(ROW)/수준(L)/항목 회전(ROT)/종료(X)] <종료>:',
        en: 'Select grip to edit array or [ASsociative/Base point/Items/Angle between/Fill angle/ROWs/Levels/ROTate items/eXit] <eXit>:',
        previewEntities: entities,
        preview: () => entities,
        previewHiddenIds: originals.map((e) => e.id),
      };
    if (arrayExit(value))
      return transformMetadata(context, originals, modifyResult(originals, entities), (index, p) =>
        polarArrayPoint(state, index, p),
      );
    const key = drawKeyword(value);
    if (['AS', 'ASSOCIATIVE'].includes(key)) yield* arrayAssociative();
    else if (['B', 'BASEPOINT', 'BASE'].includes(key))
      state.base = yield* pointInput({ ko: '기준점 지정:', en: 'Specify base point:' });
    else if (['I', 'ITEMS'].includes(key)) {
      const fill = state.fillAngle ?? state.angle * Math.max(1, state.items - 1);
      state.items = yield* arrayNumber(
        context,
        '항목 수 입력',
        'Enter number of items',
        state.items,
        (n) => arrayCountValid(n) && n * state.rows * state.levels * originals.length <= 100000,
      );
      state.angle = polarStep(fill, state.items);
      state.fillAngle = fill;
    } else if (['A', 'ANGLEBETWEEN', 'F', 'FILLANGLE'].includes(key)) {
      const fill = ['F', 'FILLANGLE'].includes(key);
      for (;;) {
        const value = yield {
          kind: 'angle',
          ko: fill ? '채울 각도 지정:' : '항목 사이의 각도 지정:',
          en: fill ? 'Specify the angle to fill:' : 'Specify the angle between items:',
          base: center,
          preview: (p: CadPoint) =>
            polarEntities(originals, {
              ...state,
              angle: fill
                ? polarStep(Math.atan2(center.y - p.y, p.x - center.x), state.items)
                : Math.atan2(center.y - p.y, p.x - center.x),
            }),
        };
        const angle = transformAngle(value, context, center);
        if (angle !== undefined && angle !== 0) {
          state.angle = fill ? polarStep(angle, state.items) : angle;
          if (fill) state.fillAngle = angle;
          else delete state.fillAngle;
          break;
        }
      }
    } else if (['ROW', 'ROWS'].includes(key))
      yield* editArrayRows(context, state, false, state.items * originals.length);
    else if (['L', 'LEVELS'].includes(key))
      yield* editArrayRows(context, state, true, state.items * originals.length);
    else if (['ROT', 'ROTATEITEMS'].includes(key)) state.rotate = yield* rotateItems(state.rotate);
  }
}
export function* rotateItems(fallback: boolean): Generator<DrawRequest, boolean, DrawValue> {
  for (;;) {
    const value = yield {
      kind: 'keyword',
      ko: `배열된 항목을 회전하시겠습니까? [예(Y)/아니오(N)] <${fallback ? '예' : '아니오'}>:`,
      en: `Rotate arrayed items? [Yes/No] <${fallback ? 'Yes' : 'No'}>:`,
    };
    const key = drawKeyword(value);
    if (value === '') return fallback;
    if (['Y', 'YES', '예'].includes(key)) return true;
    if (['N', 'NO', '아니오'].includes(key)) return false;
  }
}
export function legacyPolarBase(originals: readonly CadEntity[]): CadPoint {
  return entityAnchor(originals.at(-1)!);
}
