import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { draftLine } from '@hancad/draft';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import {
  isolateObjects,
  isolatedObjectIds,
  restoreObjectIsolation,
  unisolateObjects,
} from './object-isolation';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const state = createEmptyCadState();
  state.entities = ['A', 'B', 'C'].map((id, index) =>
    draftLine(state.settings, { x: index, y: 0 }, { x: index, y: 10 }, id),
  );
  return state;
}
describe('object isolation independent of layers', () => {
  it('accumulates hidden objects and restores the exact entity and layer graph', () => {
    const state = fixture(),
      original = structuredClone(state);
    const hidden = isolateObjects(state, ['C'], 'HIDEOBJECTS', 0);
    const isolated = isolateObjects(hidden, ['A'], 'ISOLATEOBJECTS', 0);
    expect([...isolatedObjectIds(isolated)].sort()).toEqual(['B', 'C']);
    expect(isolated.layers).toEqual(original.layers);
    expect(isolated.entities).toEqual(original.entities);
    expect(unisolateObjects(isolated)).toEqual(original);
    expect(state).toEqual(original);
  });
  it('persists only OBJECTISOLATIONMODE 1 at reopen and prunes missing IDs', () => {
    const state = fixture();
    expect(
      isolatedObjectIds(restoreObjectIsolation(isolateObjects(state, ['A'], 'HIDEOBJECTS', 0))),
    ).toEqual([]);
    const next = isolateObjects(state, ['A', 'C'], 'HIDEOBJECTS', 1);
    next.entities = next.entities.filter((entity) => entity.id !== 'C');
    expect(isolatedObjectIds(restoreObjectIsolation(next))).toEqual(['A']);
    expect(next.objectIsolation?.hiddenIds).toEqual(['A', 'C']);
    expect(isolateObjects(state, ['absent'], 'ISOLATEOBJECTS', 1)).toBe(state);
  });
});
