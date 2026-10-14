import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { applyDimensionStyle, dimensionGeometry, linearDimension } from './index';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it('changing defaults preserves existing dimensions through normalization until explicitly applied', () => {
  const initial = createEmptyCadState();
  const first = linearDimension(
    initial.settings,
    'horizontal',
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 50, y: -20 },
  );
  const second = linearDimension(
    initial.settings,
    'aligned',
    { x: 0, y: 0 },
    { x: 30, y: -40 },
    { x: 30, y: -60 },
  );
  if (!first || !second) throw new Error('Missing legacy dimensions');
  const state = normalizeCadState({ ...initial, entities: [first, second] });
  const original = state.entities.map((entity) => JSON.stringify(entity));
  const geometry = [dimensionGeometry(first), dimensionGeometry(second)];
  const settings = {
    ...state.settings,
    dimScale: 5,
    dimTextSize: 8,
    arrowSize: 4,
    dimGap: 10,
    dimMeasurementFactor: 3,
    dimZeroSuppression: 8,
    dimPost: '변경 <> mm',
  };
  const defaultsOnly = normalizeCadState({ ...state, settings });
  expect(defaultsOnly.entities.map((entity) => JSON.stringify(entity))).toEqual(original);
  for (let i = 0; i < defaultsOnly.entities.length; i++) {
    const entity = defaultsOnly.entities[i];
    if (entity?.type !== 'dimension') throw new Error('Missing normalized dimension');
    expect(dimensionGeometry(entity)).toEqual(geometry[i]);
  }
  const selectedOnly = normalizeCadState({
    ...state,
    settings,
    entities: [applyDimensionStyle(first, settings), second],
  });
  expect(JSON.stringify(selectedOnly.entities[1])).toBe(original[1]);
  const selected = selectedOnly.entities[0];
  if (selected?.type !== 'dimension') throw new Error('Missing selected dimension');
  expect(dimensionGeometry(selected)?.measurement).toBe(100);
  expect(dimensionGeometry(selected)?.label).toBe('변경 300 mm');
  expect(dimensionGeometry(selected)?.textSize).toBe(40);
});
