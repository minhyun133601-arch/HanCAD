import { closestGeometryPoint } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { CadEntity } from '@hancad/legacy-bridge';
import { wcs, positiveAngle } from './draw-curve-helpers';
import {
  drawEntity,
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawProgram,
} from './draw-program';
import { modifyId, modifyResult, modifySelection } from './modify-common';
import { editCurve, editCurveEntity, sliceEditCurve } from './modify-curve-geometry';

export function* breakProgram(context: DrawContext, atPoint = false): DrawProgram {
  let original: CadEntity | undefined = modifySelection(context)[0],
    picked;
  while (!original) {
    const value = yield { kind: 'entity', ko: '객체 선택:', en: 'Select object:' };
    if (value === '') return { entities: [] };
    const candidate = drawEntity(value);
    if (!candidate || (context.editableIds && !context.editableIds.has(candidate.id))) continue;
    const c = editCurve(candidate);
    if (
      !c ||
      !['LINE', 'ARC', 'CIRCLE', 'ELLIPSE', 'SPLINE', 'LWPOLYLINE', 'POLYLINE'].includes(c.type)
    )
      continue;
    if (
      atPoint &&
      (!['LINE', 'ARC', 'LWPOLYLINE', 'POLYLINE'].includes(c.type) ||
        ('closed' in c && c.closed) ||
        (c.type === 'ELLIPSE' && Math.abs(c.sweepParameter) >= 2 * Math.PI - 1e-10))
    )
      continue;
    original = candidate;
    picked = drawPoint(value);
  }
  const curve = editCurve(original)!;
  let first = picked;
  let second;
  if (atPoint) {
    while (!second)
      second = drawPoint(yield { kind: 'point', ko: '끊을 점 지정:', en: 'Specify break point:' });
    first = second;
  } else {
    while (!first)
      first = drawPoint(
        yield { kind: 'point', ko: '첫 번째 끊을 점 지정:', en: 'Specify first break point:' },
      );
    for (;;) {
      const value = yield {
        kind: 'point',
        ko: '두 번째 끊을 점 지정 또는 [첫 번째 점(F)]:',
        en: 'Specify second break point or [First point]:',
        ...(first ? { base: first } : {}),
      };
      const option = drawKeyword(value);
      if (option === 'F' || option === 'FIRST' || option === 'FIRST POINT') {
        first = undefined;
        while (!first)
          first = drawPoint(
            yield { kind: 'point', ko: '첫 번째 끊을 점 지정:', en: 'Specify first break point:' },
          );
      } else {
        second = value === '@' ? first : drawPoint(value);
        if (second) break;
      }
    }
  }
  if (!first || !second) return { entities: [] };
  const a = closestGeometryPoint(curve, wcs(first)).parameter,
    b = closestGeometryPoint(curve, wcs(second)).parameter;
  let pieces: CurveGeometry[] = [];
  if (
    curve.type === 'CIRCLE' ||
    (curve.type === 'ELLIPSE' && Math.abs(curve.sweepParameter) >= Math.PI * 2 - 1e-10)
  ) {
    if (Math.abs(a - b) <= 1e-12)
      return {
        entities: [],
        messages: [
          {
            ko: '닫힌 객체는 한 점에서 끊을 수 없습니다.',
            en: 'Cannot break a closed object at one point.',
          },
        ],
      };
    const sweep = positiveAngle((a - b) * Math.PI * 2);
    if (curve.type === 'CIRCLE')
      pieces = [{ ...curve, type: 'ARC', startAngle: b * Math.PI * 2, sweepAngle: sweep }];
    else
      pieces = [
        {
          ...curve,
          startParameter: curve.startParameter + b * curve.sweepParameter,
          sweepParameter: Math.sign(curve.sweepParameter) * sweep,
        },
      ];
  } else if ((curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') && curve.closed) {
    if (b < a) {
      const piece = sliceEditCurve(curve, b, a);
      if (piece) pieces = [piece];
    } else {
      const head = sliceEditCurve(curve, b, 1),
        tail = sliceEditCurve(curve, 0, a);
      if (
        head &&
        tail &&
        (head.type === 'LWPOLYLINE' || head.type === 'POLYLINE') &&
        (tail.type === 'LWPOLYLINE' || tail.type === 'POLYLINE')
      )
        pieces = [
          { ...head, closed: false, vertices: [...head.vertices.slice(0, -1), ...tail.vertices] },
        ];
    }
  } else {
    const lo = Math.min(a, b),
      hi = Math.max(a, b);
    pieces = [sliceEditCurve(curve, 0, lo), sliceEditCurve(curve, hi, 1)].filter(
      (c): c is CurveGeometry => !!c,
    );
  }
  return modifyResult(
    [original],
    pieces.map((c, i) => editCurveEntity(original, c, i ? modifyId() : original.id)),
  );
}
