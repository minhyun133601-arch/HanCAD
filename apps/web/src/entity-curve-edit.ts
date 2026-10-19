import {
  add3,
  fromObjectCoordinates,
  magnitude3,
  normalize3,
  positiveSweep,
  scale3,
  resolveSpline,
} from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';
import { purgeSplineFit, refitEditSpline, splineClose } from '@hancad/draft';
import { curveObjectPoint } from './entity-curve-properties';

const axes = ['x', 'y', 'z'] as const;
export function changePropertyCurve(
  source: CurveGeometry,
  key: string,
  input: number | boolean,
): CurveGeometry {
  let curve = structuredClone(source);
  const path = key.replace(/^curve\./, '').split('.'),
    name = path[0]!,
    value = Number(input);
  if (name === 'closed' && typeof input === 'boolean') {
    if (curve.type === 'SPLINE') return splineClose(curve, input, curve.periodic);
    if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
      curve.closed = input;
      return curve;
    }
  }
  const changePoint = (point: Vec3, axis: string | undefined): void => {
    if (!axes.includes(axis as (typeof axes)[number])) throw new Error('Invalid coordinate axis.');
    point[axis as (typeof axes)[number]] = value;
  };
  if (
    (name === 'position' && curve.type === 'POINT') ||
    (['start', 'end'].includes(name) && curve.type === 'LINE') ||
    (name === 'center' && ['CIRCLE', 'ARC', 'ELLIPSE'].includes(curve.type)) ||
    (['basePoint', 'direction'].includes(name) && ['XLINE', 'RAY'].includes(curve.type))
  ) {
    const point = (curve as unknown as Record<string, Vec3>)[name];
    if (!point) throw new Error('Missing geometry point.');
    changePoint(point, path[1]);
    if ((curve.type === 'XLINE' || curve.type === 'RAY') && name === 'direction')
      curve.direction = normalize3(curve.direction);
  } else if (
    (curve.type === 'CIRCLE' || curve.type === 'ARC') &&
    ['radius', 'diameter'].includes(name)
  ) {
    if (value <= 0) throw new Error('Radius must be positive.');
    curve.radius = name === 'diameter' ? value / 2 : value;
  } else if (curve.type === 'ARC' && ['startAngle', 'endAngle'].includes(name)) {
    const start = name === 'startAngle' ? (value * Math.PI) / 180 : curve.startAngle;
    const end = name === 'endAngle' ? (value * Math.PI) / 180 : curve.startAngle + curve.sweepAngle;
    curve.startAngle = start;
    curve.sweepAngle = positiveSweep(start, end);
    delete curve.startPoint;
    if (curve.sweepAngle < 1e-12) throw new Error('An arc requires a nonzero sweep.');
  } else if (curve.type === 'ELLIPSE') {
    const major = magnitude3(curve.majorAxis),
      minor = magnitude3(curve.minorAxis);
    if (name === 'majorRadius' && value > 0) {
      curve.majorAxis = scale3(curve.majorAxis, value / major);
      curve.minorAxis = scale3(curve.minorAxis, value / major);
    } else if (name === 'minorRadius' && value > 0 && value <= major)
      curve.minorAxis = scale3(curve.minorAxis, value / minor);
    else if (name === 'ratio' && value > 0 && value <= 1)
      curve.minorAxis = scale3(curve.minorAxis, (major * value) / minor);
    else if (name === 'startParameter' || name === 'endParameter') {
      const start = name === 'startParameter' ? value : curve.startParameter;
      const end = name === 'endParameter' ? value : curve.startParameter + curve.sweepParameter;
      curve.startParameter = start;
      curve.sweepParameter = positiveSweep(start, end);
      if (curve.sweepParameter < 1e-12) throw new Error('An ellipse requires a nonzero sweep.');
    } else throw new Error('Invalid ellipse size or property.');
  } else if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    const vertices = curve.vertices.map((vertex) => structuredClone(vertex));
    if (name === 'elevation') {
      const elevation = curveObjectPoint(vertices[0]!.position, curve.normal).z;
      for (const vertex of vertices)
        vertex.position = add3(vertex.position, scale3(curve.normal, value - elevation));
    } else if (name === 'constantWidth' && value >= 0) {
      curve.constantWidth = value;
      for (const vertex of vertices) {
        vertex.startWidth = value;
        vertex.endWidth = value;
      }
    } else if (name === 'vertices') {
      const vertex = vertices[Number(path[1])];
      if (!vertex) throw new Error('Vertex index is out of range.');
      if (path[2] === 'position') changePoint(vertex.position, path[3]);
      else if (path[2] === 'ocs') {
        const point = curveObjectPoint(vertex.position, curve.normal);
        changePoint(point, path[3]);
        vertex.position = fromObjectCoordinates(point, curve.normal);
      } else if (path[2] === 'bulge') vertex.bulge = value;
      else if (['startWidth', 'endWidth'].includes(path[2]!) && value >= 0) {
        vertex[path[2] as 'startWidth' | 'endWidth'] = value;
        curve.constantWidth = 0;
      } else throw new Error('Invalid vertex property.');
    } else throw new Error('Invalid polyline property.');
    curve.vertices = vertices;
  } else if (curve.type === 'SPLINE') {
    const index = Number(path[1]);
    if (name === 'controlPoints' || name === 'fitPoints') {
      const points = curve[name].map((point) => ({ ...point }));
      if (!points[index]) throw new Error('Spline point index is out of range.');
      changePoint(points[index]!, path[2]);
      if (name === 'controlPoints') curve = { ...purgeSplineFit(curve), controlPoints: points };
      else
        curve = refitEditSpline({
          ...curve,
          fitPoints: points,
          controlPoints: [],
          knots: [],
          weights: [],
        });
    } else if (name === 'weights' && value > 0 && index < curve.controlPoints.length) {
      const previousWeights = curve.weights;
      const weights = curve.controlPoints.map((_, i) => previousWeights[i] ?? 1);
      weights[index] = value;
      curve = { ...purgeSplineFit(curve), weights };
    } else if (name === 'fitTolerance' && value >= 0) curve.fitTolerance = value;
    else throw new Error('Invalid spline property.');
    resolveSpline(curve);
  } else throw new Error('Geometry property is not editable.');
  return curve;
}
