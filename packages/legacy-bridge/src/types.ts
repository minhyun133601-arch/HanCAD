import type { CadImportDiagnostic, CadImportProgressDiagnostic } from './diagnostics';
import type { CurveGeometry } from '@hancad/geom';
import type { DrawingExportHooks } from './draw-export-types';

export interface CadPoint {
  x: number;
  y: number;
  z?: number;
}
export interface CadBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
/** Optional native display properties retained across the transitional model. */
export interface CadDisplayStyle {
  aci?: number;
  trueColor?: number;
  linetype?: string;
  linetypeScale?: number;
  /** Hundredths of a millimeter; -1 ByLayer, -2 ByBlock, -3 Default. */
  lineweight?: number;
  transparency?: 'bylayer' | 'byblock' | number;
  plinegen?: boolean;
}
export interface CadEntityBase extends CadDisplayStyle {
  id: string;
  layer: string;
  color: string;
  lineWidth: number;
  thickness?: number;
  material?: string;
  plotStyle?: string;
  annotative?: boolean;
  /** PEDIT vertex tangent directions, retained in radians by control-frame index. */
  peditTangents?: Record<string, number>;
  /** Exact WCS geometry behind the transitional compatibility outline. */
  curve?: CurveGeometry;
  sourceType?: string;
  drawFill?: CadPoint[][];
  frameMode?: number;
  drawPaths?: CadPoint[][];
  mline?: {
    vertices: CadPoint[];
    offsets: number[];
    scale: number;
    justification: number;
    style: string;
    closed: boolean;
  };
  regionLoops?: CurveGeometry[][];
  regionArea?: number;
  cloudVertices?: CadPoint[];
  cloudArcLength?: number;
  cloudStyle?: 'Normal' | 'Calligraphy';
  cloudVariance?: boolean;
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
  /** Signed tangent of one quarter of each outgoing arc sweep in model Y-down coordinates. */
  bulges?: number[];
  startWidths?: number[];
  endWidths?: number[];
  constantWidth?: number;
  elevation?: number;
  thickness?: number;
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
  mirroredX?: boolean;
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
export interface CadLayer extends CadDisplayStyle {
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  frozen?: boolean;
  plot?: boolean;
  newViewportFrozen?: boolean;
  description?: string;
  unreconciled?: boolean;
  nativeHandle?: string;
  material?: string;
  plotStyle?: string;
}
export interface CadSettings extends CadDisplayStyle {
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
  linetypes?: CadLinetype[];
  clipboardBlocks?: CadClipboardBlock[];
  groups?: CadGroup[];
  selectionFilters?: CadNamedFilter[];
  mlineStyles?: CadMlineStyle[];
  objectIsolation?: { hiddenIds: string[]; persistent: boolean };
}
export interface CadMlineStyle {
  name: string;
  description: string;
  offsets: number[];
}
export interface CadGroup {
  id?: string;
  name: string;
  description: string;
  selectable: boolean;
  ids: string[];
}
export type CadFilterProperty =
  | 'type'
  | 'layer'
  | 'color'
  | 'linetype'
  | 'linetypeScale'
  | 'lineweight'
  | 'transparency'
  | 'text'
  | 'radius'
  | 'length'
  | 'name';
export interface CadFilterCondition {
  property: CadFilterProperty;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'wildcard';
  value: string | number;
}
export type CadFilterExpression =
  | CadFilterCondition
  | {
      operator: 'and' | 'or' | 'not' | 'xor';
      children: CadFilterExpression[];
    };
export interface CadNamedFilter {
  name: string;
  expression: CadFilterExpression;
}
export interface CadLinetype {
  name: string;
  description: string;
  pattern: number[];
}
/** Transitional block instances retain membership while display uses flattened geometry. */
export interface CadClipboardBlock {
  name: string;
  basePoint: CadPoint;
  entityIds: string[];
  rotation?: number;
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
  /** Aligned with warnings; null preserves an arbitrary external diagnostic verbatim. */
  warningDiagnostics?: (CadImportDiagnostic | null)[];
}
export interface CadFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface CadReadOptions {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  onDiagnosticProgress?: (diagnostic: CadImportProgressDiagnostic) => void;
  timeoutMs?: number;
}
export interface CadReadResult {
  state: LegacyCadState;
  report: CadImportReport;
  source: { fileName: string; file: CadFile; bytes: Uint8Array<ArrayBuffer> };
}
export interface CadDrawOptions {
  state?: LegacyCadState;
  /** White-background SVG/PNG/clipboard export policy; canvas scenes default to display. */
  exporting?: boolean;
  background?: number;
  color?: string;
  selected?: boolean;
  lineWidth?: number;
  scale?: number;
  unit?: string;
}
export interface LegacyCadRuntime {
  core: {
    cadDrawingExport?: DrawingExportHooks;
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
      boxSelect(
        entities: readonly CadEntity[],
        a: CadPoint,
        b: CadPoint,
        crossing?: boolean,
      ): string[];
      transformEntity(entity: CadEntity, options: { type: 'move'; delta: CadPoint }): CadEntity;
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
