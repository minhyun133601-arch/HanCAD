import type { EntityColor, EntityTransparency } from './aci';
import { resolveLineweight } from './lineweight';

export interface InheritableStyle {
  layer: string;
  color: EntityColor;
  linetype: string;
  lineweight: number;
  transparency: EntityTransparency;
}
export interface InheritedLayerStyle {
  color: EntityColor;
  linetype: string;
  lineweight: number;
  transparency: EntityTransparency;
  visible?: boolean;
  locked?: boolean;
}
export interface ResolvedInheritedStyle extends InheritableStyle {
  color: Extract<EntityColor, { kind: 'aci' | 'rgb' }>;
  transparency: number;
  visible: boolean;
  locked: boolean;
}
const foreground = { kind: 'aci', index: 7 } as const;
const defaultLayer: InheritedLayerStyle = {
  color: foreground,
  linetype: 'CONTINUOUS',
  lineweight: -3,
  transparency: 0,
};

/** Resolve insertion paths outside-in; layer 0 inherits the effective insertion layer. */
export function resolveInheritedStyle(
  entity: InheritableStyle,
  inserts: readonly InheritableStyle[],
  layers: ReadonlyMap<string, InheritedLayerStyle>,
  lwdefault = 25,
): ResolvedInheritedStyle {
  let parent: ResolvedInheritedStyle | undefined;
  for (const item of [...inserts, entity]) {
    const layerName = item.layer === '0' && parent ? parent.layer : item.layer;
    const layer =
      layers.get(layerName) ??
      [...layers].find(([name]) => name.toUpperCase() === layerName.toUpperCase())?.[1] ??
      defaultLayer;
    const candidate =
      item.color.kind === 'bylayer'
        ? layer.color
        : item.color.kind === 'byblock'
          ? (parent?.color ?? foreground)
          : item.color;
    const color = candidate.kind === 'aci' || candidate.kind === 'rgb' ? candidate : foreground;
    let linetype = item.linetype.toUpperCase();
    if (linetype === 'BYLAYER') linetype = layer.linetype.toUpperCase();
    else if (linetype === 'BYBLOCK') linetype = parent?.linetype ?? 'CONTINUOUS';
    if (linetype === 'BYLAYER' || linetype === 'BYBLOCK') linetype = 'CONTINUOUS';
    const transparency =
      item.transparency === 'bylayer'
        ? layer.transparency
        : item.transparency === 'byblock'
          ? (parent?.transparency ?? 0)
          : item.transparency;
    parent = {
      layer: layerName,
      color,
      linetype,
      lineweight: resolveLineweight(
        item.lineweight,
        layer.lineweight,
        lwdefault,
        parent?.lineweight,
      ),
      transparency: typeof transparency === 'number' ? Math.min(90, Math.max(0, transparency)) : 0,
      visible: layer.visible !== false && (parent?.visible ?? true),
      locked: layer.locked === true || (parent?.locked ?? false),
    };
  }
  return parent!;
}
