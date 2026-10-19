import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { draftLine, draftPolyline } from './entities';
import { curveEntity, distance, scalarInput } from './draw-curve-helpers';
import { drawKeyword, drawPoint, type DrawContext, type DrawProgram } from './draw-program';
import { splineFromPoints } from './draw-spline';

export function sketchEntities(
  context: DrawContext,
  points: readonly CadPoint[],
  type: number,
  tolerance: number,
): CadEntity[] {
  if (points.length < 2) return [];
  if (type === 0)
    return points.slice(1).map((point, i) => draftLine(context.settings, points[i]!, point));
  if (type === 2)
    return [curveEntity(context, splineFromPoints(points, true, 3, 0, false, tolerance), points)];
  return [
    {
      ...draftPolyline(context.settings, points),
      sourceType: Number(context.get('PLINETYPE')) === 0 ? 'POLYLINE' : 'LWPOLYLINE',
    },
  ];
}
export function* sketchProgram(context: DrawContext): DrawProgram {
  let type = Number(context.get('SKPOLY')) || 0,
    increment = Number(context.get('SKETCHINC')) || 1,
    tolerance = Number(context.get('SKTOLERANCE')) || 0;
  let recording = false,
    points: CadPoint[] = [];
  const completed: CadEntity[] = [];
  for (;;) {
    const partial = [...completed, ...sketchEntities(context, points, type, tolerance)];
    const value = yield {
      kind: 'point',
      ko: recording
        ? '마우스 버튼을 클릭하여 펜을 올립니다. Enter 키를 눌러 종료합니다:'
        : '스케치 지정 또는 [유형(T)/증분(I)/공차(L)]:',
      en: recording
        ? 'Click to raise pen. Press Enter to finish:'
        : 'Specify sketch or [Type/Increment/toLerance]:',
      freehand: true,
      partial,
      preview: () => partial,
    };
    const sample = typeof value !== 'string' && 'sample' in value;
    const point = drawPoint(value),
      option = drawKeyword(value);
    if (sample) {
      if (recording && point && distance(points.at(-1)!, point) > increment) points.push(point);
      continue;
    }
    if (point) {
      if (recording) {
        if (distance(points.at(-1)!, point) > increment) points.push(point);
        completed.push(...sketchEntities(context, points, type, tolerance));
        points = [];
        recording = false;
      } else {
        recording = true;
        points = [point];
      }
      continue;
    }
    if (value === '') return { entities: partial };
    if (recording) continue;
    if (option === 'T' || option === 'TYPE') {
      for (;;) {
        const kind = drawKeyword(
          yield {
            kind: 'keyword',
            ko: `스케치 객체 유형 입력 [선(L)/폴리선(P)/스플라인(S)] <${['선', '폴리선', '스플라인'][type]}>:`,
            en: `Enter sketch object type [Line/Polyline/Spline] <${['Line', 'Polyline', 'Spline'][type]}>:`,
            partial: completed,
          },
        );
        if (!kind) break;
        if (['L', 'LINE', 'P', 'POLYLINE', 'S', 'SPLINE'].includes(kind)) {
          type = kind.startsWith('L') ? 0 : kind.startsWith('P') ? 1 : 2;
          context.set('SKPOLY', type);
          break;
        }
      }
    } else if (option === 'I' || option === 'INCREMENT') {
      increment = yield* scalarInput(
        context,
        {
          ko: `기록 증분 지정 <${increment}>:`,
          en: `Specify record increment <${increment}>:`,
          partial: completed,
        },
        (n) => n > 0,
        increment,
      );
      context.set('SKETCHINC', increment);
    } else if (option === 'L' || option === 'TOLERANCE') {
      tolerance = yield* scalarInput(
        context,
        {
          ko: `스케치 공차 지정 <${tolerance}>:`,
          en: `Specify sketch tolerance <${tolerance}>:`,
          partial: completed,
        },
        (n) => n >= 0,
        tolerance,
      );
      context.set('SKTOLERANCE', tolerance);
    }
  }
}
