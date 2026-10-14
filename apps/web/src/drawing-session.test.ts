import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DrawingDatabase } from '@hancad/db';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import {
  canUseLocalDrawingCache,
  DrawingSessionTransfer,
  parseDrawingSession,
} from './drawing-session';
import type { DrawingSession } from './drawing-session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

function session(): DrawingSession {
  return {
    state: createEmptyCadState(),
    fileName: '한글 도면.dwg',
    documentId: 'drawing-A',
    report: null,
  };
}

it('hands one validated large graph to the synchronous journal observer without retaining it afterward', () => {
  const input = session();
  input.state.entities = Array.from({ length: 20001 }, (_, index) => ({
    type: 'line' as const,
    id: `line-${index}`,
    layer: '0',
    color: '#ffffff',
    lineWidth: 1,
    a: { x: index, y: 0 },
    b: { x: index, y: 100 },
  }));
  const database = new DrawingDatabase();
  const transfer = new DrawingSessionTransfer();
  let observed: DrawingSession | undefined;
  let serialized = '';
  database.events.subscribe((event) => {
    if (event.type === 'sysvar-changed' && event.name === 'VIEW' && typeof event.value === 'string')
      observed = transfer.read(event.value);
  });
  const prepared = transfer.write(input, (value) => {
    serialized = value;
    database.transaction('OPEN', (tx) => tx.setVariable('VIEW', value));
  });
  expect(observed).toBe(prepared);
  expect(prepared.state.entities).toHaveLength(20001);
  expect(prepared.documentId).toBe('drawing-A');
  expect(prepared.fileName).toBe('한글 도면.dwg');
  const inputLine = input.state.entities[0],
    preparedLine = prepared.state.entities[0];
  if (inputLine?.type !== 'line' || preparedLine?.type !== 'line') throw new Error('Missing line');
  inputLine.a.x = 999;
  expect(preparedLine.a.x).toBe(0);
  const reparsed = transfer.read(serialized);
  expect(reparsed).not.toBe(prepared);
  expect(reparsed.state.entities).toHaveLength(20001);
  expect(reparsed.state.entities[0]).toEqual(preparedLine);
  expect(canUseLocalDrawingCache(serialized)).toBe(false);
  expect(canUseLocalDrawingCache(JSON.stringify(session()))).toBe(true);
});

it('preserves atomic geometry/style undo and redo, validates history, and clears failed publication state', () => {
  const database = new DrawingDatabase();
  const transfer = new DrawingSessionTransfer();
  let visible = session();
  database.events.subscribe((event) => {
    if (event.type === 'sysvar-changed' && event.name === 'VIEW' && typeof event.value === 'string')
      visible = transfer.read(event.value);
  });
  transfer.write(visible, (serialized) =>
    database.transaction('INITIAL', (tx) => {
      tx.setVariable('DIMTXT', 2.5);
      tx.setVariable('VIEW', serialized);
    }),
  );
  database.clearHistory();
  const edited = {
    ...visible,
    state: { ...visible.state, settings: { ...visible.state.settings, dimTextSize: 8 } },
  };
  transfer.write(edited, (serialized) =>
    database.transaction('DIMSTYLE', (tx) => {
      tx.setVariable('DIMTXT', 8);
      tx.setVariable('VIEW', serialized);
    }),
  );
  expect(database.undoCount).toBe(1);
  expect(visible.state.settings.dimTextSize).toBe(8);
  database.undo();
  expect(database.getVariable('DIMTXT')).toBe(2.5);
  expect(visible.state.settings.dimTextSize).toBe(3.5);
  database.redo();
  expect(database.getVariable('DIMTXT')).toBe(8);
  expect(visible.state.settings.dimTextSize).toBe(8);
  const before = database.getVariable('VIEW');
  let failedSerialized = '';
  let inFlight: DrawingSession | undefined;
  expect(() =>
    transfer.write(edited, (serialized) => {
      failedSerialized = serialized;
      inFlight = transfer.read(serialized);
      database.transaction('cancel', (tx) => {
        tx.setVariable('VIEW', serialized);
        throw new Error('cancel');
      });
    }),
  ).toThrow('cancel');
  expect(database.getVariable('VIEW')).toBe(before);
  expect(database.undoCount).toBe(1);
  expect(transfer.read(failedSerialized)).not.toBe(inFlight);
});

it('rejects corrupt geometry, reports, style variables and identities before any journal mutation', () => {
  const transfer = new DrawingSessionTransfer();
  const input = session();
  const write = vi.fn();
  const invalid = [
    { ...input, documentId: '' },
    { ...input, state: { ...input.state, entities: [{ type: 'unknown' }] } },
    { ...input, dimensionStyle: { DIMDEC: 999 } },
    {
      ...input,
      report: {
        format: 'DWG',
        version: 'AC1015',
        imported: -1,
        sourceEntities: 1,
        skipped: 0,
        approximated: 0,
        unsupported: [],
        warnings: [],
      },
    },
  ];
  for (const value of invalid) {
    expect(() => transfer.write(value, write)).toThrow();
    expect(() => parseDrawingSession(JSON.stringify(value))).toThrow();
  }
  expect(write).not.toHaveBeenCalled();
  expect(() => transfer.read('{')).toThrow();
  expect(transfer.write(input, write).documentId).toBe('drawing-A');
  expect(write).toHaveBeenCalledOnce();
});
