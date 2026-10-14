import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';
import type { MessageKey } from '@hancad/ui';

export const dimensionStyleFields = [
  ['DIMTXT', 'dimTextHeight'],
  ['DIMASZ', 'dimArrowSize'],
  ['DIMDEC', 'dimPrecision'],
  ['DIMSCALE', 'dimScale'],
  ['DIMEXO', 'dimExtensionGap'],
  ['DIMEXE', 'dimExtensionOvershoot'],
  ['DIMGAP', 'dimTextGap'],
  ['DIMLFAC', 'dimMeasurementFactor'],
  ['DIMZIN', 'dimZeroSuppression'],
  ['DIMPOST', 'dimPrefixSuffix'],
] as const satisfies readonly (readonly [string, MessageKey])[];
export type DimensionStyleVariable = (typeof dimensionStyleFields)[number][0];
export type DimensionStyleValues = Record<Exclude<DimensionStyleVariable, 'DIMPOST'>, number> & {
  DIMPOST: string;
};
const styleStorageKey = 'hancad.dimension-style.v1';

export function readDimensionStyle(get: (name: string) => unknown): DimensionStyleValues {
  const entries = dimensionStyleFields.map(([name]) => {
    const definition = getSystemVariableDefinition(name);
    if (!definition) throw new Error(`Unsupported dimension variable ${name}`);
    const value = get(name) ?? definition.default;
    validateSystemVariable(definition, value);
    return [name, value];
  });
  return Object.fromEntries(entries) as DimensionStyleValues;
}

export function restoreDimensionStyle(value: unknown): DimensionStyleValues | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null)
    throw new Error('Invalid stored dimension style.');
  const variables = value as Record<string, unknown>;
  return readDimensionStyle((name) => variables[name]);
}

export function saveDimensionStyle(
  style: DimensionStyleValues,
  documentId: string | undefined,
): void {
  if (!documentId) throw new Error('Drawing identity is unavailable.');
  localStorage.setItem(styleStorageKey, JSON.stringify({ documentId, style }));
}

export function cachedDimensionStyle(
  fallback: DimensionStyleValues | undefined,
  documentId: string | undefined,
): DimensionStyleValues | undefined {
  try {
    if (!documentId) return fallback;
    const cached = localStorage.getItem(styleStorageKey);
    const value: unknown = cached ? JSON.parse(cached) : null;
    if (
      typeof value !== 'object' ||
      value === null ||
      !('documentId' in value) ||
      value.documentId !== documentId ||
      !('style' in value)
    )
      return fallback;
    return restoreDimensionStyle(value.style) ?? fallback;
  } catch {
    return fallback;
  }
}
