import type { LegacyCadState } from './types';

/** Preserve editor-owned layer state outside the compatibility geometry normalizer. */
export function restoreLayerMetadata(state: LegacyCadState, source: unknown): void {
  if (typeof source !== 'object' || source === null) return;
  const value = source as Record<string, unknown>;
  if (Array.isArray(value.layers)) {
    const originals = new Map<string, Record<string, unknown>>();
    for (const candidate of value.layers) {
      if (typeof candidate !== 'object' || candidate === null) continue;
      const layer = candidate as Record<string, unknown>;
      if (typeof layer.name === 'string') originals.set(layer.name, layer);
    }
    for (const layer of state.layers) {
      const original = originals.get(layer.name);
      if (!original) continue;
      for (const key of ['frozen', 'plot', 'newViewportFrozen', 'unreconciled'] as const) {
        if (original[key] !== undefined && typeof original[key] !== 'boolean')
          throw new Error(`Invalid layer ${key}`);
        if (typeof original[key] === 'boolean') layer[key] = original[key];
      }
      for (const key of ['description', 'nativeHandle', 'material', 'plotStyle'] as const) {
        if (original[key] !== undefined && typeof original[key] !== 'string')
          throw new Error(`Invalid layer ${key}`);
        if (typeof original[key] === 'string') layer[key] = original[key];
      }
    }
  }
  if (value.objectIsolation !== undefined) {
    const isolation = value.objectIsolation;
    if (
      typeof isolation !== 'object' ||
      isolation === null ||
      !('hiddenIds' in isolation) ||
      !Array.isArray(isolation.hiddenIds) ||
      !isolation.hiddenIds.every((id): id is string => typeof id === 'string') ||
      !('persistent' in isolation) ||
      typeof isolation.persistent !== 'boolean'
    )
      throw new Error('Invalid object isolation');
    state.objectIsolation = {
      hiddenIds: [...new Set(isolation.hiddenIds)],
      persistent: isolation.persistent,
    };
  }
}
