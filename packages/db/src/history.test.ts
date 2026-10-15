import { describe, expect, it } from 'vitest';
import { DrawingDatabase, UndoStateError } from './index';

function set(database: DrawingDatabase, value: number): void {
  database.transaction('SETVAR LUPREC', (tx) => tx.setVariable('LUPREC', value));
}

describe('advanced command history', () => {
  it('REDO reverses an entire numeric UNDO command while MREDO can request individual actions', () => {
    const database = new DrawingDatabase();
    set(database, 1);
    set(database, 2);
    set(database, 3);
    database.undo(3);
    expect(database.getVariable('LUPREC')).toBe(4);
    expect(database.redoLastUndo()).toBe(3);
    expect(database.getVariable('LUPREC')).toBe(3);
    database.undo(3);
    expect(database.redo(1)).toBe(1);
    expect(database.getVariable('LUPREC')).toBe(1);
  });
  it('merges Begin/End into one exact reversible database including handles and variables', () => {
    const database = new DrawingDatabase(),
      initial = database.serialize();
    expect(database.undoControl).toBe(53);
    database.beginUndoGroup();
    expect(database.undoControl).toBe(61);
    const handle = database.transaction(
      'LINE',
      (tx) => tx.add({ type: 'LINE', fields: { start: [1, 2, 0], end: [3, 4, 0] } }).handle,
    );
    database.transaction('MOVE', (tx) =>
      tx.modify(handle, (object) => {
        object.fields.start = [7, 8, 0];
      }),
    );
    set(database, 2);
    database.endUndoGroup();
    const final = database.serialize();
    expect(database.undoCount).toBe(1);
    expect(database.undoControl).toBe(53);
    database.undo();
    expect(database.serialize()).toBe(initial);
    database.redo();
    expect(database.serialize()).toBe(final);
  });

  it('stops U at an open Begin and starts a new group when Begin is repeated', () => {
    const database = new DrawingDatabase();
    set(database, 1);
    database.beginUndoGroup();
    set(database, 2);
    set(database, 3);
    expect(database.undo(99)).toBe(2);
    expect(database.getVariable('LUPREC')).toBe(1);
    expect(database.undo()).toBe(0);
    database.redo(2);
    database.beginUndoGroup();
    set(database, 4);
    database.endUndoGroup();
    expect(database.undo()).toBe(1);
    expect(database.getVariable('LUPREC')).toBe(3);
    expect(database.undo()).toBe(1);
    expect(database.getVariable('LUPREC')).toBe(1);
  });

  it('stops numeric undo at marks, crosses a reached mark with next U, and backs one mark at a time', () => {
    const database = new DrawingDatabase();
    set(database, 1);
    database.markUndo();
    set(database, 2);
    database.markUndo();
    set(database, 3);
    set(database, 4);
    expect(database.undo(99)).toBe(2);
    expect(database.undoReachedMark).toBe(true);
    expect(database.getVariable('LUPREC')).toBe(2);
    expect(database.backUndo()).toBe(0);
    expect(database.backUndo()).toBe(1);
    expect(database.getVariable('LUPREC')).toBe(1);
    expect(database.backUndo()).toBeUndefined();
    expect(database.backUndo(true)).toBe(1);
    expect(database.getVariable('LUPREC')).toBe(4);
  });

  it('drops marks within even an empty group while preserving marks made before Begin', () => {
    const database = new DrawingDatabase();
    database.markUndo();
    database.beginUndoGroup();
    database.markUndo();
    database.endUndoGroup();
    expect(database.undoMarkCount).toBe(1);
    expect(database.undoCount).toBe(0);
  });

  it('Control None discards history while edits and OOPS remain usable, One retains one operation', () => {
    const database = new DrawingDatabase();
    set(database, 1);
    database.configureUndo('none');
    expect(database.undoControl).toBe(0);
    set(database, 2);
    expect(database.undoCount).toBe(0);
    expect(database.undo()).toBe(0);
    expect(() => database.beginUndoGroup()).toThrow(UndoStateError);
    database.configureUndo('one');
    expect(database.undoControl & 3).toBe(3);
    set(database, 3);
    set(database, 4);
    expect(database.undoCount).toBe(1);
    database.undo(99);
    expect(database.getVariable('LUPREC')).toBe(3);
    database.configureUndo('all');
    database.setUndoOption('auto', false);
    expect(database.undoControl & 4).toBe(0);
  });

  it('combines categorized navigation/layer operations and preserves mark boundaries', () => {
    const database = new DrawingDatabase();
    database.transaction('ZOOM', (tx) => tx.setVariable('VIEW', 1), 'navigation');
    database.transaction('PAN', (tx) => tx.setVariable('VIEW', 2), 'navigation');
    expect(database.undoCount).toBe(1);
    database.markUndo();
    database.transaction('ZOOM', (tx) => tx.setVariable('VIEW', 3), 'navigation');
    expect(database.undoCount).toBe(2);
    database.setUndoOption('combine', false);
    database.transaction('PAN', (tx) => tx.setVariable('VIEW', 4), 'navigation');
    expect(database.undoCount).toBe(3);
    database.transaction('Layer dialog', (tx) => tx.setVariable('CLAYER', 'A'), 'layer');
    database.transaction('Layer dialog', (tx) => tx.setVariable('CLAYER', 'B'), 'layer');
    expect(database.undoCount).toBe(4);
  });

  it('OOPS restores only the last erased objects after later edits, with its own undo group and events', () => {
    const database = new DrawingDatabase();
    const first = database.transaction('POINT', (tx) => tx.add({ type: 'POINT' }).handle);
    const second = database.transaction('POINT', (tx) => tx.add({ type: 'POINT' }).handle);
    database.transaction('ERASE', (tx) => tx.erase(first));
    database.transaction('ERASE', (tx) => tx.erase(second));
    set(database, 2);
    const events: string[] = [];
    database.events.subscribe((event) => events.push(event.type));
    expect(database.oops()).toBe(1);
    expect(database.get(first)).toBeUndefined();
    expect(database.get(second)).toBeDefined();
    expect(database.getVariable('LUPREC')).toBe(2);
    expect(events).toContain('object-unerased');
    database.undo();
    expect(database.get(second)).toBeUndefined();
    database.redo();
    expect(database.get(second)).toBeDefined();
  });
});
