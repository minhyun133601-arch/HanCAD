import { getLegacyRuntime, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { validDraftPoint } from './coordinates';
import { copyCadGroups } from './selection-rules';

export function editableSelection(state: LegacyCadState, ids: readonly string[]): CadEntity[] {
  const wanted = new Set(ids);
  const blocked = new Set(state.layers.filter((l) => !l.visible || l.locked).map((l) => l.name));
  return state.entities.filter((entity) => wanted.has(entity.id) && !blocked.has(entity.layer));
}

/** Left-to-right contains complete objects; right-to-left crosses actual geometry. */
export function selectCadArea(
  state: LegacyCadState,
  a: CadPoint,
  b: CadPoint,
  mode: 'window' | 'crossing' | 'box' = 'box',
  includeLocked = false,
): string[] {
  if (!validDraftPoint(a) || !validDraftPoint(b)) return [];
  const blocked = new Set(
    state.layers.filter((l) => !l.visible || (!includeLocked && l.locked)).map((l) => l.name),
  );
  return getLegacyRuntime().core.cadEngine.boxSelect(
    state.entities.filter((entity) => !blocked.has(entity.layer)),
    a,
    b,
    mode === 'crossing' || (mode === 'box' && b.x < a.x),
  );
}

export function translateCadEntities(entities: readonly CadEntity[], delta: CadPoint): CadEntity[] {
  if (!validDraftPoint(delta)) throw new Error('Invalid displacement');
  return entities.map((entity) =>
    getLegacyRuntime().core.cadEngine.transformEntity(entity, { type: 'move', delta }),
  );
}

/** An edit produces a replacement snapshot; the shared command journal owns undo. */
export function transformCadSelection(
  state: LegacyCadState,
  ids: readonly string[],
  delta: CadPoint,
  copy = false,
  groupSelection = true,
): { state: LegacyCadState; ids: string[] } {
  const originals = editableSelection(state, ids);
  const transformed = translateCadEntities(originals, delta).map((entity) =>
    copy ? { ...entity, id: `copy-${crypto.randomUUID()}` } : entity,
  );
  const byId = new Map(transformed.map((entity) => [entity.id, entity]));
  const entities = copy
    ? [...state.entities, ...transformed]
    : state.entities.map((entity) => byId.get(entity.id) ?? entity);
  const remap = new Map(originals.map((entity, index) => [entity.id, transformed[index]!.id]));
  const movedBlocks = (state.clipboardBlocks ?? []).filter(
    (block) => block.entityIds.length > 0 && block.entityIds.every((id) => remap.has(id)),
  );
  const updated = movedBlocks.map((block) => ({
    name: copy ? `A$C${crypto.randomUUID().replaceAll('-', '').toUpperCase()}` : block.name,
    basePoint: {
      x: block.basePoint.x + delta.x,
      y: block.basePoint.y + delta.y,
      ...(block.basePoint.z !== undefined || delta.z !== undefined
        ? { z: (block.basePoint.z ?? 0) + (delta.z ?? 0) }
        : {}),
    },
    entityIds: block.entityIds.map((id) => remap.get(id)!),
  }));
  const movedNames = new Set(movedBlocks.map((block) => block.name));
  const clipboardBlocks = copy
    ? [...(state.clipboardBlocks ?? []), ...updated]
    : [...(state.clipboardBlocks ?? []).filter((block) => !movedNames.has(block.name)), ...updated];
  return {
    state: normalizeCadState({
      ...state,
      entities,
      clipboardBlocks,
      groups: copy ? copyCadGroups(state, remap, groupSelection) : (state.groups ?? []),
      selectedIds: [],
    }),
    ids: transformed.map((e) => e.id),
  };
}
