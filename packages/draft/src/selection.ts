import { getLegacyRuntime, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { validDraftPoint } from './coordinates';
import { copyCadGroups } from './selection-rules';
import { transformGripEntity } from './grip-transform';
import { selectDrawCurvePath } from './selection-draw-curves';

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
  const eligible = state.entities.filter((entity) => !blocked.has(entity.layer));
  const crossing = mode === 'crossing' || (mode === 'box' && b.x < a.x);
  const minX = Math.min(a.x, b.x),
    maxX = Math.max(a.x, b.x),
    minY = Math.min(a.y, b.y),
    maxY = Math.max(a.y, b.y);
  const points = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const advanced = new Map<string, boolean>();
  for (const entity of eligible) {
    const selected = selectDrawCurvePath(
      entity,
      points,
      crossing ? 'crossing' : 'window',
      (point) =>
        point.x >= minX - 1e-9 &&
        point.x <= maxX + 1e-9 &&
        point.y >= minY - 1e-9 &&
        point.y <= maxY + 1e-9,
    );
    if (selected !== undefined) advanced.set(entity.id, selected);
  }
  const ordinary = getLegacyRuntime().core.cadEngine.boxSelect(
    eligible.filter((entity) => !advanced.has(entity.id)),
    a,
    b,
    crossing,
  );
  const selected = new Set(ordinary);
  return eligible
    .filter((entity) => advanced.get(entity.id) ?? selected.has(entity.id))
    .map((entity) => entity.id);
}

export function translateCadEntities(entities: readonly CadEntity[], delta: CadPoint): CadEntity[] {
  if (!validDraftPoint(delta)) throw new Error('Invalid displacement');
  return entities.map((entity) => transformGripEntity(entity, 'MOVE', { x: 0, y: 0 }, delta));
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
    ...block,
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
