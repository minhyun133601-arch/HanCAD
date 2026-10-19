import type { CadEntity } from '@hancad/legacy-bridge';
import type { DrawContext, DrawResult } from './draw-program';

/** Selection is captured by the host; geometry helpers never change editor state. */
export function modifySelection(context: DrawContext): CadEntity[] {
  const byId = new Map(context.entities.map((entity) => [entity.id, entity]));
  return [...new Set(context.selectedIds ?? [])].flatMap((id) => {
    const entity = byId.get(id);
    return entity && (!context.editableIds || context.editableIds.has(id)) ? [entity] : [];
  });
}

export function modifyId(): string {
  return `modify-${crypto.randomUUID()}`;
}

export function modifyResult(
  originals: readonly CadEntity[],
  replacements: CadEntity[],
): DrawResult {
  return { entities: replacements, eraseIds: originals.map((entity) => entity.id) };
}
