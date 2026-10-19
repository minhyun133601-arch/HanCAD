import type { CadLayer, LegacyCadState } from '@hancad/legacy-bridge';
import type { LayerField } from './layer-model';
import type { LayerFilter, LayerMetadata, LayerState, LayerRestoreProperty } from './layer-states';

export interface LayerPaletteProps {
  initialTab?: 'layers' | 'states';
  state: LegacyCadState;
  metadata: LayerMetadata;
  korean: boolean;
  walk: boolean;
  close(): void;
  toggle(name: string, field: LayerField): void;
  edit(name: string, field: keyof CadLayer, value: string): void;
  current(name: string): void;
  create(name: string): void;
  remove(names: readonly string[]): void;
  filter(filter: LayerFilter): void;
  saveState(name: string, properties?: LayerRestoreProperty[]): void;
  restoreState(saved: LayerState): void;
  deleteState(name: string): void;
  exportState(name: string): void;
  importState(file: File): void;
  reconcile(names: readonly string[]): void;
  preview(names: readonly string[]): void;
}
