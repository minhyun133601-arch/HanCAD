import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { SelectionSession } from './selection-session';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  let ids: string[] = [];
  const session = new SelectionSession({
    getState: createEmptyCadState,
    getIds: () => ids,
    select: (next, remove) => {
      ids = remove ? ids.filter((id) => !next.includes(id)) : [...new Set([...ids, ...next])];
    },
    replace: (next) => {
      ids = next;
    },
    print: () => {},
    changed: () => {},
    finish: () => {},
    korean: () => true,
  });
  return session;
}
const window = {
  points: [
    { x: 5, y: -5 },
    { x: 15, y: -5 },
    { x: 15, y: 5 },
    { x: 5, y: 5 },
  ],
  crossing: true,
};
describe('selection provenance used by STRETCH', () => {
  it('records several crossing windows separately from a later individual pick', () => {
    const session = fixture();
    session.apply(['a'], false, window);
    session.apply(['b'], false, {
      ...window,
      points: window.points.map((p) => ({ ...p, y: p.y + 20 })),
    });
    session.apply(['a']);
    expect(session.getSelectionWindows().map((item) => item.ids)).toEqual([['a'], ['b']]);
    expect(session.getIndividuallySelectedIds()).toEqual(['a']);
  });
  it('selection Undo restores masks and removes a whole-object acquisition', () => {
    const session = fixture();
    session.apply(['a'], false, window);
    session.apply(['a']);
    session.submit('U');
    expect(session.getIndividuallySelectedIds()).toEqual([]);
    expect(session.getSelectionWindows()).toHaveLength(1);
    session.submit('U');
    expect(session.getSelectionWindows()).toEqual([]);
  });
  it('removed and reselected objects do not retain an obsolete crossing mask', () => {
    const session = fixture();
    session.apply(['a'], false, window);
    session.apply(['a'], true);
    session.apply(['a'], false, { ...window, crossing: false });
    expect(session.getSelectionWindows()).toEqual([{ ...window, crossing: false, ids: ['a'] }]);
  });
});
