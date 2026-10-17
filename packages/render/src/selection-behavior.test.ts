import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { createTestCanvas } from '../../legacy-bridge/src/test-canvas';
import { CadCanvasSurface, type CadSelectionDrag } from './surface';
import { selectionPolicy } from './selection-policy';
import { WebGlRenderer } from './webgl/renderer';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const pointer = (x: number, y: number, buttons = 0) => ({
  button: 0,
  pointerId: 1,
  clientX: x,
  clientY: y,
  buttons,
  shiftKey: false,
  ctrlKey: false,
  preventDefault: vi.fn(),
});
describe('selection gesture and retained highlight contracts', () => {
  it('combines PICKAUTO independent bits with click-only, held-button and over-object rules', () => {
    expect(selectionPolicy(5, 2, false, false)).toEqual({
      clickWindow: true,
      dragWindow: true,
      lasso: true,
    });
    expect(selectionPolicy(5, 0, false, false)).toEqual({
      clickWindow: true,
      dragWindow: false,
      lasso: false,
    });
    expect(selectionPolicy(5, 1, false, false)).toEqual({
      clickWindow: false,
      dragWindow: true,
      lasso: true,
    });
    expect(selectionPolicy(0, 2, false, true)).toEqual({
      clickWindow: false,
      dragWindow: false,
      lasso: false,
    });
    expect(selectionPolicy(7, 2, true, false).dragWindow).toBe(true);
    expect(selectionPolicy(7, 2, true, true).dragWindow).toBe(false);
  });
  it('supports click-move-click windows and cancels the unfinished second corner', () => {
    const fixture = createTestCanvas(),
      events: CadSelectionDrag[] = [];
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      canSelectArea: () => true,
      onSelectionDrag: (event) => events.push(event),
      getSystemVariable: (name) => (name === 'PICKDRAG' ? 0 : undefined),
    });
    surface.setDrawing(createEmptyCadState());
    fixture.fire('pointerdown', pointer(100, 100, 1));
    fixture.fire('pointerup', pointer(100, 100));
    fixture.fire('pointermove', pointer(200, 200));
    expect(fixture.canvas.dataset.selectionArea).toBe('window');
    fixture.fire('pointerdown', pointer(200, 200, 1));
    fixture.fire('pointerup', pointer(200, 200));
    expect(events.at(-1)?.phase).toBe('end');
    fixture.fire('pointerdown', pointer(300, 300, 1));
    fixture.fire('pointerup', pointer(300, 300));
    surface.cancelPointerInteraction();
    expect(events.at(-1)?.phase).toBe('cancel');
    expect(fixture.canvas.dataset.selectionArea).toBe('');
    surface.dispose();
  });
  it('captures a lasso path and reads the color/opacity settings without filling when disabled', () => {
    const fixture = createTestCanvas(),
      events: CadSelectionDrag[] = [];
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      canSelectArea: () => true,
      onSelectionDrag: (event) => events.push(event),
      getSystemVariable: (name) => (name === 'SELECTIONAREA' ? 0 : undefined),
    });
    surface.setDrawing(createEmptyCadState());
    fixture.operations.length = 0;
    fixture.fire('pointerdown', pointer(300, 100, 1));
    fixture.fire('pointermove', pointer(200, 100, 1));
    fixture.fire('pointermove', pointer(180, 220, 1));
    expect(fixture.canvas.dataset.selectionArea).toBe('lasso');
    fixture.fire('pointerup', pointer(320, 220));
    expect(events.at(-1)).toMatchObject({ phase: 'end', gesture: 'lasso', mode: 'crossing' });
    expect(events.at(-1)?.points).toHaveLength(4);
    expect(fixture.operations.some((operation) => operation.name === 'fill')).toBe(false);
    surface.dispose();
  });
  it('keeps plain TRIM/EXTEND target clicks distinct from held-button fence gestures', () => {
    const fixture = createTestCanvas(),
      events: CadSelectionDrag[] = [],
      picked = vi.fn();
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      canSelectArea: () => true,
      selectionGesture: () => 'fence',
      selectionCommandActive: () => true,
      onPick: picked,
      onSelectionDrag: (event) => events.push(event),
    });
    surface.setDrawing(createEmptyCadState());
    fixture.fire('pointerdown', pointer(100, 100, 1));
    fixture.fire('pointerup', pointer(100, 100));
    expect(picked).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
    expect(fixture.canvas.dataset.selectionArea).toBe('');
    fixture.fire('pointerdown', pointer(100, 100, 1));
    fixture.fire('pointermove', pointer(100, 200, 1));
    expect(fixture.canvas.dataset.selectionArea).toBe('fence');
    fixture.fire('pointerup', pointer(100, 200));
    const fence = events.at(-1)!;
    expect(fence).toMatchObject({ phase: 'end', gesture: 'fence' });
    expect(fence.points).toEqual([fence.start, fence.end]);
    expect(fence.end.x).toBe(fence.start.x);
    expect(fence.end.y).toBeGreaterThan(fence.start.y);
    expect(picked).toHaveBeenCalledTimes(1);
    surface.dispose();
  });
  it('uses indexed overlap ordering, reports locked candidates and updates only changed style texels', () => {
    const fixture = createTestCanvas(),
      renderer = new WebGlRenderer(fixture.canvas);
    const state = createEmptyCadState();
    state.layers.push({ name: 'locked', color: '#ffffff', visible: true, locked: true });
    state.entities = ['a', 'b'].map((id, i) => ({
      id,
      type: 'line',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      color: '#ffffff',
      lineWidth: 1,
      layer: i ? 'locked' : '0',
    }));
    renderer.setDrawing(state);
    renderer.draw({ x: 50, y: 0 }, 1, 800, 600, 0x212830);
    expect(renderer.pickAll({ x: 50, y: 0 }, 2, true)).toEqual(['b', 'a']);
    expect(renderer.pick({ x: 50, y: 0 }, 2)).toBe('a');
    fixture.operations.length = 0;
    renderer.setHighlight(['a']);
    expect(renderer.draw({ x: 50, y: 0 }, 1, 800, 600, 0x212830).rebuilt).toBe(0);
    expect(fixture.operations.filter((op) => op.name === 'gl:texSubImage2D')).toHaveLength(1);
    expect(fixture.operations.some((op) => op.name === 'gl:texImage2D')).toBe(false);
    renderer.dispose();
  });
});
