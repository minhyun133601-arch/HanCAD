import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DrawingDatabase, entityFields } from '@hancad/db';
import { SystemVariables } from '@hancad/sysvars';
import { createEmptyCadState, normalizeCadState, visibleCadEntities } from '@hancad/legacy-bridge';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { draftLine, editableSelection, legacySnapSources } from '@hancad/draft';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import {
  nativePropertyState,
  commitNativePropertyState,
  nativePropertyIds,
} from './native-property-state';
import { commitNativeLayerChange } from './native-layer-change';
import { changeEntityProperty } from './entity-properties';
import { drawingSnapSources } from './native-snap-sources';
import { nativeDisplayEntities } from './native-display-entities';
import { endTemporaryObjectIsolation } from './temporary-object-isolation';
import { drawingExportState } from './drawing-export-state';
import { syncLayerRecords } from './layers/layer-records';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it('rejects making a frozen layer current through CLAYER without changing the journal, while allowing locked current layers', () => {
  const vars = new SystemVariables();
  vars.database.transaction('fixture', (tx) => {
    tx.add({
      type: 'LAYER',
      owner: vars.database.tables.LAYER,
      name: 'FROZEN',
      fields: { flags: 1 },
    });
    tx.add({
      type: 'LAYER',
      owner: vars.database.tables.LAYER,
      name: 'LOCKED',
      fields: { flags: 4 },
    });
  });
  vars.database.clearHistory();
  const before = vars.database.serialize();
  expect(() => vars.set('CLAYER', 'FROZEN')).toThrow('동결');
  expect(vars.database.serialize()).toBe(before);
  expect(vars.database.undoCount).toBe(0);
  vars.set('CLAYER', 'LOCKED');
  expect(vars.get('CLAYER')).toBe('LOCKED');
  vars.dispose();
});

it('preserves frozen layer and isolation metadata through normalization, selection, snaps and plotting', () => {
  const state = createEmptyCadState();
  state.layers.push({
    name: 'FROZEN',
    color: '#ff0000',
    visible: true,
    locked: false,
    frozen: true,
    plot: true,
  });
  state.layers.push({
    name: 'NOPLOT',
    color: '#00ff00',
    visible: true,
    locked: false,
    plot: false,
  });
  state.entities = [
    draftLine(state.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'hidden'),
    { ...draftLine(state.settings, { x: 0, y: 10 }, { x: 10, y: 10 }, 'frozen'), layer: 'FROZEN' },
    { ...draftLine(state.settings, { x: 0, y: 20 }, { x: 10, y: 20 }, 'plot'), layer: 'NOPLOT' },
  ];
  state.objectIsolation = { hiddenIds: ['hidden'], persistent: true };
  const restored = normalizeCadState(state);
  expect(restored.layers[1]).toMatchObject({ frozen: true, plot: true });
  expect(restored.objectIsolation).toEqual(state.objectIsolation);
  expect(visibleCadEntities(restored).map((e) => e.id)).toEqual(['plot']);
  expect(
    editableSelection(
      restored,
      restored.entities.map((e) => e.id),
    ).map((e) => e.id),
  ).toEqual(['plot']);
  expect(legacySnapSources(restored).map((s) => s.id)).toEqual(['plot']);
  expect(visibleCadEntities(drawingExportState(restored, new DrawingDatabase()))).toEqual([]);
});

it('edits mixed native and legacy properties in one undo group without persisting inquiry adapters', () => {
  const vars = new SystemVariables(),
    db = vars.database,
    state = createEmptyCadState();
  state.entities.push(draftLine(state.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'legacy'));
  let handle = '';
  db.transaction('fixture', (tx) => {
    handle = tx.add({
      type: 'LINE',
      owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields({ start: [20, 0, 0], end: [30, 0, 0], color: 1 }),
      xdata: { APP: [{ code: 1000, value: 'keep' }] },
    }).handle;
    tx.setVariable('view', JSON.stringify(state));
  });
  db.clearHistory();
  const original = db.serialize(),
    proxy = nativePropertyState(db, state),
    id = nativePropertyIds(db, state).get(handle)!;
  const next = changeEntityProperty(proxy, ['legacy', id], 'color', '3');
  commitNativePropertyState(vars, 'PROPERTIES', state, next, (label, view) =>
    db.transaction(label, (tx) => tx.setVariable('view', JSON.stringify(view))),
  );
  expect(db.undoCount).toBe(1);
  expect(db.get(handle)?.fields.color).toBe(3);
  expect(db.get(handle)?.xdata.APP).toEqual([{ code: 1000, value: 'keep' }]);
  const committed = JSON.parse(String(db.getVariable('view'))) as LegacyCadState;
  expect(committed.entities).toHaveLength(1);
  expect(committed.entities[0]?.aci).toBe(3);
  expect(committed.layers).toEqual(state.layers);
  const edited = db.serialize();
  expect(db.undo()).toBe(1);
  expect(db.serialize()).toBe(original);
  expect(db.redo()).toBe(1);
  expect(db.serialize()).toBe(edited);
  vars.dispose();
});

it('isolates native geometry consistently across render, pick identity and osnap source preparation', () => {
  const db = new DrawingDatabase(),
    state = createEmptyCadState();
  let handle = '';
  db.transaction('fixture', (tx) => {
    handle = tx.add({
      type: 'LINE',
      owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields({ start: [0, 0, 0], end: [10, 0, 0] }),
    }).handle;
  });
  const id = nativePropertyIds(db, state).get(handle)!;
  const hidden = { ...state, objectIsolation: { hiddenIds: [id], persistent: true } };
  expect(nativeDisplayEntities(db, hidden)[0]?.sourceId).toBe(id);
  expect(drawingSnapSources(db, state).some((s) => s.id === handle)).toBe(true);
  expect(drawingSnapSources(db, hidden).some((s) => s.id === handle)).toBe(false);
  const reopened = endTemporaryObjectIsolation({ state: hidden, fileName: '', report: null });
  expect(reopened.state.objectIsolation).toEqual(hidden.objectIsolation);
  expect(
    endTemporaryObjectIsolation({
      ...reopened,
      state: { ...hidden, objectIsolation: { hiddenIds: [id], persistent: false } },
    }).state.objectIsolation,
  ).toBeUndefined();
});

it('merges native layer members and copies owned graph data with exact atomic undo', () => {
  const vars = new SystemVariables(),
    db = vars.database,
    state = createEmptyCadState();
  state.layers.push({ name: 'SOURCE', color: '#ff0000', visible: true, locked: false });
  state.layers.push({ name: 'TARGET', color: '#00ff00', visible: true, locked: false });
  let handle = '';
  db.transaction('fixture', (tx) => {
    syncLayerRecords(db, tx, state);
    handle = tx.add({
      type: 'LINE',
      owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields({ layer: 'SOURCE', start: [20, 0, 0], end: [30, 0, 0] }),
      xdata: { APP: [{ code: 1000, value: 'opaque-data' }] },
    }).handle;
    tx.setVariable('view', JSON.stringify(state));
  });
  db.clearHistory();
  const original = db.serialize(),
    id = nativePropertyIds(db, state).get(handle)!;
  const commit = (label: string, next: LegacyCadState) =>
    db.transaction(label, (tx) => {
      syncLayerRecords(db, tx, next);
      tx.setVariable('view', JSON.stringify(next));
    });
  commitNativeLayerChange(
    vars,
    'COPYTOLAYER',
    state,
    state,
    {},
    { kind: 'copy', ids: [id], target: 'TARGET', delta: { x: 10, y: -5 } },
    commit,
  );
  const copy = db.all().find((o) => o.type === 'LINE' && o.handle !== handle)!;
  expect(copy.fields).toMatchObject({ layer: 'TARGET', start: [30, 5, 0], end: [40, 5, 0] });
  expect(copy.xdata.APP).toEqual([{ code: 1000, value: 'opaque-data' }]);
  expect(db.undoCount).toBe(1);
  db.undo();
  expect(db.serialize()).toBe(original);
  const merged = { ...state, layers: state.layers.filter((l) => l.name !== 'SOURCE') };
  commitNativeLayerChange(
    vars,
    'LAYMRG',
    state,
    merged,
    {},
    { kind: 'merge', names: ['SOURCE'], target: 'TARGET' },
    commit,
  );
  expect(db.get(handle)?.fields.layer).toBe('TARGET');
  expect(db.find('LAYER', 'SOURCE')).toBeUndefined();
  db.undo();
  expect(db.serialize()).toBe(original);
  vars.dispose();
});
