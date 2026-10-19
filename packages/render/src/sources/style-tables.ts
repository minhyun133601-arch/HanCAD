import type { DatabaseObject } from '@hancad/db';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { colorFromDxf, colorFromHex, transparencyFromDxf } from '../style/aci';
import type { EntityColor } from '../style/aci';
import { builtinLinetypes, linetypeFromFields } from '../style/linetype';
import type { LinetypeDefinition } from '../style/linetype';

export interface DisplayLayerStyle {
  name: string;
  color: EntityColor;
  linetype: string;
  lineweight: number;
  transparency: number;
  visible: boolean;
  locked: boolean;
}
export interface DrawingStyleTables {
  layers: ReadonlyMap<string, DisplayLayerStyle>;
  linetypes: ReadonlyMap<string, LinetypeDefinition>;
}
const numeric = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Reads native style records and imported originals without resolving ACI 7 prematurely. */
export function drawingStyleTables(
  objects: readonly DatabaseObject[],
  legacy?: LegacyCadState,
): DrawingStyleTables {
  const layers = new Map<string, DisplayLayerStyle>();
  const linetypes = new Map(builtinLinetypes());
  for (const definition of legacy?.linetypes ?? [])
    linetypes.set(
      definition.name.toUpperCase(),
      linetypeFromFields(definition.name, { ...definition }),
    );
  for (const layer of legacy?.layers ?? [])
    layers.set(layer.name, {
      name: layer.name,
      color:
        layer.aci === undefined && layer.trueColor === undefined
          ? (colorFromHex(layer.color) ?? { kind: 'aci', index: 7 })
          : colorFromDxf(layer.aci ?? 7, layer.trueColor),
      linetype: layer.linetype ?? 'CONTINUOUS',
      lineweight: layer.lineweight ?? -3,
      transparency: typeof layer.transparency === 'number' ? layer.transparency : 0,
      visible: layer.visible && !layer.frozen,
      locked: layer.locked,
    });
  for (const object of objects) {
    if (object.erased || !object.name) continue;
    const fields = object.fields;
    if (object.type === 'LTYPE')
      linetypes.set(object.name.toUpperCase(), linetypeFromFields(object.name, fields));
    if (object.type !== 'LAYER') continue;
    const flags = numeric(fields.flags, 0),
      color = numeric(fields.color, 7);
    const transparency = transparencyFromDxf(numeric(fields.transparency, 0));
    // Imported layers remain authoritative while the transitional native graph holds metric placeholders.
    if (legacy && layers.has(object.name)) continue;
    layers.set(object.name, {
      name: object.name,
      color: colorFromDxf(
        color,
        typeof fields.trueColor === 'number' ? fields.trueColor : undefined,
      ),
      linetype: typeof fields.linetype === 'string' ? fields.linetype.toUpperCase() : 'CONTINUOUS',
      lineweight: numeric(fields.lineweight, -3),
      transparency: typeof transparency === 'number' ? transparency : 0,
      visible: color >= 0 && (flags & 1) === 0 && fields.visible !== false,
      locked: (flags & 4) !== 0,
    });
  }
  return { layers, linetypes };
}
