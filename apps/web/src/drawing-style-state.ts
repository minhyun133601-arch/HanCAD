import type { DrawingDatabase } from '@hancad/db';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { linetypeFromFields } from '@hancad/render';

/** Compatibility editors see loaded names; the native LTYPE retains every complex descriptor. */
export function drawingStyleState(
  database: DrawingDatabase,
  state: LegacyCadState,
): LegacyCadState {
  const definitions = new Map((state.linetypes ?? []).map((l) => [l.name.toUpperCase(), l]));
  for (const object of database.all()) {
    if (
      object.type !== 'LTYPE' ||
      !object.name ||
      ['BYLAYER', 'BYBLOCK'].includes(object.name.toUpperCase())
    )
      continue;
    const parsed = linetypeFromFields(object.name, object.fields);
    definitions.set(object.name.toUpperCase(), {
      name: object.name,
      description: parsed.description,
      pattern: parsed.elements.map((element) => element.length),
    });
  }
  const linetypes = [...definitions.values()];
  return JSON.stringify(linetypes) === JSON.stringify(state.linetypes ?? [])
    ? state
    : { ...state, linetypes };
}
