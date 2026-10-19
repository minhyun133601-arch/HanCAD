import type { CadEntity } from '@hancad/legacy-bridge';
import type { DrawContext, DrawFactory, DrawValue } from './draw-program';

/** Replay command-local input into disposable state to preview an unaccepted scalar field. */
export function scalarDrawPreview(
  factory: DrawFactory,
  source: DrawContext,
  history: readonly DrawValue[],
  value: string,
): CadEntity[] {
  const changes = new Map<string, number | string | readonly number[]>();
  const program = factory({
    ...source,
    settings: structuredClone(source.settings),
    ...(source.memory ? { memory: new Map(source.memory) } : {}),
    get: (name) => changes.get(name) ?? source.get(name),
    set: (name, next) => {
      changes.set(name, next);
    },
  });
  let state = program.next();
  for (const accepted of history) {
    if (state.done) return [];
    state = program.next(accepted);
  }
  if (state.done) return [];
  state = program.next(value);
  return state.done ? state.value.entities : (state.value.partial ?? []);
}
