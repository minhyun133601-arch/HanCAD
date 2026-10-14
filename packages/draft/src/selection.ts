import { getLegacyRuntime, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { validDraftPoint } from './coordinates';

export function editableSelection(state: LegacyCadState, ids: readonly string[]): CadEntity[] {
  const wanted = new Set(ids);
  const blocked = new Set(state.layers.filter((l) => !l.visible || l.locked).map((l) => l.name));
  return state.entities.filter((entity) => wanted.has(entity.id) && !blocked.has(entity.layer));
}

/** Left-to-right contains complete objects; right-to-left crosses actual geometry. */
export function selectCadArea(state: LegacyCadState, a: CadPoint, b: CadPoint): string[] {
  if (!validDraftPoint(a) || !validDraftPoint(b)) return [];
  const blocked = new Set(state.layers.filter((l) => !l.visible || l.locked).map((l) => l.name));
  return getLegacyRuntime().core.cadEngine.boxSelect(
    state.entities.filter((entity) => !blocked.has(entity.layer)),
    a,
    b,
    b.x < a.x,
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
): { state: LegacyCadState; ids: string[] } {
  const originals = editableSelection(state, ids);
  const transformed = translateCadEntities(originals, delta).map((entity) =>
    copy ? { ...entity, id: `copy-${crypto.randomUUID()}` } : entity,
  );
  const byId = new Map(transformed.map((entity) => [entity.id, entity]));
  const entities = copy
    ? [...state.entities, ...transformed]
    : state.entities.map((entity) => byId.get(entity.id) ?? entity);
  return {
    state: normalizeCadState({ ...state, entities, selectedIds: [] }),
    ids: transformed.map((e) => e.id),
  };
}
