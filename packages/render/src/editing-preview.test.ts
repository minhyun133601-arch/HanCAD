import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { createTestCanvas } from '../../legacy-bridge/src/test-canvas';
import { CadCanvasSurface } from './surface';
import type { CadSelectionDrag } from './surface';

class TestPath {
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  closePath(): void {}
}
const pointer = (x: number, y: number, buttons = 0) => ({
  button: 0,
  clientX: x,
  clientY: y,
  pointerId: 1,
  buttons,
  shiftKey: false,
  ctrlKey: false,
  preventDefault: vi.fn(),
});
function line(id: string, y: number): CadEntity {
  return {
    id,
    type: 'line',
    a: { x: 0, y },
    b: { x: 100, y },
    layer: '0',
    color: '#ffffff',
    lineWidth: 1,
  };
}
beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

describe('editing preview integration', () => {
  it('captures a freehand fence path with no filled selection rectangle and clears cancellation', () => {
    const fixture = createTestCanvas(),
      events: CadSelectionDrag[] = [];
    let gesture: 'area' | 'fence' = 'fence';
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      canSelectArea: () => true,
      selectionGesture: () => gesture,
      onSelectionDrag: (event) => events.push(event),
    });
    surface.setDrawing(createEmptyCadState());
    fixture.operations.length = 0;
    fixture.fire('pointerdown', pointer(100, 100, 1));
    fixture.fire('pointermove', pointer(140, 120, 1));
    gesture = 'area';
    fixture.fire('pointermove', pointer(180, 160, 1));
    expect(fixture.canvas.dataset.selectionArea).toBe('fence');
    expect(events.at(-1)).toMatchObject({ phase: 'move', gesture: 'fence' });
    expect(events.at(-1)?.points).toHaveLength(3);
    expect(
      events.at(-1)?.points?.map((point) => {
        const projected = surface.worldToScreen(point);
        return { x: Math.round(projected.x), y: Math.round(projected.y) };
      }),
    ).toEqual([
      { x: 100, y: 100 },
      { x: 140, y: 120 },
      { x: 180, y: 160 },
    ]);
    expect(fixture.operations.some((op) => op.name === 'strokeRect')).toBe(false);
    expect(
      fixture.operations.some(
        (op) => op.name === 'set:fillStyle' && String(op.args[0]).startsWith('rgba'),
      ),
    ).toBe(false);
    expect(
      fixture.operations.some(
        (op) => op.name === 'setLineDash' && Array.isArray(op.args[0]) && op.args[0].length === 2,
      ),
    ).toBe(true);
    fixture.fire('pointerup', pointer(190, 170));
    expect(events.at(-1)).toMatchObject({ phase: 'end', gesture: 'fence' });
    expect(events.at(-1)?.points).toHaveLength(4);
    expect(fixture.canvas.dataset.selectionArea).toBe('');
    gesture = 'fence';
    fixture.fire('pointerdown', pointer(200, 100, 1));
    fixture.fire('pointermove', pointer(250, 150, 1));
    surface.cancelPointerInteraction();
    expect(events.at(-1)).toMatchObject({ phase: 'cancel', gesture: 'fence' });
    expect(fixture.canvas.dataset.selectionArea).toBe('');
    surface.dispose();
  });

  it('hides batched and direct originals during previews while retaining geometric hit testing', () => {
    vi.stubGlobal('Path2D', TestPath);
    const state = createEmptyCadState();
    state.entities = [
      line('a', 0),
      line('b', 20),
      {
        id: 'text',
        type: 'text',
        point: { x: 50, y: 50 },
        text: '한글',
        textSize: 5,
        rotation: 0,
        layer: '0',
        color: '#ffffff',
        lineWidth: 1,
      },
    ];
    const original = structuredClone(state);
    const fixture = createTestCanvas();
    const surface = new CadCanvasSurface(fixture.canvas, { observeResize: false });
    surface.setDrawing(state);
    expect(fixture.canvas.dataset.drawnEntities).toBe('3');
    surface.setPreviewHiddenIds(['a', 'text']);
    expect(fixture.canvas.dataset.drawnEntities).toBe('1');
    expect(fixture.canvas.dataset.previewHiddenCount).toBe('2');
    expect(surface.pick({ x: 50, y: 0 })).toBe('a');
    const frame = fixture.canvas.dataset.frame;
    surface.setPreviewHiddenIds(['text', 'a']);
    expect(fixture.canvas.dataset.frame).toBe(frame);
    surface.setPreviewHiddenIds(['a', 'b', 'text']);
    expect(fixture.canvas.dataset.drawnEntities).toBe('0');
    surface.setPreviewHiddenIds([]);
    expect(fixture.canvas.dataset.drawnEntities).toBe('3');
    expect(state).toEqual(original);
    surface.dispose();
  });

  it('maps model points to canvas-local CSS pixels after cursor zoom and captured pan', () => {
    const fixture = createTestCanvas(),
      points: CadPoint[] = [];
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      onCoordinates: (point) => points.push(point),
    });
    surface.setDrawing(createEmptyCadState());
    fixture.fire('wheel', { ...pointer(620, 170), deltaY: -100 });
    fixture.fire('pointerdown', { ...pointer(400, 300), button: 1 });
    fixture.fire('pointermove', { ...pointer(440, 330), buttons: 4 });
    fixture.fire('pointerup', { ...pointer(440, 330), button: 1 });
    fixture.fire('pointermove', pointer(620, 170));
    const projected = surface.worldToScreen(points.at(-1)!);
    expect(projected.x).toBeCloseTo(620);
    expect(projected.y).toBeCloseTo(170);
    surface.dispose();
  });
});
