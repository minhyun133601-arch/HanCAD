import type { CadFilterExpression, LegacyCadState } from './types';

const properties = new Set([
  'type',
  'layer',
  'color',
  'linetype',
  'linetypeScale',
  'lineweight',
  'transparency',
  'text',
  'radius',
  'length',
  'name',
]);
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function validExpression(value: unknown, depth = 0): value is CadFilterExpression {
  if (!record(value) || depth > 24) return false;
  if ('children' in value)
    return (
      ['and', 'or', 'not', 'xor'].includes(String(value.operator)) &&
      Array.isArray(value.children) &&
      value.children.length <= 1000 &&
      value.children.every((child) => validExpression(child, depth + 1))
    );
  return (
    properties.has(String(value.property)) &&
    ['=', '!=', '>', '>=', '<', '<=', 'wildcard'].includes(String(value.operator)) &&
    (typeof value.value === 'string' ||
      (typeof value.value === 'number' && Number.isFinite(value.value)))
  );
}
/** Keep native selection metadata outside the legacy runtime's geometry normalization. */
export function restoreSelectionMetadata(state: LegacyCadState, value: unknown): void {
  if (!record(value)) return;
  const present = new Set(state.entities.map((entity) => entity.id));
  if (Array.isArray(value.groups)) {
    const names = new Set<string>();
    state.groups = value.groups
      .filter((group) => {
        if (
          !record(group) ||
          typeof group.name !== 'string' ||
          !group.name ||
          typeof group.description !== 'string' ||
          typeof group.selectable !== 'boolean' ||
          !Array.isArray(group.ids) ||
          names.has(group.name.toUpperCase())
        )
          return false;
        names.add(group.name.toUpperCase());
        return true;
      })
      .map((group) => ({
        ...(typeof group.id === 'string' && group.id ? { id: group.id } : {}),
        name: String(group.name),
        description: String(group.description),
        selectable: group.selectable === true,
        ids: [
          ...new Set(
            (group.ids as unknown[]).filter(
              (id): id is string => typeof id === 'string' && present.has(id),
            ),
          ),
        ],
      }));
  }
  if (Array.isArray(value.selectionFilters))
    state.selectionFilters = value.selectionFilters
      .filter(
        (filter) =>
          record(filter) && typeof filter.name === 'string' && validExpression(filter.expression),
      )
      .map((filter) => ({
        name: String(filter.name),
        expression: structuredClone(filter.expression as CadFilterExpression),
      }));
}
