import type { CadClipboardBlock, CadEntity, CadGroup, CadPoint } from '@hancad/legacy-bridge';
import type { DrawContext, DrawResult } from './draw-program';
import { deltaPoint, entityAnchor } from './modify-transform-geometry';
import { mappedBlockRotation } from './grip-blocks';

/** Flattened instance membership follows the same immutable transform as its geometry. */
export function transformMetadata(
  context: DrawContext,
  originals: readonly CadEntity[],
  result: DrawResult,
  map: (batch: number, point: CadPoint) => CadPoint,
): DrawResult {
  if (!originals.length || !result.entities.length) return result;
  const selected = new Set(originals.map((e) => e.id)),
    erased = new Set(result.eraseIds ?? []),
    updatedClipboardBlocks: CadClipboardBlock[] = [],
    clipboardBlocks: CadClipboardBlock[] = [];
  const groups: CadGroup[] = structuredClone([...(context.groups ?? [])]);
  let groupsChanged = false;
  const blocks = (context.blocks ?? []).filter(
    (b) => b.entityIds.length > 0 && b.entityIds.every((id) => selected.has(id)),
  );
  const selectedGroups = (Number(context.get('PICKSTYLE') ?? 1) & 1 ? groups : []).filter(
    (g) => g.ids.length > 0 && g.ids.every((id) => selected.has(id)),
  );
  for (let batch = 0; batch < Math.floor(result.entities.length / originals.length); batch++) {
    const replacements = result.entities.slice(
        batch * originals.length,
        (batch + 1) * originals.length,
      ),
      ids = new Map(originals.map((e, i) => [e.id, replacements[i]!.id]));
    const same = originals.every((e, i) => e.id === replacements[i]!.id),
      replaceSource = batch === 0 && originals.every((e) => erased.has(e.id));
    for (const block of blocks) {
      const basePoint = map(batch, block.basePoint),
        rotation = mappedBlockRotation(block, (p) => map(batch, p));
      const next = {
        ...structuredClone(block),
        basePoint,
        ...(rotation === undefined ? {} : { rotation }),
        entityIds: block.entityIds.map((id) => ids.get(id)!),
      };
      if (same || replaceSource) updatedClipboardBlocks.push(next);
      else
        clipboardBlocks.push({
          ...next,
          name: `A$C${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`,
        });
    }
    for (const group of selectedGroups) {
      const mapped = group.ids.map((id) => ids.get(id)!);
      if (same) continue;
      if (replaceSource) {
        const index = groups.findIndex((g) => g.name === group.name);
        groups[index] = { ...group, ids: mapped };
      } else
        groups.push({
          ...structuredClone(group),
          id: crypto.randomUUID(),
          name: `*A${crypto.randomUUID().replaceAll('-', '')}`,
          ids: mapped,
        });
      groupsChanged = true;
    }
  }
  return {
    ...result,
    ...(updatedClipboardBlocks.length ? { updatedClipboardBlocks } : {}),
    ...(clipboardBlocks.length
      ? { clipboardBlocks: [...(result.clipboardBlocks ?? []), ...clipboardBlocks] }
      : {}),
    ...(groupsChanged ? { groups } : {}),
  };
}
export function translationMetadata(
  context: DrawContext,
  originals: readonly CadEntity[],
  result: DrawResult,
): DrawResult {
  return transformMetadata(context, originals, result, (batch, point) => {
    const target = result.entities[batch * originals.length],
      source = originals[0];
    if (!source || !target) return point;
    const delta = deltaPoint(entityAnchor(target), entityAnchor(source));
    return {
      x: point.x + delta.x,
      y: point.y + delta.y,
      ...(point.z === undefined && delta.z === undefined
        ? {}
        : { z: (point.z ?? 0) + (delta.z ?? 0) }),
    };
  });
}
