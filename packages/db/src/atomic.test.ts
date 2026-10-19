import { describe, expect, it } from 'vitest';
import { DrawingDatabase } from './index';

const set = (d: DrawingDatabase, n: number) =>
  d.transaction('SETVAR', (tx) => tx.setVariable('LUPREC', n));
describe('composed database command rollback', () => {
  it('restores changed objects, variables and handles while retaining prior redo and single REDO', () => {
    const d = new DrawingDatabase();
    set(d, 2);
    set(d, 3);
    d.undo();
    const before = d.serialize(),
      undo = d.undoCount,
      redo = d.redoCount;
    let visible = d.getVariable('LUPREC');
    d.events.subscribe((e) => {
      if (e.type === 'sysvar-changed' && e.name === 'LUPREC') visible = e.value;
    });
    expect(() =>
      d.atomic('failed command', () => {
        set(d, 1);
        d.transaction('LINE', (tx) =>
          tx.add({ type: 'LINE', fields: { start: [0, 0, 0], end: [10, 0, 0] } }),
        );
        throw Error('failed');
      }),
    ).toThrow('failed');
    expect(d.serialize()).toBe(before);
    expect(visible).toBe(2);
    expect(d.undoCount).toBe(undo);
    expect(d.redoCount).toBe(redo);
    expect(d.redoLastUndo()).toBe(1);
    expect(d.getVariable('LUPREC')).toBe(3);
  });
  it('retains an existing user group and mark after failure, then continues that same group', () => {
    const d = new DrawingDatabase(),
      initial = d.serialize();
    d.beginUndoGroup();
    set(d, 1);
    d.markUndo();
    const count = d.undoCount,
      marks = d.undoMarkCount;
    expect(() =>
      d.atomic('failed', () => {
        set(d, 2);
        throw Error('failed');
      }),
    ).toThrow('failed');
    expect(d.undoGroupActive).toBe(true);
    expect(d.undoCount).toBe(count);
    expect(d.undoMarkCount).toBe(marks);
    expect(d.getVariable('LUPREC')).toBe(1);
    set(d, 3);
    d.endUndoGroup();
    expect(d.undo()).toBe(1);
    expect(d.serialize()).toBe(initial);
  });
  it('records a successful composed command once and does not close the surrounding user group', () => {
    const d = new DrawingDatabase();
    d.beginUndoGroup();
    d.atomic('command', () => {
      set(d, 1);
      set(d, 2);
    });
    expect(d.undoGroupActive).toBe(true);
    expect(d.undoCount).toBe(1);
    d.endUndoGroup();
    expect(d.undo()).toBe(1);
    expect(d.getVariable('LUPREC')).toBe(4);
  });
  it.each(['none', 'one'] as const)(
    'composes commands under UNDO Control %s without requiring full undo',
    (mode) => {
      const d = new DrawingDatabase();
      d.configureUndo(mode);
      d.atomic('command', () => {
        set(d, 1);
        set(d, 2);
      });
      expect(d.getVariable('LUPREC')).toBe(2);
      expect(d.undoCount).toBe(mode === 'none' ? 0 : 1);
      if (mode === 'one') {
        d.undo();
        expect(d.getVariable('LUPREC')).toBe(4);
      }
    },
  );
  it('keeps redo for an empty operation and rolls back rejected asynchronous/history mutations', () => {
    const d = new DrawingDatabase();
    set(d, 1);
    d.undo();
    expect(d.atomic('empty', () => 42)).toBe(42);
    expect(d.redoCount).toBe(1);
    expect(() =>
      d.atomic('async', () => {
        set(d, 2);
        return Promise.resolve();
      }),
    ).toThrow('synchronous');
    expect(d.redoCount).toBe(1);
    expect(d.getVariable('LUPREC')).toBe(4);
    expect(() =>
      d.atomic('bad history', () => {
        set(d, 2);
        d.clearHistory();
      }),
    ).toThrow('history');
    expect(d.redoCount).toBe(1);
    expect(d.getVariable('LUPREC')).toBe(4);
  });
});
