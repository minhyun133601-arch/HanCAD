import type { CadLayer } from '@hancad/legacy-bridge';
import type { LayerFilter } from './layer-states';
import { layerKey, matchesLayer } from './layer-model';

const fields: Readonly<Record<string, keyof CadLayer>> = {
  name: 'name',
  color: 'aci',
  aci: 'aci',
  on: 'visible',
  visible: 'visible',
  frozen: 'frozen',
  lock: 'locked',
  locked: 'locked',
  plot: 'plot',
  linetype: 'linetype',
  lineweight: 'lineweight',
  transparency: 'transparency',
  description: 'description',
};
/** OR rows and AND conditions follow property-filter expression behavior; no dynamic code is evaluated. */
export function layerFilterMatches(layer: CadLayer, filter: LayerFilter): boolean {
  if (filter.names) return filter.names.some((name) => layerKey(name) === layerKey(layer.name));
  if (!filter.expression?.trim()) return true;
  return filter.expression.split(/\s+OR\s+|\|\|/i).some((group) =>
    group.split(/\s+AND\s+|&&/i).every((condition) => {
      const match = condition.trim().match(/^(\w+)\s*(>=|<=|!=|=|>|<|~)\s*(.*?)\s*$/);
      if (!match) return matchesLayer(layer.name, condition.trim());
      const field = fields[match[1]!.toLowerCase()];
      if (!field) return false;
      const raw = match[3]!.replace(/^(['"])(.*)\1$/, '$2');
      const actual =
        layer[field] ??
        (['frozen', 'locked'].includes(field) ? false : field === 'plot' ? true : '');
      const expected = /^(true|yes|on)$/i.test(raw)
        ? true
        : /^(false|no|off)$/i.test(raw)
          ? false
          : raw;
      switch (match[2]) {
        case '~':
          return matchesLayer(String(actual), raw);
        case '=':
          return typeof actual === 'boolean'
            ? actual === expected
            : matchesLayer(String(actual), raw);
        case '!=':
          return typeof actual === 'boolean'
            ? actual !== expected
            : !matchesLayer(String(actual), raw);
        case '>':
          return Number(actual) > Number(raw);
        case '>=':
          return Number(actual) >= Number(raw);
        case '<':
          return Number(actual) < Number(raw);
        case '<=':
          return Number(actual) <= Number(raw);
        default:
          return false;
      }
    }),
  );
}
