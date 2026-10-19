import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DrawingDatabase } from '@hancad/db';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { copyDrawingSelection } from './drawing-clipboard';
import { drawingClipboardImage } from './drawing-clipboard-platform';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it.each([
  { aci: 1, color: '#00ff00', expected: '#ff0000' },
  { aci: 7, color: '#ffffff', expected: '#000000' },
  { aci: 7, trueColor: 0xffffff, color: '#00ff00', expected: '#ffffff' },
])('resolves clipboard PNG/DIB export color from native fields: $expected', async (style) => {
  const strokes: { color: string; width: number; opacity: number }[] = [];
  let screenScale = 1;
  const context = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    fillRect: vi.fn(),
    translate: vi.fn(),
    scale: (x: number) => {
      screenScale *= x;
    },
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    setLineDash: vi.fn(),
    stroke: () =>
      strokes.push({
        color: context.strokeStyle,
        width: context.lineWidth * screenScale,
        opacity: context.globalAlpha,
      }),
    getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: BlobCallback) =>
      callback(new Blob([new Uint8Array([137, 80])], { type: 'image/png' })),
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  const state = createEmptyCadState();
  state.entities = [
    {
      id: 'native',
      type: 'line',
      layer: '0',
      color: style.color,
      aci: style.aci,
      ...('trueColor' in style ? { trueColor: style.trueColor } : {}),
      lineWidth: 1,
      lineweight: 100,
      transparency: 60,
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
    },
  ];
  const payload = copyDrawingSelection(state, ['native'], { x: 0, y: 0 })!;
  const result = await drawingClipboardImage(payload, new DrawingDatabase());
  expect(strokes).toEqual([{ color: style.expected, width: 4, opacity: 0.4 }]);
  expect(result.png).toEqual([137, 80]);
  expect(result.dib).toHaveLength(44);
});
