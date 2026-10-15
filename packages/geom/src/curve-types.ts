export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Bounds3 {
  min: Vec3;
  max: Vec3;
}
/** Row-major affine matrix: three rows of [x, y, z, translation]. */
export type Affine3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export interface PointGeometry {
  type: 'POINT';
  position: Vec3;
}
export interface LineGeometry {
  type: 'LINE';
  start: Vec3;
  end: Vec3;
}
export interface InfiniteGeometry {
  type: 'XLINE' | 'RAY';
  basePoint: Vec3;
  direction: Vec3;
}
export interface CircleGeometry {
  type: 'CIRCLE';
  center: Vec3;
  normal: Vec3;
  xAxis: Vec3;
  radius: number;
}
export interface ArcGeometry {
  type: 'ARC';
  center: Vec3;
  normal: Vec3;
  xAxis: Vec3;
  radius: number;
  startAngle: number;
  sweepAngle: number;
  /** Exact endpoint anchor avoids cancellation for very shallow bulge arcs. */
  startPoint?: Vec3;
}
export interface EllipseGeometry {
  type: 'ELLIPSE';
  center: Vec3;
  majorAxis: Vec3;
  minorAxis: Vec3;
  startParameter: number;
  sweepParameter: number;
}
export interface Vertex3 {
  position: Vec3;
  bulge: number;
  startWidth: number;
  endWidth: number;
}
export interface PolylineGeometry {
  type: 'LWPOLYLINE' | 'POLYLINE';
  vertices: readonly Vertex3[];
  closed: boolean;
  is3D: boolean;
  normal: Vec3;
  constantWidth: number;
}
export interface SplineGeometry {
  type: 'SPLINE';
  degree: number;
  knots: readonly number[];
  controlPoints: readonly Vec3[];
  weights: readonly number[];
  fitPoints: readonly Vec3[];
  closed: boolean;
  periodic: boolean;
  startTangent?: Vec3;
  endTangent?: Vec3;
  fitTolerance: number;
  knotParameterization: 'chord' | 'centripetal' | 'uniform';
}
/** Keeps nonuniformly transformed polyline widths/bulges instead of flattening source data. */
export interface TransformedGeometry {
  type: 'TRANSFORMED';
  source: CurveGeometry;
  matrix: Affine3;
}
export type CurveGeometry =
  | PointGeometry
  | LineGeometry
  | InfiniteGeometry
  | CircleGeometry
  | ArcGeometry
  | EllipseGeometry
  | PolylineGeometry
  | SplineGeometry
  | TransformedGeometry;
export type GeometryParseResult =
  | { status: 'ok'; geometry: CurveGeometry }
  | { status: 'unsupported'; entityType: string; reason?: string }
  | { status: 'invalid'; entityType: string; reason: string };
export type GeometryBounds = Bounds3 & {
  kind: 'finite' | 'unbounded';
  quality: 'exact' | 'conservative';
};
export interface ClosestGeometryPoint {
  point: Vec3;
  parameter: number;
  distance: number;
  quality: 'exact' | 'numerical';
}
export class GeometryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GeometryError';
  }
}
