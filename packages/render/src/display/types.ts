import type { CurveGeometry } from '@hancad/geom';
import type { EntityColor, EntityTransparency } from '../style/aci';

export interface Vec2 {
  x: number;
  y: number;
}
export interface Bounds2 {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface DisplayLine {
  type: 'line';
  start: Vec2;
  end: Vec2;
}
export interface DisplayArc {
  type: 'arc';
  center: Vec2;
  radius: number;
  startAngle: number;
  sweepAngle: number;
  /** Exact bulge endpoint anchor prevents shallow-arc cancellation. */
  startPoint?: Vec2;
}
export interface DisplayPolyline {
  type: 'polyline';
  /** x, y, bulge, start width, end width for each vertex, in WCS. */
  vertices: Float64Array;
  closed: boolean;
}
export interface DisplayText {
  type: 'text';
  position: Vec2;
  text: string;
  height: number;
  rotation: number;
  mirroredX?: boolean;
  align: 'left' | 'center';
  /** Explicit rendered world width, when known by the source/font provider. */
  width?: number;
}
export type DisplayTriangle = readonly [Vec2, Vec2, Vec2];
export interface DisplayTriangleRun {
  distances: readonly [number, number, number];
  length: number;
}
export type DisplayGeometry =
  | DisplayLine
  | DisplayArc
  | DisplayPolyline
  | DisplayText
  | { type: 'point'; position: Vec2 }
  | { type: 'xline' | 'ray'; basePoint: Vec2; direction: Vec2 }
  | {
      type: 'composite';
      parts: readonly DisplayGeometry[];
      triangles: readonly DisplayTriangle[];
      fillControlled?: boolean;
    }
  | { type: 'curve'; curve: CurveGeometry };

export interface DisplayEntity {
  id: string;
  geometry: DisplayGeometry;
  layer: string;
  color: EntityColor;
  linetype: string;
  linetypeScale: number;
  lineweight: number;
  transparency: EntityTransparency;
  plinegen: boolean;
  visible?: boolean;
  sourceId?: string;
  backgroundMask?: boolean;
  wipeoutFrame?: boolean;
}
export interface TessellationOptions {
  /** Maximum model-unit chord error; normally 0.25 / CSS-pixel view scale. */
  tolerance: number;
  view?: Bounds2;
  pdmode?: number;
  pdsize?: number;
  regenViewHeight?: number;
  fillmode?: boolean;
  plinegen?: boolean;
  maxSegments?: number;
}
export interface GeometrySink {
  /** A length hint preserves linetype fitting when only a visible arc is emitted. */
  beginRun(length?: number): void;
  vertex(x: number, y: number, distance: number): void;
  endRun(closed: boolean): void;
  point(x: number, y: number): void;
  triangle(a: Vec2, b: Vec2, c: Vec2, run?: DisplayTriangleRun): void;
  text(text: DisplayText): void;
}
export interface DisplayRun {
  /** x, y, cumulative model distance. Closed runs repeat their first point. */
  vertices: Float64Array;
  length: number;
  closed: boolean;
}
export interface GeometryCollection {
  runs: DisplayRun[];
  points: Vec2[];
  triangles: DisplayTriangle[];
  /** Aligned with triangles; ordinary solid polygons have an undefined entry. */
  triangleRuns: (DisplayTriangleRun | undefined)[];
  texts: DisplayText[];
}
