import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyCadState,
  drawingToDxf,
  getLegacyRuntime,
  normalizeCadState,
} from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { dimensionGeometry, linearDimension } from './index';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it('preserves an external DIMPOST leading space and a single-space suppressed text override', () => {
  const state = createEmptyCadState();
  const entity = linearDimension(
    { ...state.settings, dimPost: ' mm' },
    'horizontal',
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 50, y: -20 },
  );
  if (!entity) throw new Error('Missing dimension');
  const dxf = drawingToDxf(
    normalizeCadState({
      ...state,
      entities: [
        entity,
        { ...entity, id: 'suppressed', text: ' ' },
        { ...entity, id: 'padded', text: '  한글 <>  ' },
      ],
    }),
  );
  // DIMPOST permits a bare suffix; emulate AutoCAD's raw group 3 rather than our <> serialization.
  const external = dxf.replace('\r\n3\r\n<> mm\r\n', '\r\n3\r\n mm\r\n');
  const imported = getLegacyRuntime().core.cadImporters.parseDxf(external);
  const [suffix, suppressed, padded] = imported.state.entities;
  if (suffix?.type !== 'dimension' || suppressed?.type !== 'dimension')
    throw new Error('Missing imported dimensions');
  expect(suffix.post).toBe(' mm');
  expect(dimensionGeometry(suffix)?.label).toBe('100.00 mm');
  expect(suppressed.text).toBe(' ');
  expect(dimensionGeometry(suppressed)?.label).toBe(' ');
  if (padded?.type !== 'dimension') throw new Error('Missing padded text dimension');
  expect(padded.text).toBe('  한글 <>  ');
  expect(dimensionGeometry(padded)?.label).toBe('  한글 100.00 mm  ');
  const reopened = getLegacyRuntime().core.cadImporters.parseDxf(drawingToDxf(imported.state));
  for (const [index, expected] of ['100.00 mm', ' ', '  한글 100.00 mm  '].entries()) {
    const restored = reopened.state.entities[index];
    if (restored?.type !== 'dimension') throw new Error('Missing reopened dimension');
    expect(dimensionGeometry(restored)?.label).toBe(expected);
  }
  const handleFree = external.replace(/\r\n5\r\n[^\r\n]+\r\n/g, '\r\n');
  const legacy = getLegacyRuntime().core.cadImporters.parseDxf(handleFree);
  for (const [index, expected] of ['100.00 mm', ' ', '  한글 100.00 mm  '].entries()) {
    const restored = legacy.state.entities[index];
    if (restored?.type !== 'dimension') throw new Error('Missing handle-free dimension');
    expect(dimensionGeometry(restored)?.label).toBe(expected);
  }
});
