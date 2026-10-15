import { describe, expect, it } from 'vitest';
import { DrawingDatabase } from '@hancad/db';
import { DocumentManager } from '@hancad/sysvars';
import { recordNavigation, storedWorldView, viewVariableValues } from './view-history';
import { extents, hostValue, layoutFromName, layoutName } from './host-variables';

const view = (x: number, y: number, height: number) => ({ center: { x, y }, height });

describe('navigation undo and host variables', () => {
  it('records zoom/pan as combined navigation steps that U restores exactly', () => {
    const database = new DrawingDatabase();
    recordNavigation(database, 'zoom', view(0, 0, 100), view(10, -20, 50));
    recordNavigation(database, 'pan', view(10, -20, 50), view(30, -20, 50));
    expect(database.undoCount).toBe(1);
    expect(database.getVariable('VIEWCTR')).toEqual([30, 20, 0]);
    database.undo();
    expect(storedWorldView(database)).toEqual(view(0, 0, 100));
    database.redo();
    expect(storedWorldView(database)).toEqual(view(30, -20, 50));
  });

  it('keeps separate steps with Combine off, ignores no-op views and never merges commands', () => {
    const database = new DrawingDatabase();
    database.setUndoOption('combine', false);
    recordNavigation(database, 'zoom', view(0, 0, 100), view(0, 0, 50));
    recordNavigation(database, 'zoom', view(0, 0, 50), view(0, 0, 50));
    recordNavigation(database, 'zoom', view(0, 0, 50), view(0, 0, 25));
    expect(database.undoCount).toBe(2);
    database.setUndoOption('combine', true);
    database.transaction('SETVAR', (tx) => tx.setVariable('LUPREC', 2));
    recordNavigation(database, 'pan', view(5, 5, 25), view(9, 5, 25));
    expect(database.undoCount).toBe(4);
    database.undo();
    // The untracked resync made the pan's prior view the one actually displayed.
    expect(storedWorldView(database)).toEqual(view(5, 5, 25));
    expect(database.getVariable('LUPREC')).toBe(2);
  });

  it('converts view and extents to drawing coordinates and names layout tabs', () => {
    expect(viewVariableValues(view(3, -4, 10))).toEqual({ VIEWCTR: [3, 4, 0], VIEWSIZE: 10 });
    expect(extents({ entities: [] } as never)).toEqual([
      [1e20, 1e20, 1e20],
      [-1e20, -1e20, -1e20],
    ]);
    expect(layoutName('layoutTwo')).toBe('Layout2');
    expect(layoutFromName('layout1')).toBe('layoutOne');
    expect(layoutFromName('Missing')).toBeUndefined();
    const document = new DocumentManager({ hostValue }).create();
    expect(document.sysvars.get('ADCSTATE')).toBe(0);
    expect(document.sysvars.get('PERSPECTIVE')).toBe(0);
    expect(() => document.sysvars.get('SCREENSIZE')).toThrow();
    expect(() => document.sysvars.set('CLAYOUT', 'Missing')).toThrow();
    const handle = document.database.find('LAYOUT', 'Layout1')?.handle;
    document.sysvars.set('CLAYOUT', 'layout1');
    expect(document.sysvars.get('CLAYOUT')).toBe(`Layout1*${handle}`);
    expect(layoutFromName(`Layout1*${handle}`)).toBe('layoutOne');
    document.database.undo();
    expect(() => document.sysvars.get('CLAYOUT')).toThrow();
  });
});
