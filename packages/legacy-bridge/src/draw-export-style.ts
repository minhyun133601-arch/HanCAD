import {
  builtinLinetypes,
  colorFromDxf,
  colorFromHex,
  lineweightPixels,
  resolveDisplayColor,
  resolveLineweight,
  rgbToCss,
} from '@hancad/render';
import type { EntityColor } from '@hancad/render';
import type { CadDisplayStyle, CadEntity, CadLinetype, LegacyCadState } from './types';

export interface ExportStyle {
  color: string;
  opacity: number;
  lineWidth: number;
  dashes: number[];
}
export interface DrawingStyleContext {
  mode: 'display' | 'export';
  background?: number;
}
/** Preserve the pre-native adapter's readable-on-white fallback for legacy RGB caches. */
function readableLegacyRgb(rgb: number): number {
  if (rgb === 0xffffff) return 0;
  const channels = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
  const luminance = (channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722) / 255;
  return luminance > 0.65
    ? channels.reduce((result, channel) => result * 256 + Math.round(channel * 0.42), 0)
    : rgb;
}
function legacyColorOf(value: string | undefined, exporting: boolean): EntityColor {
  const color = colorFromHex(value ?? '');
  return color?.kind === 'rgb'
    ? { kind: 'rgb', rgb: exporting ? readableLegacyRgb(color.rgb) : color.rgb }
    : colorFromDxf(7);
}
const colorOf = (value: CadDisplayStyle & { color?: string }, exporting: boolean) =>
  value.aci === undefined && value.trueColor === undefined
    ? legacyColorOf(value.color, exporting)
    : colorFromDxf(value.aci ?? 256, value.trueColor);
export function drawingLinetypes(state: LegacyCadState): CadLinetype[] {
  const definitions = new Map<string, CadLinetype>([
    ['CONTINUOUS', { name: 'CONTINUOUS', description: 'Solid line', pattern: [] }],
  ]);
  for (const type of state.linetypes ?? []) definitions.set(type.name.toUpperCase(), type);
  for (const source of [...(state.entities ?? []), ...(state.layers ?? [])]) {
    const name = source.linetype?.toUpperCase();
    if (!name || name === 'BYLAYER' || name === 'BYBLOCK' || definitions.has(name)) continue;
    const builtin = builtinLinetypes().get(name);
    if (builtin)
      definitions.set(name, {
        name,
        description: builtin.description,
        pattern: builtin.elements.map((e) => e.length),
      });
  }
  return [...definitions.values()];
}
export function drawingExportStyle(
  entity: CadEntity,
  state?: LegacyCadState,
  context?: DrawingStyleContext,
): ExportStyle {
  const exporting = context?.mode !== 'display',
    layer = state?.layers?.find((layer) => layer.name === entity.layer),
    rgb = resolveDisplayColor(colorOf(entity, exporting), {
      background: context?.background ?? (exporting ? 0xffffff : 0x212830),
      layer: colorOf(layer ?? entity, exporting),
    });
  const transparency =
    typeof entity.transparency === 'number'
      ? entity.transparency
      : entity.transparency === 'bylayer' && typeof layer?.transparency === 'number'
        ? layer.transparency
        : 0;
  let name = entity.linetype ?? 'CONTINUOUS';
  if (name === 'BYLAYER') name = layer?.linetype ?? 'CONTINUOUS';
  if (name === 'BYBLOCK') name = 'CONTINUOUS';
  const stored = state?.linetypes?.find((type) => type.name.toUpperCase() === name.toUpperCase()),
    pattern =
      stored?.pattern ??
      builtinLinetypes()
        .get(name.toUpperCase())
        ?.elements.map((e) => e.length) ??
      [];
  const scale = entity.linetypeScale ?? 1;
  return {
    color: rgbToCss(rgb),
    opacity: 1 - transparency / 100,
    lineWidth:
      entity.lineweight === undefined
        ? exporting
          ? Math.max(1, Math.min(6, entity.lineWidth))
          : entity.lineWidth
        : lineweightPixels(resolveLineweight(entity.lineweight, layer?.lineweight ?? -3, 25), true),
    dashes: pattern.some((v) => v < 0) ? pattern.map((v) => Math.abs(v) * scale) : [],
  };
}
