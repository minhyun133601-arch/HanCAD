export type SysvarValue = number | string | boolean | [number, number] | [number, number, number];
export type SysvarScope = 'drawing' | 'profile' | 'session';
export interface SystemVariableDefinition {
  name: string;
  type: 'integer' | 'real' | 'string' | 'boolean' | 'point2' | 'point3';
  default?: SysvarValue;
  defaultUnavailable?: string;
  defaultPolicy?: string;
  scope: SysvarScope;
  description: string;
  min?: number;
  max?: number;
  exclusiveMin?: boolean;
  exclusiveMax?: boolean;
  enum?: readonly SysvarValue[];
  bits?: Readonly<Record<number, string>>;
  bitmask?: number;
  readonly?: boolean;
  toggleBit?: number;
  character?: boolean;
  validationNote?: string;
  source: { url: string; type: string; savedIn: string; initial: string };
}
export interface DxfHeaderVariableDefinition {
  name: string;
  codes: readonly number[];
  systemVariable: string | null;
  source: string;
}

export function isSysvarValue(value: unknown): value is SysvarValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) &&
      (value.length === 2 || value.length === 3) &&
      value.every(
        (coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate),
      ))
  );
}

/** Catalog JSON is checked once at startup; malformed source metadata must fail loudly. */
export function loadSystemVariableDefinition(value: unknown): SystemVariableDefinition {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !/^[A-Z0-9_-]+$/.test(value.name) ||
    !('type' in value) ||
    typeof value.type !== 'string' ||
    !['integer', 'real', 'string', 'boolean', 'point2', 'point3'].includes(value.type) ||
    !('scope' in value) ||
    typeof value.scope !== 'string' ||
    !['drawing', 'profile', 'session'].includes(value.scope) ||
    !('description' in value) ||
    typeof value.description !== 'string' ||
    value.description.length === 0 ||
    !('source' in value) ||
    typeof value.source !== 'object' ||
    value.source === null
  )
    throw new Error('Invalid system-variable catalog definition');
  const source = value.source;
  for (const key of ['url', 'type', 'savedIn', 'initial']) {
    if (!(key in source) || typeof (source as Record<string, unknown>)[key] !== 'string')
      throw new Error(`Invalid system-variable source: ${value.name}`);
  }
  if ('default' in value && !isSysvarValue(value.default))
    throw new Error(`Invalid default: ${value.name}`);
  if (
    !('default' in value) &&
    (!('defaultUnavailable' in value) || typeof value.defaultUnavailable !== 'string')
  )
    throw new Error(`Missing initial-value policy: ${value.name}`);
  for (const key of ['min', 'max', 'toggleBit', 'bitmask']) {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined && (typeof item !== 'number' || !Number.isFinite(item)))
      throw new Error(`Invalid numeric metadata: ${value.name}`);
  }
  if ('enum' in value && (!Array.isArray(value.enum) || !value.enum.every(isSysvarValue)))
    throw new Error(`Invalid enum: ${value.name}`);
  if (
    'bits' in value &&
    (typeof value.bits !== 'object' ||
      value.bits === null ||
      Object.entries(value.bits).some(
        ([bit, meaning]) => !/^\d+$/.test(bit) || typeof meaning !== 'string',
      ))
  )
    throw new Error(`Invalid bit metadata: ${value.name}`);
  return deepFreeze(structuredClone(value)) as SystemVariableDefinition;
}
export function loadDxfHeaderDefinition(value: unknown): DxfHeaderVariableDefinition {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('codes' in value) ||
    !Array.isArray(value.codes) ||
    !value.codes.length ||
    !value.codes.every(
      (code: unknown) =>
        typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 1071,
    ) ||
    !('systemVariable' in value) ||
    !(value.systemVariable === null || typeof value.systemVariable === 'string') ||
    !('source' in value) ||
    typeof value.source !== 'string'
  )
    throw new Error('Invalid DXF header catalog definition');
  return deepFreeze(structuredClone(value)) as DxfHeaderVariableDefinition;
}
function deepFreeze(value: object): object {
  for (const child of Object.values(value))
    if (typeof child === 'object' && child !== null) deepFreeze(child);
  return Object.freeze(value);
}
