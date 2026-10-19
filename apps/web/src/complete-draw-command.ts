import { appendCadEntities } from '@hancad/draft';
import type { DraftTool, DrawResult } from '@hancad/draft';
import type { CadClipboardBlock, LegacyCadState } from '@hancad/legacy-bridge';
import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';
import type { SystemVariables } from '@hancad/sysvars';
import { commitNativeCopies, validateNativeCopies } from './complete-native-copies';

interface Options {
  tool: DraftTool;
  sysvars: SystemVariables;
  getState: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState) => void;
  print: (message: string) => void;
  korean: boolean;
  rememberSelection: (ids: readonly string[]) => void;
  committedMessage: (count: number) => string;
}

/** Validate first, then publish replacements, ordering, metadata and variables together. */
export function completeDrawCommand(
  options: Options,
  result: DrawResult,
  changes: ReadonlyMap<string, number | string | readonly number[]>,
): void {
  for (const message of result.messages ?? []) options.print(message[options.korean ? 'ko' : 'en']);
  const hasState =
    result.entities.length > 0 ||
    (result.eraseIds?.length ?? 0) > 0 ||
    result.orderIds !== undefined ||
    result.mlineStyles !== undefined ||
    result.groups !== undefined ||
    (result.clipboardBlocks?.length ?? 0) > 0 ||
    (result.updatedClipboardBlocks?.length ?? 0) > 0 ||
    (result.removedBlockNames?.length ?? 0) > 0;
  const nativeCopies = result.nativeCopies ?? [];
  if (!hasState && !changes.size && !nativeCopies.length) return;
  const source = options.getState(),
    erased = new Set(result.eraseIds ?? []),
    replacements = new Map(result.entities.map((entity) => [entity.id, entity])),
    originalIds = new Set(source.entities.map((entity) => entity.id)),
    blocked = new Set(
      source.layers.filter((layer) => !layer.visible || layer.locked).map((layer) => layer.name),
    );
  if (replacements.size !== result.entities.length)
    throw new Error('Duplicate command entity identity.');
  if (
    source.entities.some(
      (entity) =>
        (erased.has(entity.id) || replacements.has(entity.id)) && blocked.has(entity.layer),
    )
  )
    throw new Error('Cannot replace objects on hidden or locked layers.');
  const postEditIds = new Set([
    ...source.entities
      .filter((entity) => replacements.has(entity.id) || !erased.has(entity.id))
      .map((entity) => entity.id),
    ...result.entities.map((entity) => entity.id),
  ]);
  const clipboardBlocks = commandBlocks(source, result, postEditIds);
  validateNativeCopies(options.sysvars.database, source, nativeCopies);
  const state = hasState
    ? appendCadEntities(
        {
          ...source,
          entities: source.entities.flatMap((entity) => {
            const replacement = replacements.get(entity.id);
            return replacement ? [replacement] : erased.has(entity.id) ? [] : [entity];
          }),
          clipboardBlocks,
          ...(result.groups ? { groups: result.groups } : {}),
          ...(result.mlineStyles ? { mlineStyles: result.mlineStyles } : {}),
        },
        result.entities.filter((entity) => !originalIds.has(entity.id)),
      )
    : undefined;
  if (state && result.orderIds) {
    if (
      result.orderIds.length !== postEditIds.size ||
      new Set(result.orderIds).size !== postEditIds.size ||
      result.orderIds.some((id) => !postEditIds.has(id))
    )
      throw new Error('Invalid command display order.');
    const rank = new Map(result.orderIds.map((id, index) => [id, index]));
    state.entities.sort((a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1));
  }
  for (const [name, value] of changes) {
    const definition = getSystemVariableDefinition(name);
    if (!definition || definition.readonly)
      throw new Error(`Invalid drawing system variable ${name}.`);
    validateSystemVariable(definition, value);
  }
  let nativeIds: string[] = [];
  options.sysvars.atomic(options.tool, () => {
    for (const [name, value] of changes) {
      if (typeof value !== 'object') options.sysvars.set(name, value);
      else if (value.length === 2) options.sysvars.set(name, [value[0]!, value[1]!]);
      else if (value.length === 3) options.sysvars.set(name, [value[0]!, value[1]!, value[2]!]);
      else throw new Error(`Invalid point system variable ${name}.`);
    }
    if (nativeCopies.length)
      nativeIds = commitNativeCopies(options.sysvars.database, options.tool, nativeCopies);
    // Publish the view after native edits so recovery snapshots include the complete graph.
    if (state || nativeCopies.length) options.commitState(options.tool, state ?? source);
  });
  if (state || nativeCopies.length) {
    if (result.previousIds) options.rememberSelection(result.previousIds);
    options.print(options.committedMessage(result.entities.length + nativeIds.length));
  }
}

/** Only explicitly supplied memberships require exact survival; erased old instances may vanish. */
function commandBlocks(
  source: LegacyCadState,
  result: DrawResult,
  present: ReadonlySet<string>,
): CadClipboardBlock[] {
  const originals = new Map(
    (source.clipboardBlocks ?? []).map((block) => [block.name.toUpperCase(), block]),
  );
  const removed = new Set<string>();
  for (const name of result.removedBlockNames ?? []) {
    const key = name.toUpperCase();
    if (!originals.has(key) || removed.has(key))
      throw new Error('Unknown or duplicate removed block name.');
    removed.add(key);
  }
  const updates = new Map<string, CadClipboardBlock>();
  const validate = (block: CadClipboardBlock) => {
    if (
      !block.name.trim() ||
      !block.entityIds.length ||
      new Set(block.entityIds).size !== block.entityIds.length ||
      block.entityIds.some((id) => !present.has(id))
    )
      throw new Error('Invalid command block membership.');
  };
  for (const block of result.updatedClipboardBlocks ?? []) {
    validate(block);
    const key = block.name.toUpperCase();
    if (!originals.has(key) || removed.has(key) || updates.has(key))
      throw new Error('Unknown, removed or duplicate updated block name.');
    updates.set(key, block);
  }
  const occupied = new Set([...originals.keys()].filter((name) => !removed.has(name)));
  for (const block of result.clipboardBlocks ?? []) {
    validate(block);
    const key = block.name.toUpperCase();
    if (occupied.has(key)) throw new Error('Duplicate new block name.');
    occupied.add(key);
  }
  return [
    ...(source.clipboardBlocks ?? [])
      .filter((block) => !removed.has(block.name.toUpperCase()))
      .map((block) => updates.get(block.name.toUpperCase()) ?? block),
    ...(result.clipboardBlocks ?? []),
  ];
}
