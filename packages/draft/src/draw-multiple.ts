import type { DrawContext, DrawFactory, DrawProgram, DrawResult, DrawValue } from './draw-program';
import { lineContinuation } from './line-continuation';

/** Re-enters one command after committing each accepted iteration as its own undo step. */
export function repeatDrawFactory(factory: DrawFactory): DrawFactory {
  return function* repeated(initial: DrawContext): DrawProgram {
    let context = initial,
      checkpoint: DrawResult | undefined;
    for (;;) {
      const program = factory(context);
      let state = program.next();
      if (state.done) return state.value;
      while (!state.done) {
        const request = { ...state.value, ...(checkpoint ? { checkpoint } : {}) };
        checkpoint = undefined;
        const value: DrawValue = yield request;
        state = program.next(value);
      }
      checkpoint = state.value;
      const erased = new Set(checkpoint.eraseIds ?? []);
      const entities = [
        ...context.entities.filter((entity) => !erased.has(entity.id)),
        ...checkpoint.entities,
      ];
      const continuation = lineContinuation(entities);
      const { continuation: _previous, ...rest } = context;
      context = { ...rest, entities, ...(continuation ? { continuation } : {}) };
    }
  };
}
