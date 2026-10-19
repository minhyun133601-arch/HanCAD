import type { CadEntity, CadPolyline } from '@hancad/legacy-bridge';
import { scalarInput } from './draw-curve-helpers';
import {
  drawEntity,
  drawKeyword,
  drawNumber,
  type DrawContext,
  type DrawProgram,
} from './draw-program';
import { editCurve, editCurveEntity, reverseEditCurve } from './modify-curve-geometry';
import { modifyId, modifyResult, modifySelection } from './modify-common';
import { editSelection, joinEntities } from './modify-topology';
import { convertPolyline, decurvePolyline, peditFit, peditSpline } from './modify-poly-geometry';
import { polylineVertexProgram } from './modify-poly-vertex';

export function* peditProgram(context: DrawContext): DrawProgram {
  let multiple = false,
    selected: CadEntity[] = modifySelection(context);
  if (selected.length > 1) selected = [];
  while (!selected.length) {
    const value = yield {
      kind: 'entity',
      ko: '폴리선 선택 또는 [다중(M)]:',
      en: 'Select polyline or [Multiple]:',
    };
    const option = drawKeyword(value);
    if (value === '') return { entities: [] };
    if (option === 'M' || option === 'MULTIPLE') {
      multiple = true;
      selected = yield* editSelection(context, '객체 선택:', 'Select objects:', false);
    } else {
      const entity = drawEntity(value);
      if (entity && (!context.editableIds || context.editableIds.has(entity.id)))
        selected = [entity];
    }
  }
  const convert = selected.some(
    (e) =>
      !['LWPOLYLINE', 'POLYLINE'].includes(editCurve(e)?.type ?? '') &&
      !e.sourceType?.startsWith('POLYLINE_'),
  );
  if (convert && Number(context.get('PEDITACCEPT')) !== 1) {
    const answer = drawKeyword(
      yield {
        kind: 'keyword',
        ko: multiple
          ? '선, 호 및 스플라인을 폴리선으로 변환하시겠습니까? [예(Y)/아니오(N)] <예>:'
          : '선택한 객체는 폴리선이 아닙니다. 폴리선으로 변환하시겠습니까? [예(Y)/아니오(N)] <예>:',
        en: multiple
          ? 'Convert Lines, Arcs and Splines to polylines? [Yes/No] <Y>:'
          : 'Object selected is not a polyline. Do you want to turn it into one? [Yes/No] <Y>:',
      },
    );
    if (answer === 'N' || answer === 'NO') return { entities: [] };
  }
  let precision = 10;
  if (selected.some((e) => e.curve?.type === 'SPLINE' && !e.sourceType?.startsWith('POLYLINE_')))
    precision = yield* scalarInput(
      context,
      { ko: '정밀도 지정 <10>:', en: 'Specify a precision <10>:' },
      (n) => Number.isInteger(n) && n >= 0 && n <= 99,
      10,
    );
  const retainedSources = new Set<string>();
  const converted = selected.flatMap((entity): CadPolyline[] => {
    if (
      (entity.type === 'polyline' || entity.type === 'rect') &&
      entity.sourceType?.startsWith('POLYLINE_')
    )
      return [structuredClone(entity)];
    const polyline = convertPolyline(
      entity,
      precision,
      Number(context.get('PLINECONVERTMODE')) !== 0,
    );
    if (!polyline) return [];
    if (
      !['LWPOLYLINE', 'POLYLINE'].includes(editCurve(entity)?.type ?? '') &&
      Number(context.get('DELOBJ')) === 0
    ) {
      retainedSources.add(entity.id);
      return [{ ...polyline, id: modifyId() }];
    }
    return [polyline];
  });
  if (!converted.length) return { entities: [] };
  const originals = new Map(
    selected
      .filter((e) => !retainedSources.has(e.id) && converted.some((c) => c.id === e.id))
      .map((e) => [e.id, e]),
  );
  let current = converted,
    extras: CadEntity[] = [],
    tangents = new Map(
      Object.entries(current[0]!.peditTangents ?? {}).map(([index, angle]) => [
        Number(index),
        angle,
      ]),
    );
  const refit = (e: CadPolyline): CadPolyline =>
    e.sourceType === 'POLYLINE_FIT'
      ? peditFit(
          e,
          new Map(Object.entries(e.peditTangents ?? {}).map(([i, angle]) => [Number(i), angle])),
        )
      : e.sourceType?.startsWith('POLYLINE_SPLINE')
        ? peditSpline(
            e,
            Number(context.get('SPLINETYPE')) || 6,
            Number(context.get('SPLINESEGS')) || 8,
          )
        : e;
  const history: { current: CadPolyline[]; extras: CadEntity[]; originalIds: string[] }[] = [];
  const result = () => {
    return modifyResult([...originals.values()], [...current, ...extras]);
  };
  for (;;) {
    const partial = result(),
      closed = current[0]!.closed;
    const value = yield {
      kind: 'keyword',
      ko: `옵션 입력 [${closed ? '열기(O)' : '닫기(C)'}/결합(J)/폭(W)${multiple ? '' : '/정점 편집(E)'}/맞춤(F)/스플라인(S)/곡선 제거(D)/선종류 생성(L)/반전(R)/명령 취소(U)]:`,
      en: `Enter an option [${closed ? 'Open' : 'Close'}/Join/Width${multiple ? '' : '/Edit vertex'}/Fit/Spline/Decurve/Ltype gen/Reverse/Undo]:`,
      partial: partial.entities,
      partialEraseIds: partial.eraseIds ?? [],
    };
    const option = drawKeyword(value);
    if (value === '' || option === 'X' || option === 'EXIT') return result();
    if (option === 'U' || option === 'UNDO') {
      const last = history.pop();
      if (last) {
        current = last.current;
        extras = last.extras;
        tangents = new Map(
          Object.entries(current[0]!.peditTangents ?? {}).map(([i, angle]) => [Number(i), angle]),
        );
        for (const key of originals.keys())
          if (!last.originalIds.includes(key)) originals.delete(key);
      }
      continue;
    }
    const before = {
      current: structuredClone(current),
      extras: structuredClone(extras),
      originalIds: [...originals.keys()],
    };
    if (option === 'C' || option === 'CLOSE' || option === 'O' || option === 'OPEN')
      current = current.map((e) => {
        const next = { ...e, closed: option.startsWith('C') };
        delete next.curve;
        return refit(next);
      });
    else if (option === 'W' || option === 'WIDTH') {
      const width = yield* scalarInput(
        context,
        {
          ko: `모든 세그먼트에 대한 새 폭 지정 <${current[0]!.constantWidth ?? 0}>:`,
          en: 'Specify new width for all segments:',
        },
        (n) => n >= 0,
        current[0]!.constantWidth ?? 0,
      );
      current = current.map((e) => {
        const next = {
          ...e,
          constantWidth: width,
          startWidths: e.points.map(() => 0),
          endWidths: e.points.map(() => 0),
        };
        delete next.curve;
        return refit(next);
      });
    } else if (option === 'J' || option === 'JOIN') {
      const additions = yield* editSelection(context, '객체 선택:', 'Select objects:', false);
      let fuzz = 1e-9,
        joinType = 'Extend';
      if (multiple) {
        for (;;) {
          const input = yield {
            kind: 'number',
            ko: '퍼지 거리 입력 또는 [결합 유형(J)] <0.0000>:',
            en: 'Enter fuzz distance or [Jointype] <0.0000>:',
          };
          if (['J', 'JOINTYPE'].includes(drawKeyword(input))) {
            const type = drawKeyword(
              yield {
                kind: 'keyword',
                ko: '결합 유형 입력 [연장(E)/추가(A)/모두(B)] <연장>:',
                en: 'Enter a jointype [Extend/Add/Both] <Extend>:',
              },
            );
            joinType = type.startsWith('A') ? 'Add' : type.startsWith('B') ? 'Both' : 'Extend';
          } else {
            const n = input === '' ? 0 : drawNumber(input);
            if (n !== undefined && n >= 0) {
              fuzz = Math.max(1e-9, n);
              break;
            }
          }
        }
      }
      const joined = joinEntities(
        [
          ...current.map((e) => (e.sourceType?.startsWith('POLYLINE_') ? decurvePolyline(e) : e)),
          ...additions,
        ],
        true,
        fuzz,
        joinType,
      );
      if (joined.consumed.length) {
        for (const entity of additions.filter((e) => joined.consumed.some((c) => c.id === e.id)))
          originals.set(entity.id, entity);
        current = joined.entities.filter(
          (e): e is CadPolyline => e.type === 'polyline' || e.type === 'rect',
        );
      }
    } else if (option === 'F' || option === 'FIT')
      current = current.map((e) => peditFit(e, tangents));
    else if (option === 'S' || option === 'SPLINE')
      current = current.map((e) =>
        peditSpline(
          e,
          Number(context.get('SPLINETYPE')) || 6,
          Number(context.get('SPLINESEGS')) || 8,
        ),
      );
    else if (option === 'D' || option === 'DECURVE') current = current.map(decurvePolyline);
    else if (option === 'L' || option === 'LTYPE GEN' || option === 'LTYPEGEN') {
      const answer = drawKeyword(
        yield {
          kind: 'keyword',
          ko: '선종류 생성 입력 [켜기(ON)/끄기(OFF)] <끄기>:',
          en: 'Enter polyline linetype generation option [ON/OFF] <Off>:',
        },
      );
      if (['ON', 'OFF', ''].includes(answer))
        current = current.map((e) => ({ ...e, plinegen: answer === 'ON' }));
    } else if (option === 'R' || option === 'REVERSE')
      current = current.map((e) => {
        const curve = editCurve(e);
        if (!curve) return e;
        const result = editCurveEntity(
          e,
          reverseEditCurve(curve, Number(context.get('PLINEREVERSEWIDTHS')) === 1),
        ) as CadPolyline;
        if (e.sourceType?.startsWith('POLYLINE_')) {
          result.points = [...e.points].reverse();
          result.sourceType = e.sourceType;
        }
        if (e.peditTangents)
          result.peditTangents = Object.fromEntries(
            Object.entries(e.peditTangents).map(([i, angle]) => [
              e.points.length - 1 - Number(i),
              angle + Math.PI,
            ]),
          );
        if (!multiple)
          tangents = new Map(
            Object.entries(result.peditTangents ?? {}).map(([i, angle]) => [Number(i), angle]),
          );
        return result;
      });
    else if (!multiple && (option === 'E' || option === 'EDIT' || option === 'EDIT VERTEX')) {
      const edited = yield* polylineVertexProgram(context, current[0]!, tangents);
      current = [edited.entity];
      extras.push(...edited.extras);
      tangents = edited.tangents;
      current[0]!.peditTangents = Object.fromEntries(tangents);
      if (
        before.current[0]?.sourceType?.startsWith('POLYLINE_SPLINE') &&
        edited.entity.sourceType?.startsWith('POLYLINE_SPLINE')
      )
        current = current.map((e) =>
          peditSpline(
            e,
            Number(context.get('SPLINETYPE')) || 6,
            Number(context.get('SPLINESEGS')) || 8,
          ),
        );
      else if (
        before.current[0]?.sourceType === 'POLYLINE_FIT' &&
        edited.entity.sourceType === 'POLYLINE_FIT'
      )
        current = current.map((e) => peditFit(e, tangents));
    } else continue;
    history.push(before);
  }
}
