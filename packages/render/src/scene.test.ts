import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { createTestCanvas } from '../../legacy-bridge/src/test-canvas';
import { RetainedScene } from './scene';
import { CadCanvasSurface } from './surface';

class TestPath {
  readonly operations: { name: string; args: number[] }[] = [];
  moveTo(...args: number[]): void {
    this.operations.push({ name: 'moveTo', args });
  }
  lineTo(...args: number[]): void {
    this.operations.push({ name: 'lineTo', args });
  }
  arc(...args: number[]): void {
    this.operations.push({ name: 'arc', args });
  }
  closePath(): void {
    this.operations.push({ name: 'closePath', args: [] });
  }
}
const line = (id: string, x: number, color = '#ffffff', layer = '0'): CadEntity => ({
  id,
  type: 'line',
  a: { x, y: 0 },
  b: { x: x + 1, y: 1 },
  color,
  lineWidth: 1.5,
  layer,
});
function drawing(entities: CadEntity[]): LegacyCadState {
  return { ...createEmptyCadState(), entities };
}
beforeEach(() => {
  vi.stubGlobal('HeechangTool', createTestRuntime());
  vi.stubGlobal('Path2D', TestPath);
});
afterEach(() => vi.unstubAllGlobals());

describe('retained ordered scene rendering', () => {
  it('draws attached static geometry directly and keeps previews on a transparent overlay', () => {
    const fixture = createTestCanvas(),
      overlay = createTestCanvas();
    const append = vi.fn(),
      remove = vi.fn();
    Object.assign(overlay.canvas, { style: { cssText: '' }, setAttribute: vi.fn(), remove });
    Object.defineProperty(fixture.canvas, 'ownerDocument', {
      value: { createElement: () => overlay.canvas },
    });
    Object.defineProperty(fixture.canvas, 'parentElement', { value: { append } });
    const surface = new CadCanvasSurface(fixture.canvas, { observeResize: false });
    surface.setDrawing(drawing([line('a', 0), line('b', 3)]));
    const strokes = fixture.operations.filter((op) => op.name === 'stroke').length;
    surface.setPreview([line('preview', 2)]);
    surface.setSnapMarker({ x: 1, y: 1 });
    expect(fixture.operations.filter((op) => op.name === 'stroke')).toHaveLength(strokes);
    expect(fixture.operations.some((op) => op.name === 'drawImage')).toBe(false);
    expect(overlay.operations.some((op) => op.name === 'lineTo')).toBe(true);
    expect(fixture.canvas.dataset.geometryMs).toBe('0');
    expect(append).toHaveBeenCalledWith(overlay.canvas);
    surface.dispose();
    expect(remove).toHaveBeenCalledOnce();
  });
  it('batches adjacent equal styles, preserves painter order, hidden layers and selected colors', () => {
    const state = drawing([
      line('a', 0, '#ff0000'),
      line('b', 2, '#ff0000'),
      line('c', 4, '#0000ff'),
      {
        id: 'text',
        type: 'text',
        point: { x: 5, y: 5 },
        text: '한글',
        textSize: 2,
        rotation: 0,
        color: '#ffffff',
        layer: '0',
        lineWidth: 1,
      },
      line('d', 6, '#ff0000'),
      line('hidden', 8, '#00ff00', 'hidden'),
    ]);
    state.layers.push({ name: 'hidden', visible: false, locked: false, color: '#00ff00' });
    const scene = new RetainedScene(state),
      fixture = createTestCanvas();
    const result = scene.draw(
      fixture.canvas.getContext('2d')!,
      { minX: -10, minY: -10, maxX: 20, maxY: 20 },
      1,
      new Set(),
    );
    expect(result).toEqual({ entities: 5, calls: 4 });
    expect(
      fixture.operations.filter((op) => op.name === 'set:strokeStyle').map((op) => op.args[0]),
    ).toEqual(['#ff0000', '#0000ff', '#ffffff', '#ff0000']);
    const strokes = fixture.operations.filter((op) => op.name === 'stroke');
    expect(
      (strokes[0]?.args[0] as TestPath).operations.filter((op) => op.name === 'moveTo'),
    ).toHaveLength(2);
    scene.draw(
      fixture.canvas.getContext('2d')!,
      { minX: -10, minY: -10, maxX: 20, maxY: 20 },
      1,
      new Set(['a']),
    );
    expect(
      fixture.operations.some((op) => op.name === 'set:strokeStyle' && op.args[0] === '#38bdf8'),
    ).toBe(true);
    expect(scene.pick({ x: 8.5, y: 0.5 }, 0.1)).toBeUndefined();
  });

  it('culls distant geometry while retaining strokes at the viewport edge and uses floating origins', () => {
    const near = line('edge', 10);
    near.lineWidth = 4;
    const large = line('large', 200000000.25);
    const state = drawing([near, line('far', 10000, '#00ff00'), large]);
    const scene = new RetainedScene(state),
      fixture = createTestCanvas();
    expect(
      scene.draw(
        fixture.canvas.getContext('2d')!,
        { minX: 0, minY: 0, maxX: 9, maxY: 9 },
        1,
        new Set(),
      ),
    ).toEqual({ entities: 1, calls: 1 });
    scene.draw(
      fixture.canvas.getContext('2d')!,
      { minX: 200000000, minY: -2, maxX: 200000003, maxY: 2 },
      1,
      new Set(),
    );
    const paths = fixture.operations
      .filter((op) => op.name === 'stroke')
      .map((op) => op.args[0] as TestPath);
    expect(paths.at(-1)?.operations[0]?.args).toEqual([-0.5, -0.5]);
    expect(scene.pick({ x: 200000000.75, y: 0.5 }, 0.05)).toBe('large');
    state.layers[0]!.locked = true;
    expect(new RetainedScene(state).pick({ x: 200000000.75, y: 0.5 }, 0.05)).toBeUndefined();
  });

  it('reuses the base bitmap during previews and snap marker motion', () => {
    const fixture = createTestCanvas(),
      base = createTestCanvas();
    Object.defineProperty(fixture.canvas, 'ownerDocument', {
      value: { createElement: () => base.canvas },
    });
    const surface = new CadCanvasSurface(fixture.canvas, { observeResize: false });
    const state = drawing([line('a', 0), line('b', 3)]);
    surface.setDrawing(state);
    const strokes = base.operations.filter((op) => op.name === 'stroke').length;
    surface.setPreview([line('preview', 2)]);
    surface.setSnapMarker({ x: 1, y: 1 });
    surface.setSnapMarker({ x: 2, y: 2 });
    expect(base.operations.filter((op) => op.name === 'stroke')).toHaveLength(strokes);
    expect(fixture.operations.filter((op) => op.name === 'drawImage').length).toBeGreaterThan(3);
    surface.setSelection(['a']);
    expect(base.operations.filter((op) => op.name === 'stroke').length).toBeGreaterThan(strokes);
    surface.dispose();
  });

  it('coalesces wheel and middle-pan events into one frame and cancels it on disposal', () => {
    let id = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.set(++id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (key: number) => callbacks.delete(key));
    const fixture = createTestCanvas(),
      surface = new CadCanvasSurface(fixture.canvas, { observeResize: false });
    surface.setDrawing(drawing([line('a', 0)]));
    const initial = fixture.canvas.dataset.frame;
    fixture.fire('wheel', { deltaY: -100, clientX: 400, clientY: 300, preventDefault: () => {} });
    fixture.fire('wheel', { deltaY: -100, clientX: 400, clientY: 300, preventDefault: () => {} });
    fixture.fire('pointerdown', {
      button: 1,
      clientX: 400,
      clientY: 300,
      pointerId: 1,
      preventDefault: () => {},
    });
    fixture.fire('pointermove', { clientX: 440, clientY: 320 });
    expect(callbacks.size).toBe(1);
    expect(fixture.canvas.dataset.frame).toBe(initial);
    const callback = [...callbacks.values()][0]!;
    callbacks.clear();
    callback(0);
    expect(Number(fixture.canvas.dataset.frame)).toBe(Number(initial) + 1);
    expect(surface.getView()).toMatchObject({ tx: 40, ty: 20 });
    fixture.fire('wheel', { deltaY: -100, clientX: 400, clientY: 300, preventDefault: () => {} });
    surface.dispose();
    expect(callbacks.size).toBe(0);
  });
});
