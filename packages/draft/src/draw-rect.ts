import type { CadPoint } from '@hancad/legacy-bridge';
import { drawKeyword, drawPoint } from './draw-program';
import type { DrawContext, DrawProgram, DrawRequest, DrawValue } from './draw-program';
import {
  outlineAngle,
  outlineDefault,
  outlineMemory,
  outlineNumber,
  outlinePoint,
  rotate,
  vector,
} from './draw-outline-common';
import { rectangleAreaLoss, rectangleCornersFit, rectangleEntity } from './draw-rect-geometry';
import type { RectangleOptions } from './draw-rect-geometry';

function rememberedOptions(context: DrawContext): RectangleOptions {
  const memory = outlineMemory(context);
  const read = (name: string): number => Number(memory.get(`RECTANG.${name}`) ?? 0);
  return {
    chamferA: read('chamferA'),
    chamferB: read('chamferB'),
    fillet: read('fillet'),
    width: read('width'),
    rotation: read('rotation'),
    elevation: outlineDefault(context, 'ELEVATION', 0),
    thickness: outlineDefault(context, 'THICKNESS', 0),
  };
}
function* rectangleRotation(
  context: DrawContext,
  origin: CadPoint,
  current: number,
): Generator<DrawRequest, number, DrawValue> {
  while (true) {
    const value = yield {
      kind: 'angle',
      ko: `회전 각도 지정 또는 [점 선택(P)] <${(current * 180) / Math.PI}>:`,
      en: `Specify rotation angle or [Pick points] <${(current * 180) / Math.PI}>:`,
      base: origin,
    };
    const key = drawKeyword(value);
    if (typeof value === 'string' && key === '') return current;
    if (key === 'P' || key === 'PICK' || key === 'PICK POINTS') {
      const a = yield* outlinePoint('첫 번째 점 지정:', 'Specify first point:');
      const b = yield* outlinePoint('두 번째 점 지정:', 'Specify second point:', { base: a });
      return Math.atan2(-(b.y - a.y), b.x - a.x);
    }
    const angle = outlineAngle(value, context, origin);
    if (angle !== undefined) return angle;
  }
}
export function* drawRectang(context: DrawContext): DrawProgram {
  const options = rememberedOptions(context),
    memory = outlineMemory(context);
  const save = (name: keyof RectangleOptions, value: number): void => {
    options[name] = value;
    memory.set(`RECTANG.${name}`, value);
  };
  const id = `draft-${crypto.randomUUID()}`;
  let first: CadPoint | undefined;
  while (!first) {
    const value = yield {
      kind: 'point',
      ko: '첫 번째 구석점 지정 또는 [모따기(C)/고도(E)/모깎기(F)/두께(T)/폭(W)]:',
      en: 'Specify first corner point or [Chamfer/Elevation/Fillet/Thickness/Width]:',
    };
    first = drawPoint(value);
    if (first) break;
    const key = drawKeyword(value);
    if (key === 'C' || key === 'CHAMFER') {
      save(
        'chamferA',
        yield* outlineNumber(
          context,
          `직사각형의 첫 번째 모따기 거리 지정 <${options.chamferA}>:`,
          `Specify first chamfer distance for rectangles <${options.chamferA}>:`,
          { min: 0, fallback: options.chamferA },
        ),
      );
      save(
        'chamferB',
        yield* outlineNumber(
          context,
          `직사각형의 두 번째 모따기 거리 지정 <${options.chamferB}>:`,
          `Specify second chamfer distance for rectangles <${options.chamferB}>:`,
          { min: 0, fallback: options.chamferB },
        ),
      );
      save('fillet', 0);
    } else if (key === 'F' || key === 'FILLET') {
      save(
        'fillet',
        yield* outlineNumber(
          context,
          `직사각형의 모깎기 반지름 지정 <${options.fillet}>:`,
          `Specify fillet radius for rectangles <${options.fillet}>:`,
          { min: 0, fallback: options.fillet },
        ),
      );
      save('chamferA', 0);
      save('chamferB', 0);
    } else if (key === 'W' || key === 'WIDTH') {
      save(
        'width',
        yield* outlineNumber(
          context,
          `직사각형의 선 폭 지정 <${options.width}>:`,
          `Specify line width for rectangles <${options.width}>:`,
          { min: 0, fallback: options.width },
        ),
      );
    } else if (key === 'E' || key === 'ELEVATION' || key === 'T' || key === 'THICKNESS') {
      const elevation = key === 'E' || key === 'ELEVATION',
        name = elevation ? 'elevation' : 'thickness';
      const number = yield* outlineNumber(
        context,
        `직사각형의 ${elevation ? '고도' : '두께'} 지정 <${options[name]}>:`,
        `Specify ${name} for rectangles <${options[name]}>:`,
        { fallback: options[name] },
      );
      save(name, number);
      context.set(elevation ? 'ELEVATION' : 'THICKNESS', number);
    }
  }
  if (first.z !== undefined) options.elevation = first.z;
  const origin = first;
  const local = (point: CadPoint): CadPoint => rotate(vector(origin, point), options.rotation);
  const build = (dx: number, dy: number) => rectangleEntity(context, origin, dx, dy, options, id);
  while (true) {
    const value = yield {
      kind: 'point',
      ko: '다른 구석점 지정 또는 [면적(A)/치수(D)/회전(R)]:',
      en: 'Specify other corner point or [Area/Dimensions/Rotation]:',
      base: origin,
      preview: (point) => {
        const p = local(point);
        return [build(p.x, p.y)];
      },
    };
    const key = drawKeyword(value),
      point = drawPoint(value);
    if (point) {
      const p = local(point);
      return { entities: [build(p.x, p.y)] };
    }
    if (key === 'R' || key === 'ROTATION') {
      save('rotation', yield* rectangleRotation(context, origin, options.rotation));
      continue;
    }
    if (key === 'A' || key === 'AREA') {
      const area = yield* outlineNumber(
        context,
        '직사각형의 면적 입력:',
        'Enter area of rectangle:',
        { min: 0, strict: true },
      );
      let width = false;
      while (true) {
        const answer = drawKeyword(
          yield {
            kind: 'keyword',
            ko: '직사각형 치수 계산 기준 [길이(L)/너비(W)] <길이>:',
            en: 'Calculate rectangle dimensions based on [Length/Width] <Length>:',
          },
        );
        if (answer === 'W' || answer === 'WIDTH') {
          width = true;
          break;
        }
        if (answer === '' || answer === 'L' || answer === 'LENGTH') break;
      }
      const known = yield* outlineNumber(
        context,
        `직사각형의 ${width ? '너비' : '길이'} 입력:`,
        `Enter rectangle ${width ? 'width' : 'length'}:`,
        { min: 0, strict: true },
      );
      let other = (area + rectangleAreaLoss(options)) / known;
      if (!rectangleCornersFit(options, width ? other : known, width ? known : other))
        other = area / known;
      return { entities: [build(width ? other : known, -(width ? known : other))] };
    }
    if (key === 'D' || key === 'DIMENSIONS') {
      const dx = yield* outlineNumber(
        context,
        '직사각형의 길이 지정:',
        'Specify length for rectangles:',
        { min: 0, strict: true, fallback: Number(memory.get('RECTANG.length') ?? 10) },
      );
      const dy = yield* outlineNumber(
        context,
        '직사각형의 너비 지정:',
        'Specify width for rectangles:',
        { min: 0, strict: true, fallback: Number(memory.get('RECTANG.height') ?? 10) },
      );
      memory.set('RECTANG.length', dx);
      memory.set('RECTANG.height', dy);
      const oriented = (p: CadPoint) => {
        const q = local(p);
        return build((q.x < 0 ? -1 : 1) * dx, (q.y <= 0 ? -1 : 1) * dy);
      };
      const corner = yield* outlinePoint('다른 구석점 지정:', 'Specify other corner point:', {
        base: origin,
        preview: (p) => [oriented(p)],
      });
      return { entities: [oriented(corner)] };
    }
  }
}
