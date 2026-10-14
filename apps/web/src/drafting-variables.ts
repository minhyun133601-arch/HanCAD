import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';

export const draftingVariableNames = ['TEXTSIZE'] as const;
export type DraftingVariableValues = Record<(typeof draftingVariableNames)[number], number>;
const storageKey = 'hancad.drafting-variables.v1';

export function readDraftingVariables(get: (name: string) => unknown): DraftingVariableValues {
  const values = draftingVariableNames.map((name) => {
    const definition = getSystemVariableDefinition(name);
    if (!definition) throw new Error(`Unsupported drafting variable ${name}`);
    const value = get(name) ?? definition.default;
    validateSystemVariable(definition, value);
    return [name, value];
  });
  return Object.fromEntries(values) as DraftingVariableValues;
}

export function restoreDraftingVariables(value: unknown): DraftingVariableValues | undefined {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid drafting variables.');
  const values = value as Record<string, unknown>;
  return readDraftingVariables((name) => values[name]);
}

export function saveDraftingVariables(
  values: DraftingVariableValues,
  documentId: string | undefined,
): void {
  if (!documentId) throw new Error('Drawing identity is unavailable.');
  localStorage.setItem(storageKey, JSON.stringify({ documentId, values }));
}

export function cachedDraftingVariables(
  fallback: DraftingVariableValues | undefined,
  documentId: string | undefined,
): DraftingVariableValues | undefined {
  try {
    const raw = localStorage.getItem(storageKey);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (
      !documentId ||
      typeof value !== 'object' ||
      value === null ||
      !('documentId' in value) ||
      value.documentId !== documentId ||
      !('values' in value)
    )
      return fallback;
    return restoreDraftingVariables(value.values) ?? fallback;
  } catch {
    return fallback;
  }
}
