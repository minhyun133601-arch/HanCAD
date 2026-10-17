import type { CurveGeometry, Vec3 } from '@hancad/geom';
import type { SnapSource } from './snap-types';

export const v = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
export const normal = v(0, 0, 1),
  xAxis = v(1, 0);
export const source = (geometry: CurveGeometry, id: string = geometry.type): SnapSource => ({
  id,
  geometry,
});
export const line = (start = v(0, 0), end = v(10, 0)): CurveGeometry => ({
  type: 'LINE',
  start,
  end,
});
export const circle = (center = v(0, 0), radius = 10): CurveGeometry => ({
  type: 'CIRCLE',
  center,
  radius,
  normal,
  xAxis,
});
export const arc = (startAngle = 0, sweepAngle = Math.PI / 2): CurveGeometry => ({
  type: 'ARC',
  center: v(0, 0),
  radius: 10,
  normal,
  xAxis,
  startAngle,
  sweepAngle,
});
export const ellipse = (rotation = 0): CurveGeometry => ({
  type: 'ELLIPSE',
  center: v(0, 0),
  majorAxis: v(10 * Math.cos(rotation), 10 * Math.sin(rotation)),
  minorAxis: v(-5 * Math.sin(rotation), 5 * Math.cos(rotation)),
  startParameter: 0,
  sweepParameter: Math.PI * 2,
});
export const spline = (points = [v(0, 0), v(5, 10), v(10, 0)]): CurveGeometry => ({
  type: 'SPLINE',
  degree: 2,
  controlPoints: points,
  weights: [1, 1, 1],
  knots: [0, 0, 0, 1, 1, 1],
  fitPoints: [],
  closed: false,
  periodic: false,
  fitTolerance: 1e-10,
  knotParameterization: 'chord',
});
export const polyline = (
  points = [v(0, 0), v(10, 0), v(10, 10), v(0, 10)],
  closed = true,
): CurveGeometry => ({
  type: 'LWPOLYLINE',
  vertices: points.map((position) => ({ position, bulge: 0, startWidth: 0, endWidth: 0 })),
  closed,
  is3D: false,
  normal,
  constantWidth: 0,
});
