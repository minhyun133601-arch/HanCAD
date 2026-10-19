import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { applyGripAction } from './grip-actions';
import { defaultGripProvider } from './grip-providers';
import { outlineOnly } from './draw-outline-fixtures';
import { drawPline } from './draw-pline';
import type { GripAction } from './grip-types';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const p = (x: number, y: number): CadPoint => ({ x, y: -y });
function fixture(closed = false): CadPolyline {
  const result = outlineOnly(drawPline, [p(0, 0), p(100, 0), p(100, 100), closed ? 'C' : '']);
  result.startWidths = [2, 10, closed ? 6 : 0];
  result.endWidths = [8, 14, closed ? 12 : 0];
  return result;
}
function edit(entity: CadPolyline, index: number, action: GripAction, point?: CadPoint) {
  const grip = defaultGripProvider.grips(entity, true).find((item) => item.key === `v${index}`)!;
  const changed = applyGripAction(entity, grip, action, point);
  if (changed?.type !== 'polyline') throw new Error('Expected edited polyline');
  const state = createEmptyCadState();
  state.entities = [changed];
  return normalizeCadState(state).entities[0] as CadPolyline;
}
describe('multifunction polyline grips preserve vertex width records', () => {
  it('accepts actual PLINE zero-width add/remove results through recovery normalization', () => {
    const source = outlineOnly(drawPline, [p(0, 0), p(100, 0), p(100, 60), '']);
    const added = edit(source, 0, 'addVertex', p(50, 20));
    expect(added.points).toHaveLength(4);
    expect(added.startWidths).toEqual([0, 0, 0, 0]);
    expect(added.endWidths).toEqual([0, 0, 0, 0]);
    const removed = edit(added, 1, 'removeVertex');
    expect(removed.points).toEqual(source.points);
    expect(removed.startWidths).toEqual(source.startWidths);
    expect(removed.endWidths).toEqual(source.endWidths);
  });
  it('splits a tapered segment continuously and merges its exterior widths on removal', () => {
    const source = fixture(),
      added = edit(source, 0, 'addVertex', p(25, 0));
    expect(added.startWidths).toEqual([2, 3.5, 10, 0]);
    expect(added.endWidths).toEqual([3.5, 8, 14, 0]);
    const removed = edit(added, 1, 'removeVertex');
    expect(removed.startWidths).toEqual(source.startWidths);
    expect(removed.endWidths).toEqual(source.endWidths);
    expect(source.points).toHaveLength(3);
  });
  it('handles the closing segment and joins widths across the first vertex', () => {
    const source = fixture(true),
      added = edit(source, 2, 'addVertex', p(50, 50));
    expect(added.startWidths).toEqual([2, 10, 6, 9]);
    expect(added.endWidths).toEqual([8, 14, 9, 12]);
    expect(edit(added, 3, 'removeVertex').endWidths).toEqual(source.endWidths);
    const removed = edit(source, 0, 'removeVertex');
    expect(removed.startWidths).toEqual([10, 6]);
    expect(removed.endWidths).toEqual([14, 8]);
  });
  it('extends an open end using the incoming width and keeps its terminal record aligned', () => {
    const source = fixture(),
      extended = edit(source, 2, 'addVertex', p(200, 100));
    expect(extended.startWidths).toEqual([2, 10, 14, 0]);
    expect(extended.endWidths).toEqual([8, 14, 14, 0]);
    const removed = edit(extended, 3, 'removeVertex');
    expect(removed.startWidths).toEqual(source.startWidths);
    expect(removed.endWidths).toEqual(source.endWidths);
    expect(edit(source, 0, 'removeVertex').startWidths).toEqual([10, 0]);
  });
  it('keeps tapered widths through exact arc/line conversion after adding and removing vertices', () => {
    const source = fixture(),
      added = edit(source, 0, 'addVertex', p(50, 20)),
      removed = edit(added, 1, 'removeVertex'),
      curved = edit(removed, 0, 'convertArc', p(50, 50));
    expect(curved.bulges?.[0]).toBeCloseTo(1, 12);
    expect(curved.startWidths).toEqual(source.startWidths);
    expect(curved.endWidths).toEqual(source.endWidths);
    const straight = edit(curved, 0, 'convertLine');
    expect(straight.bulges?.[0]).toBe(0);
    expect(straight.startWidths).toEqual(source.startWidths);
    expect(straight.endWidths).toEqual(source.endWidths);
  });
  it('retains a constant width without introducing per-vertex overrides', () => {
    const source = fixture();
    delete source.startWidths;
    delete source.endWidths;
    source.constantWidth = 4;
    const added = edit(source, 0, 'addVertex', p(50, 20));
    expect(added.constantWidth).toBe(4);
    expect(added.startWidths).toBeUndefined();
    expect(added.endWidths).toBeUndefined();
  });
});
