import { GeometryError } from './curve-types';
import type { CurveGeometry, GeometryParseResult, Vec3, Vertex3 } from './curve-types';
import {
  cross3,
  dot3,
  fromObjectCoordinates,
  magnitude3,
  normalize3,
  objectAxes,
  positiveSweep,
  scale3,
  worldNormal,
} from './vector3';
import { resolveSpline } from './nurbs';
import { helixBounds } from './helix';

const supported = new Set([
  'LINE',
  'POINT',
  'CIRCLE',
  'ARC',
  'ELLIPSE',
  'LWPOLYLINE',
  'POLYLINE',
  'SPLINE',
  'XLINE',
  'RAY',
  'HELIX',
]);
type Fields = Readonly<Record<string, unknown>>;
/** Interprets geometry only; the database remains responsible for retaining all raw DXF fields. */
export function geometryFromFields(entityType: string, fields: Fields): GeometryParseResult {
  const type = entityType.toUpperCase();
  if (!supported.has(type)) return { status: 'unsupported', entityType };
  try {
    if (type === 'POLYLINE' && integer(fields.flags, 0) & (16 | 64))
      return { status: 'unsupported', entityType };
    return { status: 'ok', geometry: parse(type, fields) };
  } catch (error) {
    if (error instanceof GeometryError && error.code === 'inconsistent-periodic-fit-tangents')
      return { status: 'unsupported', entityType, reason: error.code };
    return {
      status: 'invalid',
      entityType,
      reason: error instanceof GeometryError ? error.code : String(error),
    };
  }
}
function parse(type: string, fields: Fields): CurveGeometry {
  if (type === 'HELIX') {
    const normal = normalOf(fields);
    const curve: CurveGeometry = {
      type,
      center: point(fields.center),
      normal,
      xAxis: fields.xAxis === undefined ? objectAxes(normal).x : normalize3(point(fields.xAxis)),
      baseRadius: nonnegative(fields.baseRadius),
      topRadius: nonnegative(fields.topRadius),
      turns: positive(fields.turns),
      height: real(fields.height, 0),
      clockwise: fields.clockwise === true,
      startAngle: real(fields.startAngle, 0),
    };
    helixBounds(curve);
    return curve;
  }
  if (type === 'POINT') return { type, position: point(fields.position) };
  if (type === 'LINE') return { type, start: point(fields.start), end: point(fields.end) };
  if (type === 'XLINE' || type === 'RAY')
    return {
      type,
      basePoint: point(fields.basePoint),
      direction: normalize3(point(fields.direction)),
    };
  if (type === 'CIRCLE' || type === 'ARC') {
    const normal = normalOf(fields),
      center = fromObjectCoordinates(point(fields.center), normal);
    const radius = positive(fields.radius);
    const common = { center, normal, xAxis: objectAxes(normal).x, radius };
    if (type === 'CIRCLE') return { type, ...common };
    const startAngle = (real(fields.startAngle) * Math.PI) / 180;
    const endAngle = (real(fields.endAngle) * Math.PI) / 180;
    const sweepAngle = positiveSweep(startAngle, endAngle);
    if (sweepAngle === 0) throw new GeometryError('empty-arc');
    return { type, ...common, startAngle, sweepAngle };
  }
  if (type === 'ELLIPSE') {
    const normal = normalOf(fields),
      majorAxis = point(fields.majorAxis),
      majorLength = magnitude3(majorAxis);
    const ratio = positive(fields.ratio);
    if (!majorLength || ratio > 1 || Math.abs(dot3(majorAxis, normal)) > majorLength * 1e-10)
      throw new GeometryError('invalid-ellipse');
    const startParameter = real(fields.startParameter, 0);
    const sweepParameter = positiveSweep(startParameter, real(fields.endParameter, 2 * Math.PI));
    if (!sweepParameter) throw new GeometryError('empty-ellipse');
    return {
      type,
      center: point(fields.center),
      majorAxis,
      minorAxis: scale3(cross3(normal, majorAxis), ratio),
      startParameter,
      sweepParameter,
    };
  }
  if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
    const flags = integer(fields.flags, 0),
      is3D = type === 'POLYLINE' && Boolean(flags & 8);
    const normal = normalOf(fields);
    const elevation = real(
      fields.elevation,
      fields.position === undefined ? 0 : point(fields.position).z,
    );
    const raw = records(fields.vertices);
    if (raw.length < 2) throw new GeometryError('invalid-polyline-vertices');
    const variableWidth = raw.some(
      (vertex) => vertex.startWidth !== undefined || vertex.endWidth !== undefined,
    );
    const constantWidth =
      type === 'LWPOLYLINE' && !variableWidth ? nonnegative(fields.constantWidth, 0) : 0;
    // POLYLINE header codes 40/41 supply omitted VERTEX widths; explicit zero overrides them.
    const startWidth = type === 'POLYLINE' ? nonnegative(fields.startWidth, 0) : constantWidth;
    const endWidth = type === 'POLYLINE' ? nonnegative(fields.endWidth, 0) : constantWidth;
    const vertices: Vertex3[] = raw.map((vertex) => {
      const local = point(vertex.position);
      return {
        position: is3D
          ? local
          : fromObjectCoordinates({ x: local.x, y: local.y, z: elevation }, normal),
        bulge: real(vertex.bulge, 0),
        startWidth: nonnegative(vertex.startWidth, startWidth),
        endWidth: nonnegative(vertex.endWidth, endWidth),
      };
    });
    return { type, vertices, closed: Boolean(flags & 1), is3D, normal, constantWidth };
  }
  if (type === 'SPLINE') {
    const flags = integer(fields.flags, 0);
    const method = fields.knotParameterization ?? 'chord';
    if (method !== 'chord' && method !== 'centripetal' && method !== 'uniform')
      throw new GeometryError('invalid-knot-parameterization');
    const spline: CurveGeometry = {
      type,
      degree: integer(fields.degree, 3),
      knots: numbers(fields.knots),
      controlPoints: points(fields.controlPoints),
      weights: numbers(fields.weights),
      fitPoints: points(fields.fitPoints),
      closed: Boolean(flags & 1),
      periodic: Boolean(flags & 2),
      fitTolerance: nonnegative(fields.fitTolerance, 1e-10),
      knotParameterization: method,
      ...(fields.startTangent === undefined ? {} : { startTangent: point(fields.startTangent) }),
      ...(fields.endTangent === undefined ? {} : { endTangent: point(fields.endTangent) }),
    };
    resolveSpline(spline);
    return spline;
  }
  throw new GeometryError('unsupported-geometry');
}
function real(value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new GeometryError('invalid-number');
  return value;
}
function integer(value: unknown, fallback?: number): number {
  const result = real(value, fallback);
  if (!Number.isSafeInteger(result) || result < 0) throw new GeometryError('invalid-integer');
  return result;
}
function positive(value: unknown): number {
  const result = real(value);
  if (result <= 0) throw new GeometryError('nonpositive-size');
  return result;
}
function nonnegative(value: unknown, fallback?: number): number {
  const result = real(value, fallback);
  if (result < 0) throw new GeometryError('negative-size');
  return result;
}
function point(value: unknown): Vec3 {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3)
    throw new GeometryError('invalid-point');
  return { x: real(value[0]), y: real(value[1]), z: real(value[2], 0) };
}
function normalOf(fields: Fields): Vec3 {
  return fields.extrusion === undefined ? { ...worldNormal } : normalize3(point(fields.extrusion));
}
function numbers(value: unknown): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new GeometryError('invalid-number-array');
  return value.map((item: unknown) => real(item));
}
function points(value: unknown): Vec3[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new GeometryError('invalid-point-array');
  return value.map((item: unknown) => point(item));
}
function records(value: unknown): Fields[] {
  if (!Array.isArray(value)) throw new GeometryError('invalid-vertex-array');
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      throw new GeometryError('invalid-vertex');
    return item as Fields;
  });
}
