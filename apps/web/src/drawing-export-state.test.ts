import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingDatabase } from '@hancad/db';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { drawingExportState } from './drawing-export-state';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
describe('drawing export snapshot', () => {
  it('reads the current drawing frame mode for every wipeout without changing source metadata', () => {
    const state = createEmptyCadState(),
      database = new DrawingDatabase();
    state.entities = [
      {
        id: 'mask',
        type: 'polyline',
        sourceType: 'WIPEOUT',
        frameMode: 1,
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: -10 },
        ],
        drawFill: [
          [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 0, y: -10 },
          ],
        ],
        layer: '0',
        color: '#ffffff',
        lineWidth: 1,
      },
      {
        id: 'solid',
        type: 'polyline',
        sourceType: 'SOLID',
        frameMode: 1,
        closed: true,
        points: [
          { x: 20, y: 0 },
          { x: 30, y: 0 },
          { x: 20, y: -10 },
        ],
        layer: '0',
        color: '#ffffff',
        lineWidth: 1,
      },
    ];
    const original = structuredClone(state);
    for (const mode of [2, 1, 0]) {
      database.transaction('WIPEOUTFRAME', (tx) => tx.setVariable('WIPEOUTFRAME', mode));
      const exported = drawingExportState(state, database);
      expect(exported).not.toBe(state);
      expect(exported.entities[0]).toEqual({ ...state.entities[0], frameMode: mode });
      expect(exported.entities[0]).not.toBe(state.entities[0]);
      expect(exported.entities[1]).toBe(state.entities[1]);
      expect(state).toEqual(original);
    }
    database.undo();
    expect(drawingExportState(state, database).entities[0]?.frameMode).toBe(1);
  });
  it('uses the catalog default when the drawing has no explicit override', () => {
    const database = new DrawingDatabase(),
      state = createEmptyCadState();
    state.entities = [
      {
        id: 'mask',
        type: 'polyline',
        sourceType: 'WIPEOUT',
        frameMode: 0,
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: -10 },
        ],
        layer: '0',
        color: '#ffffff',
        lineWidth: 1,
      },
    ];
    expect(drawingExportState(state, database).entities[0]?.frameMode).toBe(1);
    expect(state.entities[0]?.frameMode).toBe(0);
  });
});
