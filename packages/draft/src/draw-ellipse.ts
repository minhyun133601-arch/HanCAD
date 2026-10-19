import type { EllipseGeometry } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import {
  curveEntity,
  distance,
  heading,
  middle,
  numeric,
  pointInput,
  positiveAngle,
  TAU,
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

export function ellipseGeometry(
  center: CadPoint,
  axisEnd: CadPoint,
  otherRadius: number,
  startParameter = 0,
  sweepParameter = TAU,
): EllipseGeometry {
  const dx = axisEnd.x - center.x,
    dy = center.y - axisEnd.y,
    radius = Math.hypot(dx, dy);
  return {
    type: 'ELLIPSE',
    center: wcs(center),
    majorAxis: { x: dx, y: dy, z: 0 },
    minorAxis: { x: (-dy / radius) * otherRadius, y: (dx / radius) * otherRadius, z: 0 },
    startParameter,
    sweepParameter,
  };
}
const ellipseEntity = (context: DrawContext, curve: EllipseGeometry) =>
  curveEntity(
    context,
    curve,
    [
      { x: curve.center.x - curve.majorAxis.x, y: -curve.center.y + curve.majorAxis.y },
      { x: curve.center.x + curve.majorAxis.x, y: -curve.center.y - curve.majorAxis.y },
      { x: curve.center.x + curve.minorAxis.x, y: -curve.center.y - curve.minorAxis.y },
    ],
    Math.abs(curve.sweepParameter) >= TAU,
  );
function parameter(angle: number, curve: EllipseGeometry, parametric: boolean): number {
  return parametric
    ? angle
    : Math.atan2(
        Math.hypot(curve.majorAxis.x, curve.majorAxis.y) * Math.sin(angle),
        Math.hypot(curve.minorAxis.x, curve.minorAxis.y) * Math.cos(angle),
      );
}
function relativeAngle(
  value: DrawValue,
  context: DrawContext,
  curve: EllipseGeometry,
): number | undefined {
  const center = { x: curve.center.x, y: -curve.center.y },
    point = drawPoint(value);
  const angle = heading(value, context, center, true);
  return angle === undefined
    ? undefined
    : point
      ? angle - Math.atan2(curve.majorAxis.y, curve.majorAxis.x)
      : angle;
}
function arcAtAngle(
  initial: EllipseGeometry,
  startParameter: number,
  angle: number,
  parametric: boolean,
  included: boolean,
): EllipseGeometry {
  const startAngle = Math.atan2(
    Math.hypot(initial.minorAxis.x, initial.minorAxis.y) * Math.sin(startParameter),
    Math.hypot(initial.majorAxis.x, initial.majorAxis.y) * Math.cos(startParameter),
  );
  const end = included
    ? parametric
      ? startParameter + angle
      : parameter(startAngle + angle, initial, false)
    : parameter(angle, initial, parametric);
  let sweepParameter = positiveAngle(end - startParameter);
  if (included && angle < 0) sweepParameter -= TAU;
  if (sweepParameter === 0 && Math.abs(angle) >= TAU - 1e-12) sweepParameter = TAU;
  return { ...initial, startParameter, sweepParameter };
}
function* arcParameters(
  context: DrawContext,
  initial: EllipseGeometry,
): Generator<DrawRequest, EllipseGeometry, DrawValue> {
  let parametric = false,
    start: number | undefined;
  while (start === undefined) {
    const value = yield {
      kind: 'angle',
      ko: parametric ? '시작 매개변수 지정 또는 [각도(A)]:' : '시작 각도 지정 또는 [매개변수(P)]:',
      en: parametric
        ? 'Specify start parameter or [Angle]:'
        : 'Specify start angle or [Parameter]:',
      base: { x: initial.center.x, y: -initial.center.y },
      preview: () => [ellipseEntity(context, initial)],
    };
    const option = drawKeyword(value);
    if (option === 'P' || option === 'PARAMETER') {
      parametric = true;
      continue;
    }
    if (option === 'A' || option === 'ANGLE') {
      parametric = false;
      continue;
    }
    const angle = relativeAngle(value, context, initial);
    if (angle !== undefined) start = parameter(angle, initial, parametric);
  }
  let included = false;
  for (;;) {
    const startParameter = start;
    const value = yield {
      kind: 'angle',
      ko: included
        ? '사이각 지정:'
        : parametric
          ? '끝 매개변수 지정 또는 [각도(A)/사이각(I)]:'
          : '끝 각도 지정 또는 [매개변수(P)/사이각(I)]:',
      en: included
        ? 'Specify included angle:'
        : parametric
          ? 'Specify end parameter or [Angle/Included angle]:'
          : 'Specify end angle or [Parameter/Included angle]:',
      base: { x: initial.center.x, y: -initial.center.y },
      preview: (point: CadPoint) => {
        const angle = relativeAngle(point, context, initial)!;
        return [
          ellipseEntity(context, arcAtAngle(initial, startParameter, angle, parametric, included)),
        ];
      },
    };
    const option = drawKeyword(value);
    if (!included && (option === 'P' || option === 'PARAMETER')) {
      parametric = true;
      continue;
    }
    if (!included && (option === 'A' || option === 'ANGLE')) {
      parametric = false;
      continue;
    }
    if (!included && (option === 'I' || option === 'INCLUDED' || option === 'INCLUDED ANGLE')) {
      included = true;
      continue;
    }
    const angle = relativeAngle(value, context, initial);
    if (angle === undefined) continue;
    const curve = arcAtAngle(initial, startParameter, angle, parametric, included);
    if (Math.abs(curve.sweepParameter) > 1e-12) return curve;
  }
}
function* isocircle(context: DrawContext): DrawProgram {
  const center = yield* pointInput({
    ko: '등각원의 중심 지정:',
    en: 'Specify center of isocircle:',
  });
  let diameter = false;
  for (;;) {
    const radiusValue = yield {
      kind: 'number',
      ko: diameter ? '등각원의 지름 지정:' : '등각원의 반지름 지정 또는 [지름(D)]:',
      en: diameter
        ? 'Specify diameter of isocircle:'
        : 'Specify radius of isocircle or [Diameter]:',
      base: center,
      preview: (p: CadPoint) => {
        const r = distance(center, p) / (diameter ? 2 : 1);
        return r ? [ellipseEntity(context, isocircleGeometry(context, center, r))] : [];
      },
    };
    const option = drawKeyword(radiusValue);
    if (!diameter && (option === 'D' || option === 'DIAMETER')) {
      diameter = true;
      continue;
    }
    const radius = numeric(radiusValue, context, center);
    if (radius !== undefined && radius > 0)
      return {
        entities: [
          ellipseEntity(context, isocircleGeometry(context, center, radius / (diameter ? 2 : 1))),
        ],
      };
  }
}
export function isocircleGeometry(
  context: DrawContext,
  center: CadPoint,
  radius: number,
): EllipseGeometry {
  const plane = Number(context.get('SNAPISOPAIR'));
  const angle = plane === 0 ? Math.PI / 3 : plane === 2 ? (Math.PI * 2) / 3 : 0;
  const majorRadius = radius * Math.sqrt(1.5),
    minorRadius = radius / Math.sqrt(2);
  return ellipseGeometry(
    center,
    { x: center.x + majorRadius * Math.cos(angle), y: center.y - majorRadius * Math.sin(angle) },
    minorRadius,
  );
}
export function* ellipseProgram(context: DrawContext): DrawProgram {
  let arc = false;
  for (;;) {
    const isometric = Number(context.get('SNAPSTYL')) === 1;
    const value = yield {
      kind: 'point',
      ko: arc
        ? '타원형 호의 축 끝점 지정 또는 [중심(C)]:'
        : `타원의 축 끝점 지정 또는 [호(A)/중심(C)${isometric ? '/등각원(I)' : ''}]:`,
      en: arc
        ? 'Specify axis endpoint of elliptical arc or [Center]:'
        : `Specify axis endpoint of ellipse or [Arc/Center${isometric ? '/Isocircle' : ''}]:`,
    };
    const option = drawKeyword(value);
    if (!arc && (option === 'A' || option === 'ARC')) {
      arc = true;
      continue;
    }
    if (!arc && isometric && (option === 'I' || option === 'ISOCIRCLE'))
      return yield* isocircle(context);
    let center: CadPoint, axisEnd: CadPoint;
    if (option === 'C' || option === 'CENTER') {
      center = yield* pointInput({ ko: '타원의 중심 지정:', en: 'Specify center of ellipse:' });
      axisEnd = yield* pointInput({
        ko: '축의 끝점 지정:',
        en: 'Specify endpoint of axis:',
        base: center,
      });
    } else {
      const first = drawPoint(value);
      if (!first) continue;
      axisEnd = yield* pointInput({
        ko: '축의 다른 끝점 지정:',
        en: 'Specify other endpoint of axis:',
        base: first,
      });
      center = middle(first, axisEnd);
    }
    const firstRadius = distance(center, axisEnd);
    if (!(firstRadius > 0)) continue;
    let rotation = false;
    for (;;) {
      const input = yield {
        kind: rotation ? 'angle' : 'number',
        ko: rotation ? '주 축에 대한 회전 지정:' : '다른 축으로 거리 지정 또는 [회전(R)]:',
        en: rotation
          ? 'Specify rotation around major axis:'
          : 'Specify distance to other axis or [Rotation]:',
        base: center,
        preview: (p: CadPoint) => {
          const r = rotation
            ? firstRadius * Math.abs(Math.cos(heading(p, context, center, true)!))
            : distance(center, p);
          return r > 0 ? [ellipseEntity(context, ellipseGeometry(center, axisEnd, r))] : [];
        },
      };
      const option = drawKeyword(input);
      if (!rotation && (option === 'R' || option === 'ROTATION')) {
        rotation = true;
        continue;
      }
      const angle = rotation ? heading(input, context, center, true) : undefined;
      if (rotation && angle === undefined) continue;
      const radius = rotation
        ? firstRadius * Math.abs(Math.cos(angle!))
        : numeric(input, context, center);
      if (
        radius === undefined ||
        radius <= 0 ||
        (rotation && radius / firstRadius < Math.cos((89.4 * Math.PI) / 180))
      )
        continue;
      const curve = ellipseGeometry(center, axisEnd, radius);
      return {
        entities: [ellipseEntity(context, arc ? yield* arcParameters(context, curve) : curve)],
      };
    }
  }
}
