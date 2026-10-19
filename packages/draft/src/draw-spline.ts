import { fitSpline, splineEvaluation, type SplineGeometry, type Vec3 } from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import {
  curveEntity,
  difference,
  distance,
  heading,
  scalarInput,
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

export function splineFromPoints(
  points: readonly CadPoint[],
  fit: boolean,
  degree: number,
  knots: number,
  closed = false,
  fitTolerance = 0,
  startTangent?: Vec3,
  endTangent?: Vec3,
  periodic = closed,
): SplineGeometry {
  const controls = points.map(wcs);
  const source: SplineGeometry = {
    type: 'SPLINE',
    degree: fit ? 3 : degree,
    knots: [],
    controlPoints: [],
    weights: [],
    fitPoints: fit ? controls : [],
    closed,
    periodic: closed && periodic,
    fitTolerance,
    knotParameterization: knots === 1 ? 'centripetal' : knots === 2 ? 'uniform' : 'chord',
    ...(startTangent ? { startTangent } : {}),
    ...(endTangent ? { endTangent } : {}),
  };
  if (fit) return fitSpline(source);
  if (closed && periodic) {
    controls.push(...controls.slice(0, degree));
    source.knots = Array.from({ length: controls.length + degree + 1 }, (_, i) => i);
  } else {
    if (closed) controls.push(controls[0]!);
    const spanCount = controls.length - degree;
    source.knots = [
      ...Array<number>(degree + 1).fill(0),
      ...Array.from({ length: Math.max(0, spanCount - 1) }, (_, i) => (i + 1) / spanCount),
      ...Array<number>(degree + 1).fill(1),
    ];
  }
  return { ...source, controlPoints: controls, weights: controls.map(() => 1) };
}
const splineEntity = (context: DrawContext, spline: SplineGeometry, points: readonly CadPoint[]) =>
  curveEntity(context, spline, points, spline.closed);
function* tangentInput(
  context: DrawContext,
  point: CadPoint,
  start: boolean,
  points: readonly CadPoint[],
  knots: number,
): Generator<DrawRequest, Vec3 | undefined, DrawValue> {
  for (;;) {
    const value = yield {
      kind: 'angle',
      ko: start ? '시작 접선 지정:' : '끝 접선 지정:',
      en: start ? 'Specify start tangent:' : 'Specify end tangent:',
      base: point,
    };
    if (value === '') return undefined;
    const selected = drawPoint(value);
    const direction = selected
      ? unit(start ? difference(selected, point) : difference(point, selected))
      : (() => {
          const angle = heading(value, context, point);
          return angle === undefined ? undefined : { x: Math.cos(angle), y: -Math.sin(angle) };
        })();
    if (!direction) continue;
    const natural = splineFromPoints(points, true, 3, knots);
    const derivative = splineEvaluation(natural, start ? 0 : 1).derivative;
    const magnitude = Math.hypot(derivative.x, derivative.y, derivative.z);
    return { x: direction.x * magnitude, y: -direction.y * magnitude, z: 0 };
  }
}
export function splineObject(entity: CadEntity): SplineGeometry | undefined {
  if (entity.curve?.type === 'SPLINE' && entity.sourceType?.startsWith('POLYLINE_SPLINE'))
    return structuredClone(entity.curve);
  if (
    entity.type !== 'polyline' ||
    (entity.sourceType !== 'POLYLINE_SPLINE_QUADRATIC' &&
      entity.sourceType !== 'POLYLINE_SPLINE_CUBIC')
  )
    return undefined;
  const degree = entity.sourceType === 'POLYLINE_SPLINE_QUADRATIC' ? 2 : 3;
  if (entity.points.length < 2) return undefined;
  const points = [...entity.points];
  while (!entity.closed && points.length <= degree) points.splice(1, 0, points[0]!);
  return splineFromPoints(points, false, degree, 2, entity.closed);
}
function* objectInput(context: DrawContext): DrawProgram {
  const entities: CadEntity[] = [],
    eraseIds: string[] = [];
  for (;;) {
    const value = yield {
      kind: 'entity',
      partial: entities,
      partialEraseIds: eraseIds,
      ko: '스플라인 맞춤 폴리선 선택:',
      en: 'Select spline-fit polyline:',
    };
    if (value === '') return { entities, eraseIds };
    const entity = drawEntity(value);
    if (!entity || eraseIds.includes(entity.id)) continue;
    const curve = splineObject(entity);
    if (!curve) continue;
    const points =
      entity.type === 'polyline'
        ? entity.points
        : curve.controlPoints.map((p) => ({ x: p.x, y: -p.y }));
    entities.push(splineEntity(context, curve, points));
    if (Number(context.get('DELOBJ')) !== 0) eraseIds.push(entity.id);
  }
}
export function* splineProgram(context: DrawContext): DrawProgram {
  let fit = Number(context.get('SPLMETHOD')) !== 1,
    degree = Number(context.memory?.get('SPLINE.DEGREE') ?? context.get('SPLDEGREE')) || 3,
    knots = Number(context.get('SPLKNOTS')) || 0,
    tolerance = 0;
  let startTangent: Vec3 | undefined, endTangent: Vec3 | undefined;
  const points: CadPoint[] = [];
  const preview = (p: CadPoint): CadEntity[] => {
    const next = points.at(-1) && distance(points.at(-1)!, p) === 0 ? points : [...points, p];
    if (next.length < (fit ? 2 : degree + 1)) return [];
    return [
      splineEntity(
        context,
        splineFromPoints(next, fit, degree, knots, false, tolerance, startTangent, endTangent),
        next,
      ),
    ];
  };
  for (;;) {
    const value = yield {
      kind: 'point',
      ko: points.length
        ? `다음 점 지정 또는 [닫기(C)/명령 취소(U)${fit ? '/시작 접선(ST)/끝 접선(ET)/공차(T)' : ''}]:`
        : `첫 번째 점 지정 또는 [방법(M)${fit ? '/매듭(K)' : '/차수(D)'}/객체(O)]:`,
      en: points.length
        ? `Specify next point or [Close/Undo${fit ? '/start Tangency/end Tangency/Tolerance' : ''}]:`
        : `Specify first point or [Method${fit ? '/Knots' : '/Degree'}/Object]:`,
      ...(points.length ? { base: points.at(-1)! } : {}),
      preview,
    };
    const option = drawKeyword(value);
    if (!points.length && (option === 'M' || option === 'METHOD')) {
      for (;;) {
        const method = drawKeyword(
          yield {
            kind: 'keyword',
            ko: `스플라인 작성 방법 입력 [맞춤(F)/조정 정점(CV)] <${fit ? '맞춤' : '조정 정점'}>:`,
            en: `Enter spline creation method [Fit/CV] <${fit ? 'Fit' : 'CV'}>:`,
          },
        );
        if (method === '') break;
        if (method === 'F' || method === 'FIT' || method === 'CV') {
          fit = method !== 'CV';
          context.set('SPLMETHOD', fit ? 0 : 1);
          break;
        }
      }
      continue;
    }
    if (!points.length && (option === 'O' || option === 'OBJECT'))
      return yield* objectInput(context);
    if (!points.length && !fit && (option === 'D' || option === 'DEGREE')) {
      degree = yield* scalarInput(
        context,
        { ko: `스플라인의 차수 입력 <${degree}>:`, en: `Enter degree of spline <${degree}>:` },
        (n) => Number.isInteger(n) && n >= 1 && n <= 10,
        degree,
      );
      context.memory?.set('SPLINE.DEGREE', degree);
      if (degree <= 5) context.set('SPLDEGREE', degree);
      continue;
    }
    if (!points.length && fit && (option === 'K' || option === 'KNOTS')) {
      for (;;) {
        const knot = drawKeyword(
          yield {
            kind: 'keyword',
            ko: '스플라인 매듭 매개변수화 입력 [현(C)/제곱근(S)/균일(U)] <현>:',
            en: 'Enter spline knot parameterization [Chord/Square root/Uniform] <Chord>:',
          },
        );
        if (knot === '') break;
        if (['C', 'CHORD', 'S', 'SQUARE', 'SQUARE ROOT', 'U', 'UNIFORM'].includes(knot)) {
          knots = knot.startsWith('C') ? 0 : knot.startsWith('S') ? 1 : 2;
          context.set('SPLKNOTS', knots);
          break;
        }
      }
      continue;
    }
    if (points.length && (option === 'U' || option === 'UNDO')) {
      points.pop();
      continue;
    }
    if (fit && points.length && (option === 'T' || option === 'TOLERANCE')) {
      tolerance = yield* scalarInput(
        context,
        { ko: `맞춤 공차 지정 <${tolerance}>:`, en: `Specify fit tolerance <${tolerance}>:` },
        (n) => n >= 0,
        tolerance,
      );
      continue;
    }
    if (
      fit &&
      points.length >= 2 &&
      (option === 'ST' ||
        option === 'START TANGENCY' ||
        option === 'ET' ||
        option === 'END TANGENCY')
    ) {
      if (option === 'ST' || option === 'START TANGENCY')
        startTangent = yield* tangentInput(context, points[0]!, true, points, knots);
      else endTangent = yield* tangentInput(context, points.at(-1)!, false, points, knots);
      continue;
    }
    const closed = option === 'C' || option === 'CLOSE';
    if ((value === '' || closed) && points.length >= (fit ? (closed ? 3 : 2) : degree + 1)) {
      if (fit && !closed) {
        startTangent ??= yield* tangentInput(context, points[0]!, true, points, knots);
        endTangent ??= yield* tangentInput(context, points.at(-1)!, false, points, knots);
      }
      return {
        entities: [
          splineEntity(
            context,
            splineFromPoints(
              points,
              fit,
              degree,
              knots,
              closed,
              tolerance,
              closed ? undefined : startTangent,
              closed ? undefined : endTangent,
              Number(context.get('SPLPERIODIC')) !== 0,
            ),
            points,
          ),
        ],
      };
    }
    if (value === '' && !points.length) return { entities: [] };
    const point = drawPoint(value);
    if (point && (!points.length || distance(point, points.at(-1)!) > 0)) points.push(point);
  }
}
