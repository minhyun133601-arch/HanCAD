import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DrawingDatabase, entityFields } from '@hancad/db';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { draftLine } from '@hancad/draft';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { nativePropertyIds, nativePropertyState } from './native-property-state';
import { commitNativeLayerChange } from './native-layer-change';
import { nativeDisplayEntities } from './native-display-entities';
import { entityProperties } from './entity-properties';
import { syncLayerRecords } from './layers/layer-records';
import { syncSelectionGroupRecords } from './selection-group-records';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const vars = new SystemVariables(),
    db = vars.database,
    state = createEmptyCadState();
  state.layers.push({ name: 'SOURCE', color: '#ff0000', visible: true, locked: false });
  state.layers.push({ name: 'TARGET', color: '#00ff00', visible: true, locked: false });
  const commit = (label: string, view: LegacyCadState) =>
    db.transaction(label, (tx) => {
      syncLayerRecords(db, tx, view);
      tx.setVariable('view', JSON.stringify(view));
    });
  return { vars, db, state, commit };
}
it('copies mixed source identities and owned dictionaries with remapped graph references and exact history', () => {
  const { vars, db, state, commit } = setup();
  const model = db.find('BLOCK_RECORD', '*Model_Space')!.handle;
  const handles = db.transaction('fixture', (tx) => {
    syncLayerRecords(db, tx, state);
    const entity = tx.add({
      type: 'LINE',
      owner: model,
      fields: entityFields({ layer: 'SOURCE', start: [0, 0, 0], end: [10, 0, 0] }),
    });
    const dictionary = tx.add({
      type: 'DICTIONARY',
      owner: entity.handle,
      fields: { entries: [] },
    });
    const record = tx.add({
      type: 'XRECORD',
      owner: dictionary.handle,
      fields: { targetHandle: entity.handle },
      groups: [{ code: 330, value: entity.handle }],
    });
    tx.modify(dictionary.handle, (o) => {
      o.fields.entries = [{ name: 'CUSTOM', handle: record.handle, hardOwner: true }];
      o.groups = [{ code: 350, value: record.handle }];
    });
    tx.modify(entity.handle, (o) => {
      o.extensionDictionary = dictionary.handle;
      o.reactors = [record.handle];
      o.xdata.APP = [
        { code: 1005, value: record.handle },
        { code: 1000, value: 'retained' },
      ];
    });
    return { entity: entity.handle, dictionary: dictionary.handle, record: record.handle };
  });
  state.entities = [
    draftLine(state.settings, { x: 0, y: 20 }, { x: 10, y: 20 }, `native:ENTITY:${handles.entity}`),
  ];
  const id = nativePropertyIds(db, state).get(handles.entity)!;
  expect(id).not.toBe(state.entities[0]!.id);
  commit('baseline', state);
  db.clearHistory();
  const before = db.serialize();
  const next = {
    ...state,
    entities: [...state.entities, { ...state.entities[0]!, id: 'legacy-copy', layer: 'TARGET' }],
  };
  commitNativeLayerChange(
    vars,
    'COPYTOLAYER',
    state,
    next,
    {},
    { kind: 'copy', ids: [id, state.entities[0]!.id], target: 'TARGET', delta: { x: 5, y: -3 } },
    commit,
  );
  const copy = db.all().find((o) => o.type === 'LINE' && o.handle !== handles.entity)!;
  const dictionary = db.get(copy.extensionDictionary!)!;
  const entry = (dictionary.fields.entries as { handle: string }[])[0]!;
  const record = db.get(entry.handle)!;
  expect(copy.fields).toMatchObject({ layer: 'TARGET', start: [5, 3, 0], end: [15, 3, 0] });
  expect(dictionary.handle).not.toBe(handles.dictionary);
  expect(dictionary.owner).toBe(copy.handle);
  expect(record.handle).not.toBe(handles.record);
  expect(record.owner).toBe(dictionary.handle);
  expect(record.fields.targetHandle).toBe(copy.handle);
  expect(record.groups).toEqual([{ code: 330, value: copy.handle }]);
  expect(copy.reactors).toEqual([record.handle]);
  expect(copy.xdata.APP).toEqual([
    { code: 1005, value: record.handle },
    { code: 1000, value: 'retained' },
  ]);
  expect(JSON.parse(String(db.getVariable('view'))).entities).toHaveLength(2);
  const copyId = nativePropertyIds(db, next).get(copy.handle),
    after = db.serialize();
  expect(db.undoCount).toBe(1);
  db.undo();
  expect(db.serialize()).toBe(before);
  db.redo();
  expect(db.serialize()).toBe(after);
  expect(nativePropertyIds(db, next).get(copy.handle)).toBe(copyId);
  vars.dispose();
});

it('reports native true color and opaque INSERT common raw DXF properties consistently with their renderer', () => {
  const { db, state } = setup();
  db.transaction('fixture', (tx) => {
    syncLayerRecords(db, tx, state);
    tx.add({
      type: 'LINE',
      owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields({ start: [0, 0], end: [10, 0], trueColor: 0x123456 }),
    });
    tx.add({
      type: 'INSERT',
      owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
      groups: [
        { code: 8, value: 'SOURCE' },
        { code: 62, value: 3 },
        { code: 6, value: 'HIDDEN' },
        { code: 370, value: 70 },
        { code: 440, value: 0x02000099 },
      ],
    });
  });
  const native = nativePropertyState(db, state).entities;
  expect(entityProperties([native[0]!]).find((p) => p.key === 'color')?.value).toBe('#123456');
  expect(native[1]).toMatchObject({
    layer: 'SOURCE',
    aci: 3,
    linetype: 'HIDDEN',
    lineweight: 70,
    transparency: 40,
  });
});

it.each(['handle', 'case'])('SETBYLAYER includes nested definitions referenced by %s', (mode) => {
  const { db, vars, state, commit } = setup();
  const handles = db.transaction('fixture', (tx) => {
    const record = tx.add({
      type: 'BLOCK_RECORD',
      owner: db.tables.BLOCK_RECORD,
      name: 'MixedCase',
    });
    const child = tx.add({
      type: 'LINE',
      owner: record.handle,
      fields: entityFields({ start: [0, 0], end: [10, 0], color: 1 }),
    });
    const insert = tx.add({
      type: 'INSERT',
      owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields(
        mode === 'handle' ? { blockRecord: record.handle } : { name: 'mixedcase' },
      ),
    });
    return { child: child.handle, insert: insert.handle };
  });
  const id = nativePropertyIds(db, state).get(handles.insert)!;
  commitNativeLayerChange(
    vars,
    'SETBYLAYER',
    state,
    state,
    {},
    { kind: 'setbylayer', ids: [id], mode: 1, includeBlocks: true },
    commit,
  );
  expect(db.get(handles.child)?.fields.color).toBe(256);
  vars.dispose();
});

it('native block defaults resolve through supplied profile weight and retain locked ancestors on named child layers', () => {
  const db = new DrawingDatabase(),
    state = createEmptyCadState();
  db.transaction('fixture', (tx) => {
    tx.add({
      type: 'LAYER',
      owner: db.tables.LAYER,
      name: 'LOCKED',
      fields: { color: 1, flags: 4, lineweight: -3 },
    });
    tx.add({
      type: 'LAYER',
      owner: db.tables.LAYER,
      name: 'DETAIL',
      fields: { color: 3, lineweight: -3 },
    });
    const block = tx.add({ type: 'BLOCK_RECORD', owner: db.tables.BLOCK_RECORD, name: 'nested' });
    tx.add({
      type: 'LINE',
      owner: block.handle,
      fields: entityFields({ layer: 'DETAIL', start: [0, 0], end: [10, 0] }),
    });
    tx.add({
      type: 'INSERT',
      owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields({ name: 'nested', layer: 'LOCKED' }),
    });
  });
  expect(nativeDisplayEntities(db, state, 70)[0]).toMatchObject({
    layer: 'DETAIL',
    lineweight: 70,
    locked: true,
  });
});

it('COPYTOLAYER applies a WCS displacement to circles whose DXF centers use a reversed OCS', () => {
  const { db, vars, state, commit } = setup();
  const handle = db.transaction(
    'fixture',
    (tx) =>
      tx.add({
        type: 'CIRCLE',
        owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
        fields: entityFields({
          layer: 'SOURCE',
          center: [10, 0, 0],
          radius: 2,
          extrusion: [0, 0, -1],
        }),
      }).handle,
  );
  const id = nativePropertyIds(db, state).get(handle)!;
  commitNativeLayerChange(
    vars,
    'COPYTOLAYER',
    state,
    state,
    {},
    { kind: 'copy', ids: [id], target: 'TARGET', delta: { x: 5, y: -3 } },
    commit,
  );
  const copied = nativeDisplayEntities(db, state).find((entity) => entity.layer === 'TARGET');
  expect(copied?.geometry).toMatchObject({ type: 'arc', center: { x: -5, y: 3 } });
  vars.dispose();
});

it('retains GROUP mirror records without duplicating compatibility members in native properties or rendering', () => {
  const db = new DrawingDatabase(),
    state = createEmptyCadState();
  state.entities = [
    draftLine(state.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'legacy-group-line'),
  ];
  state.groups = [
    { name: 'Review', ids: ['legacy-group-line'], description: 'retained group', selectable: true },
  ];
  db.transaction('GROUP', (tx) => syncSelectionGroupRecords(db, tx, state));
  expect(
    db.all().some((object) => object.fields.hancadSelectionEntityId === 'legacy-group-line'),
  ).toBe(true);
  expect(nativePropertyState(db, state).entities.map((entity) => entity.id)).toEqual([
    'legacy-group-line',
  ]);
  expect(nativeDisplayEntities(db, state)).toEqual([]);
});
