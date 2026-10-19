import type { LegacyCadState } from './types';

/** Recover block identity without passing application metadata through the legacy importer. */
export function restoreClipboardMetadata(state: LegacyCadState, source: unknown): void {
  if (typeof source !== 'object' || source === null || !('clipboardBlocks' in source)) return;
  if (!Array.isArray(source.clipboardBlocks)) throw new Error('Invalid stored clipboard blocks.');
  const present = new Set(state.entities.map((entity) => entity.id));
  const names = new Set<string>();
  state.clipboardBlocks = source.clipboardBlocks
    .map((value: unknown) => {
      if (
        typeof value !== 'object' ||
        value === null ||
        !('name' in value) ||
        typeof value.name !== 'string' ||
        !value.name ||
        names.has(value.name.toUpperCase()) ||
        !('basePoint' in value) ||
        typeof value.basePoint !== 'object' ||
        value.basePoint === null ||
        !('x' in value.basePoint) ||
        !('y' in value.basePoint) ||
        ![
          value.basePoint.x,
          value.basePoint.y,
          'z' in value.basePoint ? value.basePoint.z : 0,
        ].every((number) => typeof number === 'number' && Number.isFinite(number)) ||
        !('entityIds' in value) ||
        !Array.isArray(value.entityIds) ||
        !value.entityIds.every((id: unknown) => typeof id === 'string') ||
        ('rotation' in value &&
          (typeof value.rotation !== 'number' || !Number.isFinite(value.rotation)))
      )
        throw new Error('Invalid stored clipboard block.');
      names.add(value.name.toUpperCase());
      return {
        name: value.name,
        basePoint: {
          x: Number(value.basePoint.x),
          y: Number(value.basePoint.y),
          ...('z' in value.basePoint ? { z: Number(value.basePoint.z) } : {}),
        },
        entityIds: [...new Set(value.entityIds as string[])].filter((id) => present.has(id)),
        ...('rotation' in value ? { rotation: Number(value.rotation) } : {}),
      };
    })
    .filter((block) => block.entityIds.length > 0);
}
