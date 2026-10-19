import { getLegacyRuntime, normalizeCadState, visibleCadEntities } from '@hancad/legacy-bridge';
import type { CadBounds, CadGroup, LegacyCadState } from '@hancad/legacy-bridge';

export function expandSelectionGroups(
  state: LegacyCadState,
  ids: readonly string[],
  pickstyle: number,
): string[] {
  const wanted = new Set(ids);
  let previous = -1;
  while (previous !== wanted.size) {
    previous = wanted.size;
    if (pickstyle & 1)
      for (const group of state.groups ?? [])
        if (group.selectable && group.ids.some((id) => wanted.has(id)))
          for (const id of group.ids) wanted.add(id);
    for (const block of state.clipboardBlocks ?? [])
      if (block.entityIds.some((id) => wanted.has(id)))
        for (const id of block.entityIds) wanted.add(id);
  }
  return [...wanted];
}
export interface SelectionChange {
  ids: string[];
  found: number;
  duplicates: number;
  locked: number;
}
export function updateCadSelection(
  state: LegacyCadState,
  current: readonly string[],
  requested: readonly string[],
  options: { pickadd: number; pickstyle: number; remove?: boolean; forceAdd?: boolean },
): SelectionChange {
  const ids = expandSelectionGroups(state, requested, options.pickstyle);
  const wanted = new Set(ids),
    old = new Set(current);
  const visible = new Set(state.layers.filter((layer) => layer.visible).map((layer) => layer.name));
  const locked = new Set(state.layers.filter((layer) => layer.locked).map((layer) => layer.name));
  const zero = state.layers.find((layer) => layer.name === '0');
  if (zero && (!zero.visible || zero.frozen)) locked.add('Defpoints');
  const eligible = visibleCadEntities(state).filter(
    (entity) => wanted.has(entity.id) && visible.has(entity.layer),
  );
  const editable = eligible
    .filter((entity) => !locked.has(entity.layer))
    .map((entity) => entity.id);
  const duplicates = editable.filter((id) => old.has(id)).length;
  let result: string[];
  if (options.remove && options.pickadd === 0 && !options.forceAdd)
    result = [...current.filter((id) => !wanted.has(id)), ...editable.filter((id) => !old.has(id))];
  else if (options.remove) result = current.filter((id) => !wanted.has(id));
  else
    result = [
      ...new Set([...(options.pickadd === 0 && !options.forceAdd ? [] : current), ...editable]),
    ];
  return {
    ids: result,
    found: editable.length,
    duplicates,
    locked: eligible.length - editable.length,
  };
}
export function upsertCadGroup(state: LegacyCadState, group: CadGroup): LegacyCadState {
  const name = group.name.trim();
  if (!name || /[<>/\\":;?*|=,]/.test(name.replace(/^\*A\d+$/, '')))
    throw new Error('올바른 그룹 이름이 아닙니다.');
  return normalizeCadState({
    ...state,
    groups: [
      ...(state.groups ?? []).filter((item) => item.name.toUpperCase() !== name.toUpperCase()),
      {
        ...group,
        id:
          group.id ??
          state.groups?.find((item) => item.name.toUpperCase() === name.toUpperCase())?.id ??
          crypto.randomUUID(),
        name,
        ids: [...new Set(group.ids)],
      },
    ],
  });
}

/** Copying an entire selectable group creates an independent unnamed group. */
export function copyCadGroups(
  state: LegacyCadState,
  remap: ReadonlyMap<string, string>,
  enabled = true,
): CadGroup[] {
  const groups = [...(state.groups ?? [])];
  if (!enabled) return groups;
  for (const source of state.groups ?? []) {
    if (!source.selectable || !source.ids.length || !source.ids.every((id) => remap.has(id)))
      continue;
    let number = 1;
    while (groups.some((group) => group.name === `*A${number}`)) number++;
    groups.push({
      ...source,
      id: crypto.randomUUID(),
      name: `*A${number}`,
      ids: source.ids.map((id) => remap.get(id)!),
    });
  }
  return groups;
}
export function cadGroupBounds(
  state: LegacyCadState,
  selected: readonly string[],
  pickstyle: number,
): CadBounds[] {
  if (!(pickstyle & 1)) return [];
  const wanted = new Set(selected);
  return (state.groups ?? [])
    .filter((group) => group.selectable && group.ids.some((id) => wanted.has(id)))
    .flatMap((group) => {
      const members = new Set(group.ids);
      const bounds = getLegacyRuntime().core.cadEngine.bounds(
        state.entities.filter((entity) => members.has(entity.id)),
      );
      return bounds ? [bounds] : [];
    });
}
