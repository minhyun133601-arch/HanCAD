import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import type { PolylineGeometry } from '@hancad/geom';
import { draftEntityBase, draftPolyline } from './entities';
import { parseDraftNumber } from './coordinates';
import { drawKeyword, drawPoint } from './draw-program';
import type { DrawContext, DrawProgram, DrawRequest } from './draw-program';
import { drawMultiline } from './draw-mline';

const wcs = (p: CadPoint) => ({ x: p.x, y: p.y === 0 ? 0 : -p.y, z: p.z ?? 0 });
export function drawNode(context: DrawContext, point: CadPoint): CadEntity {
  return {
    ...draftEntityBase(context.settings),
    type: 'polyline',
    points: [{ ...point }, { ...point }],
    closed: false,
    sourceType: 'POINT',
    curve: { type: 'POINT', position: wcs(point) },
  };
}
export function* pointProgram(context: DrawContext): DrawProgram {
  for (;;) {
    const value = yield { kind: 'point', ko: '점 지정:', en: 'Specify a point:' };
    const point = drawPoint(value);
    if (point) return { entities: [drawNode(context, point)] };
  }
}
function polyline3(context: DrawContext, points: CadPoint[], closed: boolean): CadEntity {
  const curve: PolylineGeometry = {
    type: 'POLYLINE',
    vertices: points.map((p) => ({ position: wcs(p), bulge: 0, startWidth: 0, endWidth: 0 })),
    normal: { x: 0, y: 0, z: 1 },
    is3D: true,
    closed,
    constantWidth: 0,
  };
  return { ...draftPolyline(context.settings, points, closed), sourceType: '3DPOLY', curve };
}
export function* poly3Program(context: DrawContext): DrawProgram {
  const points: CadPoint[] = [];
  for (;;) {
    const partial = points.length > 1 ? [polyline3(context, points, false)] : [];
    const base = points.at(-1);
    const value = yield {
      kind: 'point',
      ko: base ? '선의 끝점 지정 또는 [닫기(C)/명령 취소(U)]:' : '폴리선의 시작점 지정:',
      en: base ? 'Specify endpoint of line or [Close/Undo]:' : 'Specify start point of polyline:',
      ...(base ? { base } : {}),
      partial,
      preview: (point) => (points.length ? [polyline3(context, [...points, point], false)] : []),
    };
    const key = drawKeyword(value),
      point = drawPoint(value);
    if (key === 'U' || key === 'UNDO') {
      points.pop();
      continue;
    }
    if ((key === 'C' || key === 'CLOSE') && points.length > 2)
      return { entities: [polyline3(context, points, true)] };
    if (typeof value === 'string' && !value.trim() && points.length > 1)
      return { entities: partial };
    if (
      point &&
      (!base ||
        Math.hypot(point.x - base.x, point.y - base.y, (point.z ?? 0) - (base.z ?? 0)) > 1e-12)
    )
      points.push(point);
  }
}
export function* solidProgram(context: DrawContext): DrawProgram {
  const entities: CadEntity[] = [];
  let edge: CadPoint[] = [];
  for (;;) {
    const points = [...edge];
    while (points.length < 4) {
      const number = points.length + 1;
      const value = yield {
        kind: 'point',
        ko: `${['첫 번째', '두 번째', '세 번째', '네 번째'][number - 1]} 점 지정${number === 4 ? ' 또는 <종료>' : ''}:`,
        en: `Specify ${['first', 'second', 'third', 'fourth'][number - 1]} point${number === 4 ? ' or <exit>' : ''}:`,
        ...(points.at(-1) ? { base: points.at(-1)! } : {}),
        partial: entities,
        preview: (point) =>
          points.length >= 2
            ? [...entities, filled(context, [...points, point], 'SOLID')]
            : entities,
      };
      const point = drawPoint(value);
      if (point) points.push(point);
      else if (typeof value === 'string' && !value.trim()) {
        if (points.length === 3) entities.push(filled(context, points, 'SOLID'));
        return { entities };
      }
    }
    entities.push(filled(context, points, 'SOLID'));
    edge = points.slice(2);
  }
}
export function filled(
  context: DrawContext,
  vertices: readonly CadPoint[],
  sourceType: string,
): CadEntity {
  const points =
    vertices.length === 4
      ? [vertices[0]!, vertices[1]!, vertices[3]!, vertices[2]!]
      : [...vertices];
  return { ...draftPolyline(context.settings, points, true), sourceType, drawFill: [points] };
}
export function* traceProgram(context: DrawContext): DrawProgram {
  let width = Number(context.get('TRACEWID'));
  for (;;) {
    const value = yield {
      kind: 'number',
      ko: `트레이스 폭 지정 <${width}>:`,
      en: `Specify trace width <${width}>:`,
    };
    const n =
      typeof value === 'string' && value.trim()
        ? parseDraftNumber(value, context.coordinates())
        : width;
    if (n !== undefined && n > 0) {
      width = n;
      context.set('TRACEWID', width);
      break;
    }
  }
  const points: CadPoint[] = [];
  const identity = crypto.randomUUID();
  const traces = (vertices: CadPoint[]): CadEntity[] => {
    if (vertices.length < 2) return [];
    const paths = drawMultiline(
      context,
      vertices,
      false,
      [0.5, -0.5],
      width,
      1,
      'Standard',
    ).drawPaths!;
    return vertices.slice(1).map((_, i) => ({
      ...filled(
        context,
        [paths[0]![i]!, paths[1]![i]!, paths[0]![i + 1]!, paths[1]![i + 1]!],
        'TRACE',
      ),
      id: `trace-${identity}-${i}`,
    }));
  };
  for (;;) {
    const base = points.at(-1),
      partial = traces(points);
    const request: DrawRequest = {
      kind: 'point',
      ko: base ? '다음 점 지정:' : '시작점 지정:',
      en: base ? 'Specify next point:' : 'Specify start point:',
      ...(base ? { base } : {}),
      partial,
      preview: (point) => (base ? traces([...points, point]) : []),
    };
    const value = yield request,
      point = drawPoint(value);
    if (point) points.push(point);
    else if (typeof value === 'string' && !value.trim() && points.length > 1)
      return { entities: partial };
  }
}
