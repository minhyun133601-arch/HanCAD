import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DrawingDatabase, applyDxfFieldPatch } from '@hancad/db';
import { validateSnapshot } from '../../../packages/db/src/validation';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { draftLine } from '@hancad/draft';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { syncSelectionGroupRecords } from './selection-group-records';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
it('journals dictionary GROUP ownership, native member handles and reciprocal reactors together', () => {
  const state = createEmptyCadState(),
    database = new DrawingDatabase();
  state.entities = [draftLine(state.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'line')];
  state.groups = [
    { id: 'walls-group', name: 'WALLS', description: '외벽', selectable: true, ids: ['line'] },
  ];
  database.transaction('GROUP', (tx) => syncSelectionGroupRecords(database, tx, state));
  const group = database.find('GROUP', 'WALLS');
  expect(group?.fields).toMatchObject({ description: '외벽', selectable: 1 });
  const handle = (group?.fields.entities as string[])[0]!;
  const member = database.get(handle)!;
  expect(member.type).toBe('LINE');
  expect(member.reactors).toEqual([group?.handle]);
  expect(
    applyDxfFieldPatch(group!, { entities: [handle] }).groups.filter((tag) => tag.code === 340),
  ).toEqual([{ code: 340, value: handle }]);
  validateSnapshot(database.snapshot());
  const changed = structuredClone(state);
  changed.entities[0] = {
    ...changed.entities[0]!,
    type: 'line',
    a: { x: 5, y: 0 },
    b: { x: 15, y: 0 },
  };
  database.transaction('MOVE', (tx) => syncSelectionGroupRecords(database, tx, changed));
  expect(database.get(handle)?.fields.start).toEqual([5, 0, 0]);
  expect(database.find('GROUP', 'WALLS')?.fields.entities).toEqual([handle]);
  database.undo();
  expect(database.get(handle)?.fields.start).toEqual([0, 0, 0]);
  database.transaction('GROUPEDIT', (tx) =>
    syncSelectionGroupRecords(database, tx, {
      ...state,
      groups: [{ ...state.groups![0]!, name: 'EXTERIOR' }],
    }),
  );
  expect(database.find('GROUP', 'EXTERIOR')?.handle).toBe(group?.handle);
  expect(database.get(handle)?.reactors).toEqual([group?.handle]);
  database.undo();
  expect(database.find('GROUP', 'WALLS')?.handle).toBe(group?.handle);
  database.transaction('UNGROUP', (tx) =>
    syncSelectionGroupRecords(database, tx, { ...state, groups: [] }),
  );
  expect(database.find('GROUP', 'WALLS')).toBeUndefined();
  expect(database.get(handle)).toBeUndefined();
  database.undo();
  expect(database.get(handle)?.reactors).toEqual([group?.handle]);
  validateSnapshot(database.snapshot());
});
