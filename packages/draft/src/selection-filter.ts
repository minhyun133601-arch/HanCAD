import type {
  CadEntity,
  CadFilterExpression,
  CadFilterProperty,
  LegacyCadState,
} from '@hancad/legacy-bridge';
import { geometryLength, polylineLength } from '@hancad/geom';
import { arcSweep } from './snap-geometry';

const filterProperties = new Set([
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
export function validCadFilterExpression(input: unknown, depth = 0): input is CadFilterExpression {
  if (typeof input !== 'object' || input === null || depth > 24) return false;
  const value = input as Record<string, unknown>;
  if ('children' in value) {
    if (!Array.isArray(value.children) || value.children.length > 1000) return false;
    const count = value.children.length;
    const arity =
      value.operator === 'xor'
        ? count === 2
        : value.operator === 'not'
          ? count === 1
          : (value.operator === 'and' || value.operator === 'or') && count > 0;
    return arity && value.children.every((child) => validCadFilterExpression(child, depth + 1));
  }
  return (
    filterProperties.has(String(value.property)) &&
    ['=', '!=', '>', '>=', '<', '<=', 'wildcard'].includes(String(value.operator)) &&
    (typeof value.value === 'string' ||
      (typeof value.value === 'number' && Number.isFinite(value.value)))
  );
}
export function validateCadFilterExpression(input: unknown): asserts input is CadFilterExpression {
  if (!validCadFilterExpression(input)) throw new Error('filterExpression');
}

export function cadFilterValue(
  entity: CadEntity,
  property: CadFilterProperty,
  state?: LegacyCadState,
): string | number {
  const block =
    property === 'type' || property === 'name'
      ? state?.clipboardBlocks?.find((item) => item.entityIds.includes(entity.id))
      : undefined;
  if (block) return property === 'type' ? 'insert' : block.name;
  switch (property) {
    case 'type':
      if (entity.sourceType)
        return entity.sourceType === '3DPOLY' ? 'polyline' : entity.sourceType.toLowerCase();
      return entity.type === 'rect' ? 'polyline' : entity.type;
    case 'name':
      return entity.type === 'dimension' ? entity.kind : entity.type;
    case 'color':
      return entity.trueColor ?? entity.aci ?? entity.color;
    case 'linetype':
      return entity.linetype ?? 'BYLAYER';
    case 'linetypeScale':
      return entity.linetypeScale ?? 1;
    case 'lineweight':
      return entity.lineweight ?? -1;
    case 'transparency':
      return entity.transparency ?? 'bylayer';
    case 'text':
      return entity.type === 'text' || entity.type === 'dimension' ? (entity.text ?? '') : '';
    case 'radius':
      return entity.type === 'circle' || entity.type === 'arc' ? entity.radius : 0;
    case 'length': {
      if (entity.curve) return geometryLength(entity.curve);
      if (entity.regionLoops)
        return entity.regionLoops.flat().reduce((sum, curve) => sum + geometryLength(curve), 0);
      if (entity.type === 'line')
        return Math.hypot(entity.b.x - entity.a.x, entity.b.y - entity.a.y);
      if (entity.type === 'circle') return Math.PI * 2 * entity.radius;
      if (entity.type === 'arc') return Math.abs(arcSweep(entity)) * entity.radius;
      if (entity.type === 'polyline' || entity.type === 'rect') {
        return polylineLength({
          closed: entity.closed,
          vertices: entity.points.map((point, index) => ({
            ...point,
            bulge: entity.bulges?.[index] ?? 0,
          })),
        });
      }
      return 0;
    }
    default:
      return entity.layer;
  }
}
/** AutoCAD-style common wildcard forms: *, ?, # digit, @ alphabetic and comma alternatives. */
export function cadWildcardMatch(input: string, pattern: string): boolean {
  return pattern.split(',').some((part) => {
    const negative = part.startsWith('~');
    const source = (negative ? part.slice(1) : part)
      .split('')
      .map((character) => {
        if (character === '*') return '.*';
        if (character === '?') return '.';
        if (character === '#') return '[0-9]';
        if (character === '@') return '[A-Za-z]';
        if (character === '.') return '[^A-Za-z0-9]';
        return character.replace(/[\\^$+(){}|[\].]/g, '\\$&');
      })
      .join('');
    return new RegExp(`^${source}$`, 'i').test(input) !== negative;
  });
}
export function matchesCadFilter(
  entity: CadEntity,
  expression: CadFilterExpression,
  state?: LegacyCadState,
): boolean {
  if ('children' in expression) {
    const values = expression.children.map((child) => matchesCadFilter(entity, child, state));
    if (expression.operator === 'and') return values.length > 0 && values.every(Boolean);
    if (expression.operator === 'or') return values.length > 0 && values.some(Boolean);
    if (expression.operator === 'not') return values.length === 1 && !values[0];
    return values.length === 2 && values[0] !== values[1];
  }
  const raw = cadFilterValue(entity, expression.property, state);
  if (expression.operator === 'wildcard')
    return cadWildcardMatch(String(raw), String(expression.value));
  const numeric = typeof raw === 'number';
  const left = numeric ? raw : String(raw).toUpperCase();
  const right = numeric ? Number(expression.value) : String(expression.value).toUpperCase();
  if (expression.operator === '=') return left === right;
  if (expression.operator === '!=') return left !== right;
  if (expression.operator === '>') return left > right;
  if (expression.operator === '>=') return left >= right;
  if (expression.operator === '<') return left < right;
  return left <= right;
}
export function filterCadSelection(
  state: LegacyCadState,
  expression: CadFilterExpression,
  scope?: readonly string[],
  exclude = false,
): string[] {
  const wanted = scope ? new Set(scope) : undefined;
  const eligible = new Set(
    state.layers.filter((layer) => layer.visible && !layer.locked).map((layer) => layer.name),
  );
  return state.entities
    .filter(
      (entity) =>
        (!wanted || wanted.has(entity.id)) &&
        eligible.has(entity.layer) &&
        matchesCadFilter(entity, expression, state) !== exclude,
    )
    .map((entity) => entity.id);
}
const similarFields = [
  [1, 'color'],
  [2, 'layer'],
  [4, 'linetype'],
  [8, 'linetypeScale'],
  [16, 'lineweight'],
  [64, 'name'],
  [128, 'name'],
] as const;
export function selectSimilarCadEntities(
  state: LegacyCadState,
  sourceIds: readonly string[],
  mode = 130,
): string[] {
  const wanted = new Set(sourceIds);
  const sources = state.entities.filter((entity) => wanted.has(entity.id));
  const eligible = new Set(
    state.layers.filter((layer) => layer.visible && !layer.locked).map((layer) => layer.name),
  );
  return state.entities
    .filter(
      (entity) =>
        eligible.has(entity.layer) &&
        sources.some(
          (source) =>
            cadFilterValue(source, 'type', state) === cadFilterValue(entity, 'type', state) &&
            similarFields.every(
              ([bit, property]) =>
                !(mode & bit) ||
                cadFilterValue(source, property, state) === cadFilterValue(entity, property, state),
            ),
        ),
    )
    .map((entity) => entity.id);
}
