import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingDatabase, serializeHcd } from '@hancad/db';
import { DocumentManager } from '@hancad/sysvars';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import {
  createImportedDocument,
  initialDocumentDrawing,
  openNativeDocument,
} from './document-actions';
import {
  cacheNativeDrawing,
  cachedNativeBlobs,
  cachedNativeDatabase,
} from './native-drawing-cache';
import { normalizeDrawingSession } from './drawing-session';
import { drawingViewVariable } from './drawing-storage';
import { NativeDrawingFileError } from './native-file-error';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

describe('document transition and recovery boundaries', () => {
  it('reads current document styles on reactivation and preserves native objects, blobs and title state', () => {
    const manager = new DocumentManager();
    const document = createImportedDocument(manager, {
      state: createEmptyCadState('source.dxf'),
      fileName: 'source.dxf',
      report: null,
    });
    document.database.transaction('PROXY', (tx) =>
      tx.add({
        type: 'OPAQUE_VENDOR_OBJECT',
        fields: { unknown: ['한글', 7] },
        groups: [{ code: 9876, value: 'untouched' }],
      }),
    );
    document.sysvars.set('TEXTSIZE', 6);
    document.sysvars.set('DIMTXT', 8);
    const view = initialDocumentDrawing(document.database, document.name, false).drawing;
    expect(view.draftingVariables?.TEXTSIZE).toBe(6);
    expect(view.dimensionStyle?.DIMTXT).toBe(8);
    document.blobs.set('opaque.bin', Uint8Array.from([0, 127, 255]));
    const cache = normalizeDrawingSession(
      cacheNativeDrawing(view, document.database, document.blobs, false),
    );
    expect(cache.nativeDatabase?.drawingVariables[drawingViewVariable]).toBeUndefined();
    const restored = cachedNativeDatabase(cache);
    expect(restored?.getVariable('TEXTSIZE')).toBe(6);
    expect(restored?.getVariable('DIMTXT')).toBe(8);
    expect(restored?.find('OPAQUE_VENDOR_OBJECT')).toEqual(
      document.database.find('OPAQUE_VENDOR_OBJECT'),
    );
    expect(cachedNativeBlobs(cache).get('opaque.bin')).toEqual(document.blobs.get('opaque.bin'));
    expect(cache.nativeTitled).toBe(false);
    expect(restored?.undoCount).toBe(0);
  });

  it('rejects invalid HCD view data before adding or activating a document', () => {
    const manager = new DocumentManager(),
      active = manager.create();
    const database = new DrawingDatabase();
    database.transaction('BAD_VIEW', (tx) => tx.setVariable(drawingViewVariable, '{broken'));
    expect(() => openNativeDocument(manager, serializeHcd(database), 'bad.hcd')).toThrow(
      NativeDrawingFileError,
    );
    expect(manager.active).toBe(active);
    expect(manager.all).toHaveLength(1);
  });

  it('rejects recursive native graphs and malformed binary recovery metadata', () => {
    const session = { state: createEmptyCadState(), fileName: '', report: null };
    const database = new DrawingDatabase();
    database.transaction('VIEW', (tx) => tx.setVariable(drawingViewVariable, '{}'));
    expect(() =>
      normalizeDrawingSession({ ...session, nativeDatabase: database.snapshot() }),
    ).toThrow('Recursive');
    expect(() => normalizeDrawingSession({ ...session, nativeTitled: 1 })).toThrow('title state');
    for (const blob of [
      { name: '../bad', data: [1] },
      { name: 'bad.bin', data: [256] },
    ])
      expect(() => normalizeDrawingSession({ ...session, nativeBlobs: [blob] })).toThrow('blobs');
  });
});
