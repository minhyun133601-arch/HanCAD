import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { drawEntity, drawKeyword, drawPoint } from './draw-program';
import type { DrawContext, DrawProgram } from './draw-program';
import { outlineDefault, outlineEditable, outlinePolyline } from './draw-outline-common';

export function signedPolygonArea(points: readonly CadPoint[]): number {
  const origin = points[0];
  if (!origin) return 0;
  return (
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length]!;
      return sum + (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
    }, 0) / 2
  );
}
export function validWipeoutBoundary(points: readonly CadPoint[]): boolean {
  if (points.length < 3 || Math.abs(signedPolygonArea(points)) < 1e-12) return false;
  const z = points[0]?.z ?? 0;
  if (points.some((p) => Math.abs((p.z ?? 0) - z) > 1e-9)) return false;
  const turn = (a: CadPoint, b: CadPoint, c: CadPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < points.length; i++)
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const a = points[i]!,
        b = points[(i + 1) % points.length]!,
        c = points[j]!,
        d = points[(j + 1) % points.length]!;
      if (
        turn(a, b, c) * turn(a, b, d) <= 0 &&
        turn(c, d, a) * turn(c, d, b) <= 0 &&
        Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
          Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
        Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
          Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
      )
        return false;
    }
  return true;
}
export function wipeoutEntity(
  context: DrawContext,
  points: readonly CadPoint[],
  id?: string,
): CadPolyline {
  return {
    ...outlinePolyline(context, points, true, [], undefined, id),
    sourceType: 'WIPEOUT',
    drawFill: [points.map((p) => ({ ...p }))],
    frameMode: outlineDefault(context, 'WIPEOUTFRAME', 1),
  };
}
function wipeoutSourcePoints(entity: CadEntity): CadPoint[] | undefined {
  if (entity.type !== 'polyline' && entity.type !== 'rect') return undefined;
  if (
    ['REGION', 'WIPEOUT', 'SOLID', 'TRACE', 'MLINE', '3DPOLY', 'HELIX'].includes(
      entity.sourceType ?? '',
    )
  )
    return undefined;
  if (entity.curve) {
    const curve = entity.curve;
    if (
      (curve.type !== 'LWPOLYLINE' && curve.type !== 'POLYLINE') ||
      !curve.closed ||
      curve.is3D ||
      curve.constantWidth ||
      curve.vertices.some((v) => v.bulge || v.startWidth || v.endWidth)
    )
      return undefined;
    return curve.vertices.map((v) => ({ x: v.position.x, y: -v.position.y, z: v.position.z }));
  }
  return entity.closed &&
    !entity.bulges?.some(Boolean) &&
    !(entity.constantWidth ?? 0) &&
    !entity.startWidths?.some(Boolean) &&
    !entity.endWidths?.some(Boolean)
    ? entity.points
    : undefined;
}
export function* drawWipeout(context: DrawContext): DrawProgram {
  while (true) {
    const value = yield {
      kind: 'point',
      ko: '첫 번째 점 지정 또는 [프레임(F)/폴리선(P)] <폴리선>:',
      en: 'Specify first point or [Frames/Polyline] <Polyline>:',
    };
    const key = drawKeyword(value),
      first = drawPoint(value);
    if (key === 'F' || key === 'FRAMES') {
      while (true) {
        const mode = drawKeyword(
          yield {
            kind: 'keyword',
            ko: '모드 입력 [켜기(ON)/끄기(OFF)/표시하되 플롯 안 함(D)] <켜기>:',
            en: 'Enter mode [ON/OFF/Display but not plot] <ON>:',
          },
        );
        const result =
          mode === 'OFF' || mode === '0'
            ? 0
            : mode === 'D' || mode === 'DISPLAY' || mode === '2'
              ? 2
              : mode === 'ON' || mode === '1' || mode === ''
                ? 1
                : undefined;
        if (result !== undefined) {
          context.set('WIPEOUTFRAME', result);
          return { entities: [] };
        }
      }
    }
    if (!first && (key === '' || key === 'P' || key === 'POLYLINE')) {
      let source: CadPolyline | undefined;
      let invalid = false;
      while (!source) {
        const entity = drawEntity(
          yield {
            kind: 'entity',
            ko: '닫힌 폴리선 선택:',
            en: 'Select a closed polyline:',
            ...(invalid
              ? {
                  notice: {
                    ko: '폭과 호 세그먼트가 없는 닫힌 폴리선을 선택하십시오.',
                    en: 'Select a closed polyline with zero width and no arc segments.',
                  },
                }
              : {}),
          },
        );
        const points = entity ? wipeoutSourcePoints(entity) : undefined;
        if (
          entity &&
          points &&
          validWipeoutBoundary(points) &&
          (entity.type === 'polyline' || entity.type === 'rect')
        )
          source = { ...entity, points };
        invalid = !source;
      }
      let locked = false;
      while (true) {
        const answer = drawKeyword(
          yield {
            kind: 'keyword',
            ko: '폴리선을 지우시겠습니까? [예(Y)/아니오(N)] <아니오>:',
            en: 'Erase polyline? [Yes/No] <No>:',
            preview: () => [wipeoutEntity(context, source.points, 'wipeout-preview')],
            ...(locked
              ? {
                  notice: {
                    ko: '잠긴 도면층이나 숨겨진 도면층의 객체를 지울 수 없습니다.',
                    en: 'Cannot erase an object on a locked or hidden layer.',
                  },
                }
              : {}),
          },
        );
        if ((answer === 'Y' || answer === 'YES') && !outlineEditable(context, source)) {
          locked = true;
          continue;
        }
        if (answer === 'Y' || answer === 'YES')
          return { entities: [wipeoutEntity(context, source.points)], eraseIds: [source.id] };
        if (answer === '' || answer === 'N' || answer === 'NO')
          return { entities: [wipeoutEntity(context, source.points)] };
      }
    }
    if (!first) continue;
    const points = [first],
      id = `draft-${crypto.randomUUID()}`;
    while (true) {
      const input = yield {
        kind: 'point',
        ko: '다음 점 지정 또는 [명령 취소(U)/닫기(C)] <닫기>:',
        en: 'Specify next point or [Undo/Close] <Close>:',
        base: points.at(-1)!,
        preview: (p) => [wipeoutEntity(context, [...points, p], id)],
      };
      const point = drawPoint(input),
        option = drawKeyword(input);
      if (point) {
        points.push(point);
        continue;
      }
      if (option === 'U' || option === 'UNDO') {
        if (points.length > 1) points.pop();
        continue;
      }
      if (option === '' || option === 'C' || option === 'CLOSE') {
        if (validWipeoutBoundary(points)) return { entities: [wipeoutEntity(context, points, id)] };
      }
    }
  }
}
