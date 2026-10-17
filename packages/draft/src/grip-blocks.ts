import type { CadClipboardBlock, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { EntityGrip, GripMode } from './grip-types';
import { transformGripPoint } from './grip-transform';

export interface GripOperation {
  mode: GripMode;
  base: CadPoint;
  value: number | CadPoint;
}
export function updatedGripBlocks(
  state: LegacyCadState,
  ids: ReadonlyMap<string, string>,
  hot: readonly EntityGrip[],
  operation?: GripOperation,
  copy = false,
): CadClipboardBlock[] {
  return (state.clipboardBlocks ?? []).flatMap((block) => {
    if (!block.entityIds.every((id) => ids.has(id))) return [];
    const aggregate = hot.some(
      (grip) =>
        grip.key === `block:${block.name}` ||
        (grip.key.startsWith('group:') &&
          block.entityIds.every((id) => grip.entityIds?.includes(id))),
    );
    if (!copy && (!operation || (operation.mode === 'STRETCH' && !aggregate))) return [];
    const basePoint =
      operation && (operation.mode !== 'STRETCH' || aggregate)
        ? transformGripPoint(block.basePoint, operation.mode, operation.base, operation.value)
        : block.basePoint;
    return [
      {
        name: copy ? `*U${crypto.randomUUID().replace(/-/g, '').toUpperCase()}` : block.name,
        basePoint: { ...basePoint },
        entityIds: block.entityIds.map((id) => ids.get(id)!),
      },
    ];
  });
}
