import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { CadEntity } from '@hancad/legacy-bridge';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import type { DrawFactory } from './draw-program';
import { editSelection } from './modify-selection';
import { peditProgram } from './modify-poly';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

const line = (id: string, x: number): CadEntity => ({
  id,
  type: 'line',
  layer: '0',
  color: '#ffffff',
  lineWidth: 1,
  a: { x, y: 0 },
  b: { x: x + 2, y: 0 },
});
const a = line('a', 0),
  b = line('b', 10),
  locked = line('locked', 5);
const context = () => ({
  ...outlineContext({ PEDITACCEPT: 1, DELOBJ: 1 }),
  entities: [a, b, locked],
  editableIds: new Set(['a', 'b']),
});
const select: DrawFactory = function* (ctx) {
  return { entities: yield* editSelection(ctx, undefined, undefined, false) };
};
test('inner selection shares ALL, Remove, Undo and locked-object eligibility', () => {
  const result = outlineRun(
    select,
    ['ALL', 'R', { entity: a, point: { x: 0, y: 0 } }, 'U', ''],
    context(),
  );
  expect(result.entities.map((e) => e.id)).toEqual(['a', 'b']);
});
test('inner selection accepts explicit window corners and automatic box points', () => {
  expect(
    outlineRun(select, ['W', { x: -1, y: -1 }, { x: 3, y: 1 }, ''], context()).entities.map(
      (e) => e.id,
    ),
  ).toEqual(['a']);
  expect(
    outlineRun(select, [{ x: 3, y: -1 }, { x: 1, y: 1 }, ''], context()).entities.map((e) => e.id),
  ).toEqual(['a']);
});
test('PEDIT Multiple accepts ALL through the same nested selection host', () => {
  const result = outlineRun(peditProgram, ['M', 'ALL', '', 'W', '3', ''], context());
  expect(result.entities).toHaveLength(2);
  expect(
    result.entities.every(
      (e) => (e.type === 'polyline' || e.type === 'rect') && e.constantWidth === 3,
    ),
  ).toBe(true);
  expect(result.eraseIds).toEqual(['a', 'b']);
});
