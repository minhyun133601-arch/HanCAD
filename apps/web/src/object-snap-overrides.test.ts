import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftSession, draftCircle, draftLine, snapDraftPoint } from '@hancad/draft';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { TempOverrides, type ObjectSnapOverride } from './temp-overrides';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

describe('one-point shortcut-menu object snaps', () => {
  it.each<[ObjectSnapOverride, number]>([
    ['endpoint', 1],
    ['midpoint', 2],
    ['center', 4],
    ['quadrant', 16],
    ['intersection', 32],
    ['nearest', 512],
    ['none', 0],
  ])('uses %s for one point without changing OSMODE', (mode, mask) => {
    const variables = new SystemVariables();
    variables.set('OSMODE', 16385);
    const overrides = new TempOverrides();
    overrides.setObjectSnap(mode);
    expect(overrides.number(variables, 'OSMODE')).toBe(mask);
    expect(variables.getNumber('OSMODE')).toBe(16385);
    overrides.consumeObjectSnap();
    expect(overrides.number(variables, 'OSMODE')).toBe(16385);
    expect(overrides.getObjectSnap()).toBeUndefined();
  });

  it('keeps menu choices after Shift release and separates held-key overrides', () => {
    const overrides = new TempOverrides();
    overrides.press('ortho');
    overrides.setObjectSnap('quadrant');
    overrides.release();
    expect(overrides.effective('OSMODE', 4133)).toBe(16);
    overrides.press('endpoint');
    expect(overrides.effective('OSMODE', 4133)).toBe(1);
    overrides.release('endpoint');
    expect(overrides.effective('OSMODE', 4133)).toBe(16);
    overrides.clearObjectSnap();
    expect(overrides.effective('OSMODE', 4133)).toBe(4133);
  });

  it('notifies once per change and keeps unrelated variables and tracking unchanged', () => {
    const overrides = new TempOverrides();
    let changes = 0;
    const unsubscribe = overrides.subscribe(() => changes++);
    overrides.setObjectSnap('none');
    overrides.setObjectSnap('none');
    expect(overrides.effective('AUTOSNAP', 63)).toBe(63);
    expect(overrides.effective('ORTHOMODE', 1)).toBe(1);
    overrides.setObjectSnap('center');
    overrides.clearObjectSnap();
    overrides.clearObjectSnap();
    expect(changes).toBe(3);
    unsubscribe();
  });

  it('retains the override after rejected text and keywords, consuming accepted coordinates', () => {
    const overrides = new TempOverrides();
    const state = createEmptyCadState();
    const session = new DraftSession('LINE', state.settings, { onCommit: () => undefined });
    session.acceptText('0,0');
    overrides.setObjectSnap('endpoint');
    for (const value of ['bad input', '0,0', 'Undo']) {
      const result = session.acceptText(value);
      overrides.consumeObjectSnapInput(value, result.status !== 'error');
      expect(overrides.getObjectSnap()).toBe('endpoint');
    }
    const result = session.acceptText('@10,20');
    overrides.consumeObjectSnapInput('@10,20', result.status !== 'error');
    expect(overrides.getObjectSnap()).toBeUndefined();
  });

  it('acquires only the selected mode and returns to the running modes after a point', () => {
    const overrides = new TempOverrides();
    const state = createEmptyCadState();
    state.entities = [
      draftLine(state.settings, { x: 0, y: 0 }, { x: 100, y: 0 }, 'line'),
      draftCircle(state.settings, { x: 50, y: 30 }, 10, 'circle'),
    ];
    const snap = (x: number, y: number) =>
      snapDraftPoint(state, { x, y }, 2, overrides.effective('OSMODE', 2));
    overrides.setObjectSnap('endpoint');
    expect(snap(1, 1)?.point).toEqual({ x: 0, y: 0 });
    expect(snap(50, 1)).toBeUndefined();
    overrides.consumeObjectSnap();
    expect(snap(1, 1)).toBeUndefined();
    expect(snap(50, 1)?.kind).toBe('midpoint');
    overrides.setObjectSnap('center');
    expect(snap(50, 31)?.point).toEqual({ x: 50, y: 30 });
    overrides.setObjectSnap('none');
    expect(snap(50, 1)).toBeUndefined();
  });
});
