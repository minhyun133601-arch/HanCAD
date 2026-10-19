import type { SystemVariables } from '@hancad/sysvars';
import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';
import { cornerExpression } from '@hancad/draft';
import { entityProperties, propertyLineweights } from './entity-properties';
import { parseColorValue } from './styles08/color-values';

const names: Readonly<Record<string, string>> = {
  layer: 'CLAYER',
  color: 'CECOLOR',
  linetype: 'CELTYPE',
  linetypeScale: 'CELTSCALE',
  lineweight: 'CELWEIGHT',
  transparency: 'CETRANSPARENCY',
  thickness: 'THICKNESS',
};
export function applyCurrentProperty(
  variables: SystemVariables,
  state: LegacyCadState,
  key: string,
  input: string,
): void {
  const name = names[key];
  if (!name) throw new Error('Current property is not editable.');
  let value: string | number = input;
  if (key === 'layer') {
    if (!state.layers.some((layer) => layer.name === input && !layer.frozen))
      throw new Error('Choose an existing thawed layer.');
  } else if (key === 'color') {
    const hex = /^#[\da-f]{6}$/i.test(input) ? parseInt(input.slice(1), 16) : undefined;
    value = parseColorValue(
      hex === undefined ? input : `RGB:${hex >> 16},${(hex >> 8) & 255},${hex & 255}`,
    );
  } else if (key === 'linetype') {
    const known = ['BYLAYER', 'BYBLOCK', 'CONTINUOUS', 'DASHED', 'HIDDEN', 'CENTER', 'DOT'];
    if (
      !known.includes(input.toUpperCase()) &&
      !state.linetypes?.some((line) => line.name.toUpperCase() === input.toUpperCase())
    )
      throw new Error('Unknown linetype.');
  } else {
    value =
      key === 'transparency' && /^bylayer$/i.test(input)
        ? -1
        : key === 'transparency' && /^byblock$/i.test(input)
          ? -2
          : (cornerExpression(input) ?? NaN);
    if (!Number.isFinite(value) || Math.abs(value) > 1e12)
      throw new Error('A finite numeric value is required.');
    if (key === 'linetypeScale' && value <= 0) throw new Error('Value must be greater than zero.');
    if (key === 'lineweight' && !(propertyLineweights as readonly number[]).includes(value))
      throw new Error('Invalid lineweight.');
    if (key === 'transparency' && (!Number.isInteger(value) || value < -2 || value > 90))
      throw new Error('Invalid transparency.');
  }
  variables.set(name, value);
}

export function currentPropertyFields(variables: SystemVariables, state: LegacyCadState) {
  const transparency = variables.getNumber('CETRANSPARENCY');
  const entity: CadEntity = {
    ...state.settings,
    id: '*CURRENT*',
    type: 'line',
    a: { x: 0, y: 0 },
    b: { x: 0, y: 0 },
    layer: String(variables.get('CLAYER')),
    color: String(variables.get('CECOLOR')),
    linetype: String(variables.get('CELTYPE')),
    linetypeScale: variables.getNumber('CELTSCALE'),
    lineweight: variables.getNumber('CELWEIGHT'),
    transparency: transparency === -1 ? 'bylayer' : transparency === -2 ? 'byblock' : transparency,
    thickness: variables.getNumber('THICKNESS'),
  };
  delete entity.aci;
  delete entity.trueColor;
  return entityProperties([entity]).filter(
    (property) => property.category === 'general' && property.key !== 'type',
  );
}
