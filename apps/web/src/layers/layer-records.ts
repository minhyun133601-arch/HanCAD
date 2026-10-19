import type {
  DrawingDatabase,
  DatabaseTransaction,
  JsonObject,
  DxfGroup,
  JsonValue,
} from '@hancad/db';
import { applyDxfFieldPatch, getDxfObjectSchema } from '@hancad/db';
import type { CadLayer, LegacyCadState } from '@hancad/legacy-bridge';
import { ACI_RGB, rgbToCss } from '@hancad/render';
import { layerKey } from './layer-model';

const marker = 'hancadLayerManaged';
function layerFields(layer: CadLayer, previous: JsonObject = {}): JsonObject {
  const fields: JsonObject = {
    ...previous,
    [marker]: true,
    flags:
      (Number(previous.flags ?? 0) & ~7) |
      (layer.frozen ? 1 : 0) |
      (layer.newViewportFrozen ? 2 : 0) |
      (layer.locked ? 4 : 0),
    color: (layer.visible ? 1 : -1) * Math.abs(layer.aci ?? 7),
    linetype: layer.linetype ?? 'CONTINUOUS',
    lineweight: layer.lineweight ?? -3,
    transparency:
      0x02000000 |
      Math.round(
        255 * (1 - (typeof layer.transparency === 'number' ? layer.transparency : 0) / 100),
      ),
    plot: layerKey(layer.name) === 'DEFPOINTS' ? 0 : layer.plot === false ? 0 : 1,
    description: layer.description ?? '',
    unreconciled: layer.unreconciled ?? false,
  };
  if (layer.trueColor !== undefined) fields.trueColor = layer.trueColor;
  else if (layer.aci === undefined && /^#?[a-f0-9]{6}$/i.test(layer.color))
    fields.trueColor = parseInt(layer.color.replace('#', ''), 16);
  else delete fields.trueColor;
  return fields;
}
/** Patch only the layer subclass; embedded XDATA, application data and repeated vendor groups survive. */
function layerGroups(groups: readonly DxfGroup[], name: string, fields: JsonObject): DxfGroup[] {
  const patches = new Map<number, JsonValue | undefined>([
    [2, name],
    [70, fields.flags],
    [62, fields.color],
    [420, fields.trueColor],
    [6, fields.linetype],
    [290, fields.plot],
    [370, fields.lineweight],
    [440, fields.transparency],
  ]);
  const result = structuredClone([...groups]);
  const hasSubclass = result.some((group) => group.code === 100);
  let subclass = '',
    depth = 0;
  const last = new Map<number, number>();
  for (let index = 0; index < result.length; index++) {
    const group = result[index]!;
    if (group.code === 102) {
      if (String(group.value).startsWith('{')) depth++;
      else if (group.value === '}') depth = Math.max(0, depth - 1);
      continue;
    }
    if (group.code === 100) subclass = String(group.value);
    if (
      !depth &&
      group.code < 1000 &&
      (!hasSubclass || subclass === 'AcDbLayerTableRecord') &&
      patches.has(group.code)
    )
      last.set(group.code, index);
  }
  for (const [code, value] of patches) {
    const index = last.get(code);
    if (index !== undefined && value !== undefined) result[index] = { code, value };
  }
  const removals = new Set(
    [...last].filter(([code]) => patches.get(code) === undefined).map(([, index]) => index),
  );
  const clean = result.filter((_, index) => !removals.has(index));
  let insertion = clean.length;
  const layerClass = clean.findIndex(
    (group) => group.code === 100 && group.value === 'AcDbLayerTableRecord',
  );
  if (layerClass >= 0) {
    const next = clean.findIndex(
      (group, index) => index > layerClass && (group.code === 100 || group.code >= 1000),
    );
    if (next >= 0) insertion = next;
  } else if (!hasSubclass) {
    const xdata = clean.findIndex((group) => group.code >= 1000);
    if (xdata >= 0) insertion = xdata;
  }
  const additions = [...patches].flatMap(([code, value]) =>
    !last.has(code) && value !== undefined ? [{ code, value }] : [],
  );
  clean.splice(insertion, 0, ...additions);
  return clean;
}
/** Run inside the drawing view's transaction so U restores native and transitional layers together. */
export function syncLayerRecords(
  database: DrawingDatabase,
  tx: DatabaseTransaction,
  state: LegacyCadState,
): void {
  const all = database
    .all(true)
    .filter((item) => item.type === 'LAYER' && item.owner === database.tables.LAYER);
  const retained = new Set<string>();
  for (const layer of state.layers) {
    const previous =
      all.find((item) => item.handle === layer.nativeHandle) ??
      all.find((item) => layerKey(item.name ?? '') === layerKey(layer.name));
    const fields = layerFields(layer, previous?.fields);
    if (previous) {
      retained.add(previous.handle);
      if (previous.name !== layer.name && previous.name) {
        const oldName = layerKey(previous.name);
        for (const entity of database.all()) {
          const schema = getDxfObjectSchema(entity.type);
          if (
            !['entity', 'block'].includes(schema?.section ?? '') ||
            layerKey(String(entity.fields.layer ?? '0')) !== oldName
          )
            continue;
          tx.modify(entity.handle, (record) =>
            Object.assign(record, applyDxfFieldPatch(record, { layer: layer.name })),
          );
        }
      }
      if (
        JSON.stringify(previous.fields) !== JSON.stringify(fields) ||
        previous.name !== layer.name ||
        previous.erased
      )
        tx.modify(previous.handle, (item) => {
          item.name = layer.name;
          item.fields = fields;
          item.groups = layerGroups(item.groups, layer.name, fields);
          item.erased = false;
        });
    } else {
      const record = tx.add({
        type: 'LAYER',
        owner: database.tables.LAYER,
        name: layer.name,
        fields,
        groups: layerGroups([], layer.name, fields),
      });
      retained.add(record.handle);
    }
  }
  for (const record of all)
    if (
      !record.erased &&
      record.fields[marker] &&
      !retained.has(record.handle) &&
      record.name !== '0'
    )
      tx.erase(record.handle);
}
/** Native-only layers join the manager without losing imported legacy presentation properties. */
export function layerStateWithNative(
  database: DrawingDatabase,
  state: LegacyCadState,
): LegacyCadState {
  const rows = database
    .all()
    .filter((item) => item.type === 'LAYER' && item.owner === database.tables.LAYER);
  const layers = state.layers.map((layer) => {
    const native = rows.find(
      (item) =>
        item.handle === layer.nativeHandle || layerKey(item.name ?? '') === layerKey(layer.name),
    );
    return native ? { ...layer, nativeHandle: native.handle } : layer;
  });
  for (const record of rows) {
    if (!record.name || layers.some((layer) => layerKey(layer.name) === layerKey(record.name!)))
      continue;
    const flags = Number(record.fields.flags ?? 0),
      color = Number(record.fields.color ?? 7);
    layers.push({
      name: record.name,
      nativeHandle: record.handle,
      color: rgbToCss(
        typeof record.fields.trueColor === 'number'
          ? record.fields.trueColor
          : (ACI_RGB[Math.abs(color)] ?? 0xffffff),
      ),
      visible: color >= 0,
      frozen: !!(flags & 1),
      newViewportFrozen: !!(flags & 2),
      locked: !!(flags & 4),
      aci: Math.abs(color),
      ...(typeof record.fields.trueColor === 'number'
        ? { trueColor: record.fields.trueColor }
        : {}),
      linetype: String(record.fields.linetype ?? 'CONTINUOUS'),
      lineweight: Number(record.fields.lineweight ?? -3),
      transparency:
        Number(record.fields.transparency ?? 0) & 0x02000000
          ? Math.round((1 - (Number(record.fields.transparency) & 255) / 255) * 100)
          : 0,
      plot: record.fields.plot !== 0 && record.name.toUpperCase() !== 'DEFPOINTS',
      description: String(record.fields.description ?? ''),
      unreconciled: record.fields.unreconciled === true,
    });
  }
  return { ...state, layers };
}
