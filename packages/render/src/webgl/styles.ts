import { ACI_RGB, foregroundColor, resolveDisplayColor, resolveTransparency } from '../style/aci';
import type { EntityColor, EntityTransparency } from '../style/aci';
import { effectiveLinetypeScale, builtinLinetypes } from '../style/linetype';
import type { LinetypeDefinition } from '../style/linetype';
import { lineweightPixels, resolveLineweight } from '../style/lineweight';
import type { DisplayEntity } from '../display/types';

export interface RenderLayer {
  color: EntityColor;
  lineweight: number;
  linetype: string;
  transparency: EntityTransparency;
  visible?: boolean;
}
export interface RenderEnvironment {
  background: number;
  variable: (name: string) => unknown;
  layers: ReadonlyMap<string, RenderLayer>;
  linetypes: ReadonlyMap<string, LinetypeDefinition>;
  selected: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  preview?: ReadonlySet<string>;
}
export function numberVariable(environment: RenderEnvironment, name: string, fallback: number) {
  const value = environment.variable(name);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export function patternTable(definitions: ReadonlyMap<string, LinetypeDefinition>) {
  const combined = new Map(builtinLinetypes());
  for (const [name, definition] of definitions) combined.set(name.toUpperCase(), definition);
  const names = new Map<string, number>([['CONTINUOUS', 0]]);
  const data = new Float32Array((combined.size + 1) * 13);
  let row = 1;
  for (const [name, definition] of combined) {
    names.set(name, row);
    definition.elements
      .slice(0, 12)
      .forEach((element, index) => (data[row * 13 + index] = element.length));
    data[row * 13 + 12] = definition.patternLength;
    row++;
  }
  return { names, data, height: combined.size + 1 };
}
export function entityStyle(
  entity: DisplayEntity,
  environment: RenderEnvironment,
  patterns: ReadonlyMap<string, number>,
) {
  const layer = environment.layers.get(entity.layer);
  const selected =
    environment.selected.has(entity.id) && numberVariable(environment, 'HIGHLIGHT', 1) !== 0;
  const preview = environment.preview?.has(entity.id) ?? false;
  const effect = numberVariable(environment, 'SELECTIONEFFECT', 1);
  const effectColor = numberVariable(environment, 'SELECTIONEFFECTCOLOR', 0);
  const rgb =
    selected && effect !== 0
      ? effectColor
        ? (ACI_RGB[effectColor] ?? 0x38bdf8)
        : 0x38bdf8
      : preview
        ? foregroundColor(environment.background)
        : resolveDisplayColor(entity.color, {
            layer: layer?.color ?? { kind: 'aci', index: 7 },
            background: environment.background,
          });
  const alpha =
    1 -
    resolveTransparency(
      entity.transparency,
      typeof layer?.transparency === 'number' ? layer.transparency : 0,
      0,
      numberVariable(environment, 'TRANSPARENCYDISPLAY', 1) !== 0,
    ) /
      100;
  let linetype = entity.linetype.toUpperCase();
  if (linetype === 'BYLAYER') linetype = layer?.linetype.toUpperCase() ?? 'CONTINUOUS';
  if (linetype === 'BYBLOCK') linetype = 'CONTINUOUS';
  const scale = effectiveLinetypeScale(entity.linetypeScale, {
    ltscale: numberVariable(environment, 'LTSCALE', 1),
    msltscale: numberVariable(environment, 'MSLTSCALE', 1),
    annotationScale: numberVariable(environment, 'CANNOSCALEVALUE', 1),
    modelSpace: true,
  });
  const weight = resolveLineweight(
    entity.lineweight,
    layer?.lineweight ?? -3,
    numberVariable(environment, 'LWDEFAULT', 25),
  );
  const visible =
    entity.visible !== false && layer?.visible !== false && !environment.hidden.has(entity.id);
  return [
    ((rgb >> 16) & 255) / 255,
    ((rgb >> 8) & 255) / 255,
    (rgb & 255) / 255,
    visible ? alpha : 0,
    Math.max(
      selected && effect !== 0 ? 3 : preview ? 2 : 1,
      lineweightPixels(weight, Boolean(environment.variable('LWDISPLAY'))),
    ),
    patterns.get(linetype) ?? 0,
    scale,
    selected && effect === 0 ? 1 : 0,
  ];
}
export function entityDash(entity: DisplayEntity, environment: RenderEnvironment) {
  const layer = environment.layers.get(entity.layer);
  const name =
    entity.linetype.toUpperCase() === 'BYLAYER'
      ? (layer?.linetype.toUpperCase() ?? 'CONTINUOUS')
      : entity.linetype.toUpperCase();
  const definition = environment.linetypes.get(name) ?? builtinLinetypes().get(name);
  if (!definition?.elements.some((e) => e.length < 0)) return undefined;
  const scale = effectiveLinetypeScale(entity.linetypeScale, {
    ltscale: numberVariable(environment, 'LTSCALE', 1),
    msltscale: numberVariable(environment, 'MSLTSCALE', 1),
    annotationScale: numberVariable(environment, 'CANNOSCALEVALUE', 1),
    modelSpace: true,
  });
  return {
    length: definition.patternLength * scale,
    first: Math.max(0, definition.elements[0]?.length ?? 0) * scale,
  };
}
