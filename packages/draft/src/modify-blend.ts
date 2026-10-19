import {
  geometryEvaluation,
  type CurveGeometry,
  type SplineGeometry,
  type Vec3,
} from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { model, wcs } from './draw-curve-helpers';
import {
  drawEntity,
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawProgram,
} from './draw-program';
import { modifyId } from './modify-common';
import { draftEntityBase } from './entities';

export function blendCurve(entity: CadEntity): CurveGeometry | undefined {
  if (entity.curve) {
    const c = entity.curve;
    if (
      c.type === 'CIRCLE' ||
      c.type === 'POINT' ||
      c.type === 'XLINE' ||
      c.type === 'RAY' ||
      (c.type === 'ELLIPSE' && Math.abs(c.sweepParameter) >= 2 * Math.PI - 1e-10) ||
      ((c.type === 'LWPOLYLINE' || c.type === 'POLYLINE' || c.type === 'SPLINE') && c.closed)
    )
      return;
    return c;
  }
  if (entity.type === 'line') return { type: 'LINE', start: wcs(entity.a), end: wcs(entity.b) };
  if (entity.type === 'arc') {
    let sweep = entity.endAngle - entity.startAngle;
    while (entity.clockwise ? sweep < 0 : sweep > 0)
      sweep += entity.clockwise ? 2 * Math.PI : -2 * Math.PI;
    return {
      type: 'ARC',
      center: wcs(entity.center),
      radius: entity.radius,
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
      startAngle: -entity.startAngle,
      sweepAngle: -sweep,
    };
  }
  if ((entity.type === 'polyline' || entity.type === 'rect') && !entity.closed)
    return {
      type: 'LWPOLYLINE',
      vertices: entity.points.map((p, i) => ({
        position: wcs(p),
        bulge: -(entity.bulges?.[i] ?? 0),
        startWidth: 0,
        endWidth: 0,
      })),
      closed: false,
      is3D: false,
      normal: { x: 0, y: 0, z: 1 },
      constantWidth: 0,
    };
  return;
}
const add = (a: Vec3, b: Vec3, k: number): Vec3 => ({
  x: a.x + b.x * k,
  y: a.y + b.y * k,
  z: a.z + b.z * k,
});
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function endpoint(
  curve: CurveGeometry,
  pick: CadPoint,
  first: boolean,
  speed: number,
): { point: Vec3; d: Vec3; dd: Vec3 } {
  const t =
      distance(geometryEvaluation(curve, 0).point, wcs(pick)) <
      distance(geometryEvaluation(curve, 1).point, wcs(pick))
        ? 0
        : 1,
    e = geometryEvaluation(curve, t),
    v = e.derivative,
    length = Math.hypot(v.x, v.y, v.z),
    sign = first ? (t === 1 ? 1 : -1) : t === 0 ? 1 : -1;
  if (length < 1e-12) throw new Error('Singular blend endpoint.');
  const lo = t === 0 ? 0 : 1 - 1e-5,
    hi = t === 0 ? 1e-5 : 1,
    a = geometryEvaluation(curve, lo).derivative,
    b = geometryEvaluation(curve, hi).derivative;
  const second = {
      x: (b.x - a.x) / (hi - lo),
      y: (b.y - a.y) / (hi - lo),
      z: (b.z - a.z) / (hi - lo),
    },
    projection = (second.x * v.x + second.y * v.y + second.z * v.z) / (length * length),
    factor = (speed * speed) / (length * length);
  return {
    point: e.point,
    d: {
      x: (v.x * sign * speed) / length,
      y: (v.y * sign * speed) / length,
      z: (v.z * sign * speed) / length,
    },
    dd: {
      x: (second.x - v.x * projection) * factor,
      y: (second.y - v.y * projection) * factor,
      z: (second.z - v.z * projection) * factor,
    },
  };
}
export function blendSpline(
  a: CadEntity,
  b: CadEntity,
  pickA: CadPoint,
  pickB: CadPoint,
  smooth: boolean,
): SplineGeometry | undefined {
  const ca = blendCurve(a),
    cb = blendCurve(b);
  if (!ca || !cb) return;
  const ea = endpoint(ca, pickA, true, 1),
    eb = endpoint(cb, pickB, false, 1),
    speed = distance(ea.point, eb.point);
  if (speed < 1e-10) return;
  const start = endpoint(ca, pickA, true, speed),
    end = endpoint(cb, pickB, false, speed),
    degree = smooth ? 5 : 3;
  const p1 = add(start.point, start.d, 1 / degree),
    p4 = add(end.point, end.d, -1 / degree);
  const controls = smooth
    ? [
        start.point,
        p1,
        add(add(add(p1, p1, 1), start.point, -1), start.dd, 1 / 20),
        add(add(add(p4, p4, 1), end.point, -1), end.dd, 1 / 20),
        p4,
        end.point,
      ]
    : [start.point, p1, p4, end.point];
  return {
    type: 'SPLINE',
    degree,
    controlPoints: controls,
    weights: controls.map(() => 1),
    knots: [...Array<number>(degree + 1).fill(0), ...Array<number>(degree + 1).fill(1)],
    fitPoints: [],
    closed: false,
    periodic: false,
    fitTolerance: 0,
    knotParameterization: 'uniform',
  };
}
export function* blendProgram(context: DrawContext): DrawProgram {
  let smooth = context.memory?.get('BLEND.CONTINUITY') === 'Smooth';
  for (;;) {
    const value = yield {
        kind: 'entity',
        ko: '첫 번째 객체 선택 또는 [연속성(CO)]:',
        en: 'Select first object or [Continuity]:',
      },
      key = drawKeyword(value);
    if (value === '') return { entities: [] };
    if (['CO', 'CONTINUITY'].includes(key)) {
      for (;;) {
        const mode = drawKeyword(
          yield {
            kind: 'keyword',
            ko: `연속성 옵션 입력 [접선(T)/부드럽게(S)] <${smooth ? '부드럽게' : '접선'}>:`,
            en: `Enter continuity option [Tangent/Smooth] <${smooth ? 'Smooth' : 'Tangent'}>:`,
          },
        );
        if (!mode) break;
        if (['T', 'TANGENT', 'S', 'SMOOTH'].includes(mode)) {
          smooth = mode.startsWith('S');
          context.memory?.set('BLEND.CONTINUITY', smooth ? 'Smooth' : 'Tangent');
          break;
        }
      }
      continue;
    }
    const first = drawEntity(value),
      pickA = drawPoint(value);
    if (!first || !pickA || !blendCurve(first)) continue;
    const build = (second: CadEntity, pickB: CadPoint): CadEntity[] => {
      const spline = blendSpline(first, second, pickA, pickB, smooth);
      return spline
        ? [
            {
              ...draftEntityBase(context.settings),
              id: modifyId(),
              type: 'polyline',
              points: spline.controlPoints.map(model),
              closed: false,
              sourceType: 'SPLINE',
              curve: spline,
            },
          ]
        : [];
    };
    const second = yield {
      kind: 'entity',
      ko: '두 번째 객체 선택:',
      en: 'Select second object:',
      preview: (p) => {
        if (Number(context.get('COMMANDPREVIEW')) === 0) return [];
        let best: CadEntity | undefined,
          d = Infinity;
        for (const e of context.entities) {
          if (e.id === first.id) continue;
          const curve = blendCurve(e);
          if (!curve) continue;
          const near = Math.min(
            distance(geometryEvaluation(curve, 0).point, wcs(p)),
            distance(geometryEvaluation(curve, 1).point, wcs(p)),
          );
          if (near < d) {
            d = near;
            best = e;
          }
        }
        return best ? build(best, p) : [];
      },
    };
    const entity = drawEntity(second),
      point = drawPoint(second);
    if (entity && point && entity.id !== first.id) {
      const entities = build(entity, point);
      if (entities.length) return { entities };
    }
  }
}
