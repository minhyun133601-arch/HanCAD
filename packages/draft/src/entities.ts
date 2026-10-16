import { normalizeCadState } from '@hancad/legacy-bridge';
import type {
  CadEntity,
  CadEntityBase,
  CadPoint,
  CadSettings,
  LegacyCadState,
} from '@hancad/legacy-bridge';

export function draftEntityBase(
  settings: CadSettings,
  id = `draft-${crypto.randomUUID()}`,
): CadEntityBase {
  const result: CadEntityBase = {
    id,
    layer: settings.layer,
    color: settings.color,
    lineWidth: settings.lineWidth,
  };
  const names = [
    'aci',
    'trueColor',
    'linetype',
    'linetypeScale',
    'lineweight',
    'transparency',
    'plinegen',
  ] as const;
  for (const name of names)
    if (settings[name] !== undefined) Object.assign(result, { [name]: settings[name] });
  return result;
}
export function draftLine(settings: CadSettings, a: CadPoint, b: CadPoint, id?: string): CadEntity {
  return { ...draftEntityBase(settings, id), type: 'line', a: { ...a }, b: { ...b } };
}
export function draftCircle(
  settings: CadSettings,
  center: CadPoint,
  radius: number,
  id?: string,
): CadEntity {
  return { ...draftEntityBase(settings, id), type: 'circle', center: { ...center }, radius };
}
export function draftPolyline(
  settings: CadSettings,
  points: readonly CadPoint[],
  closed = false,
  rectangle = false,
  id?: string,
): CadEntity {
  return {
    ...draftEntityBase(settings, id),
    type: rectangle ? 'rect' : 'polyline',
    points: points.map((point) => ({ ...point })),
    closed: rectangle || closed,
  };
}
export function rectanglePoints(a: CadPoint, b: CadPoint): CadPoint[] {
  return [{ ...a }, { x: b.x, y: a.y }, { ...b }, { x: a.x, y: b.y }];
}

export function appendCadEntities(
  state: LegacyCadState,
  entities: readonly CadEntity[],
): LegacyCadState {
  return normalizeCadState({
    ...state,
    entities: [...state.entities, ...entities],
    selectedIds: [],
  });
}

export function deleteCadEntities(
  state: LegacyCadState,
  ids: readonly string[],
): { state: LegacyCadState; deleted: number } {
  const requested = new Set(ids);
  const blocked = new Set(
    state.layers.filter((layer) => layer.locked || !layer.visible).map((layer) => layer.name),
  );
  const entities = state.entities.filter(
    (entity) => !requested.has(entity.id) || blocked.has(entity.layer),
  );
  const deleted = state.entities.length - entities.length;
  const remaining = new Set(entities.map((entity) => entity.id));
  return {
    state: structuredClone({
      ...state,
      entities,
      selectedIds: state.selectedIds.filter((id) => remaining.has(id)),
    }),
    deleted,
  };
}
