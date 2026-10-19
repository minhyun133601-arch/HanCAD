import { closestGeometryPoint } from '@hancad/geom';
import type { SplineGeometry } from '@hancad/geom';
import type { CadEntity } from '@hancad/legacy-bridge';
import { pointInput, scalarInput, wcs } from './draw-curve-helpers';
import { drawEntity, drawKeyword, type DrawContext, type DrawProgram } from './draw-program';
import { splineObject } from './draw-spline';
import { editCurveEntity, reverseEditCurve } from './modify-curve-geometry';
import { modifyId, modifyResult, modifySelection } from './modify-common';
import { editSelection, joinEntities } from './modify-topology';
import { convertPolyline } from './modify-poly-geometry';
import { insertSplineKnot } from './modify-spline-geometry';
import { splineClose, splineFitDataProgram, splineVertexProgram } from './modify-spline-data';

export function* splineditProgram(context: DrawContext): DrawProgram {
  let original = modifySelection(context).find(
    (e) => e.curve?.type === 'SPLINE' || splineObject(e),
  );
  while (!original) {
    const value = yield { kind: 'entity', ko: '스플라인 선택:', en: 'Select spline:' };
    if (value === '') return { entities: [] };
    const entity = drawEntity(value);
    if (
      entity &&
      (!context.editableIds || context.editableIds.has(entity.id)) &&
      (entity.curve?.type === 'SPLINE' || splineObject(entity))
    )
      original = entity;
  }
  let spline: SplineGeometry = splineObject(original) ?? (original.curve as SplineGeometry);
  const originals = new Map<string, CadEntity>([[original.id, original]]),
    history: { spline: SplineGeometry; originalIds: string[] }[] = [];
  const current = () => editCurveEntity(original, spline);
  const result = () => modifyResult([...originals.values()], [current()]);
  for (;;) {
    const partial = result();
    const value = yield {
      kind: 'keyword',
      ko: `옵션 입력 [${spline.closed ? '열기(O)' : '닫기(C)'}/결합(J)/맞춤 데이터(F)/정점 편집(E)/폴리선으로 변환(P)/반전(R)/세분화(A)/명령 취소(U)/나가기(X)]:`,
      en: `Enter an option [${spline.closed ? 'Open' : 'Close'}/Join/Fit data/Edit vertex/convert to Polyline/Reverse/refine/Undo/eXit]:`,
      partial: partial.entities,
      partialEraseIds: partial.eraseIds ?? [],
    };
    const option = drawKeyword(value);
    if (value === '' || option === 'X' || option === 'EXIT') return result();
    if (option === 'U' || option === 'UNDO') {
      const last = history.pop();
      if (last) {
        spline = last.spline;
        for (const id of originals.keys()) if (!last.originalIds.includes(id)) originals.delete(id);
      }
      continue;
    }
    const before = { spline: structuredClone(spline), originalIds: [...originals.keys()] };
    if (option === 'C' || option === 'CLOSE' || option === 'O' || option === 'OPEN')
      spline = splineClose(
        spline,
        option.startsWith('C'),
        Number(context.get('SPLPERIODIC')) !== 0,
      );
    else if (option === 'R' || option === 'REVERSE')
      spline = reverseEditCurve(spline) as SplineGeometry;
    else if (option === 'F' || option === 'FIT' || option === 'FIT DATA')
      spline = yield* splineFitDataProgram(context, spline);
    else if (option === 'E' || option === 'EDIT' || option === 'EDIT VERTEX')
      spline = yield* splineVertexProgram(context, spline);
    else if (option === 'A' || option === 'REFINE') {
      const point = yield* pointInput({
        ko: '매듭을 추가할 점 지정:',
        en: 'Specify point for knot refinement:',
      });
      spline = insertSplineKnot(spline, closestGeometryPoint(spline, wcs(point)).parameter);
    } else if (option === 'J' || option === 'JOIN') {
      const selected = yield* editSelection(
        context,
        '결합할 객체 선택:',
        'Select objects to join:',
        false,
      );
      const joined = joinEntities([current(), ...selected]);
      const entity = joined.entities.find((e) => e.id === original.id);
      if (entity?.curve?.type === 'SPLINE') {
        spline = entity.curve;
        for (const e of selected.filter((e) => joined.consumed.some((c) => c.id === e.id)))
          originals.set(e.id, e);
      }
    } else if (option === 'P' || option === 'POLYLINE' || option === 'CONVERT TO POLYLINE') {
      const precision = yield* scalarInput(
        context,
        { ko: '정밀도 지정 <10>:', en: 'Specify a precision <10>:' },
        (n) => Number.isInteger(n) && n >= 0 && n <= 99,
        10,
      );
      const polyline = convertPolyline(
        current(),
        precision,
        Number(context.get('PLINECONVERTMODE')) !== 0,
      );
      if (polyline)
        return Number(context.get('DELOBJ')) === 0
          ? { entities: [{ ...polyline, id: modifyId() }] }
          : modifyResult([...originals.values()], [polyline]);
    } else continue;
    history.push(before);
  }
}
