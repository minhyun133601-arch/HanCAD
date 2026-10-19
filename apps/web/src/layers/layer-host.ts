import type { CommandRegistry } from '@hancad/commands';
import type { DrawingDatabase } from '@hancad/db';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { SystemVariables, SysvarValue } from '@hancad/sysvars';
import { layerStateWithNative } from './layer-records';
import { captureLayerState, layerMetadataVariable, readLayerMetadata } from './layer-states';
import type { LayerMetadata } from './layer-states';

export interface LayerHost {
  registry: CommandRegistry;
  database: DrawingDatabase;
  sysvars: SystemVariables;
  korean: boolean;
  getState(): LegacyCadState;
  getPreviewEntities?(): readonly CadEntity[];
  commitState(
    label: string,
    state: LegacyCadState,
    variables?: Readonly<Record<string, SysvarValue>>,
  ): void;
  getSelectedIds(): readonly string[];
  getAllEntityIds?(): readonly string[];
  getEntityLayer?(id: string): string | undefined;
  commitNativeLayerChange?(
    label: string,
    state: LegacyCadState,
    variables: Readonly<Record<string, SysvarValue>>,
    change: NativeLayerChange,
  ): void;
  selectIds?(ids: readonly string[]): void;
  clearSelection?(): void;
  print(message: string): void;
  cancelOthers?(): void;
}
export interface NativeLayerChange {
  kind: 'assign' | 'merge' | 'delete' | 'copy' | 'setbylayer';
  ids?: readonly string[];
  names?: readonly string[];
  target?: string;
  delta?: CadPoint;
  mode?: number;
  byblock?: boolean;
  includeBlocks?: boolean;
}
export interface LayerSnapshot {
  preview?: CadEntity[];
  command: string;
  stage:
    | 'selection'
    | 'target'
    | 'confirm'
    | 'settings'
    | 'fade'
    | 'names'
    | 'offset'
    | 'byblock'
    | 'blocks'
    | 'cli';
  inputMode: 'selection' | 'text' | 'keyword' | 'point';
  ids: readonly string[];
  names?: string[];
  target?: string;
  byblock?: boolean;
}
export function liveLayerState(host: LayerHost): LegacyCadState {
  return layerStateWithNative(host.database, host.getState());
}
export function layerMetadata(host: LayerHost): LayerMetadata {
  return readLayerMetadata(host.database.getVariable(layerMetadataVariable));
}
export function commitLayerChange(
  host: LayerHost,
  label: string,
  next: LegacyCadState,
  metadata = layerMetadata(host),
  track = true,
  native?: NativeLayerChange,
): void {
  const current = liveLayerState(host);
  if (host.sysvars.getNumber('LAYEREVALCTL') !== 0 && host.sysvars.getNumber('LAYEREVAL') === 2) {
    const names = new Set(current.layers.map((layer) => layer.name.toUpperCase()));
    const handles = new Set(
      current.layers.flatMap((layer) => (layer.nativeHandle ? [layer.nativeHandle] : [])),
    );
    next = {
      ...next,
      layers: next.layers.map((layer) =>
        names.has(layer.name.toUpperCase()) ||
        (layer.nativeHandle && handles.has(layer.nativeHandle))
          ? layer
          : { ...layer, unreconciled: true },
      ),
    };
  }
  if (
    track &&
    host.database.getVariable('HANCAD_LAYERPMODE') !== 0 &&
    (JSON.stringify(current.layers) !== JSON.stringify(next.layers) ||
      current.settings.layer !== next.settings.layer)
  ) {
    metadata.previous = captureLayerState(current);
    metadata.previousStack = [...(metadata.previousStack ?? []), metadata.previous];
  }
  const variables = {
    CLAYER: next.settings.layer,
    [layerMetadataVariable]: JSON.stringify(metadata),
  };
  if (native && host.commitNativeLayerChange)
    host.commitNativeLayerChange(label, next, variables, native);
  else host.commitState(label, next, variables);
}
