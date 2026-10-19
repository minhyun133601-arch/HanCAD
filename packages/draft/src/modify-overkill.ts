import { polylineSegments } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { CadEntity } from '@hancad/legacy-bridge';
import { editCurve, editCurveEntity, near3, reverseEditCurve } from './modify-curve-geometry';
import { modifyId, modifyResult, modifySelection } from './modify-common';
import {
  circularCurveCovered,
  mergeOverkillArcs,
  mergeOverkillLines,
  optimizeOverkillPolyline,
  subtractOverkillCurve,
} from './modify-overkill-geometry';
import { drawKeyword } from './draw-program';
import type { DrawFactory, DrawProgram } from './draw-program';

export interface OverkillOptions {
  tolerance: number;
  ignore: ReadonlySet<string>;
  optimizePolylines: boolean;
  ignoreWidths: boolean;
  keepPolylines: boolean;
  partialOverlap: boolean;
  endToEnd: boolean;
  maintainAssociativity: boolean;
}
const defaults = (): OverkillOptions => ({
  tolerance: 1e-6,
  ignore: new Set(),
  optimizePolylines: true,
  ignoreWidths: false,
  keepPolylines: true,
  partialOverlap: true,
  endToEnd: true,
  maintainAssociativity: true,
});
const propertyKeys: Record<string, readonly (keyof CadEntity)[]> = {
  COLOR: ['color', 'aci', 'trueColor'],
  LAYER: ['layer'],
  LTYPE: ['linetype'],
  LTSCALE: ['linetypeScale'],
  LWEIGHT: ['lineweight'],
  THICKNESS: ['thickness'],
  TRANSPARENCY: ['transparency'],
  PLOTSTYLE: ['plotStyle'],
  MATERIAL: ['material'],
};
const ignoredAliases: Record<string, string> = {
  C: 'COLOR',
  LA: 'LAYER',
  LT: 'LTYPE',
  S: 'LTSCALE',
  LW: 'LWEIGHT',
  T: 'THICKNESS',
  TR: 'TRANSPARENCY',
  P: 'PLOTSTYLE',
  M: 'MATERIAL',
};
function sameProperties(a: CadEntity, b: CadEntity, options: OverkillOptions): boolean {
  return Object.entries(propertyKeys).every(
    ([property, fields]) =>
      options.ignore.has('ALL') ||
      options.ignore.has(property) ||
      fields.every((field) => {
        if (
          field === 'color' &&
          (a.aci !== undefined || a.trueColor !== undefined) &&
          a.aci === b.aci &&
          a.trueColor === b.trueColor
        )
          return true;
        return a[field] === b[field];
      }),
  );
}
function sameCurve(
  a: CurveGeometry,
  b: CurveGeometry,
  tolerance: number,
  widths: boolean,
): boolean {
  if (
    a.type !== b.type &&
    !(['LWPOLYLINE', 'POLYLINE'].includes(a.type) && ['LWPOLYLINE', 'POLYLINE'].includes(b.type))
  )
    return false;
  if (a.type === 'LINE' && b.type === 'LINE')
    return (
      (near3(a.start, b.start, tolerance) && near3(a.end, b.end, tolerance)) ||
      (near3(a.start, b.end, tolerance) && near3(a.end, b.start, tolerance))
    );
  if (
    (a.type === 'LWPOLYLINE' || a.type === 'POLYLINE') &&
    (b.type === 'LWPOLYLINE' || b.type === 'POLYLINE')
  ) {
    if (
      a.closed !== b.closed ||
      a.vertices.length !== b.vertices.length ||
      (!widths && Math.abs(a.constantWidth - b.constantWidth) > tolerance)
    )
      return false;
    const reversed = reverseEditCurve(b, true);
    if (reversed.type !== 'LWPOLYLINE' && reversed.type !== 'POLYLINE') return false;
    const n = a.vertices.length;
    for (const candidate of [b, reversed])
      for (let offset = 0; offset < (a.closed ? n : 1); offset++) {
        if (
          a.vertices.every((vertex, i) => {
            const other = candidate.vertices[(i + offset) % n]!;
            return (
              near3(vertex.position, other.position, tolerance) &&
              Math.abs(vertex.bulge - other.bulge) <= tolerance &&
              (widths ||
                (Math.abs(vertex.startWidth - other.startWidth) <= tolerance &&
                  Math.abs(vertex.endWidth - other.endWidth) <= tolerance))
            );
          })
        )
          return true;
      }
    return false;
  }
  const exact = (first: unknown, second: unknown): boolean => {
    if (typeof first === 'number' && typeof second === 'number')
      return Math.abs(first - second) <= tolerance;
    if (first === second) return true;
    if (Array.isArray(first) && Array.isArray(second))
      return first.length === second.length && first.every((value, i) => exact(value, second[i]));
    if (first && second && typeof first === 'object' && typeof second === 'object') {
      const left = first as Record<string, unknown>,
        right = second as Record<string, unknown>;
      return (
        Object.keys(left).length === Object.keys(right).length &&
        Object.keys(left).every((key) => exact(left[key], right[key]))
      );
    }
    return false;
  };
  if (exact(a, b) || exact(a, reverseEditCurve(b))) return true;
  return false;
}
/** Pure cleanup; the command host publishes the final graph in one transaction. */
export function overkillEntities(
  originals: readonly CadEntity[],
  options: OverkillOptions,
): CadEntity[] {
  const result: CadEntity[] = [];
  const working = originals.flatMap((entity) => {
    const curve = editCurve(entity);
    if (
      options.keepPolylines ||
      !curve ||
      (curve.type !== 'LWPOLYLINE' && curve.type !== 'POLYLINE')
    )
      return [entity];
    const segments = polylineSegments(curve);
    if (
      !options.ignoreWidths &&
      (curve.constantWidth > options.tolerance ||
        curve.vertices.some(
          (v) => v.startWidth > options.tolerance || v.endWidth > options.tolerance,
        ))
    )
      return [entity];
    const redundant = segments.some(
      (segment, i) =>
        segments.some(
          (other, j) =>
            j < i && sameCurve(segment.geometry, other.geometry, options.tolerance, true),
        ) ||
        originals.some((other) => {
          const geometry = other.id === entity.id ? undefined : editCurve(other);
          return (
            geometry &&
            sameProperties(entity, other, options) &&
            sameCurve(segment.geometry, geometry, options.tolerance, options.ignoreWidths)
          );
        }),
    );
    if (!redundant) return [entity];
    return segments.map((segment, i) =>
      editCurveEntity(entity, segment.geometry, i ? modifyId() : entity.id),
    );
  });
  for (const original of working) {
    let entity = structuredClone(original);
    const initial = editCurve(entity);
    if (
      !initial ||
      (options.maintainAssociativity && (entity.type === 'dimension' || !!entity.regionLoops))
    ) {
      result.push(entity);
      continue;
    }
    let curve: CurveGeometry = initial;
    if (options.optimizePolylines && (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE')) {
      const optimized = optimizeOverkillPolyline(curve, options);
      if (!optimized) continue;
      curve = optimized;
      entity = editCurveEntity(entity, curve);
    }
    let consumed = false;
    for (let i = 0; i < result.length; i++) {
      const existing = result[i]!,
        previous = editCurve(existing);
      if (!previous || !sameProperties(existing, entity, options)) continue;
      if (sameCurve(previous, curve, options.tolerance, options.ignoreWidths)) {
        consumed = true;
        break;
      }
      if (circularCurveCovered(curve, previous, options.tolerance)) {
        consumed = true;
        break;
      }
      if (circularCurveCovered(previous, curve, options.tolerance)) {
        result.splice(i--, 1);
        continue;
      }
      const merged: CurveGeometry | undefined =
        mergeOverkillLines(previous, curve, options) ?? mergeOverkillArcs(previous, curve, options);
      if (merged) {
        curve = merged;
        entity = editCurveEntity(existing, merged);
        result.splice(i--, 1);
      }
    }
    if (!consumed) result.push(entity);
  }
  if (options.optimizePolylines)
    return result.flatMap((entity) => {
      const curve = editCurve(entity);
      if (!curve || !['LINE', 'ARC'].includes(curve.type)) return [entity];
      let fragments = [curve];
      for (const polyline of result) {
        const poly = editCurve(polyline);
        if (
          !poly ||
          (poly.type !== 'LWPOLYLINE' && poly.type !== 'POLYLINE') ||
          !sameProperties(entity, polyline, options)
        )
          continue;
        polylineSegments(poly).forEach((segment, i) => {
          const vertex = poly.vertices[i]!;
          if (
            options.ignoreWidths ||
            (poly.constantWidth === 0 && vertex.startWidth === 0 && vertex.endWidth === 0)
          )
            fragments = fragments.flatMap((part) =>
              subtractOverkillCurve(part, segment.geometry, options.tolerance),
            );
        });
      }
      return fragments.map((fragment, i) =>
        editCurveEntity(entity, fragment, i ? modifyId() : entity.id),
      );
    });
  return result;
}

function* overkillProgram(context: Parameters<DrawFactory>[0]): DrawProgram {
  const originals = modifySelection(context),
    options = defaults();
  for (;;) {
    const value = yield {
      kind: 'keyword',
      ko: '옵션 입력 [무시(I)/공차(T)/폴리선 최적화(O)/부분 중첩 결합(P)/끝과 끝 결합(E)/연관성(A)] 또는 <완료>:',
      en: 'Enter an option [Ignore/Tolerance/Optimize polylines/Partial overlap/End to end/Associativity] or <done>:',
    };
    const key = drawKeyword(value);
    if (!key) break;
    if (['I', 'IGNORE'].includes(key)) {
      const answer = drawKeyword(
        yield {
          kind: 'keyword',
          ko: '무시할 특성 [없음(N)/전체(A)/색상(C)/도면층(LA)/선종류(LT)/선종류 축척(S)/선가중치(LW)/두께(T)/투명도(TR)/플롯스타일(P)/재료(M)]:',
          en: 'Ignore property [None/All/Color/LAyer/LType/ltScale/LWeight/Thickness/TRansparency/Plotstyle/Material]:',
        },
      );
      const ignored = new Set(options.ignore),
        property = ignoredAliases[answer] ?? answer;
      if (['N', 'NONE'].includes(property)) ignored.clear();
      else if (['A', 'ALL'].includes(property)) ignored.add('ALL');
      else if (property in propertyKeys) {
        if (ignored.has(property)) ignored.delete(property);
        else ignored.add(property);
      }
      options.ignore = ignored;
    } else if (['T', 'TOLERANCE'].includes(key)) {
      const answer = yield {
        kind: 'number',
        ko: `공차 지정 <${options.tolerance}>:`,
        en: `Specify tolerance <${options.tolerance}>:`,
      };
      if (
        typeof answer === 'string' &&
        answer.trim() &&
        Number.isFinite(Number(answer)) &&
        Number(answer) >= 0
      )
        options.tolerance = Number(answer);
    } else {
      const setting:
        | keyof Pick<
            OverkillOptions,
            'optimizePolylines' | 'partialOverlap' | 'endToEnd' | 'maintainAssociativity'
          >
        | undefined = ['O', 'OPTIMIZEPOLYLINES', 'OPTIMIZE POLYLINES'].includes(key)
        ? 'optimizePolylines'
        : ['P', 'PARTIALOVERLAP', 'PARTIAL OVERLAP'].includes(key)
          ? 'partialOverlap'
          : ['E', 'ENDTOEND', 'END TO END'].includes(key)
            ? 'endToEnd'
            : ['A', 'ASSOCIATIVITY'].includes(key)
              ? 'maintainAssociativity'
              : undefined;
      if (!setting) continue;
      const answer = drawKeyword(
        yield {
          kind: 'keyword',
          ko: '옵션 입력 [예(Y)/아니오(N)/세그먼트 폭(W)/폴리선 끊기(B)] <예>:',
          en: 'Enter option [Yes/No/segment Width/Break polyline] <Yes>:',
        },
      );
      if (
        setting === 'optimizePolylines' &&
        ['W', 'WIDTH', 'B', 'BREAKPOLYLINE'].includes(answer)
      ) {
        const enabled = drawKeyword(
          yield {
            kind: 'keyword',
            ko: '옵션 입력 [예(Y)/아니오(N)] <예>:',
            en: 'Enter option [Yes/No] <Yes>:',
          },
        );
        if (answer === 'W' || answer === 'WIDTH')
          options.ignoreWidths = !['N', 'NO'].includes(enabled);
        else options.keepPolylines = ['N', 'NO'].includes(enabled);
      } else if (['', 'Y', 'YES', 'N', 'NO'].includes(answer))
        options[setting] = !['N', 'NO'].includes(answer);
    }
  }
  const entities = overkillEntities(originals, options);
  return {
    ...modifyResult(originals, entities),
    messages: [
      {
        ko: `${overkillRemovedCount(originals, entities)}개의 중복 또는 겹치는 객체가 제거되었습니다.`,
        en: `${overkillRemovedCount(originals, entities)} duplicate or overlapping objects removed.`,
      },
    ],
  };
}
export const overkillFactories: Record<string, DrawFactory> = {
  OVERKILL: overkillProgram,
  '-OVERKILL': overkillProgram,
};

export function overkillRemovedCount(
  originals: readonly CadEntity[],
  result: readonly CadEntity[],
): number {
  const surviving = new Set(result.map((entity) => entity.id));
  return originals.filter((entity) => !surviving.has(entity.id)).length;
}
