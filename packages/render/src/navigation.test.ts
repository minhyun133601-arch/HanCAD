import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadPoint } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { createTestCanvas } from '../../legacy-bridge/src/test-canvas';
import { CadCanvasSurface } from './surface';
import type { CadSelectionDrag } from './surface';
import { defaultAidSettings } from './drafting-aids';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const pointer = (button: number, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  button,
  clientX: x,
  clientY: y,
  pointerId: 1,
  shiftKey: false,
  ctrlKey: false,
  preventDefault: vi.fn(),
  ...extra,
});

describe('drafting view navigation and pointer gestures', () => {
  it('keeps the cursor model point fixed, reverses wheel steps and reads live wheel settings', () => {
    const fixture = createTestCanvas();
    const points: CadPoint[] = [];
    const settings = { zoomFactor: 60, zoomWheel: 0, middleButtonPan: 1 };
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      getNavigationSettings: () => settings,
      onCoordinates: (point) => points.push(point),
    });
    surface.setDrawing(createEmptyCadState());
    const initial = surface.getView();
    fixture.fire('pointermove', pointer(0, 620, 150));
    fixture.fire('wheel', { ...pointer(0, 620, 150), deltaY: -100, deltaMode: 0 });
    expect(surface.getView().scale).toBeCloseTo(initial.scale * 1.6);
    fixture.fire('pointermove', pointer(0, 620, 150));
    expect(points[1]?.x).toBeCloseTo(points[0]!.x);
    expect(points[1]?.y).toBeCloseTo(points[0]!.y);
    fixture.fire('wheel', { ...pointer(0, 620, 150), deltaY: 100, deltaMode: 0 });
    expect(surface.getView().scale).toBeCloseTo(initial.scale);
    expect(surface.getView().tx).toBeCloseTo(initial.tx);
    expect(surface.getView().ty).toBeCloseTo(initial.ty);
    settings.zoomWheel = 1;
    fixture.fire('wheel', { ...pointer(0, 620, 150), deltaY: -3, deltaMode: 1 });
    expect(surface.getView().scale).toBeCloseTo(initial.scale / 1.6);
    settings.zoomWheel = 0;
    settings.zoomFactor = 20;
    fixture.fire('wheel', { ...pointer(0, 620, 150), deltaY: -1, deltaMode: 2 });
    expect(surface.getView().scale).toBeCloseTo((initial.scale / 1.6) * 1.2);
    const beforeInvalid = surface.getView();
    fixture.fire('wheel', { ...pointer(0, 620, 150), deltaY: NaN });
    expect(surface.getView()).toEqual(beforeInvalid);
    surface.dispose();
  });

  it('pans only when enabled, tracks the captured pointer and fits on a middle double click', () => {
    const fixture = createTestCanvas();
    const settings = { zoomFactor: 60, zoomWheel: 0, middleButtonPan: 0 };
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      getNavigationSettings: () => settings,
    });
    surface.setDrawing(createEmptyCadState());
    const initial = surface.getView();
    const disabled = pointer(1, 400, 300);
    fixture.fire('pointerdown', disabled);
    fixture.fire('pointermove', pointer(1, 440, 320, { buttons: 4 }));
    expect(surface.getView()).toEqual(initial);
    expect(disabled.preventDefault).toHaveBeenCalledOnce();
    settings.middleButtonPan = 1;
    fixture.fire('pointerdown', pointer(1, 400, 300));
    fixture.fire('pointermove', pointer(1, 440, 320, { buttons: 4 }));
    fixture.fire('pointerup', pointer(1, 440, 320, { pointerId: 2 }));
    fixture.fire('pointermove', pointer(1, 450, 330, { buttons: 4 }));
    expect(surface.getView()).toMatchObject({ tx: 50, ty: 30 });
    fixture.fire('lostpointercapture', { pointerId: 1 });
    fixture.fire('pointermove', pointer(1, 500, 380, { buttons: 4 }));
    expect(surface.getView()).toMatchObject({ tx: 50, ty: 30 });
    fixture.fire('wheel', { ...pointer(0, 400, 300), deltaY: -100 });
    fixture.fire('pointerdown', pointer(1, 400, 300, { timeStamp: 1000 }));
    fixture.fire('pointerup', pointer(1, 400, 300, { timeStamp: 1010 }));
    fixture.fire('pointerdown', pointer(1, 400, 300, { timeStamp: 1200 }));
    expect(surface.getView()).toEqual(initial);
    surface.dispose();
  });

  it('distinguishes clicks from window/crossing drags and clears a cancelled rectangle', () => {
    const fixture = createTestCanvas();
    const picks = vi.fn();
    const drags: CadSelectionDrag[] = [];
    let areaEnabled = true;
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      canSelectArea: () => areaEnabled,
      onPick: picks,
      onSelectionDrag: (event) => drags.push(event),
    });
    surface.setDrawing(createEmptyCadState());
    fixture.fire('pointerdown', pointer(0, 100, 100));
    expect(picks).not.toHaveBeenCalled();
    fixture.fire('pointermove', pointer(0, 103, 100, { buttons: 1 }));
    fixture.fire('pointerup', pointer(0, 103, 100));
    expect(picks).toHaveBeenCalledOnce();
    expect(drags).toHaveLength(0);
    fixture.fire('pointerdown', pointer(0, 100, 100, { shiftKey: true }));
    fixture.fire('pointermove', pointer(0, 180, 180, { buttons: 1 }));
    expect(fixture.canvas.dataset.selectionArea).toBe('window');
    expect(drags[0]).toMatchObject({ phase: 'start', shiftKey: true, ctrlKey: false });
    fixture.fire('pointerup', pointer(0, 180, 180, { ctrlKey: true }));
    expect(drags.at(-1)).toMatchObject({ phase: 'end', ctrlKey: true });
    expect(fixture.canvas.dataset.selectionArea).toBe('');
    expect(picks).toHaveBeenCalledOnce();
    fixture.fire('pointerdown', pointer(0, 180, 180));
    fixture.fire('pointermove', pointer(0, 100, 100, { buttons: 1 }));
    expect(fixture.canvas.dataset.selectionArea).toBe('crossing');
    expect(
      fixture.operations.some(
        (op) => op.name === 'setLineDash' && Array.isArray(op.args[0]) && op.args[0].length === 2,
      ),
    ).toBe(true);
    fixture.fire('pointercancel', { pointerId: 1 });
    expect(drags.at(-1)?.phase).toBe('cancel');
    expect(fixture.canvas.dataset.selectionArea).toBe('');
    fixture.fire('pointerup', pointer(0, 100, 100));
    expect(picks).toHaveBeenCalledOnce();
    areaEnabled = false;
    fixture.fire('pointerdown', pointer(0, 100, 100));
    expect(picks).toHaveBeenCalledTimes(2);
    surface.dispose();
  });

  it('can report object dragging without drawing a selection box and cancel it explicitly', () => {
    const fixture = createTestCanvas();
    const drags = vi.fn();
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      canSelectArea: () => true,
      suppressSelectionBox: () => true,
      onSelectionDrag: drags,
    });
    surface.setDrawing(createEmptyCadState());
    fixture.fire('pointerdown', pointer(0, 100, 100));
    fixture.fire('pointermove', pointer(0, 180, 180, { buttons: 1, ctrlKey: true }));
    expect(drags).toHaveBeenCalledWith(expect.objectContaining({ phase: 'start', ctrlKey: true }));
    expect(fixture.canvas.dataset.selectionArea).toBe('');
    surface.cancelPointerInteraction();
    expect(drags).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'cancel' }));
    fixture.fire('pointerdown', pointer(0, 100, 100, { shiftKey: true }));
    fixture.fire('pointermove', pointer(0, 180, 180, { buttons: 1, shiftKey: true }));
    expect(fixture.canvas.dataset.selectionArea).toBe('window');
    expect(drags).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'start', shiftKey: true }),
    );
    surface.dispose();
  });

  it('cancels captured dragging on Escape and window blur and removes document listeners', () => {
    const fixture = createTestCanvas();
    const documentHandlers = new Map<string, (event: KeyboardEvent) => void>();
    const windowHandlers = new Map<string, () => void>();
    const createElement = fixture.canvas.ownerDocument.createElement;
    Object.defineProperty(fixture.canvas, 'ownerDocument', {
      value: {
        createElement,
        addEventListener: (name: string, handler: (event: KeyboardEvent) => void) =>
          documentHandlers.set(name, handler),
        removeEventListener: (name: string) => documentHandlers.delete(name),
        defaultView: {
          addEventListener: (name: string, handler: () => void) =>
            windowHandlers.set(name, handler),
          removeEventListener: (name: string) => windowHandlers.delete(name),
        },
      },
    });
    const drag = vi.fn();
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      canSelectArea: () => true,
      onSelectionDrag: drag,
    });
    surface.setDrawing(createEmptyCadState());
    fixture.fire('pointerdown', pointer(0, 100, 100));
    fixture.fire('pointermove', pointer(0, 180, 180, { buttons: 1 }));
    const escape = { code: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    documentHandlers.get('keydown')?.(escape as unknown as KeyboardEvent);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(escape.stopPropagation).toHaveBeenCalledOnce();
    expect(drag).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'cancel', reason: 'escape' }),
    );
    expect(fixture.canvas.dataset.selectionArea).toBe('');
    documentHandlers.get('keydown')?.(escape as unknown as KeyboardEvent);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(escape.stopPropagation).toHaveBeenCalledOnce();
    fixture.fire('pointerdown', pointer(0, 100, 100));
    fixture.fire('pointermove', pointer(0, 180, 180, { buttons: 1 }));
    windowHandlers.get('blur')?.();
    expect(drag).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'cancel' }));
    expect(fixture.canvas.dataset.selectionArea).toBe('');
    surface.dispose();
    expect(documentHandlers.size).toBe(0);
    expect(windowHandlers.size).toBe(0);
  });

  it('changes snap symbols and Korean tooltips at one point and honors hidden marker display', () => {
    const fixture = createTestCanvas();
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      getAidSettings: () => ({ ...defaultAidSettings, gridMode: 0, ucsIcon: 0 }),
    });
    surface.setDrawing(createEmptyCadState());
    const point = { x: 50, y: -50 };
    surface.setSnapMarker(point, 'endpoint', '끝점');
    expect(fixture.canvas.dataset.snapKind).toBe('endpoint');
    expect(fixture.operations.some((op) => op.name === 'rect')).toBe(true);
    expect(fixture.operations.some((op) => op.name === 'fillText' && op.args[0] === '끝점')).toBe(
      true,
    );
    surface.setSnapMarker(point, 'midpoint', '중간점');
    expect(fixture.canvas.dataset.snapKind).toBe('midpoint');
    expect(fixture.operations.some((op) => op.name === 'closePath')).toBe(true);
    const strokes = fixture.operations.filter((op) => op.name === 'stroke').length;
    surface.setSnapMarker(point, 'center', '중심', false);
    expect(fixture.canvas.dataset.snapKind).toBe('center');
    expect(fixture.operations.filter((op) => op.name === 'stroke')).toHaveLength(strokes);
    expect(fixture.operations.some((op) => op.name === 'fillText' && op.args[0] === '중심')).toBe(
      true,
    );
    surface.setSnapMarker();
    expect(fixture.canvas.dataset.snapActive).toBe('0');
    expect(fixture.canvas.dataset.snapKind).toBe('');
    surface.dispose();
  });
});
