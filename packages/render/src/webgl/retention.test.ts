import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadEntity } from '@hancad/legacy-bridge';
import { createTestCanvas } from '../../../legacy-bridge/src/test-canvas';
import { createTestRuntime } from '../../../legacy-bridge/src/test-runtime';
import { WebGlRenderer } from './renderer';
import type { DisplayLayerStyle } from '../sources/style-tables';
import type { DisplayEntity } from '../display/types';
import { buildMesh } from './mesh';
import type { MeshData } from './mesh';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const line: CadEntity = {
  id: 'a',
  type: 'line',
  a: { x: 0, y: 0 },
  b: { x: 100, y: 0 },
  layer: '0',
  color: '#ffffff',
  lineWidth: 1,
};
describe('retained GPU invalidation contracts', () => {
  it('forecasts LOD costs before another upload, makes progress and never defers dirty geometry', () => {
    const fixture = createTestCanvas(),
      renderer = new WebGlRenderer(fixture.canvas);
    const entities: DisplayEntity[] = [0, 5000].map((x, index) => ({
      id: `circle${index}`,
      geometry: {
        type: 'arc',
        center: { x, y: 0 },
        radius: 10,
        startAngle: 0,
        sweepAngle: 2 * Math.PI,
      },
      layer: '0',
      color: { kind: 'aci', index: 7 },
      linetype: 'CONTINUOUS',
      linetypeScale: 1,
      lineweight: -3,
      transparency: 0,
      plinegen: false,
    }));
    let clock = 0;
    const meshes: MeshData[] = [];
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock),
      upload = renderer.device.upload.bind(renderer.device);
    vi.spyOn(renderer.device, 'upload').mockImplementation((mesh, previous) => {
      clock += 2.5;
      meshes.push(mesh);
      return upload(mesh, previous);
    });
    const draw = (scale: number) => renderer.draw({ x: 2500, y: 0 }, scale, 10000, 800, 0x212830);
    try {
      renderer.setDisplayEntities(entities);
      expect(draw(1)).toMatchObject({ rebuilt: 2, pending: 0 });
      expect(draw(1.1)).toMatchObject({ rebuilt: 1, pending: 1, entities: 2 });
      expect(draw(1.1)).toMatchObject({ rebuilt: 1, pending: 0, entities: 2 });
      expect(draw(1.1)).toMatchObject({ rebuilt: 0, pending: 0, entities: 2 });
      // A fixed view drains the work queue and uploads the exact requested power-of-two LOD.
      for (const [index, entity] of entities.entries()) {
        const expected = buildMesh([{ entity, slot: index }], { tolerance: 0.25 / 2 });
        expect(meshes[index + 2]?.lines).toEqual(expected.lines);
        expect(meshes[index + 2]!.lines.length).toBeGreaterThan(meshes[index]!.lines.length);
      }
      renderer.regenerate(800);
      expect(draw(1.1)).toMatchObject({ rebuilt: 2, pending: 0 });
    } finally {
      now.mockRestore();
      renderer.dispose();
    }
  });
  it('changes entity color without rebuilding geometry and rebuilds an actual endpoint edit', () => {
    const fixture = createTestCanvas(),
      renderer = new WebGlRenderer(fixture.canvas);
    const state = { ...createEmptyCadState(), entities: [line] };
    const draw = () => renderer.draw({ x: 50, y: 0 }, 1, 800, 600, 0x212830);
    renderer.setDrawing(state);
    draw();
    renderer.setDrawing({ ...state, entities: [{ ...line, color: '#ff0000' }] });
    expect(draw().rebuilt).toBe(0);
    expect(renderer.pick({ x: 50, y: 0 }, 1)).toBe('a');
    renderer.setDrawing({ ...state, entities: [{ ...line, b: { x: 200, y: 0 } }] });
    expect(draw().rebuilt).toBe(1);
    expect(renderer.pick({ x: 150, y: 0 }, 1)).toBe('a');
    renderer.setDrawing({
      ...state,
      entities: [{ ...line, a: { x: 10000, y: 0 }, b: { x: 10100, y: 0 } }],
    });
    draw();
    renderer.setDrawing(state);
    expect(draw().rebuilt).toBe(1);
    expect(renderer.pick({ x: 50, y: 0 }, 1)).toBe('a');
    renderer.dispose();
  });
  it('updates layer visibility/color/locking from the current table while retaining buffers', () => {
    const fixture = createTestCanvas();
    const layers = new Map<string, DisplayLayerStyle>([
      [
        '0',
        {
          name: '0',
          color: { kind: 'aci', index: 7 },
          linetype: 'CONTINUOUS',
          lineweight: -3,
          transparency: 0,
          visible: true,
          locked: false,
        },
      ],
    ]);
    const renderer = new WebGlRenderer(fixture.canvas, { layers: () => layers });
    const draw = () => renderer.draw({ x: 50, y: 0 }, 1, 800, 600, 0x212830);
    renderer.setDrawing({ ...createEmptyCadState(), entities: [line] });
    draw();
    layers.set('0', { ...layers.get('0')!, visible: false, color: { kind: 'aci', index: 1 } });
    const hidden = draw();
    expect(hidden.rebuilt).toBe(0);
    expect(hidden.count).toBe(0);
    expect(renderer.pick({ x: 50, y: 0 }, 1)).toBeUndefined();
    layers.set('0', { ...layers.get('0')!, visible: true, locked: true });
    expect(draw().count).toBe(1);
    expect(renderer.pick({ x: 50, y: 0 }, 1)).toBeUndefined();
    renderer.dispose();
  });
  it('re-encodes a moved ByLayer entity only when the effective dash fit changes', () => {
    const layers = new Map<string, DisplayLayerStyle>(
      ['A', 'B', 'C'].map((name) => [
        name,
        {
          name,
          color: { kind: 'aci' as const, index: 7 },
          linetype: name === 'A' ? 'DASHED' : 'CENTER',
          lineweight: -3,
          transparency: 0,
          visible: true,
          locked: false,
        },
      ]),
    );
    const fixture = createTestCanvas(),
      renderer = new WebGlRenderer(fixture.canvas, { layers: () => layers });
    const state = createEmptyCadState(),
      draw = () => renderer.draw({ x: 50, y: 0 }, 1, 800, 600, 0x212830);
    renderer.setDrawing({ ...state, entities: [{ ...line, layer: 'A', linetype: 'BYLAYER' }] });
    draw();
    renderer.setDrawing({ ...state, entities: [{ ...line, layer: 'B', linetype: 'BYLAYER' }] });
    expect(draw().rebuilt).toBe(1);
    renderer.setDrawing({ ...state, entities: [{ ...line, layer: 'C', linetype: 'BYLAYER' }] });
    expect(draw().rebuilt).toBe(0);
    renderer.setDrawing({ ...state, entities: [{ ...line, layer: 'A', linetype: 'CONTINUOUS' }] });
    draw();
    renderer.setDrawing({ ...state, entities: [{ ...line, layer: 'B', linetype: 'CONTINUOUS' }] });
    expect(draw().rebuilt).toBe(0);
    renderer.dispose();
  });
  it('retains viewport-edge wide strokes across frames for opaque and transparent entities', () => {
    for (const transparency of [0, 50]) {
      const fixture = createTestCanvas(),
        renderer = new WebGlRenderer(fixture.canvas, {
          variable: (name) => (name === 'LWDISPLAY' ? true : undefined),
        });
      renderer.setDrawing({
        ...createEmptyCadState(),
        entities: [
          { ...line, a: { x: 0, y: -101 }, b: { x: 100, y: -101 }, lineweight: 211, transparency },
        ],
      });
      const draw = () => renderer.draw({ x: 50, y: 0 }, 1, 200, 200, 0x212830);
      expect(draw().entities).toBe(1);
      expect(draw().entities).toBe(1);
      renderer.dispose();
    }
  });
  it('rebuilds clipped straight buffers after a centered zoom or resolved width change', () => {
    const fixture = createTestCanvas();
    let displayWeights = false;
    const renderer = new WebGlRenderer(fixture.canvas, {
      variable: (name) => (name === 'LWDISPLAY' ? displayWeights : undefined),
    });
    renderer.setDrawing({
      ...createEmptyCadState(),
      entities: [{ ...line, a: { x: -1e8, y: 0 }, b: { x: 1e8, y: 0 }, lineweight: 211 }],
    });
    renderer.draw({ x: 0, y: 0 }, 4, 800, 600, 0x212830);
    expect(renderer.draw({ x: 0, y: 0 }, 1, 800, 600, 0x212830).rebuilt).toBe(1);
    expect(renderer.draw({ x: 0, y: 0 }, 1, 800, 600, 0x212830).rebuilt).toBe(0);
    displayWeights = true;
    expect(renderer.draw({ x: 0, y: 0 }, 1, 800, 600, 0x212830).rebuilt).toBe(1);
    renderer.dispose();
  });
});
