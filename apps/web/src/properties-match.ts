import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';

export const matchPropertyLabels = {
  color: ['색상', 'Color'],
  layer: ['도면층', 'Layer'],
  linetype: ['선종류', 'Linetype'],
  linetypeScale: ['선종류 축척', 'Linetype scale'],
  lineweight: ['선가중치', 'Lineweight'],
  transparency: ['투명도', 'Transparency'],
  thickness: ['두께', 'Thickness'],
  plotStyle: ['플롯 스타일', 'Plot style'],
  text: ['문자', 'Text'],
  dimension: ['치수', 'Dimension'],
  polyline: ['폴리선', 'Polyline'],
  material: ['재료', 'Material'],
} as const;
export type MatchProperty = keyof typeof matchPropertyLabels;
export type MatchSettings = Readonly<Record<MatchProperty, boolean>>;
export const defaultMatchSettings: MatchSettings = {
  color: true,
  layer: true,
  linetype: true,
  linetypeScale: true,
  lineweight: true,
  transparency: true,
  thickness: true,
  plotStyle: true,
  text: true,
  dimension: true,
  polyline: true,
  material: true,
};
const fields: Record<MatchProperty, readonly string[]> = {
  color: ['color', 'aci', 'trueColor'],
  layer: ['layer'],
  linetype: ['linetype'],
  linetypeScale: ['linetypeScale'],
  lineweight: ['lineweight', 'lineWidth'],
  transparency: ['transparency'],
  thickness: ['thickness'],
  plotStyle: ['plotStyle'],
  text: ['annotative'],
  dimension: [
    'precision',
    'dimScale',
    'textSize',
    'arrowSize',
    'extensionGap',
    'extensionOvershoot',
    'unit',
    'textGap',
    'measurementFactor',
    'zeroSuppression',
    'post',
    'textRotation',
    'annotative',
  ],
  polyline: ['plinegen'],
  material: ['material'],
};

/** Copy attributes rather than resolved appearance; absent overrides are cleared. */
export function matchEntityProperties(
  state: LegacyCadState,
  sourceId: string,
  destinationIds: readonly string[],
  settings: MatchSettings = defaultMatchSettings,
): LegacyCadState {
  const source = state.entities.find((entity) => entity.id === sourceId);
  if (!source) throw new Error('Source object not found.');
  const destinations = new Set(destinationIds);
  const lockedLayers = new Set(
    state.layers.filter((layer) => layer.locked).map((layer) => layer.name),
  );
  const entities = state.entities.map((entity): CadEntity => {
    if (entity.id === sourceId || !destinations.has(entity.id) || lockedLayers.has(entity.layer))
      return entity;
    const result = structuredClone(entity);
    const writable = result as unknown as Record<string, unknown>;
    const readable = source as unknown as Record<string, unknown>;
    for (const property of Object.keys(settings) as MatchProperty[]) {
      if (!settings[property]) continue;
      if (
        ['linetype', 'linetypeScale'].includes(property) &&
        ['ATTRIB', 'HATCH', 'MTEXT', 'POINT', 'VIEWPORT'].includes(entity.sourceType ?? '')
      )
        continue;
      if (
        property === 'thickness' &&
        (entity.type === 'dimension' || (entity.curve?.type === 'POLYLINE' && entity.curve.is3D))
      )
        continue;
      if (
        ['text', 'dimension'].includes(property) &&
        (entity.type !== property || source.type !== property)
      )
        continue;
      if (
        property === 'polyline' &&
        (!['polyline', 'rect'].includes(entity.type) || !['polyline', 'rect'].includes(source.type))
      )
        continue;
      for (const key of fields[property]) {
        if (readable[key] === undefined) delete writable[key];
        else writable[key] = structuredClone(readable[key]);
      }
      if (
        property === 'polyline' &&
        (source.type === 'polyline' || source.type === 'rect') &&
        (result.type === 'polyline' || result.type === 'rect') &&
        !(
          source.startWidths?.some((width) => width !== 0) ||
          source.endWidths?.some((width) => width !== 0)
        )
      ) {
        result.constantWidth = source.constantWidth ?? 0;
        delete result.startWidths;
        delete result.endWidths;
        if (result.curve?.type === 'LWPOLYLINE' || result.curve?.type === 'POLYLINE') {
          result.curve.constantWidth = source.constantWidth ?? 0;
          for (const vertex of result.curve.vertices) {
            vertex.startWidth = source.constantWidth ?? 0;
            vertex.endWidth = source.constantWidth ?? 0;
          }
        }
      }
    }
    return result;
  });
  return { ...state, entities };
}

/** Accepted destinations retain the settings active at the time of each pick. */
export class PropertyMatchSession {
  private readonly accepted = new Set<string>();
  private readonly editable: Set<string>;
  private current: LegacyCadState;
  constructor(
    state: LegacyCadState,
    private readonly sourceId: string,
  ) {
    if (!state.entities.some((entity) => entity.id === sourceId))
      throw new Error('Source object not found.');
    this.current = state;
    const locked = new Set(state.layers.filter((layer) => layer.locked).map((layer) => layer.name));
    this.editable = new Set(
      state.entities.filter((entity) => !locked.has(entity.layer)).map((entity) => entity.id),
    );
  }
  accept(ids: readonly string[], settings: MatchSettings): boolean {
    const fresh = ids.filter(
      (id) => id !== this.sourceId && !this.accepted.has(id) && this.editable.has(id),
    );
    if (!fresh.length) return false;
    this.current = matchEntityProperties(this.current, this.sourceId, fresh, settings);
    for (const id of fresh) this.accepted.add(id);
    return true;
  }
  get hasTargets(): boolean {
    return this.accepted.size > 0;
  }
  get state(): LegacyCadState {
    return this.current;
  }
}
