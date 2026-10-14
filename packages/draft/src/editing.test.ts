import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import {
  draftCircle,
  draftLine,
  ModifySession,
  selectCadArea,
  transformCadSelection,
} from './index';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

describe('selection and basic edit workflows', () => {
  function fixture() {
    const state = createEmptyCadState();
    state.entities = [
      draftLine(state.settings, { x: -10, y: 5 }, { x: 20, y: 5 }, 'long'),
      draftLine(state.settings, { x: 2, y: 2 }, { x: 8, y: 8 }, 'inside'),
      draftCircle(state.settings, { x: 20, y: 20 }, 3, 'circle'),
      draftCircle(state.settings, { x: 5, y: 5 }, 20, 'surrounding'),
    ];
    return state;
  }
  it('distinguishes complete window containment from crossing geometry, excluding locked/hidden layers', () => {
    const state = fixture();
    expect(selectCadArea(state, { x: 0, y: 0 }, { x: 10, y: 10 })).toEqual(['inside']);
    expect(selectCadArea(state, { x: 10, y: 10 }, { x: 0, y: 0 })).toEqual(['long', 'inside']);
    state.layers[0]!.locked = true;
    expect(selectCadArea(state, { x: 10, y: 10 }, { x: 0, y: 0 })).toEqual([]);
    state.layers[0]!.locked = false;
    state.layers[0]!.visible = false;
    expect(selectCadArea(state, { x: 10, y: 10 }, { x: 0, y: 0 })).toEqual([]);
  });
  it('moves original handles, copies with fresh identities and leaves source data intact', () => {
    const state = fixture();
    const original = structuredClone(state);
    const moved = transformCadSelection(state, ['long', 'circle'], { x: 100, y: -50 });
    expect(moved.ids).toEqual(['long', 'circle']);
    expect(moved.state.entities[0]).toMatchObject({ a: { x: 90, y: -45 }, b: { x: 120, y: -45 } });
    expect(moved.state.entities[2]).toMatchObject({ center: { x: 120, y: -30 }, radius: 3 });
    const copy = transformCadSelection(state, ['long', 'circle'], { x: 100, y: -50 }, true);
    expect(copy.state.entities).toHaveLength(6);
    expect(new Set(copy.state.entities.map((e) => e.id)).size).toBe(6);
    expect(copy.state.entities[4]).toMatchObject({ a: { x: 90, y: -45 } });
    expect(state).toEqual(original);
  });
  it('previews exact snapped movement, preserves explicit WCS input and groups repeated copy placements', () => {
    const state = fixture();
    const move = new ModifySession('MOVE');
    expect(move.getSnapshot().prompt).toBe('selectObjects');
    move.select(state, ['inside']);
    move.acceptText('0,0');
    move.moveCursor({ x: 30, y: -12 }, true, true);
    expect(move.getSnapshot().preview[0]).toMatchObject({ a: { x: 32, y: -10 } });
    expect(move.acceptPoint({ x: 30, y: -12 }, true, true)).toEqual({ x: 30, y: -12 });
    const copy = new ModifySession('COPY');
    copy.select(state, ['inside']);
    copy.acceptText('0,0');
    expect(copy.acceptText('@30,12').delta).toEqual({ x: 30, y: -12 });
    expect(copy.acceptText('@60,24').delta).toEqual({ x: 60, y: -24 });
    expect(copy.getSnapshot().preview).toHaveLength(2);
    expect(copy.acceptText('E')).toEqual({ finish: true });
    expect(state.entities).toHaveLength(4);
  });
  it('accepts zero displacement without trapping MOVE and allows an in-place COPY', () => {
    const state = fixture();
    const move = new ModifySession('MOVE');
    move.select(state, ['inside']);
    move.acceptText('0,0');
    expect(move.acceptText('')).toEqual({ delta: { x: 0, y: 0 } });
    const copy = new ModifySession('COPY');
    copy.select(state, ['inside']);
    copy.acceptText('0,0');
    expect(copy.acceptText('0,0')).toEqual({ delta: { x: 0, y: 0 } });
    expect(copy.getSnapshot().preview).toHaveLength(1);
  });
});
