import type { CadBounds, CadEntity, CadDrawOptions, CadPoint, LegacyCadState } from './types';

export interface DxfWriter {
  owner: string;
  push: (code: number, value: number | string) => void;
  start: (type: string, entity: CadEntity, owner: string) => string;
  position: (point: { x: number; y: number; z?: number }, code?: number) => void;
}
export interface DrawingExportHooks {
  bounds: (entity: CadEntity) => CadBounds | undefined;
  draw: (context: CanvasRenderingContext2D, entity: CadEntity, options: CadDrawOptions) => boolean;
  svg: (entity: CadEntity, bounds?: CadBounds) => string | undefined;
  dxf: (entity: CadEntity, writer: DxfWriter) => boolean;
  validateDxf: (state: LegacyCadState) => void;
  metadata: (entity: CadEntity) => string | undefined;
  signatures: (lines: readonly (string | number)[]) => Map<string, string>;
  splinePolyline: (
    frame: readonly CadPoint[],
    degree: 2 | 3,
    closed: boolean,
  ) => Pick<CadEntity, 'curve' | 'sourceType'>;
  importMetadata: (
    json: string,
    matrix: readonly number[],
    style: Record<string, unknown>,
    normalize: (value: unknown) => CadEntity | null,
  ) => CadEntity;
  restore: (
    state: Pick<LegacyCadState, 'entities' | 'mlineStyles'>,
    raw: { entities: unknown[]; mlineStyles?: unknown },
  ) => void;
}
