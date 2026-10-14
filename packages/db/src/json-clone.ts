import type { JsonObject, JsonValue } from './types';

/** Immutable primitives, including large drawing strings, need no structured-copy allocation. */
export function cloneJson<Value extends JsonValue | undefined>(value: Value): Value {
  return value === null || typeof value !== 'object' ? value : structuredClone(value);
}

export function cloneVariableMap(values: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, cloneJson(value)]),
  );
}
