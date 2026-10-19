import {
  closestGeometryPoint,
  splineBreakpoints,
  evaluateGeometry,
  geometryEvaluation,
  distance3,
} from '@hancad/geom';
import type { SplineGeometry, Vec3 } from '@hancad/geom';
import { heading, model, pointInput, scalarInput, wcs } from './draw-curve-helpers';
import {
  drawKeyword,
  drawNumber,
  drawPoint,
  type DrawContext,
  type DrawRequest,
  type DrawValue,
} from './draw-program';
import { splineFromPoints } from './draw-spline';
import { elevateSpline, insertSplineKnot } from './modify-spline-geometry';
import { purgeSplineFit, refitEditSpline } from './modify-spline-refit';

function nearest(points: readonly Vec3[], value: DrawValue): number | undefined {
  const point = drawPoint(value);
  if (!point) {
    const n = drawNumber(value);
    return n !== undefined && Number.isInteger(n) && n >= 1 && n <= points.length
      ? n - 1
      : undefined;
  }
  const target = wcs(point);
  let index = 0;
  points.forEach((p, i) => {
    if (
      Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z) <
      Math.hypot(
        points[index]!.x - target.x,
        points[index]!.y - target.y,
        points[index]!.z - target.z,
      )
    )
      index = i;
  });
  return index;
}
function* selectIndex(
  points: readonly Vec3[],
  fit: boolean,
): Generator<DrawRequest, number | undefined, DrawValue> {
  for (;;) {
    const value = yield {
      kind: 'point',
      ko: fit ? '맞춤점 선택:' : '조정 정점 선택:',
      en: fit ? 'Select fit point:' : 'Select control vertex:',
    };
    if (value === '') return;
    const index = nearest(points, value);
    if (index !== undefined) return index;
  }
}
export function splineClose(
  source: SplineGeometry,
  closed: boolean,
  periodic: boolean,
): SplineGeometry {
  if (source.fitPoints.length) {
    const points = [...source.fitPoints];
    if (source.closed && distance3(points[0]!, points.at(-1)!) <= 1e-12) points.pop();
    const result = {
      ...source,
      fitPoints: points,
      closed,
      periodic: closed && periodic,
      controlPoints: [],
      knots: [],
      weights: [],
    };
    delete result.startTangent;
    delete result.endTangent;
    if (source.kinkFitIndices)
      result.kinkFitIndices = source.kinkFitIndices.filter((i) => i < points.length);
    return refitEditSpline(result);
  }
  let points = [...source.controlPoints];
  if (source.closed && source.periodic) points = points.slice(0, -source.degree);
  else if (source.closed) points = points.slice(0, -1);
  const result = splineFromPoints(
    points.map(model),
    false,
    source.degree,
    2,
    closed,
    0,
    undefined,
    undefined,
    periodic,
  );
  const weights = [...source.weights.slice(0, points.length)];
  if (closed) weights.push(...(periodic ? weights.slice(0, source.degree) : [weights[0] ?? 1]));
  return { ...result, weights };
}
export function* splineMoveProgram(
  context: DrawContext,
  initial: SplineGeometry,
  fit: boolean,
  weight = false,
): Generator<DrawRequest, SplineGeometry, DrawValue> {
  let source = initial,
    index = yield* selectIndex(fit ? initial.fitPoints : initial.controlPoints, fit);
  if (index === undefined) return source;
  for (;;) {
    const points = fit ? source.fitPoints : source.controlPoints;
    const value = yield {
      kind: weight ? 'number' : 'point',
      ko: weight
        ? `새 가중치 입력 또는 [다음(N)/이전(P)/점 선택(S)/나가기(X)] <${source.weights[index] ?? 1}>:`
        : '새 위치 지정 또는 [다음(N)/이전(P)/점 선택(S)/나가기(X)]:',
      en: weight
        ? `Enter new weight or [Next/Previous/Select point/eXit] <${source.weights[index] ?? 1}>:`
        : 'Specify new location or [Next/Previous/Select point/eXit]:',
      base: model(points[index]!),
    };
    const option = drawKeyword(value);
    if (value === '' || option === 'X' || option === 'EXIT') return source;
    if (option === 'N' || option === 'NEXT') index = Math.min(points.length - 1, index + 1);
    else if (option === 'P' || option === 'PREVIOUS') index = Math.max(0, index - 1);
    else if (option === 'S' || option === 'SELECT' || option === 'SELECT POINT')
      index = (yield* selectIndex(points, fit)) ?? index;
    else if (weight) {
      const n = drawNumber(value);
      if (n !== undefined && n > 0) {
        const weights = points.map((_, i) => source.weights[i] ?? 1);
        weights[index] = n;
        source = { ...purgeSplineFit(source), weights };
      }
    } else {
      const point = drawPoint(value);
      if (!point) continue;
      const updated = points.map((p, i) => (i === index ? wcs(point) : p));
      source = fit
        ? refitEditSpline({
            ...source,
            controlPoints: [],
            knots: [],
            weights: [],
            fitPoints: updated,
          })
        : { ...purgeSplineFit(source), controlPoints: updated };
    }
  }
}
export function* splineFitDataProgram(
  context: DrawContext,
  initial: SplineGeometry,
): Generator<DrawRequest, SplineGeometry, DrawValue> {
  let source = initial;
  if (!source.fitPoints.length) {
    const parameters = [
      ...new Set([
        ...splineBreakpoints(source),
        ...Array.from(
          { length: Math.max(4, source.controlPoints.length) },
          (_, i) => i / (Math.max(4, source.controlPoints.length) - 1),
        ),
      ]),
    ].sort((a, b) => a - b);
    const fitPoints = parameters.map((t) => evaluateGeometry(source, t));
    source =
      source.degree === 3
        ? { ...source, fitPoints, fitTolerance: 0 }
        : refitEditSpline({
            ...source,
            degree: 3,
            fitPoints,
            controlPoints: [],
            knots: [],
            weights: [],
            fitTolerance: 0,
          });
  }
  for (;;) {
    const option = drawKeyword(
      yield {
        kind: 'keyword',
        ko: `맞춤 데이터 옵션 입력 [추가(A)/${source.closed ? '열기(O)' : '닫기(C)'}/삭제(D)/꺾기(K)/이동(M)/제거(P)/접선(T)/공차(L)/나가기(X)]:`,
        en: `Enter a fit data option [Add/${source.closed ? 'Open' : 'Close'}/Delete/Kink/Move/Purge/Tangents/toLerance/eXit]:`,
      },
    );
    if (option === '' || option === 'X' || option === 'EXIT') return source;
    if (option === 'P' || option === 'PURGE') {
      source = purgeSplineFit(source);
      return source;
    }
    if (option === 'C' || option === 'CLOSE' || option === 'O' || option === 'OPEN')
      source = splineClose(
        source,
        option.startsWith('C'),
        Number(context.get('SPLPERIODIC')) !== 0,
      );
    else if (option === 'M' || option === 'MOVE')
      source = yield* splineMoveProgram(context, source, true);
    else if (option === 'A' || option === 'ADD' || option === 'D' || option === 'DELETE') {
      const index = yield* selectIndex(source.fitPoints, true);
      if (index === undefined) continue;
      const points = [...source.fitPoints];
      let kinks = [...(source.kinkFitIndices ?? [])];
      if (option.startsWith('A')) {
        let before = false;
        if (index === 0 && !source.closed)
          before = ['B', 'BEFORE'].includes(
            drawKeyword(
              yield {
                kind: 'keyword',
                ko: '새 맞춤점 위치 [앞(B)/뒤(A)] <뒤>:',
                en: 'Enter location for new fit point [Before/After] <After>:',
              },
            ),
          );
        const point = yield* pointInput({
          ko: '새 맞춤점 지정:',
          en: 'Specify new fit point:',
          base: model(points[index]!),
        });
        const insertion = index + (before ? 0 : 1);
        points.splice(insertion, 0, wcs(point));
        kinks = kinks.map((i) => (i >= insertion ? i + 1 : i));
      } else {
        if (points.length <= (source.closed ? 3 : 2)) continue;
        points.splice(index, 1);
        kinks = kinks.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));
      }
      source = refitEditSpline({
        ...source,
        fitPoints: points,
        controlPoints: [],
        knots: [],
        weights: [],
        ...(source.kinkFitIndices ? { kinkFitIndices: kinks } : {}),
      });
    } else if (option === 'K' || option === 'KINK') {
      const point = yield* pointInput({ ko: '꺾을 점 지정:', en: 'Specify kink point:' });
      const t = closestGeometryPoint(source, wcs(point)).parameter;
      const fitPoints = [...source.fitPoints],
        oldKinks = (source.kinkFitIndices ?? []).map((i) => fitPoints[i]!);
      const position = evaluateGeometry(source, t);
      let kink = fitPoints.find((p) => distance3(p, position) <= 1e-9);
      if (!kink) {
        kink = position;
        fitPoints.push(kink);
      }
      const low = source.knots[source.degree]!,
        high = source.knots[source.controlPoints.length]!,
        native = low + (high - low) * t;
      while (
        source.knots.filter((k) => Math.abs(k - native) <= 1e-12 * Math.max(1, high - low)).length <
        source.degree
      )
        source = insertSplineKnot(source, t);
      fitPoints.sort(
        (a, b) =>
          closestGeometryPoint(source, a).parameter - closestGeometryPoint(source, b).parameter,
      );
      source = {
        ...source,
        fitPoints,
        kinkFitIndices: [
          ...new Set([...oldKinks.map((p) => fitPoints.indexOf(p)), fitPoints.indexOf(kink)]),
        ].sort((a, b) => a - b),
      };
    } else if (option === 'L' || option === 'TOLERANCE') {
      const tolerance = yield* scalarInput(
        context,
        {
          ko: `맞춤 공차 지정 <${source.fitTolerance}>:`,
          en: `Specify fit tolerance <${source.fitTolerance}>:`,
        },
        (n) => n >= 0,
        source.fitTolerance,
      );
      source = refitEditSpline({
        ...source,
        fitTolerance: tolerance,
        controlPoints: [],
        knots: [],
        weights: [],
      });
    } else if (option === 'T' || option === 'TANGENTS') {
      const first = yield {
        kind: 'angle',
        ko: source.closed
          ? '접선 지정 또는 [시스템 기본값(S)]:'
          : '시작 접선 지정 또는 [시스템 기본값(S)]:',
        en: source.closed
          ? 'Specify tangent or [System default]:'
          : 'Specify start tangent or [System default]:',
        base: model(source.fitPoints[0]!),
      };
      if (['S', 'SYSTEM DEFAULT', 'SYSTEM'].includes(drawKeyword(first))) {
        delete source.startTangent;
        delete source.endTangent;
        if (source.closed) source.periodic = Number(context.get('SPLPERIODIC')) !== 0;
      } else {
        const a = heading(first, context, model(source.fitPoints[0]!));
        if (a === undefined) continue;
        if (source.closed) {
          const derivative = geometryEvaluation(source, 0).derivative;
          const magnitude = Math.hypot(derivative.x, derivative.y, derivative.z);
          const tangent = { x: Math.cos(a) * magnitude, y: Math.sin(a) * magnitude, z: 0 };
          source = refitEditSpline({
            ...source,
            periodic: false,
            startTangent: tangent,
            endTangent: tangent,
            controlPoints: [],
            knots: [],
            weights: [],
          });
          continue;
        }
        const last = yield {
          kind: 'angle',
          ko: '끝 접선 지정:',
          en: 'Specify end tangent:',
          base: model(source.fitPoints.at(-1)!),
        };
        const b = heading(last, context, model(source.fitPoints.at(-1)!));
        if (b === undefined) continue;
        const length = Math.hypot(
          source.fitPoints.at(-1)!.x - source.fitPoints[0]!.x,
          source.fitPoints.at(-1)!.y - source.fitPoints[0]!.y,
        );
        source = {
          ...source,
          startTangent: { x: Math.cos(a) * length, y: Math.sin(a) * length, z: 0 },
          endTangent: { x: Math.cos(b) * length, y: Math.sin(b) * length, z: 0 },
        };
      }
      source = refitEditSpline({ ...source, controlPoints: [], knots: [], weights: [] });
    }
  }
}
export function* splineVertexProgram(
  context: DrawContext,
  initial: SplineGeometry,
): Generator<DrawRequest, SplineGeometry, DrawValue> {
  let source: SplineGeometry = purgeSplineFit(initial);
  for (;;) {
    const option = drawKeyword(
      yield {
        kind: 'keyword',
        ko: '정점 편집 옵션 입력 [추가(A)/삭제(D)/차수 높이기(E)/이동(M)/가중치(W)/나가기(X)]:',
        en: 'Enter a vertex editing option [Add/Delete/Elevate order/Move/Weight/eXit]:',
      },
    );
    if (option === '' || option === 'X' || option === 'EXIT') return source;
    if (option === 'M' || option === 'MOVE' || option === 'W' || option === 'WEIGHT')
      source = yield* splineMoveProgram(context, source, false, option.startsWith('W'));
    else if (option === 'E' || option === 'ELEVATE' || option === 'ELEVATE ORDER') {
      const order = yield* scalarInput(
        context,
        {
          ko: `새 차수 지정 <${source.degree + 2}>:`,
          en: `Specify new order <${source.degree + 2}>:`,
        },
        (n) => Number.isInteger(n) && n > source.degree + 1 && n <= 26,
        Math.min(26, source.degree + 2),
      );
      source = elevateSpline(source, order - 1);
    } else if (option === 'A' || option === 'ADD') {
      const point = yield* pointInput({
        ko: '새 조정 정점 지정:',
        en: 'Specify new control vertex:',
      });
      const t = closestGeometryPoint(source, wcs(point)).parameter;
      source = insertSplineKnot(source, t);
    } else if (option === 'D' || option === 'DELETE') {
      const index = yield* selectIndex(source.controlPoints, false);
      if (index === undefined || source.controlPoints.length <= source.degree + 1) continue;
      const points = source.controlPoints.filter((_, i) => i !== index),
        weights = source.weights.filter((_, i) => i !== index);
      source = {
        ...splineFromPoints(points.map(model), false, source.degree, 2, source.closed),
        weights,
      };
    }
  }
}
