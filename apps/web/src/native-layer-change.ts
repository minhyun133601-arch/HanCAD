import { applyDxfFieldPatch, getDxfObjectSchema } from '@hancad/db';
import type { DatabaseObject, JsonObject } from '@hancad/db';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import type { SystemVariables, SysvarValue } from '@hancad/sysvars';
import type { NativeLayerChange } from './layers/layer-host';
import { nativePropertyIds } from './native-property-state';
import { commitNativeCopies } from './complete-native-copies';
import { translateNativeCopy } from './native-copy-geometry';

export function patchNativeProperties(object: DatabaseObject, fields: JsonObject): void {
  const mapped = new Set(getDxfObjectSchema(object.type)?.fields.map((f) => f.name));
  const patch = Object.fromEntries(Object.entries(fields).filter(([key]) => mapped.has(key)));
  if (Object.keys(patch).length) Object.assign(object, applyDxfFieldPatch(object, patch));
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) delete object.fields[key];
    else object.fields[key] = value;
  }
  if ('layer' in fields && !mapped.has('layer')) {
    const existing = object.groups.find((g) => g.code === 8);
    if (existing) existing.value = String(fields.layer);
    else if (object.groups.length) object.groups.push({ code: 8, value: String(fields.layer) });
  }
  if (object.type === 'INSERT' && Array.isArray(fields.insertionPoint)) {
    const position = fields.insertionPoint;
    const scoped = object.groups.some((g) => g.code === 100);
    let subclass = '',
      depth = 0;
    const remaining = new Map([10, 20, 30].map((code, i) => [code, Number(position[i] ?? 0)]));
    for (const group of object.groups) {
      if (group.code === 100) subclass = String(group.value);
      if (group.code === 102) {
        depth += String(group.value).startsWith('{') ? 1 : group.value === '}' ? -1 : 0;
        continue;
      }
      if (!depth && (!scoped || subclass === 'AcDbBlockReference') && remaining.has(group.code)) {
        group.value = remaining.get(group.code)!;
        remaining.delete(group.code);
      }
    }
    if (remaining.size && object.groups.length) {
      const index = object.groups.findIndex((g) => g.code >= 1000);
      object.groups.splice(
        index < 0 ? object.groups.length : index,
        0,
        ...[...remaining].map(([code, value]) => ({ code, value })),
      );
    }
  }
}

/** Native edits and replacement compatibility state share the command's one atomic journal group. */
export function commitNativeLayerChange(
  sysvars: SystemVariables,
  label: string,
  source: LegacyCadState,
  state: LegacyCadState,
  variables: Readonly<Record<string, SysvarValue>>,
  change: NativeLayerChange,
  commit: (
    label: string,
    next: LegacyCadState,
    variables?: Readonly<Record<string, SysvarValue>>,
  ) => void,
): void {
  const database = sysvars.database,
    ids = nativePropertyIds(database, source);
  const wanted = new Set(change.ids ?? []),
    names = new Set(change.names?.map((name) => name.toUpperCase()) ?? []);
  const all = database.all(),
    byHandle = new Map(all.map((o) => [o.handle, o]));
  const layer = (o: DatabaseObject) =>
    String(o.fields.layer ?? o.groups.find((g) => g.code === 8)?.value ?? '0');
  const targets = all.filter(
    (o) =>
      !o.fields.hancadClipboardBlock &&
      !o.fields.hancadSelectionEntityId &&
      (wanted.has(ids.get(o.handle) ?? '') ||
        ((change.kind === 'merge' || change.kind === 'delete') &&
          names.has(layer(o).toUpperCase()) &&
          byHandle.get(o.owner ?? '')?.type === 'BLOCK_RECORD')),
  );
  if (change.kind === 'setbylayer' && change.includeBlocks) {
    const included = new Set(targets.map((o) => o.handle));
    for (let i = 0; i < targets.length; i++) {
      const item = targets[i]!;
      if (item.type !== 'INSERT') continue;
      const name = String(
        item.fields.blockName ??
          item.fields.name ??
          item.groups.find((g) => g.code === 2)?.value ??
          '',
      );
      const record =
        typeof item.fields.blockRecord === 'string'
          ? byHandle.get(item.fields.blockRecord)
          : all.find(
              (o) => o.type === 'BLOCK_RECORD' && o.name?.toUpperCase() === name.toUpperCase(),
            );
      for (const child of all)
        if (
          child.owner === record?.handle &&
          !included.has(child.handle) &&
          !['BLOCK', 'ENDBLK'].includes(child.type)
        ) {
          included.add(child.handle);
          targets.push(child);
        }
    }
  }
  const overrides = new Map<string, DatabaseObject>();
  const copies =
    change.kind === 'copy'
      ? targets.map((o) => {
          const { object, ownedObjects } = translateNativeCopy(
            o,
            change.delta ?? { x: 0, y: 0 },
            all,
            patchNativeProperties,
          );
          for (const child of ownedObjects) overrides.set(child.handle, child);
          patchNativeProperties(object, { layer: change.target ?? '0' });
          return { sourceHandle: o.handle, object, eraseSource: false };
        })
      : [];
  sysvars.atomic(label, () => {
    database.transaction(label, (tx) => {
      for (const object of targets) {
        if (change.kind === 'copy') continue;
        if (change.kind === 'delete') {
          tx.erase(object.handle);
          continue;
        }
        const fields: JsonObject = {};
        if (change.kind === 'assign' || change.kind === 'merge')
          fields.layer = change.target ?? '0';
        else {
          const mode = change.mode ?? 255,
            f = object.fields,
            byblock = change.byblock !== false;
          if (mode & 1 && (byblock || f.color !== 0)) {
            fields.color = 256;
            fields.trueColor = null;
          }
          if (mode & 2 && (byblock || String(f.linetype).toUpperCase() !== 'BYBLOCK'))
            fields.linetype = 'BYLAYER';
          if (mode & 4 && (byblock || f.lineweight !== -2)) fields.lineweight = -1;
          if (mode & 8) fields.material = null;
          if (mode & 16) fields.plotStyle = 'ByLayer';
          if (mode & 128 && (byblock || f.transparency !== 0x01000000)) fields.transparency = 0;
        }
        tx.modify(object.handle, (o) => patchNativeProperties(o, fields));
      }
      if (change.kind === 'merge' || change.kind === 'delete')
        for (const record of all)
          if (
            record.type === 'LAYER' &&
            record.name !== '0' &&
            names.has(record.name?.toUpperCase() ?? '')
          )
            tx.erase(record.handle);
    });
    if (copies.length) commitNativeCopies(database, label, copies, overrides);
    commit(label, state, variables);
  });
}
