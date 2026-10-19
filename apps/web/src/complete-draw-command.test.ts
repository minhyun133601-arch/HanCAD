import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadClipboardBlock, LegacyCadState } from '@hancad/legacy-bridge';
import { draftLine } from '@hancad/draft';
import type { DrawResult } from '@hancad/draft';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { completeDrawCommand } from './complete-draw-command';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const sysvars = new SystemVariables(),
    database = sysvars.database,
    source = createEmptyCadState();
  source.entities = ['A', 'B', 'C'].map((id, i) =>
    draftLine(source.settings, { x: i * 10, y: 0 }, { x: i * 10 + 5, y: 0 }, id),
  );
  source.clipboardBlocks = [
    { name: 'BLOCK', basePoint: { x: 0, y: 0 }, rotation: 0, entityIds: ['A'] },
  ];
  database.transaction('initial', (tx) => tx.setVariable('_STATE', JSON.stringify(source)));
  database.clearHistory();
  const commitState = vi.fn((label: string, state: LegacyCadState) =>
    database.transaction(label, (tx) => tx.setVariable('_STATE', JSON.stringify(state))),
  );
  const options = {
    tool: 'MOVE' as const,
    sysvars,
    getState: () => JSON.parse(String(database.getVariable('_STATE'))) as LegacyCadState,
    commitState,
    print: vi.fn(),
    korean: true,
    rememberSelection: vi.fn(),
    committedMessage: (n: number) => String(n),
  };
  const result: DrawResult = {
    entities: [{ ...source.entities[0]!, color: '#ff0000' }],
    eraseIds: ['A'],
  };
  return { sysvars, database, source, options, result };
}
const changes = () =>
  new Map<string, number | string | readonly number[]>([
    ['FILLETRAD', 5],
    ['COPYMODE', 1],
    ['MODEMACRO', 'temporary'],
  ]);
describe('complete drawing command publication', () => {
  it('preserves source ordering, valid block updates and new memberships in one undo step', () => {
    const { database, sysvars, source, options, result } = fixture(),
      copy = { ...source.entities[0]!, id: 'D' };
    completeDrawCommand(
      options,
      {
        ...result,
        entities: [...result.entities, copy],
        updatedClipboardBlocks: [
          { name: 'block', basePoint: { x: 2, y: 3 }, rotation: 1, entityIds: ['A'] },
        ],
        clipboardBlocks: [{ name: 'COPY', basePoint: { x: 0, y: 0 }, entityIds: ['D'] }],
      },
      changes(),
    );
    const after = options.getState();
    expect(after.entities.map((e) => e.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(after.clipboardBlocks).toEqual([
      { name: 'block', basePoint: { x: 2, y: 3 }, rotation: 1, entityIds: ['A'] },
      { name: 'COPY', basePoint: { x: 0, y: 0 }, entityIds: ['D'] },
    ]);
    expect(database.undoCount).toBe(1);
    expect(sysvars.get('FILLETRAD')).toBe(5);
    database.undo();
    expect(options.getState()).toEqual(source);
    expect(sysvars.get('FILLETRAD')).toBe(0);
    expect(sysvars.get('COPYMODE')).toBe(1);
  });
  it.each([false, true])(
    'rolls back all scopes and existing redo when commitState throws after DB commit=%s',
    (afterCommit) => {
      const { database, sysvars, options, result } = fixture();
      sysvars.set('USERI1', 11);
      sysvars.set('USERI1', 22);
      database.undo();
      const before = database.serialize(),
        profile = structuredClone([...sysvars.profile.values]),
        undo = database.undoCount,
        redo = database.redoCount;
      const real = options.commitState;
      options.commitState = vi.fn((label, state) => {
        if (afterCommit) real(label, state);
        throw Error('injected commit failure');
      });
      let visible = options.getState();
      database.events.subscribe((event) => {
        if (
          event.type === 'sysvar-changed' &&
          event.name === '_STATE' &&
          typeof event.value === 'string'
        )
          visible = JSON.parse(event.value) as LegacyCadState;
      });
      expect(() => completeDrawCommand(options, result, changes())).toThrow(
        'injected commit failure',
      );
      expect(database.serialize()).toBe(before);
      expect(visible).toEqual(options.getState());
      expect([...sysvars.profile.values]).toEqual(profile);
      expect(sysvars.get('MODEMACRO')).toBe('');
      expect(database.undoCount).toBe(undo);
      expect(database.redoCount).toBe(redo);
      expect(database.redoLastUndo()).toBe(1);
      expect(sysvars.get('USERI1')).toBe(22);
      expect(options.rememberSelection).not.toHaveBeenCalled();
    },
  );
  it('preserves the active user group and earlier edits when a command fails', () => {
    const { database, sysvars, options, result } = fixture();
    database.beginUndoGroup();
    sysvars.set('USERI1', 7);
    database.markUndo();
    const before = database.serialize(),
      marks = database.undoMarkCount;
    options.commitState = vi.fn(() => {
      throw Error('failed');
    });
    expect(() => completeDrawCommand(options, result, changes())).toThrow('failed');
    expect(database.serialize()).toBe(before);
    expect(database.undoGroupActive).toBe(true);
    expect(database.undoMarkCount).toBe(marks);
    sysvars.set('USERI1', 8);
    database.endUndoGroup();
    expect(database.undo()).toBe(1);
    expect(sysvars.get('USERI1')).toBe(0);
  });
  it('rolls back earlier variables when a later symbol reference is invalid', () => {
    const { database, sysvars, options, result } = fixture(),
      before = database.serialize();
    expect(() =>
      completeDrawCommand(
        options,
        result,
        new Map<string, number | string>([
          ['FILLETRAD', 8],
          ['CLAYER', 'missing-layer'],
        ]),
      ),
    ).toThrow('도면에 없습니다');
    expect(database.serialize()).toBe(before);
    expect(sysvars.get('FILLETRAD')).toBe(0);
    expect(options.commitState).not.toHaveBeenCalled();
  });
  it.each([
    [
      'unknown update',
      {
        updatedClipboardBlocks: [{ name: 'missing', basePoint: { x: 0, y: 0 }, entityIds: ['A'] }],
      },
    ],
    [
      'duplicate update',
      {
        updatedClipboardBlocks: [
          { name: 'BLOCK', basePoint: { x: 0, y: 0 }, entityIds: ['A'] },
          { name: 'block', basePoint: { x: 0, y: 0 }, entityIds: ['A'] },
        ],
      },
    ],
    [
      'new duplicate',
      { clipboardBlocks: [{ name: 'block', basePoint: { x: 0, y: 0 }, entityIds: ['A'] }] },
    ],
    [
      'unknown member',
      {
        updatedClipboardBlocks: [
          { name: 'BLOCK', basePoint: { x: 0, y: 0 }, entityIds: ['missing'] },
        ],
      },
    ],
    [
      'duplicate member',
      { clipboardBlocks: [{ name: 'NEW', basePoint: { x: 0, y: 0 }, entityIds: ['A', 'A'] }] },
    ],
    [
      'empty member',
      { clipboardBlocks: [{ name: 'NEW', basePoint: { x: 0, y: 0 }, entityIds: [] }] },
    ],
    [
      'removed update',
      {
        updatedClipboardBlocks: [{ name: 'BLOCK', basePoint: { x: 0, y: 0 }, entityIds: ['A'] }],
        removedBlockNames: ['BLOCK'],
      },
    ],
  ] satisfies [string, Partial<DrawResult>][])(
    'rejects %s before changing variables, state or history',
    (_name, metadata) => {
      const { database, sysvars, options, result } = fixture(),
        before = database.serialize();
      expect(() => completeDrawCommand(options, { ...result, ...metadata }, changes())).toThrow();
      expect(database.serialize()).toBe(before);
      expect(sysvars.get('FILLETRAD')).toBe(0);
      expect(sysvars.get('COPYMODE')).toBe(0);
      expect(options.commitState).not.toHaveBeenCalled();
    },
  );
  it('validates memberships against the graph after erasure and additions', () => {
    const { database, options } = fixture(),
      block: CadClipboardBlock = { name: 'BLOCK', basePoint: { x: 0, y: 0 }, entityIds: ['A'] };
    expect(() =>
      completeDrawCommand(
        options,
        { entities: [], eraseIds: ['A'], updatedClipboardBlocks: [block] },
        new Map(),
      ),
    ).toThrow('membership');
    expect(database.undoCount).toBe(0);
    completeDrawCommand(
      options,
      { entities: [], eraseIds: ['A'], removedBlockNames: ['BLOCK'] },
      new Map(),
    );
    expect(options.getState().clipboardBlocks).toEqual([]);
    expect(options.getState().entities.map((e) => e.id)).toEqual(['B', 'C']);
  });
});
