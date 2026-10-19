import type { CadClipboardBlock, CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { heading } from './draw-curve-helpers';
import { drawPoint, type DrawContext, type DrawProgram, type DrawResult } from './draw-program';
import { modifySelection } from './modify-common';
import { deltaPoint, origin, transformEntities } from './modify-transform-geometry';

/** CHANGE treats flattened Clipboard instances as blocks, using their insertion/rotation. */
export function* changeBlocksProgram(context: DrawContext, initialPoint?: CadPoint): DrawProgram {
  const selected = modifySelection(context),
    selectedIds = new Set(selected.map((e) => e.id));
  const blocks = (context.blocks ?? []).filter(
    (b) => b.entityIds.length > 0 && b.entityIds.every((id) => selectedIds.has(id)),
  );
  const entities: CadEntity[] = [],
    eraseIds: string[] = [],
    updatedClipboardBlocks: CadClipboardBlock[] = [];
  const result = (): DrawResult => ({
    entities: [...entities],
    eraseIds: [...eraseIds],
    updatedClipboardBlocks: [...updatedClipboardBlocks],
  });
  for (const [index, block] of blocks.entries()) {
    const ids = new Set(block.entityIds),
      members = selected.filter((e) => ids.has(e.id)),
      rotation = block.rotation ?? 0;
    let insertion = index === 0 ? initialPoint : undefined;
    while (!insertion) {
      const value = yield {
        kind: 'point',
        ko: `블록의 새 삽입점 지정 <현재>:`,
        en: 'Specify new block insertion point <current>:',
        base: block.basePoint,
        partial: entities,
        partialEraseIds: eraseIds,
        partialResult: result(),
        previewHiddenIds: [...eraseIds, ...block.entityIds],
        preview: (p: CadPoint) => [
          ...entities,
          ...transformEntities(members, 'MOVE', origin, deltaPoint(p, block.basePoint)),
        ],
      };
      insertion = value === '' ? { ...block.basePoint } : drawPoint(value);
    }
    const moved = transformEntities(
      members,
      'MOVE',
      origin,
      deltaPoint(insertion, block.basePoint),
    );
    let nextRotation: number | undefined;
    while (nextRotation === undefined) {
      const value = yield {
        kind: 'angle',
        ko: `블록의 새 회전 각도 지정 <${(rotation * 180) / Math.PI}>:`,
        en: `Specify new block rotation angle <${(rotation * 180) / Math.PI}>:`,
        base: insertion,
        previewEntities: [...entities, ...moved],
        partial: entities,
        partialEraseIds: eraseIds,
        partialResult: result(),
        previewHiddenIds: [...eraseIds, ...block.entityIds],
        preview: (p: CadPoint) => [
          ...entities,
          ...transformEntities(
            moved,
            'ROTATE',
            insertion!,
            -(Math.atan2(insertion!.y - p.y, p.x - insertion!.x) - rotation),
          ),
        ],
      };
      nextRotation = value === '' ? rotation : heading(value, context, insertion);
    }
    if (
      Math.hypot(
        insertion.x - block.basePoint.x,
        insertion.y - block.basePoint.y,
        (insertion.z ?? 0) - (block.basePoint.z ?? 0),
      ) <= 1e-12 &&
      Math.abs(nextRotation - rotation) <= 1e-12
    )
      continue;
    entities.push(...transformEntities(moved, 'ROTATE', insertion, -(nextRotation - rotation)));
    eraseIds.push(...block.entityIds);
    updatedClipboardBlocks.push({
      ...structuredClone(block),
      basePoint: { ...insertion },
      rotation: nextRotation,
    });
  }
  return result();
}
