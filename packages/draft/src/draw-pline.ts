import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { drawKeyword, drawPoint } from './draw-program';
import type { DrawContext, DrawProgram } from './draw-program';
import {
  length,
  offset,
  outlineDefault,
  outlineNumber,
  outlinePolyline,
  unit,
  vector,
} from './draw-outline-common';
import { plineArcOption } from './draw-pline-arc';
import { alternateArcBulge, endTangent, tangentBulge } from './draw-pline-geometry';
import type { PlineSegment } from './draw-pline-geometry';

export function* drawPline(context: DrawContext): DrawProgram {
  let first: CadPoint | undefined;
  while (!first) {
    const value = yield { kind: 'point', ko: '시작점 지정:', en: 'Specify start point:' };
    first =
      drawPoint(value) ?? (drawKeyword(value) === '' ? context.continuation?.point : undefined);
  }
  const points: CadPoint[] = [{ ...first }],
    bulges: number[] = [],
    starts: number[] = [],
    ends: number[] = [];
  const id = `draft-${crypto.randomUUID()}`;
  let mode: 'line' | 'arc' = 'line',
    closed = false;
  let startWidth = outlineDefault(context, 'PLINEWID', 0),
    endWidth = startWidth;
  const initialTangent = context.continuation?.tangent ?? { x: 1, y: 0 };
  const implicitBulge = (start: CadPoint, end: CadPoint): number | undefined => {
    const bulge = tangentBulge(start, end, tangent());
    return bulge === undefined
      ? undefined
      : context.isControlPressed?.()
        ? alternateArcBulge(bulge)
        : bulge;
  };
  const tangent = (): CadPoint =>
    points.length > 1
      ? endTangent(points.at(-2)!, points.at(-1)!, bulges.at(-1) ?? 0)
      : initialTangent;
  const entity = (): CadEntity =>
    outlinePolyline(context, points, closed, bulges, { start: starts, end: ends }, id);
  const partial = (): CadEntity[] => (points.length > 1 ? [entity()] : []);
  const planarPoint = (point: CadPoint): CadPoint => ({
    x: point.x,
    y: point.y,
    ...(first.z === undefined ? {} : { z: first.z }),
  });
  const preview = (point: CadPoint, bulge = 0): CadEntity[] => [
    outlinePolyline(
      context,
      [...points, planarPoint(point)],
      false,
      [...bulges, bulge],
      { start: [...starts, startWidth], end: [...ends, endWidth] },
      id,
    ),
  ];
  const append = (segment: PlineSegment): void => {
    if (length(points.at(-1)!, segment.end) <= 1e-12) return;
    points.push(planarPoint(segment.end));
    bulges.push(segment.bulge);
    starts.push(startWidth);
    ends.push(endWidth);
    startWidth = endWidth;
  };
  while (true) {
    const start = points.at(-1)!;
    const canClose = points.length > 1;
    const lineOptionsKo = `호(A)/${canClose ? '닫기(C)/' : ''}반폭(H)/길이(L)/명령 취소(U)/폭(W)`;
    const lineOptionsEn = `Arc/${canClose ? 'Close/' : ''}Halfwidth/Length/Undo/Width`;
    const arcOptionsKo = `각도(A)/중심(CE)/${canClose ? '닫기(CL)/' : ''}방향(D)/반폭(H)/선(L)/반지름(R)/두 번째 점(S)/명령 취소(U)/폭(W)`;
    const arcOptionsEn = `Angle/CEnter/${canClose ? 'CLose/' : ''}Direction/Halfwidth/Line/Radius/Second pt/Undo/Width`;
    const value = yield {
      kind: 'point',
      base: start,
      partial: partial(),
      ko:
        mode === 'line'
          ? `다음 점 지정 또는 [${lineOptionsKo}]:`
          : `호의 끝점 지정 또는 [${arcOptionsKo}]:`,
      en:
        mode === 'line'
          ? `Specify next point or [${lineOptionsEn}]:`
          : `Specify endpoint of arc or [${arcOptionsEn}]:`,
      preview: (p) => preview(p, mode === 'arc' ? (implicitBulge(start, p) ?? 0) : 0),
    };
    const key = drawKeyword(value),
      point = drawPoint(value);
    if (typeof value === 'string' && key === '') return { entities: partial() };
    if (key === 'U' || key === 'UNDO') {
      if (points.length > 1) {
        points.pop();
        bulges.pop();
        starts.pop();
        ends.pop();
      }
      continue;
    }
    if (key === 'W' || key === 'WIDTH' || key === 'H' || key === 'HALFWIDTH') {
      const half = key === 'H' || key === 'HALFWIDTH',
        factor = half ? 2 : 1;
      const startLabel = half ? '시작 반폭' : '시작 폭',
        endLabel = half ? '끝 반폭' : '끝 폭';
      startWidth =
        factor *
        (yield* outlineNumber(
          context,
          `${startLabel} 지정 <${startWidth / factor}>:`,
          `Specify starting ${half ? 'half-width' : 'width'} <${startWidth / factor}>:`,
          { fallback: startWidth / factor, min: 0, partial: partial() },
        ));
      endWidth =
        factor *
        (yield* outlineNumber(
          context,
          `${endLabel} 지정 <${startWidth / factor}>:`,
          `Specify ending ${half ? 'half-width' : 'width'} <${startWidth / factor}>:`,
          { fallback: startWidth / factor, min: 0, partial: partial() },
        ));
      context.set('PLINEWID', endWidth);
      continue;
    }
    if (
      (mode === 'line' && (key === 'C' || key === 'CLOSE')) ||
      (mode === 'arc' && (key === 'CL' || key === 'CLOSE'))
    ) {
      if (!canClose) continue;
      const bulge = mode === 'arc' ? implicitBulge(start, points[0]!) : 0;
      if (bulge === undefined) continue;
      bulges.push(bulge);
      starts.push(startWidth);
      ends.push(endWidth);
      closed = true;
      return { entities: [entity()] };
    }
    if (mode === 'line' && (key === 'A' || key === 'ARC')) {
      mode = 'arc';
      continue;
    }
    if (mode === 'arc' && (key === 'L' || key === 'LINE')) {
      mode = 'line';
      continue;
    }
    if (mode === 'line' && (key === 'L' || key === 'LENGTH')) {
      const distance = yield* outlineNumber(context, '선의 길이 지정:', 'Specify length of line:', {
        min: 0,
        strict: true,
        partial: partial(),
        base: start,
        preview: (p) => preview(offset(start, unit(tangent()), length(start, p))),
      });
      append({ end: offset(start, unit(tangent()), distance), bulge: 0 });
      continue;
    }
    if (point) {
      const bulge = mode === 'arc' ? implicitBulge(start, point) : 0;
      if (bulge !== undefined) append({ end: point, bulge });
      continue;
    }
    if (mode === 'arc') {
      const segment = yield* plineArcOption(context, key, {
        start,
        tangent: unit(tangent()),
        partial: partial(),
        preview,
      });
      if (segment) append(segment);
    } else if (typeof value === 'string') {
      // Direct distance strings are normally resolved against the cursor by the host.
      const distance = Number(value);
      if (Number.isFinite(distance) && distance > 0)
        append({ end: offset(start, unit(vector({ x: 0, y: 0 }, tangent())), distance), bulge: 0 });
    }
  }
}
