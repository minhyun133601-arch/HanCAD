import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { drawKeyword, drawPoint } from './draw-program';
import type { DrawContext, DrawFactory, DrawProgram } from './draw-program';
import { parseDraftNumber } from './coordinates';
import { drawPline } from './draw-pline';
import { drawRectang } from './draw-rect';
import {
  length,
  offset,
  outlineDefault,
  outlineMemory,
  outlineNumber,
  outlinePoint,
  outlinePolyline,
  rotate,
  unit,
  vector,
} from './draw-outline-common';

export function* drawPolygon(context: DrawContext): DrawProgram {
  const memory = outlineMemory(context);
  let sides: number;
  while (true) {
    const value = yield* outlineNumber(
      context,
      `변의 수 입력 <${memory.get('POLYGON.sides') ?? 4}>:`,
      `Enter number of sides <${memory.get('POLYGON.sides') ?? 4}>:`,
      { min: 3, fallback: Number(memory.get('POLYGON.sides') ?? 4) },
    );
    if (Number.isInteger(value) && value <= 1024) {
      sides = value;
      break;
    }
  }
  memory.set('POLYGON.sides', sides);
  const id = `draft-${crypto.randomUUID()}`;
  const polygon = (center: CadPoint, radius: number, angle: number) =>
    outlinePolyline(
      context,
      Array.from({ length: sides }, (_, index) =>
        offset(
          center,
          {
            x: Math.cos(angle - (index * Math.PI * 2) / sides),
            y: Math.sin(angle - (index * Math.PI * 2) / sides),
          },
          radius,
        ),
      ),
      true,
      [],
      undefined,
      id,
    );
  while (true) {
    const value = yield {
      kind: 'point',
      ko: '폴리곤의 중심 지정 또는 [모서리(E)]:',
      en: 'Specify center of polygon or [Edge]:',
    };
    const key = drawKeyword(value),
      center = drawPoint(value);
    if (key === 'E' || key === 'EDGE') {
      const a = yield* outlinePoint(
        '모서리의 첫 번째 끝점 지정:',
        'Specify first endpoint of edge:',
      );
      const build = (b: CadPoint) => {
        const edge = unit(vector(a, b)),
          half = length(a, b) / 2;
        const c = offset(
          offset(a, edge, half),
          rotate(edge, -Math.PI / 2),
          half / Math.tan(Math.PI / sides),
        );
        return polygon(c, length(a, c), Math.atan2(a.y - c.y, a.x - c.x));
      };
      const b = yield* outlinePoint(
        '모서리의 두 번째 끝점 지정:',
        'Specify second endpoint of edge:',
        { base: a, preview: (p) => [build(p)] },
      );
      if (length(a, b) <= 1e-12) continue;
      return { entities: [build(b)] };
    }
    if (!center) continue;
    let circumscribed = memory.get('POLYGON.mode') === 'C';
    while (true) {
      const answer = drawKeyword(
        yield {
          kind: 'keyword',
          ko: `옵션 입력 [원에 내접(I)/원에 외접(C)] <${circumscribed ? '외접' : '내접'}>:`,
          en: `Enter an option [Inscribed in circle/Circumscribed about circle] <${circumscribed ? 'C' : 'I'}>:`,
        },
      );
      if (answer === '') break;
      if (answer === 'I' || answer === 'INSCRIBED' || answer === 'INSCRIBED IN CIRCLE') {
        circumscribed = false;
        break;
      }
      if (answer === 'C' || answer === 'CIRCUMSCRIBED' || answer === 'CIRCUMSCRIBED ABOUT CIRCLE') {
        circumscribed = true;
        break;
      }
    }
    memory.set('POLYGON.mode', circumscribed ? 'C' : 'I');
    const factor = circumscribed ? 1 / Math.cos(Math.PI / sides) : 1;
    const fromPoint = (p: CadPoint) =>
      polygon(
        center,
        length(center, p) * factor,
        Math.atan2(p.y - center.y, p.x - center.x) + (circumscribed ? Math.PI / sides : 0),
      );
    while (true) {
      const radiusValue = yield {
        kind: 'number',
        ko: '원의 반지름 지정:',
        en: 'Specify radius of circle:',
        base: center,
        preview: (p) => [fromPoint(p)],
      };
      const p = drawPoint(radiusValue);
      if (p && length(center, p) > 1e-12) return { entities: [fromPoint(p)] };
      const radius =
        typeof radiusValue === 'string'
          ? parseDraftNumber(radiusValue, context.coordinates())
          : undefined;
      if (radius !== undefined && radius > 0) {
        const angle = Math.PI / 2 + Math.PI / sides - outlineDefault(context, 'SNAPANG', 0);
        return { entities: [polygon(center, radius * factor, angle)] };
      }
    }
  }
}
export function* drawDonut(context: DrawContext): DrawProgram {
  let inside = yield* outlineNumber(
    context,
    `도넛의 내부 지름 지정 <${outlineDefault(context, 'DONUTID', 0.5)}>:`,
    `Specify inside diameter of donut <${outlineDefault(context, 'DONUTID', 0.5)}>:`,
    { min: 0, fallback: outlineDefault(context, 'DONUTID', 0.5) },
  );
  let outside = yield* outlineNumber(
    context,
    `도넛의 외부 지름 지정 <${outlineDefault(context, 'DONUTOD', 1)}>:`,
    `Specify outside diameter of donut <${outlineDefault(context, 'DONUTOD', 1)}>:`,
    { min: 0, strict: true, fallback: outlineDefault(context, 'DONUTOD', 1) },
  );
  if (inside > outside) [inside, outside] = [outside, inside];
  context.set('DONUTID', inside);
  context.set('DONUTOD', outside);
  const entities: CadEntity[] = [];
  const make = (center: CadPoint, id?: string) => {
    const radius = (inside + outside) / 4,
      width = (outside - inside) / 2;
    return {
      ...outlinePolyline(
        context,
        [offset(center, { x: 1, y: 0 }, radius), offset(center, { x: -1, y: 0 }, radius)],
        true,
        [-1, -1],
        undefined,
        id,
      ),
      constantWidth: width,
      sourceType: 'DONUT',
    };
  };
  while (true) {
    const value = yield {
      kind: 'point',
      ko: '도넛의 중심 지정 또는 <종료>:',
      en: 'Specify center of donut or <exit>:',
      partial: entities,
      preview: (p) => [...entities, make(p, 'draw-donut-preview')],
    };
    const point = drawPoint(value);
    if (point) entities.push(make(point));
    else if (drawKeyword(value) === '') return { entities };
  }
}

export const outlineFactories: Record<string, DrawFactory> = {
  PLINE: drawPline,
  RECTANG: drawRectang,
  POLYGON: drawPolygon,
  DONUT: drawDonut,
};
