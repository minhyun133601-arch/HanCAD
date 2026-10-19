import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { serializeHcd } from '@hancad/db';
import { DocumentManager } from '@hancad/sysvars';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import {
  createImportedDocument,
  initialDocumentDrawing,
  openNativeDocument,
} from './document-actions';
import { cacheNativeDrawing } from './native-drawing-cache';
import { normalizeDrawingSession } from './drawing-session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
it('retains exact drawing geometry and custom multiline definitions through real HCD bytes and recovery', () => {
  const state = createEmptyCadState('curves.hcd');
  state.entities = [
    {
      id: 'ellipse',
      layer: '0',
      color: '#ffffff',
      lineWidth: 1,
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      closed: true,
      sourceType: 'ELLIPSE',
      curve: {
        type: 'ELLIPSE',
        center: { x: 1e8, y: 25, z: 7 },
        majorAxis: { x: 10, y: 0, z: 0 },
        minorAxis: { x: 0, y: 5, z: 0 },
        startParameter: 0,
        sweepParameter: 2 * Math.PI,
      },
      startWidths: [2, 0],
      endWidths: [4, 0],
      elevation: 7,
      thickness: 3,
    },
  ];
  state.mlineStyles = [
    { name: 'Custom', description: 'Saved definition', offsets: [-0.5, 0, 0.5] },
  ];
  const manager = new DocumentManager(),
    source = createImportedDocument(manager, { state, fileName: 'curves.hcd', report: null });
  const bytes = serializeHcd(source.database),
    reopened = openNativeDocument(new DocumentManager(), bytes, 'reopened.hcd');
  const restored = initialDocumentDrawing(reopened.database, reopened.name, false).drawing;
  expect(restored.state.entities).toEqual(state.entities);
  expect(restored.state.mlineStyles).toEqual(state.mlineStyles);
  const recovery = normalizeDrawingSession(
    JSON.parse(
      JSON.stringify(cacheNativeDrawing(restored, reopened.database, reopened.blobs, true)),
    ),
  );
  expect(recovery.state.entities).toEqual(state.entities);
  expect(recovery.state.mlineStyles).toEqual(state.mlineStyles);
});
