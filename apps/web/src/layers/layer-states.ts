import type { CadLayer, LegacyCadState } from '@hancad/legacy-bridge';
import { ACI_RGB } from '@hancad/render';
import { layerKey, newLayer } from './layer-model';

export interface LayerState {
  name: string;
  description: string;
  current: string;
  layers: CadLayer[];
  properties?: LayerRestoreProperty[];
}
export const layerRestoreProperties = [
  'visible',
  'frozen',
  'locked',
  'plot',
  'newViewportFrozen',
  'color',
  'linetype',
  'lineweight',
  'transparency',
  'description',
] as const;
export type LayerRestoreProperty = (typeof layerRestoreProperties)[number];
export interface LayerFilter {
  name: string;
  expression?: string;
  names?: string[];
}
export interface LayerMetadata {
  states: LayerState[];
  filters: LayerFilter[];
  previous?: LayerState;
  previousStack?: LayerState[];
  isolated?: LayerState;
  isolateMode: 'lock' | 'off';
}
export const layerMetadataVariable = 'HANCAD_LAYER_METADATA';
export function readLayerMetadata(value: unknown): LayerMetadata {
  if (typeof value === 'string') {
    try {
      const data: unknown = JSON.parse(value);
      if (
        typeof data === 'object' &&
        data !== null &&
        'states' in data &&
        Array.isArray(data.states) &&
        'filters' in data &&
        Array.isArray(data.filters) &&
        'isolateMode' in data &&
        ['lock', 'off'].includes(String(data.isolateMode))
      )
        return data as LayerMetadata;
    } catch {
      /* Invalid optional metadata does not make drawing geometry unreadable. */
    }
  }
  return { states: [], filters: [], isolateMode: 'lock' };
}
export function captureLayerState(state: LegacyCadState, name = '', description = ''): LayerState {
  return {
    name,
    description,
    current: state.settings.layer,
    layers: structuredClone(state.layers),
  };
}
export function restoreLayerState(
  state: LegacyCadState,
  saved: LayerState,
  create = true,
): LegacyCadState {
  const settings = new Map(saved.layers.map((layer) => [layerKey(layer.name), layer]));
  const layers = state.layers.map((layer) => {
    const previous = settings.get(layerKey(layer.name));
    if (!previous) return layer;
    if (!saved.properties)
      return {
        ...previous,
        name: layer.name,
        ...(layer.nativeHandle ? { nativeHandle: layer.nativeHandle } : {}),
      };
    const result = { ...layer };
    for (const property of saved.properties) {
      const keys: readonly (keyof CadLayer)[] =
        property === 'color' ? ['color', 'aci', 'trueColor'] : [property];
      for (const key of keys) {
        if (previous[key] === undefined) delete result[key];
        else Object.assign(result, { [key]: previous[key] });
      }
    }
    return result;
  });
  if (create)
    for (const layer of saved.layers)
      if (!layers.some((item) => layerKey(item.name) === layerKey(layer.name)))
        layers.push(structuredClone(layer));
  const current = layers.find(
    (layer) => layerKey(layer.name) === layerKey(saved.current) && !layer.frozen,
  );
  return {
    ...state,
    layers,
    settings: { ...state.settings, layer: current?.name ?? state.settings.layer },
  };
}
/** LAYERP retains added/deleted layers and names; persistent native handles identify renamed layers. */
export function restorePreviousLayers(state: LegacyCadState, saved: LayerState): LegacyCadState {
  const layers = state.layers.map((layer) => {
    const prior = saved.layers.find(
      (item) =>
        (layer.nativeHandle && item.nativeHandle === layer.nativeHandle) ||
        layerKey(item.name) === layerKey(layer.name),
    );
    return prior
      ? {
          ...prior,
          name: layer.name,
          ...(layer.nativeHandle ? { nativeHandle: layer.nativeHandle } : {}),
        }
      : layer;
  });
  const priorCurrent = saved.layers.find(
    (layer) => layerKey(layer.name) === layerKey(saved.current),
  );
  const current = layers.find(
    (layer) =>
      !layer.frozen &&
      ((priorCurrent?.nativeHandle && layer.nativeHandle === priorCurrent.nativeHandle) ||
        layerKey(layer.name) === layerKey(saved.current)),
  );
  return {
    ...state,
    layers,
    settings: { ...state.settings, layer: current?.name ?? state.settings.layer },
  };
}
/** LAS is a DXF-style pair stream. Unknown pairs remain in the source's optional comment trailer. */
export function exportLayerState(saved: LayerState): string {
  const pairs: (string | number)[] = [
    0,
    'LAYERSTATEDICTIONARY',
    0,
    'LAYERSTATE',
    1,
    saved.name,
    91,
    saved.properties
      ? saved.properties.reduce(
          (mask, property) =>
            mask |
            {
              visible: 1,
              frozen: 2,
              locked: 4,
              plot: 8,
              newViewportFrozen: 16,
              color: 32,
              linetype: 64,
              lineweight: 128,
              transparency: 1024,
              description: 0,
            }[property],
          0,
        )
      : 2047,
    301,
    saved.description,
    290,
    0,
    302,
    saved.current,
  ];
  for (const layer of saved.layers) {
    const flags =
      (!layer.visible ? 1 : 0) |
      (layer.frozen ? 2 : 0) |
      (layer.locked ? 4 : 0) |
      (layer.plot !== false && layerKey(layer.name) !== 'DEFPOINTS' ? 8 : 0) |
      (layer.newViewportFrozen ? 16 : 0);
    pairs.push(
      8,
      layer.name,
      90,
      flags,
      62,
      layer.aci ?? 7,
      370,
      layer.lineweight ?? -3,
      6,
      layer.linetype ?? 'CONTINUOUS',
      2,
      'Normal',
      440,
      0x02000000 |
        Math.round(
          255 * (1 - (typeof layer.transparency === 'number' ? layer.transparency : 0) / 100),
        ),
    );
    if (layer.trueColor !== undefined) pairs.push(420, layer.trueColor);
    else if (layer.aci === undefined && /^#?[a-f0-9]{6}$/i.test(layer.color))
      pairs.push(420, parseInt(layer.color.replace('#', ''), 16));
    if (layer.description) pairs.push(4, layer.description);
  }
  return `${pairs.map(String).join('\r\n')}\r\n`;
}
export function importLayerState(text: string): LayerState {
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split('\n');
  const pairs: { code: number; value: string }[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]?.trim());
    if (!Number.isInteger(code))
      throw new Error('유효하지 않은 LAS 파일입니다. / Invalid LAS file.');
    pairs.push({ code, value: lines[i + 1]! });
  }
  if (
    pairs[0]?.value !== 'LAYERSTATEDICTIONARY' ||
    !pairs.some((pair) => pair.value === 'LAYERSTATE')
  )
    throw new Error('유효하지 않은 LAS 파일입니다. / Invalid LAS file.');
  const result: LayerState = { name: '', description: '', current: '0', layers: [] };
  let layer: CadLayer | undefined;
  for (const { code, value } of pairs) {
    if (code === 8) {
      layer = newLayer(value);
      result.layers.push(layer);
      continue;
    }
    if (!layer) {
      if (code === 1) result.name = value;
      if (code === 301) result.description = value;
      if (code === 302) result.current = value;
      if (code === 91 && Number(value) !== 2047) {
        const flags: Readonly<Record<LayerRestoreProperty, number>> = {
          visible: 1,
          frozen: 2,
          locked: 4,
          plot: 8,
          newViewportFrozen: 16,
          color: 32,
          linetype: 64,
          lineweight: 128,
          transparency: 1024,
          description: 0,
        };
        result.properties = layerRestoreProperties.filter(
          (property) => (Number(value) & flags[property]) !== 0,
        );
      }
      continue;
    }
    const number = Number(value);
    if ([90, 62, 370, 440, 420].includes(code) && !Number.isFinite(number))
      throw new Error('LAS 숫자가 유효하지 않습니다. / Invalid LAS number.');
    if (code === 90) {
      layer.visible = !(number & 1);
      layer.frozen = !!(number & 2);
      layer.locked = !!(number & 4);
      layer.plot = !!(number & 8);
      layer.newViewportFrozen = !!(number & 16);
    }
    if (code === 62) layer.aci = Math.abs(number);
    if (code === 370) layer.lineweight = number;
    if (code === 440)
      layer.transparency = number === 0 ? 0 : Math.round((1 - (number & 255) / 255) * 100);
    if (code === 420) layer.trueColor = number;
    if (code === 6) layer.linetype = value;
    if (code === 4) layer.description = value;
  }
  if (!result.name || !result.layers.length)
    throw new Error('LAS 도면층 상태가 비어 있습니다. / Empty LAS layer state.');
  for (const layer of result.layers)
    layer.color = `#${(layer.trueColor ?? ACI_RGB[layer.aci ?? 7] ?? 0xffffff).toString(16).padStart(6, '0')}`;
  return result;
}
