export interface CadPoint {
  x: number;
  y: number;
}
export interface CadBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface CadEntityBase {
  id: string;
  layer: string;
  color: string;
  lineWidth: number;
}
export interface CadLine extends CadEntityBase {
  type: 'line';
  a: CadPoint;
  b: CadPoint;
}
export interface CadPolyline extends CadEntityBase {
  type: 'polyline' | 'rect';
  points: CadPoint[];
  closed: boolean;
}
export interface CadCircle extends CadEntityBase {
  type: 'circle';
  center: CadPoint;
  radius: number;
}
export interface CadArc extends CadEntityBase {
  type: 'arc';
  center: CadPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;
}
export interface CadText extends CadEntityBase {
  type: 'text';
  point: CadPoint;
  text: string;
  textSize: number;
  rotation: number;
}
export interface CadDimension extends CadEntityBase {
  type: 'dimension';
  kind: 'aligned' | 'horizontal' | 'vertical' | 'radius' | 'diameter' | 'angular';
  a?: CadPoint;
  b?: CadPoint;
  center?: CadPoint;
  radius?: number;
  placement?: CadPoint;
  offset?: number;
  axisAngle?: number;
  clockwise?: boolean;
  precision: number;
  dimScale: number;
  textSize: number;
  arrowSize: number;
  extensionGap: number;
  extensionOvershoot: number;
  unit: string;
  text?: string;
  textGap?: number;
  measurementFactor?: number;
  zeroSuppression?: number;
  post?: string;
  textRotation?: number;
}
export type CadEntity = CadLine | CadPolyline | CadCircle | CadArc | CadText | CadDimension;
export interface CadLayer {
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}
export interface CadSettings {
  unit: '' | 'mm' | 'cm' | 'm';
  grid: boolean;
  gridSnap: boolean;
  ortho: boolean;
  objectSnap: boolean;
  gridSize: number;
  color: string;
  lineWidth: number;
  layer: string;
  textSize: number;
  dimPrecision: number;
  dimScale: number;
  dimTextSize: number;
  arrowSize: number;
  extensionGap: number;
  extensionOvershoot: number;
  dimUnit: '' | 'mm' | 'cm' | 'm';
  dimGap?: number;
  dimMeasurementFactor?: number;
  dimZeroSuppression?: number;
  dimPost?: string;
}
/** Transitional imported model: Y down. The new @hancad/db model uses Y up. */
export interface LegacyCadState {
  version: 1;
  name: string;
  entities: CadEntity[];
  layers: CadLayer[];
  selectedIds: string[];
  settings: CadSettings;
}
export interface CadImportReport {
  format: string;
  version: string;
  imported: number;
  sourceEntities: number;
  skipped: number;
  approximated: number;
  unsupported: { type: string; count: number }[];
  warnings: string[];
}
export interface CadFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface CadReadOptions {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  timeoutMs?: number;
}
export interface CadReadResult {
  state: LegacyCadState;
  report: CadImportReport;
  source: { fileName: string; file: CadFile; bytes: Uint8Array<ArrayBuffer> };
}
export interface CadDrawOptions {
  color?: string;
  selected?: boolean;
  lineWidth?: number;
  scale?: number;
  unit?: string;
}
export interface LegacyCadRuntime {
  core: {
    cadEngine: {
      readonly ENTITY_LIMIT: number;
      dimensionGeometry(entity: CadDimension, unit?: string): CadDimensionGeometry | null;
      normalizeState(raw?: unknown): LegacyCadState;
      bounds(entities: readonly CadEntity[] | CadEntity): CadBounds | null;
      hitTest(
        entities: readonly CadEntity[],
        point: CadPoint,
        tolerance?: number,
      ): CadEntity | null;
    };
    cadImporters: {
      read(
        file: CadFile,
        options?: CadReadOptions,
      ): Promise<{ state: LegacyCadState; report: CadImportReport }>;
      parseDxf(
        text: string,
        options?: CadReadOptions,
      ): { state: LegacyCadState; report: CadImportReport };
    };
    cadExporters: {
      boundsOf(state: LegacyCadState, visibleOnly?: boolean): CadBounds;
      drawEntity(
        context: CanvasRenderingContext2D,
        entity: CadEntity,
        options?: CadDrawOptions,
      ): void;
      toSvg(state: LegacyCadState): string;
      toDxf(state: LegacyCadState): string;
    };
  };
}

export interface CadDimensionGeometry {
  kind: CadDimension['kind'];
  q1: CadPoint;
  q2: CadPoint;
  measurement: number;
  displayMeasurement: number;
  label: string;
  textPoint: CadPoint;
  labelPoint: CadPoint;
  textSize: number;
  arrowSize: number;
  rotation: number;
  lines: [CadPoint, CadPoint][];
  arrows: CadPoint[][];
  arcs: {
    center: CadPoint;
    radius: number;
    startAngle: number;
    endAngle: number;
    clockwise: boolean;
  }[];
  points: CadPoint[];
  snapPoints: CadPoint[];
  textCorners: CadPoint[];
}
