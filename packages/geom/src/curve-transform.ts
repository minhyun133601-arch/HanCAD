import type { Affine3, CurveGeometry, EllipseGeometry, Vec3 } from './curve-types';
import { conicComponents } from './analytic-curves';
import { resolveSpline } from './nurbs';
import {
  add3,
  assertAffine,
  cross3,
  dot3,
  magnitude3,
  multiplyAffine3,
  normalize3,
  objectAxes,
  scale3,
  transformPoint3,
  transformVector3,
} from './vector3';

/** Affine transforms preserve parameterized geometry; conics are canonicalized without tessellation. */
export function transformGeometry(curve: CurveGeometry, matrix: Affine3): CurveGeometry {
  assertAffine(matrix);
  const point = (p: Vec3) => transformPoint3(matrix, p),
    vector = (p: Vec3) => transformVector3(matrix, p);
  switch (curve.type) {
    case 'POINT':
      return { ...curve, position: point(curve.position) };
    case 'LINE':
      return { ...curve, start: point(curve.start), end: point(curve.end) };
    case 'XLINE':
    case 'RAY':
      return { ...curve, basePoint: point(curve.basePoint), direction: vector(curve.direction) };
    case 'CIRCLE':
    case 'ARC':
    case 'ELLIPSE': {
      const { a, b, start, sweep } = conicComponents(curve),
        ta = vector(a),
        tb = vector(b);
      const la = magnitude3(ta),
        lb = magnitude3(tb),
        perpendicular = Math.abs(dot3(ta, tb)) <= la * lb * 1e-12;
      const normal = normalize3(cross3(ta, tb));
      if (
        curve.type !== 'ELLIPSE' &&
        perpendicular &&
        Math.abs(la - lb) <= Math.max(la, lb) * 1e-12
      )
        return {
          ...curve,
          center: point(curve.center),
          normal,
          xAxis: normalize3(ta),
          radius: la,
          ...(curve.type === 'ARC' && curve.startPoint
            ? { startPoint: point(curve.startPoint) }
            : {}),
        };
      const angle = Math.atan2(2 * dot3(ta, tb), dot3(ta, ta) - dot3(tb, tb)) / 2;
      const majorAxis = add3(scale3(ta, Math.cos(angle)), scale3(tb, Math.sin(angle)));
      const minorAxis = add3(scale3(ta, -Math.sin(angle)), scale3(tb, Math.cos(angle)));
      const result: EllipseGeometry = {
        type: 'ELLIPSE',
        center: point(curve.center),
        majorAxis,
        minorAxis,
        startParameter: start - angle,
        sweepParameter: sweep,
      };
      return result;
    }
    case 'SPLINE': {
      const resolved = resolveSpline(curve);
      return {
        ...curve,
        degree: resolved.degree,
        knots: [...resolved.knots],
        weights: [...resolved.weights],
        controlPoints: resolved.controlPoints.map(point),
        fitPoints: curve.fitPoints.map(point),
        ...(curve.startTangent ? { startTangent: vector(curve.startTangent) } : {}),
        ...(curve.endTangent ? { endTangent: vector(curve.endTangent) } : {}),
      };
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const axes = objectAxes(curve.normal),
        x = vector(axes.x),
        y = vector(axes.y);
      const lx = magnitude3(x),
        ly = magnitude3(y),
        similarity =
          Math.abs(lx - ly) <= Math.max(lx, ly) * 1e-12 && Math.abs(dot3(x, y)) <= lx * ly * 1e-12;
      if (!similarity && !curve.is3D)
        return { type: 'TRANSFORMED', source: curve, matrix: [...matrix] as Affine3 };
      return {
        ...curve,
        normal: normalize3(cross3(x, y)),
        constantWidth: curve.constantWidth * lx,
        vertices: curve.vertices.map((v) => ({
          ...v,
          position: point(v.position),
          startWidth: v.startWidth * lx,
          endWidth: v.endWidth * lx,
        })),
      };
    }
    case 'TRANSFORMED':
      return {
        type: 'TRANSFORMED',
        source: curve.source,
        matrix: multiplyAffine3(matrix, curve.matrix),
      };
    case 'HELIX':
      return { type: 'TRANSFORMED', source: curve, matrix: [...matrix] as Affine3 };
  }
}
