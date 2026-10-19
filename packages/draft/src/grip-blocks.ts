import type { CadClipboardBlock, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { EntityGrip, GripMode } from './grip-types';
import { transformGripPoint } from './grip-transform';

export interface GripOperation {
  mode: GripMode;
  base: CadPoint;
  value: number | CadPoint;
}
/** Rotation follows a transformed local X axis; translations preserve optional defaults. */
export function mappedBlockRotation(
  block: CadClipboardBlock,
  map: (point: CadPoint) => CadPoint,
): number | undefined {
  const angle = block.rotation ?? 0,
    base = map(block.basePoint),
    end = map({
      ...block.basePoint,
      x: block.basePoint.x + Math.cos(angle),
      y: block.basePoint.y - Math.sin(angle),
    }),
    dx = end.x - base.x,
    dy = base.y - end.y;
  if (Math.hypot(dx, dy) <= 1e-12) return block.rotation;
  const rotation = Math.atan2(dy, dx);
  return block.rotation === undefined && Math.abs(rotation) <= 1e-12 ? undefined : rotation;
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
    const rotation = mappedBlockRotation(block, (point) =>
      operation && (operation.mode !== 'STRETCH' || aggregate)
        ? transformGripPoint(point, operation.mode, operation.base, operation.value)
        : point,
    );
    return [
      {
        ...block,
        name: copy ? `*U${crypto.randomUUID().replace(/-/g, '').toUpperCase()}` : block.name,
        basePoint: { ...basePoint },
        ...(rotation === undefined ? {} : { rotation }),
        entityIds: block.entityIds.map((id) => ids.get(id)!),
      },
    ];
  });
}
