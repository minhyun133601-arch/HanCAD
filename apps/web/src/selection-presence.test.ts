import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DrawingDatabase } from '@hancad/db';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { SelectionSession, updateCadSelection, nativeObjectSelectionId } from '@hancad/draft';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { pruneSelectionPresence } from './selection-presence';
import {
  nativeHatchIdentities,
  nativeHatchSelectionState,
  nativeHatchEditorIds,
} from './native-hatch-selection';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
it('retains native-only Previous through a view publication and P reacquires the original', () => {
  const database = new DrawingDatabase(),
    state = createEmptyCadState();
  let handle = '';
  database.transaction('fixture', (tx) => {
    handle = tx.add({
      type: 'HATCH',
      owner: database.find('BLOCK_RECORD', '*Model_Space')!.handle,
    }).handle;
  });
  const model = nativeHatchSelectionState(
    state,
    database.all().filter((o) => o.type === 'HATCH'),
  );
  const id = nativeObjectSelectionId(handle);
  let selected = [id];
  const session = new SelectionSession({
    getState: () => model,
    getIds: () => selected,
    select: (ids) => {
      selected = updateCadSelection(model, selected, ids, { pickadd: 2, pickstyle: 1 }).ids;
    },
    replace: (ids) => {
      selected = ids;
    },
    print: vi.fn(),
    changed: vi.fn(),
    finish: vi.fn(),
    korean: () => true,
  });
  session.remember();
  selected = [];
  session.previous = pruneSelectionPresence(
    [],
    nativeHatchIdentities(database),
    selected,
    session.previous,
  ).previous;
  expect(session.submit('P')).toBe(true);
  expect(selected).toEqual([id]);
});
it('prunes erased native IDs and invalidates Previous without changing legacy membership rules', () => {
  const database = new DrawingDatabase();
  let hatch = '',
    nested = '';
  database.transaction('fixture', (tx) => {
    const owner = database.find('BLOCK_RECORD', '*Model_Space')!.handle,
      block = tx.add({ type: 'BLOCK_RECORD', name: 'nested' });
    hatch = tx.add({ type: 'HATCH', owner }).handle;
    nested = tx.add({ type: 'HATCH', owner: block.handle }).handle;
  });
  const id = nativeObjectSelectionId(hatch),
    nestedId = nativeObjectSelectionId(nested);
  expect(nativeHatchIdentities(database)).toEqual([id]);
  const ids = ['legacy', id, nestedId];
  expect(
    pruneSelectionPresence(['legacy'], nativeHatchIdentities(database), ids, ['legacy', id]),
  ).toEqual({ selected: ['legacy', id], previous: ['legacy', id] });
  database.transaction('erase', (tx) => tx.erase(hatch));
  expect(
    pruneSelectionPresence(['legacy'], nativeHatchIdentities(database), ids, ['legacy', id]),
  ).toEqual({ selected: ['legacy'], previous: [] });
  expect(
    pruneSelectionPresence(['legacy'], [], ['legacy', 'missing'], ['legacy', 'missing']),
  ).toEqual({ selected: ['legacy'], previous: [] });
});
it.each(['raw', 'prefix'])(
  'keeps native identity stable through deletion and U of a colliding legacy %s ID',
  (collision) => {
    const database = new DrawingDatabase(),
      state = createEmptyCadState();
    let handle = '';
    database.transaction('fixture', (tx) => {
      handle = tx.add({
        type: 'HATCH',
        owner: database.find('BLOCK_RECORD', '*Model_Space')!.handle,
      }).handle;
    });
    const legacyId = collision === 'raw' ? handle : nativeObjectSelectionId(handle);
    state.entities = [
      {
        id: legacyId,
        type: 'line',
        a: { x: 100, y: 0 },
        b: { x: 110, y: 0 },
        layer: '0',
        color: '#fff',
        lineWidth: 1,
      },
    ];
    database.transaction('view', (tx) => tx.setVariable('_STATE', JSON.stringify(state)));
    database.clearHistory();
    const initial = nativeHatchEditorIds(database, state).get(handle)!;
    database.transaction('ERASE', (tx) =>
      tx.setVariable('_STATE', JSON.stringify({ ...state, entities: [] })),
    );
    const erased = JSON.parse(String(database.getVariable('_STATE'))) as typeof state,
      ids = nativeHatchIdentities(database, erased);
    expect(nativeHatchEditorIds(database, erased).get(handle)).toBe(initial);
    expect(pruneSelectionPresence([], ids, [legacyId], [legacyId])).toEqual({
      selected: [],
      previous: [],
    });
    database.undo();
    const restored = JSON.parse(String(database.getVariable('_STATE'))) as typeof state;
    expect(nativeHatchEditorIds(database, restored).get(handle)).toBe(initial);
    expect(
      nativeHatchSelectionState(
        restored,
        database.all().filter((o) => o.type === 'HATCH'),
        nativeHatchEditorIds(database, restored),
      ).entities.at(-1)?.id,
    ).toBe(initial);
  },
);
it('never allocates a former legacy ID to a newly added native HATCH', () => {
  const database = new DrawingDatabase(),
    state = createEmptyCadState(),
    raw = database.handseed,
    legacyId = nativeObjectSelectionId(raw);
  state.entities = [
    {
      id: legacyId,
      type: 'line',
      a: { x: 0, y: 0 },
      b: { x: 1, y: 0 },
      layer: '0',
      color: '#fff',
      lineWidth: 1,
    },
  ];
  nativeHatchEditorIds(database, state);
  const erased = { ...state, entities: [] };
  nativeHatchEditorIds(database, erased);
  database.transaction('native import', (tx) =>
    tx.add({ type: 'HATCH', owner: database.find('BLOCK_RECORD', '*Model_Space')!.handle }),
  );
  const ids = nativeHatchIdentities(database, erased);
  expect(ids).toHaveLength(1);
  expect(ids[0]).not.toBe(legacyId);
  expect(pruneSelectionPresence([], ids, [], [legacyId]).previous).toEqual([]);
});
