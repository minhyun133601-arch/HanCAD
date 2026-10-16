import type { CurveGeometry, Vec3 } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';

export type DraftSnapKind =
  | 'endpoint' | 'midpoint' | 'center' | 'geometricCenter' | 'node' | 'quadrant'
  | 'intersection' | 'extension' | 'insertion' | 'perpendicular' | 'tangent'
  | 'nearest' | 'apparentIntersection' | 'parallel';

/** Source geometry remains in WCS; the public picking API returns model Y-down points. */
export interface SnapSource {
  id: string;
  entityId?: string;
  geometry: CurveGeometry;
  points?: readonly {point:Vec3;kind:DraftSnapKind}[];
  insertion?: Vec3;
  hatch?: boolean;
  dimensionExtension?: boolean;
  /** Insertion-only POINT proxies (TEXT/INSERT) are not POINT-node objects. */
  node?: boolean;
}
export interface DraftSnapDeferred {
  kind: 'perpendicular' | 'tangent';
  source: SnapSource;
  near: CadPoint;
}
export interface DraftSnap {
  point: CadPoint;
  kind: DraftSnapKind;
  entityId: string;
  source: SnapSource;
  parameter?: number;
  deferred?: DraftSnapDeferred;
  /** Exact WCS elevation distinguishes true and apparent intersections. */
  elevation?: number;
  otherSource?: SnapSource;
}
export interface SnapQueryOptions {
  basePoint?: CadPoint;
  osoptions?: number;
  dynamicUcs?: boolean;
  /** Extended intersections are explicit overrides, never running INT. */
  extendedIntersection?: boolean;
  intersectionSources?: readonly SnapSource[];
  /** Acquired geometry supplied by the editor's hover state. */
  extensions?: readonly SnapSource[];
  parallels?: readonly SnapSource[];
}
export const snapModeBits: Readonly<Record<DraftSnapKind, number>> = {
  endpoint: 1, midpoint: 2, center: 4, node: 8, quadrant: 16, intersection: 32,
  insertion: 64, perpendicular: 128, tangent: 256, nearest: 512,
  apparentIntersection: 2048, extension: 4096, parallel: 8192, geometricCenter: 1024,
};
export const snapWcs = (point: CadPoint): Vec3 => ({ x: point.x, y: -point.y, z: 0 });
export const snapModel = (point: Pick<Vec3, 'x' | 'y'>): CadPoint => ({ x: point.x, y: -point.y });
