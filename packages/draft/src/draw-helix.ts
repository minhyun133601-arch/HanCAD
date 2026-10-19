import {
  evaluateGeometry,
  normalize3,
  objectAxes,
  type HelixGeometry,
  type Vec3,
} from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import {
  curveEntity,
  distance,
  model,
  numeric,
  pointInput,
  scalarInput,
  wcs,
} from './draw-curve-helpers';
import {
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawProgram,
  type DrawRequest,
  type DrawValue,
} from './draw-program';

function* radiusInput(
  context: DrawContext,
  center: CadPoint,
  fallback: number,
  top: boolean,
  baseRadius = 0,
): Generator<DrawRequest, { radius: number; startAngle?: number }, DrawValue> {
  let diameter = false;
  for (;;) {
    const name = top ? '상단' : '밑면',
      english = top ? 'top' : 'base';
    const value = yield {
      kind: 'number',
      ko: `${name} ${diameter ? '지름' : '반지름'} 지정${diameter ? '' : ' 또는 [지름(D)]'} <${(fallback * (diameter ? 2 : 1)).toFixed(4)}>:`,
      en: `Specify ${english} ${diameter ? 'diameter' : 'radius'}${diameter ? '' : ' or [Diameter]'} <${(fallback * (diameter ? 2 : 1)).toFixed(4)}>:`,
      base: center,
    };
    const option = drawKeyword(value);
    if (!diameter && (option === 'D' || option === 'DIAMETER')) {
      diameter = true;
      continue;
    }
    const entered = value === '' ? fallback * (diameter ? 2 : 1) : numeric(value, context, center),
      point = drawPoint(value);
    if (entered !== undefined && entered >= 0 && (!top || entered + baseRadius > 0))
      return {
        radius: entered / (diameter ? 2 : 1),
        ...(point && !top && distance(center, point) > 0
          ? { startAngle: Math.atan2(center.y - point.y, point.x - center.x) }
          : {}),
      };
  }
}
export function helixEntity(context: DrawContext, curve: HelixGeometry): CadEntity {
  // Compatibility points serve generic legacy bounds only; all geometry consumers use the source.
  const count = Math.max(8, Math.ceil(curve.turns * 8));
  const points = Array.from({ length: count + 1 }, (_, i) =>
    model(evaluateGeometry(curve, i / count)),
  );
  return curveEntity(context, curve, points);
}
export function* helixProgram(context: DrawContext): DrawProgram {
  const center = yield* pointInput({
    ko: '밑면의 중심점 지정:',
    en: 'Specify center point of base:',
  });
  const base = yield* radiusInput(
    context,
    center,
    Number(context.memory?.get('HELIX_BASERADIUS') ?? 1),
    false,
  );
  context.memory?.set('HELIX_BASERADIUS', base.radius);
  const top = yield* radiusInput(context, center, base.radius, true, base.radius);
  let turns = Number(context.memory?.get('HELIX_TURNS') ?? 3),
    height = Number(context.memory?.get('HELIX_HEIGHT') ?? 1),
    clockwise = context.memory?.get('HELIX_TWIST') === 'CW';
  let turnHeight: number | undefined,
    turnsExplicit = false;
  const curve = (rise: number, normal: Vec3 = { x: 0, y: 0, z: 1 }): HelixGeometry => ({
    type: 'HELIX',
    center: wcs(center),
    normal,
    xAxis: objectAxes(normal).x,
    baseRadius: base.radius,
    topRadius: top.radius,
    turns: turnHeight ? Math.abs(rise / turnHeight) : turns,
    height: rise,
    clockwise,
    startAngle: base.startAngle ?? 0,
  });
  for (;;) {
    const value = yield {
      kind: 'number',
      ko: `나선 높이 지정 또는 [축 끝점(A)/회전(T)/회전 높이(H)/비틀기(W)] <${height.toFixed(4)}>:`,
      en: `Specify helix height or [Axis endpoint/Turns/turn Height/tWist] <${height.toFixed(4)}>:`,
      base: center,
      preview: (p: CadPoint) => {
        const rise = p.z !== undefined ? p.z - (center.z ?? 0) : distance(center, p);
        const source = curve(rise);
        return source.turns > 0 && source.turns <= 500 ? [helixEntity(context, source)] : [];
      },
    };
    const option = drawKeyword(value);
    if (option === 'T' || option === 'TURNS') {
      turns = yield* scalarInput(
        context,
        { ko: `회전 수 입력 <${turns}>:`, en: `Enter number of turns <${turns}>:` },
        (n) => n > 0 && n <= 500,
        turns,
      );
      context.memory?.set('HELIX_TURNS', turns);
      turnsExplicit = true;
      turnHeight = undefined;
      continue;
    }
    if (option === 'H' || option === 'HEIGHT' || option === 'TURN HEIGHT') {
      if (turnsExplicit) {
        yield {
          kind: 'keyword',
          ko: '회전 수를 지정한 경우 회전 높이를 지정할 수 없습니다. 계속하려면 Enter 키를 누르십시오:',
          en: 'Turn height cannot be specified after the number of turns. Press Enter to continue:',
        };
        continue;
      }
      turnHeight = yield* scalarInput(
        context,
        {
          ko: `회전 높이 지정 <${Math.abs(height / turns).toFixed(4)}>:`,
          en: `Specify turn height <${Math.abs(height / turns).toFixed(4)}>:`,
          base: center,
        },
        (n) => n > 0,
        Math.abs(height / turns),
      );
      continue;
    }
    if (option === 'W' || option === 'TWIST') {
      for (;;) {
        const choice = drawKeyword(
          yield {
            kind: 'keyword',
            ko: `나선 비틀기 방향 입력 [시계 방향(CW)/시계 반대 방향(CCW)] <${clockwise ? 'CW' : 'CCW'}>:`,
            en: `Enter twist direction of helix [CW/CCW] <${clockwise ? 'CW' : 'CCW'}>:`,
          },
        );
        if (!choice) break;
        if (choice === 'CW' || choice === 'CCW') {
          clockwise = choice === 'CW';
          context.memory?.set('HELIX_TWIST', choice);
          break;
        }
      }
      continue;
    }
    let source: HelixGeometry | undefined;
    if (option === 'A' || option === 'AXIS' || option === 'AXIS ENDPOINT') {
      const end = yield* pointInput({
        ko: '축 끝점 지정:',
        en: 'Specify axis endpoint:',
        base: center,
      });
      const dx = end.x - center.x,
        dy = center.y - end.y,
        dz = (end.z ?? 0) - (center.z ?? 0),
        length = Math.hypot(dx, dy, dz);
      if (length > 0) {
        height = length;
        source = curve(length, normalize3({ x: dx, y: dy, z: dz }));
      }
    } else {
      const point = drawPoint(value),
        entered =
          value === ''
            ? height
            : point?.z !== undefined
              ? point.z - (center.z ?? 0)
              : numeric(value, context, center);
      if (entered !== undefined) {
        height = entered;
        source = curve(height);
      }
    }
    if (source && source.turns > 0 && source.turns <= 500) {
      context.memory?.set('HELIX_HEIGHT', height);
      context.memory?.set('HELIX_TURNS', source.turns);
      return { entities: [helixEntity(context, source)] };
    }
  }
}
