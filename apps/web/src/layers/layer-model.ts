import type { CadLayer, LegacyCadState } from '@hancad/legacy-bridge';

export type LayerField = 'visible' | 'frozen' | 'locked' | 'plot' | 'newViewportFrozen';
export const layerKey = (name: string): string => name.toLocaleUpperCase('en-US');
export function findLayer(state: LegacyCadState, name: string): CadLayer | undefined {
  return state.layers.find((layer) => layerKey(layer.name) === layerKey(name));
}
export function assertLayerName(name: string): string {
  const clean = name.trim();
  if (!clean || clean.length > 255 || /[<>/\\":;?*|=\u0000-\u001f]/.test(clean))
    throw new Error('유효하지 않은 도면층 이름입니다. / Invalid layer name.');
  return clean;
}
export function newLayer(name: string, template?: CadLayer): CadLayer {
  const result: CadLayer = {
    ...(template ?? {
      color: '#ffffff',
      visible: true,
      locked: false,
      aci: 7,
      linetype: 'CONTINUOUS',
      lineweight: -3,
      transparency: 0,
      plot: true,
    }),
    name: assertLayerName(name),
    ...(layerKey(name) === 'DEFPOINTS' ? { plot: false } : {}),
  };
  delete result.nativeHandle;
  return result;
}
export function createLayers(
  state: LegacyCadState,
  names: string,
  template?: CadLayer,
): LegacyCadState {
  const next = { ...state, layers: [...state.layers] };
  for (const name of names.split(',').map((name) => assertLayerName(name)))
    if (!findLayer(next, name)) next.layers.push(newLayer(name, template));
  return next;
}
/** AutoCAD wildcard list: comma alternatives, ~ exclusion, # digit, @ letter, . nonalphanumeric. */
export function matchesLayer(name: string, pattern: string): boolean {
  return pattern.split(',').some((entry) => {
    let part = entry.trim(),
      negate = false;
    if (part.startsWith('~')) {
      negate = true;
      part = part.slice(1);
    }
    let source = '';
    for (let i = 0; i < part.length; i++) {
      const c = part[i]!;
      if (c === '`' && i + 1 < part.length)
        source += part[++i]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      else if (c === '*') source += '.*';
      else if (c === '?') source += '.';
      else if (c === '#') source += '[0-9]';
      else if (c === '@') source += '[A-Za-z]';
      else if (c === '.') source += '[^A-Za-z0-9]';
      else if (c === '[') {
        const end = part.indexOf(']', i + 1);
        if (end >= 0) {
          source += part.slice(i, end + 1).replace('[~', '[^');
          i = end;
        } else source += '\\[';
      } else source += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return negate !== new RegExp(`^${source}$`, 'i').test(name);
  });
}
export function changeLayers(
  state: LegacyCadState,
  pattern: string,
  update: (layer: CadLayer) => CadLayer,
): LegacyCadState {
  const target = pattern.trim() || state.settings.layer;
  if (!state.layers.some((layer) => matchesLayer(layer.name, target)))
    throw new Error(`도면층을 찾을 수 없습니다: ${target} / Layer not found.`);
  return {
    ...state,
    layers: state.layers.map((layer) => (matchesLayer(layer.name, target) ? update(layer) : layer)),
  };
}
export function setCurrentLayer(state: LegacyCadState, name: string): LegacyCadState {
  const layer = findLayer(state, name);
  if (!layer) throw new Error(`도면층을 찾을 수 없습니다: ${name} / Layer not found.`);
  if (layer.frozen || name.includes('|'))
    throw new Error(
      '동결되거나 외부 참조에 종속된 도면층은 현재로 설정할 수 없습니다. / Cannot make frozen or xref-dependent layer current.',
    );
  return {
    ...changeLayers(state, layer.name, (item) => ({ ...item, visible: true })),
    settings: { ...state.settings, layer: layer.name },
  };
}
export function changeLayerField(
  state: LegacyCadState,
  name: string,
  field: LayerField,
  value: boolean,
): LegacyCadState {
  return changeLayers(state, name, (layer) => {
    if (field === 'frozen' && value && layerKey(layer.name) === layerKey(state.settings.layer))
      throw new Error('현재 도면층은 동결할 수 없습니다. / Cannot freeze the current layer.');
    if (field === 'plot' && value && layerKey(layer.name) === 'DEFPOINTS') return layer;
    return { ...layer, [field]: value };
  });
}
export function renameLayer(state: LegacyCadState, previous: string, next: string): LegacyCadState {
  const layer = findLayer(state, previous),
    name = assertLayerName(next);
  if (!layer) throw new Error('도면층을 찾을 수 없습니다. / Layer not found.');
  if (['0', 'DEFPOINTS'].includes(layerKey(previous)) || previous.includes('|'))
    throw new Error('이 도면층의 이름은 바꿀 수 없습니다. / This layer cannot be renamed.');
  if (findLayer(state, name) && layerKey(name) !== layerKey(previous))
    throw new Error('도면층 이름이 이미 있습니다. / Layer name already exists.');
  return {
    ...state,
    layers: state.layers.map((item) => (item === layer ? { ...item, name } : item)),
    entities: state.entities.map((entity) =>
      layerKey(entity.layer) === layerKey(previous) ? { ...entity, layer: name } : entity,
    ),
    settings: {
      ...state.settings,
      layer: layerKey(state.settings.layer) === layerKey(previous) ? name : state.settings.layer,
    },
  };
}
export function deleteLayers(
  state: LegacyCadState,
  names: readonly string[],
  force = false,
): LegacyCadState {
  const wanted = new Set(names.map(layerKey));
  for (const layer of state.layers.filter((item) => wanted.has(layerKey(item.name)))) {
    if (
      ['0', 'DEFPOINTS', layerKey(state.settings.layer)].includes(layerKey(layer.name)) ||
      layer.name.includes('|') ||
      (force && layer.locked) ||
      (!force && state.entities.some((entity) => layerKey(entity.layer) === layerKey(layer.name)))
    )
      throw new Error(`도면층을 삭제할 수 없습니다: ${layer.name} / Layer cannot be deleted.`);
  }
  return {
    ...state,
    layers: state.layers.filter((item) => !wanted.has(layerKey(item.name))),
    entities: force
      ? state.entities.filter((item) => !wanted.has(layerKey(item.layer)))
      : state.entities,
  };
}
export function mergeLayers(
  state: LegacyCadState,
  names: readonly string[],
  target: string,
): LegacyCadState {
  const layer = findLayer(state, target);
  if (!layer) throw new Error('대상 도면층을 찾을 수 없습니다. / Destination layer not found.');
  const wanted = new Set(names.map(layerKey));
  wanted.delete(layerKey(layer.name));
  if (wanted.has('0') || names.some((name) => name.includes('|')))
    throw new Error(
      '도면층 0 또는 외부 참조 도면층은 병합할 수 없습니다. / Cannot merge layer 0 or xref-dependent layers.',
    );
  return {
    ...state,
    layers: state.layers.filter((item) => !wanted.has(layerKey(item.name))),
    entities: state.entities.map((entity) =>
      wanted.has(layerKey(entity.layer)) ? { ...entity, layer: layer.name } : entity,
    ),
    settings: {
      ...state.settings,
      layer: wanted.has(layerKey(state.settings.layer)) ? layer.name : state.settings.layer,
    },
  };
}
