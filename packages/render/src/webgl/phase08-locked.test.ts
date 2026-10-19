import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTestCanvas } from '../../../legacy-bridge/src/test-canvas';
import { createTestRuntime } from '../../../legacy-bridge/src/test-runtime';
import type { DisplayEntity } from '../display/types';
import type { DisplayLayerStyle } from '../sources/style-tables';
import { WebGlRenderer } from './renderer';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it.each(['layer', 'ancestor'])(
  'retains locked %s geometry through selected opaque / faded transparent transitions',
  (mode) => {
    const fixture = createTestCanvas();
    const layers = new Map<string, DisplayLayerStyle>([
      [
        'DETAIL',
        {
          name: 'DETAIL',
          color: { kind: 'aci', index: 3 },
          linetype: 'CONTINUOUS',
          lineweight: -3,
          transparency: 0,
          visible: true,
          locked: mode === 'layer',
        },
      ],
    ]);
    const entity: DisplayEntity = {
      id: 'native-display:root/child',
      sourceId: 'native:ENTITY:root',
      geometry: { type: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      layer: 'DETAIL',
      color: { kind: 'aci', index: 3 },
      linetype: 'CONTINUOUS',
      linetypeScale: 1,
      lineweight: -3,
      transparency: 0,
      plinegen: false,
      ...(mode === 'ancestor' ? { locked: true } : {}),
    };
    const renderer = new WebGlRenderer(fixture.canvas, {
      layers: () => layers,
      variable: (name) =>
        name === 'LAYLOCKFADECTL' ? 50 : name === 'TRANSPARENCYDISPLAY' ? 0 : undefined,
    });
    const upload = vi.spyOn(renderer.device, 'uploadStyles'),
      drawPass = vi.spyOn(renderer.device, 'draw');
    const draw = () => renderer.draw({ x: 50, y: 0 }, 1, 800, 600, 0x212830);
    try {
      renderer.setDisplayEntities([entity]);
      renderer.setSelection(new Set([entity.sourceId!]), new Set());
      draw();
      expect(upload.mock.calls.at(-1)?.[0][3]).toBe(1);
      expect(drawPass.mock.calls.some((call) => call[6] === 1)).toBe(false);
      drawPass.mockClear();
      renderer.setSelection(new Set(), new Set());
      draw();
      expect(upload.mock.calls.at(-1)?.[0][3]).toBe(0.5);
      expect(drawPass.mock.calls.some((call) => call[6] === 1)).toBe(true);
      expect(renderer.pick({ x: 50, y: 0 }, 1)).toBeUndefined();
      expect(renderer.pickAll({ x: 50, y: 0 }, 1, true)).toEqual([entity.sourceId]);
      drawPass.mockClear();
      renderer.setSelection(new Set([entity.sourceId!]), new Set());
      draw();
      expect(upload.mock.calls.at(-1)?.[0][3]).toBe(1);
      expect(drawPass.mock.calls.some((call) => call[6] === 1)).toBe(false);
    } finally {
      renderer.dispose();
    }
  },
);

it('uses native selection aliases for zoom bounds and excludes isolated display aliases', () => {
  const fixture = createTestCanvas(),
    renderer = new WebGlRenderer(fixture.canvas);
  const entity: DisplayEntity = {
    id: 'native-display:child',
    sourceId: 'native:ENTITY:root',
    geometry: { type: 'line', start: { x: 10, y: 20 }, end: { x: 30, y: 40 } },
    layer: '0',
    color: { kind: 'aci', index: 7 },
    linetype: 'CONTINUOUS',
    linetypeScale: 1,
    lineweight: -3,
    transparency: 0,
    plinegen: false,
  };
  try {
    renderer.setDisplayEntities([entity]);
    expect(renderer.getBounds([entity.sourceId!])).toMatchObject({
      minX: 10,
      minY: 20,
      maxX: 30,
      maxY: 40,
    });
    renderer.setSelection(new Set(), new Set([entity.sourceId!]));
    expect(renderer.getBounds()).toBeUndefined();
  } finally {
    renderer.dispose();
  }
});
