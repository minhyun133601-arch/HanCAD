import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { entityFields } from '@hancad/db';
import type { DatabaseObject } from '@hancad/db';
import { SystemVariables } from '@hancad/sysvars';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import type { DrawResult } from '@hancad/draft';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { completeDrawCommand } from './complete-draw-command';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const sysvars = new SystemVariables(),
    database = sysvars.database,
    source = createEmptyCadState();
  let original!: DatabaseObject;
  database.transaction('fixture', (tx) => {
    original = tx.add({
      type: 'HATCH',
      owner: database.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields(),
    });
    tx.setVariable('_STATE', JSON.stringify(source));
  });
  database.clearHistory();
  const object = { ...structuredClone(original), groups: [{ code: 53, value: 105 }] },
    result: DrawResult = {
      entities: [],
      nativeCopies: [{ sourceHandle: original.handle, object, eraseSource: false }],
    },
    options = {
      tool: 'MIRROR' as const,
      sysvars,
      getState: () => source,
      commitState: vi.fn((label: string, state: LegacyCadState) =>
        database.transaction(label, (tx) => tx.setVariable('_STATE', JSON.stringify(state))),
      ),
      print: vi.fn(),
      korean: true,
      rememberSelection: vi.fn(),
      committedMessage: String,
    };
  return { sysvars, database, source, original, result, options };
}
it('publishes native-only copies before the view so cache observers receive the new graph', () => {
  const { database, original, source, result, options } = fixture(),
    observed: DatabaseObject[][] = [];
  options.commitState = vi.fn((label, state) => {
    observed.push(database.all().filter((o) => o.type === 'HATCH'));
    database.transaction(label, (tx) => tx.setVariable('_STATE', JSON.stringify(state)));
  });
  const before = database.serialize();
  completeDrawCommand(options, result, new Map());
  expect(options.commitState).toHaveBeenCalledWith('MIRROR', source);
  expect(options.rememberSelection).not.toHaveBeenCalled();
  expect(observed[0]).toHaveLength(2);
  expect(observed[0]?.[0]).toEqual(original);
  expect(database.undoCount).toBe(1);
  const after = database.serialize();
  database.undo();
  expect(database.serialize()).toBe(before);
  database.redo();
  expect(database.serialize()).toBe(after);
});
it.each([false, true])(
  'rolls back native copies and variables after commitState failure (user group=%s), preserving old redo',
  (group) => {
    const { sysvars, database, result, options } = fixture();
    database.transaction('old redo', (tx) => tx.setVariable('TEST_PREVIOUS', 42));
    database.undo();
    if (group) {
      database.beginUndoGroup();
      database.markUndo();
    }
    const before = database.serialize(),
      undo = database.undoCount,
      redo = database.redoCount,
      marks = database.undoMarkCount,
      profile = sysvars.get('COPYMODE');
    options.commitState = vi.fn((label, state) => {
      expect(database.all().filter((o) => o.type === 'HATCH')).toHaveLength(2);
      database.transaction(label, (tx) => tx.setVariable('_STATE', JSON.stringify(state)));
      throw Error('injected native publication failure');
    });
    expect(() =>
      completeDrawCommand(
        options,
        result,
        new Map([
          ['COPYMODE', 1],
          ['FILLETRAD', 7],
        ]),
      ),
    ).toThrow('injected native publication failure');
    expect(database.serialize()).toBe(before);
    expect(sysvars.get('COPYMODE')).toEqual(profile);
    expect(database.undoCount).toBe(undo);
    expect(database.redoCount).toBe(redo);
    expect(database.undoMarkCount).toBe(marks);
    expect(database.undoGroupActive).toBe(group);
    expect(database.redoLastUndo()).toBe(1);
    expect(database.getVariable('TEST_PREVIOUS')).toBe(42);
    if (group) database.endUndoGroup();
  },
);
it.each(['duplicate', 'unknown', 'locked', 'foreign owner'])(
  'rejects %s native identities before mutation',
  (failure) => {
    const { database, source, result, options } = fixture(),
      copy = result.nativeCopies![0]!;
    if (failure === 'duplicate') result.nativeCopies!.push(copy);
    if (failure === 'unknown') copy.sourceHandle = 'FFFF';
    if (failure === 'locked') source.layers[0]!.locked = true;
    if (failure === 'foreign owner') copy.object.owner = database.namedObjectDictionary;
    const before = database.serialize();
    expect(() => completeDrawCommand(options, result, new Map([['FILLETRAD', 7]]))).toThrow(
      'Invalid native HATCH',
    );
    expect(database.serialize()).toBe(before);
    expect(options.commitState).not.toHaveBeenCalled();
  },
);
