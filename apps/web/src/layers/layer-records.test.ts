import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DrawingDatabase } from '@hancad/db';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../../../packages/legacy-bridge/src/test-runtime';
import { createLayers, renameLayer } from './layer-model';
import { layerStateWithNative, syncLayerRecords } from './layer-records';
beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
it('updates native transparency, color and flags while retaining opaque raw data and undo identity', () => {
  const database = new DrawingDatabase();
  let state = createLayers(createEmptyCadState(), 'WALL');
  database.transaction('INITIAL', (tx) => syncLayerRecords(database, tx, state));
  const handle = database.find('LAYER', 'WALL')!.handle;
  database.transaction('VENDOR', (tx) =>
    tx.modify(handle, (record) => {
      record.groups.push(
        { code: 102, value: '{VENDOR' },
        { code: 62, value: 88 },
        { code: 102, value: '}' },
        { code: 1001, value: 'USER' },
        { code: 1000, value: 'opaque' },
      );
      record.xdata.USER = [{ code: 1000, value: 'payload' }];
    }),
  );
  state = layerStateWithNative(database, state);
  const baseline = database.serialize();
  state = {
    ...state,
    layers: state.layers.map((layer) =>
      layer.name === 'WALL'
        ? {
            ...layer,
            aci: 2,
            trueColor: 0x123456,
            transparency: 50,
            visible: false,
            frozen: true,
            locked: true,
          }
        : layer,
    ),
  };
  database.transaction('LAYER', (tx) => syncLayerRecords(database, tx, state));
  expect(database.get(handle)?.fields).toMatchObject({
    color: -2,
    trueColor: 0x123456,
    transparency: 0x02000080,
    flags: 5,
  });
  expect(database.get(handle)?.groups).toContainEqual({ code: 62, value: 88 });
  expect(database.get(handle)?.xdata.USER).toEqual([{ code: 1000, value: 'payload' }]);
  database.undo();
  expect(database.serialize()).toBe(baseline);
  database.redo();
  expect(database.get(handle)?.fields.trueColor).toBe(0x123456);
  state = {
    ...state,
    layers: state.layers.map((layer) => {
      const row = { ...layer };
      delete row.trueColor;
      return row;
    }),
  };
  database.transaction('ACI', (tx) => syncLayerRecords(database, tx, state));
  expect(database.get(handle)?.fields.trueColor).toBeUndefined();
  expect(database.get(handle)?.groups.some((group) => group.code === 420)).toBe(false);
  const renamed = renameLayer(state, 'WALL', 'WALLS');
  database.transaction('RENAME', (tx) => syncLayerRecords(database, tx, renamed));
  expect(database.find('LAYER', 'WALLS')?.handle).toBe(handle);
});
it('merges native-only layers and preserves an explicit legacy hex color', () => {
  const database = new DrawingDatabase(),
    state = createEmptyCadState();
  database.transaction('NATIVE', (tx) =>
    tx.add({
      type: 'LAYER',
      name: 'NATIVE',
      owner: database.tables.LAYER,
      fields: { color: 3, flags: 6, transparency: 0x02000080, linetype: 'HIDDEN', lineweight: 25 },
    }),
  );
  const merged = layerStateWithNative(database, state);
  expect(merged.layers.find((layer) => layer.name === 'NATIVE')).toMatchObject({
    aci: 3,
    frozen: false,
    locked: true,
    newViewportFrozen: true,
    transparency: 50,
  });
  const hex = createLayers(state, 'HEX');
  hex.layers = hex.layers.map((layer) => {
    if (layer.name !== 'HEX') return layer;
    const row = { ...layer, color: '#12abef' };
    delete row.aci;
    return row;
  });
  database.transaction('HEX', (tx) => syncLayerRecords(database, tx, hex));
  expect(database.find('LAYER', 'HEX')?.fields.trueColor).toBe(0x12abef);
  expect(database.find('LAYER', 'NATIVE')).toBeDefined();
});
it('renames native entity layer references inside block definitions without changing raw vendor data', () => {
  const database = new DrawingDatabase();
  let state = createLayers(createEmptyCadState(), 'OLD');
  database.transaction('INITIAL', (tx) => syncLayerRecords(database, tx, state));
  const model = database.find('BLOCK_RECORD', '*Model_Space')!;
  let handle = '';
  database.transaction('LINE', (tx) => {
    handle = tx.add({
      type: 'LINE',
      owner: model.handle,
      fields: { layer: 'OLD', start: [0, 0, 0], end: [10, 0, 0] },
      groups: [
        { code: 100, value: 'AcDbEntity' },
        { code: 8, value: 'OLD' },
        { code: 100, value: 'AcDbLine' },
        { code: 10, value: 0 },
        { code: 20, value: 0 },
        { code: 30, value: 0 },
        { code: 11, value: 10 },
        { code: 21, value: 0 },
        { code: 31, value: 0 },
        { code: 1001, value: 'VENDOR' },
        { code: 1000, value: 'payload' },
      ],
    }).handle;
  });
  state = renameLayer(layerStateWithNative(database, state), 'OLD', 'NEW');
  database.transaction('RENAME', (tx) => syncLayerRecords(database, tx, state));
  expect(database.get(handle)?.fields.layer).toBe('NEW');
  expect(database.get(handle)?.groups).toContainEqual({ code: 8, value: 'NEW' });
  expect(database.get(handle)?.groups).toContainEqual({ code: 1000, value: 'payload' });
  database.undo();
  expect(database.get(handle)?.fields.layer).toBe('OLD');
});
