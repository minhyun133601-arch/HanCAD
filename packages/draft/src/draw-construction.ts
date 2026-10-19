import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import {
  curveEntity,
  difference,
  entityDirection,
  heading,
  numeric,
  pointInput,
  unit,
  wcs,
} from './draw-curve-helpers';
import {
  drawEntity,
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawProgram,
  type DrawRequest,
  type DrawValue,
} from './draw-program';

export function constructionEntity(
  context: DrawContext,
  base: CadPoint,
  direction: CadPoint,
  ray = false,
): CadEntity {
  const normalized = unit(direction)!;
  return curveEntity(
    context,
    { type: ray ? 'RAY' : 'XLINE', basePoint: wcs(base), direction: wcs(normalized) },
    [base, { x: base.x + normalized.x, y: base.y + normalized.y }],
  );
}
function* repetitions(
  context: DrawContext,
  base: CadPoint | undefined,
  direction: CadPoint | undefined,
  ray = false,
): DrawProgram {
  const entities: CadEntity[] = [];
  for (;;) {
    const input = yield {
      kind: 'point',
      partial: entities,
      ko: '통과점 지정:',
      en: 'Specify through point:',
      ...(base ? { base } : {}),
      preview: (p: CadPoint) => {
        const origin = base ?? p,
          vector = direction ?? (base ? difference(p, base) : undefined);
        return vector && unit(vector)
          ? [...entities, constructionEntity(context, origin, vector, ray)]
          : entities;
      },
    };
    if (input === '') return { entities };
    const point = drawPoint(input);
    if (!point) continue;
    const origin = base ?? point,
      vector = direction ?? (base ? difference(point, base) : undefined);
    if (vector && unit(vector)) entities.push(constructionEntity(context, origin, vector, ray));
  }
}
export function* rayProgram(context: DrawContext): DrawProgram {
  const base = yield* pointInput({ ko: '시작점 지정:', en: 'Specify start point:' });
  return yield* repetitions(context, base, undefined, true);
}
function* referenceLine(): Generator<
  DrawRequest,
  { base: CadPoint; direction: CadPoint },
  DrawValue
> {
  for (;;) {
    const entity = drawEntity(
      yield { kind: 'entity', ko: '선 객체 선택:', en: 'Select a line object:' },
    );
    const line = entity && entityDirection(entity);
    if (line) return line;
  }
}
function* offset(context: DrawContext): DrawProgram {
  let through = false,
    amount: number | undefined;
  const remembered = Number(context.get('OFFSETDIST'));
  for (;;) {
    const value = yield {
      kind: 'number',
      ko: `간격띄우기 거리 지정 또는 [통과점(T)] <${remembered > 0 ? remembered.toFixed(4) : '통과점'}>:`,
      en: `Specify offset distance or [Through] <${remembered > 0 ? remembered.toFixed(4) : 'Through'}>:`,
    };
    const option = drawKeyword(value);
    if (option === 'T' || option === 'THROUGH' || (value === '' && !(remembered > 0))) {
      through = true;
      context.set('OFFSETDIST', -1);
      break;
    }
    amount = value === '' ? remembered : numeric(value, context);
    if (amount !== undefined && amount > 0) {
      context.set('OFFSETDIST', amount);
      break;
    }
    const a = drawPoint(value);
    if (a) {
      const b = yield* pointInput({ ko: '두 번째 점 지정:', en: 'Specify second point:', base: a });
      amount = Math.hypot(b.x - a.x, b.y - a.y);
      if (amount > 0) {
        context.set('OFFSETDIST', amount);
        break;
      }
    }
  }
  const entities: CadEntity[] = [];
  for (;;) {
    const value = yield {
      kind: 'entity',
      partial: entities,
      ko: '선 객체 선택 또는 <종료>:',
      en: 'Select a line object or <exit>:',
    };
    if (value === '') return { entities };
    const entity = drawEntity(value),
      line = entity && entityDirection(entity);
    if (!line) continue;
    const normal = { x: -line.direction.y, y: line.direction.x };
    const project = (point: CadPoint): CadPoint => {
      const signed = (point.x - line.base.x) * normal.x + (point.y - line.base.y) * normal.y;
      const shift = through ? signed : (signed < 0 ? -1 : 1) * amount!;
      return { x: line.base.x + normal.x * shift, y: line.base.y + normal.y * shift };
    };
    const side = yield* pointInput({
      partial: entities,
      ko: through ? '통과점 지정:' : '간격띄우기할 면의 점 지정:',
      en: through ? 'Specify through point:' : 'Specify point on side to offset:',
      base: line.base,
      preview: (p) => [...entities, constructionEntity(context, project(p), line.direction)],
    });
    entities.push(constructionEntity(context, project(side), line.direction));
  }
}
export function* xlineProgram(context: DrawContext): DrawProgram {
  for (;;) {
    const input = yield {
      kind: 'point',
      ko: '점 지정 또는 [수평(H)/수직(V)/각도(A)/이등분(B)/간격띄우기(O)]:',
      en: 'Specify a point or [Hor/Ver/Ang/Bisect/Offset]:',
    };
    const option = drawKeyword(input),
      base = drawPoint(input);
    if (base) return yield* repetitions(context, base, undefined);
    if (option === 'H' || option === 'HOR' || option === 'HORIZONTAL')
      return yield* repetitions(context, undefined, { x: 1, y: 0 });
    if (option === 'V' || option === 'VER' || option === 'VERTICAL')
      return yield* repetitions(context, undefined, { x: 0, y: -1 });
    if (option === 'O' || option === 'OFFSET') return yield* offset(context);
    if (option === 'A' || option === 'ANG' || option === 'ANGLE') {
      for (;;) {
        const value = yield {
          kind: 'angle',
          ko: 'X선의 각도 입력 또는 [참조(R)]:',
          en: 'Enter angle of xline or [Reference]:',
        };
        const keyword = drawKeyword(value);
        let angle: number | undefined;
        if (keyword === 'R' || keyword === 'REFERENCE') {
          const reference = yield* referenceLine();
          for (;;) {
            const entered = yield {
              kind: 'angle',
              ko: 'X선의 각도 입력:',
              en: 'Enter angle of xline:',
              base: reference.base,
            };
            const relative = heading(entered, context, reference.base, true);
            if (relative !== undefined) {
              angle = Math.atan2(-reference.direction.y, reference.direction.x) + relative;
              break;
            }
          }
        } else angle = heading(value, context);
        if (angle !== undefined)
          return yield* repetitions(context, undefined, {
            x: Math.cos(angle),
            y: -Math.sin(angle),
          });
      }
    }
    if (option === 'B' || option === 'BISECT') {
      const vertex = yield* pointInput({
        ko: '각도 정점 지정:',
        en: 'Specify angle vertex point:',
      });
      let first: CadPoint | undefined;
      while (!first) {
        const point = yield* pointInput({
          ko: '각도 시작점 지정:',
          en: 'Specify angle start point:',
          base: vertex,
        });
        first = unit(difference(point, vertex));
      }
      const entities: CadEntity[] = [];
      for (;;) {
        const directionFor = (point: CadPoint) => {
          const second = unit(difference(point, vertex));
          if (!second) return undefined;
          return (
            unit({ x: first!.x + second.x, y: first!.y + second.y }) ?? {
              x: -first!.y,
              y: first!.x,
            }
          );
        };
        const value = yield {
          kind: 'point',
          partial: entities,
          ko: '각도 끝점 지정:',
          en: 'Specify angle end point:',
          base: vertex,
          preview: (p: CadPoint) => {
            const direction = directionFor(p);
            return direction
              ? [...entities, constructionEntity(context, vertex, direction)]
              : entities;
          },
        };
        if (value === '') return { entities };
        const point = drawPoint(value),
          direction = point && directionFor(point);
        if (direction) entities.push(constructionEntity(context, vertex, direction));
      }
    }
    if (input === '') return { entities: [] };
  }
}
