import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCadFile } from '@hancad/legacy-bridge';
import { createTestRuntime, fixtureDxf } from '../../legacy-bridge/src/test-runtime';
import { createTestCanvas } from '../../legacy-bridge/src/test-canvas';
import { CadCanvasSurface } from './index';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

describe('imperative imported drawing surface', () => {
  it('fits and draws actual line/circle/Korean text, zooms at cursor and pans with the middle button', async () => {
    const { state } = await readCadFile(new File([fixtureDxf()], 'test.dxf'));
    const fixture = createTestCanvas();
    const coordinates: { x: number; y: number }[] = [];
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      onCoordinates: (point) => coordinates.push(point),
    });
    surface.setDrawing(state);
    expect(fixture.canvas.dataset.entityCount).toBe('3');
    expect(fixture.operations.some((operation) => operation.name === 'lineTo')).toBe(true);
    expect(fixture.operations.some((operation) => operation.name === 'arc')).toBe(true);
    expect(
      fixture.operations.some(
        (operation) => operation.name === 'fillText' && operation.args[0] === '한글 검사 도면',
      ),
    ).toBe(true);
    const previousScale = surface.getView().scale;
    fixture.fire('wheel', { deltaY: -100, clientX: 400, clientY: 300, preventDefault: () => {} });
    expect(surface.getView().scale).toBeGreaterThan(previousScale);
    fixture.fire('pointerdown', {
      button: 1,
      clientX: 400,
      clientY: 300,
      pointerId: 1,
      preventDefault: () => {},
    });
    fixture.fire('pointermove', { clientX: 440, clientY: 320 });
    expect(surface.getView()).toMatchObject({ tx: 40, ty: 20 });
    expect(coordinates).toHaveLength(1);
    surface.dispose();
    const scale = surface.getView().scale;
    fixture.fire('wheel', { deltaY: -100, clientX: 400, clientY: 300, preventDefault: () => {} });
    expect(surface.getView().scale).toBe(scale);
  });

  it('preserves the current view for edits and renders previews, selection and geometric picks', async () => {
    const { state } = await readCadFile(new File([fixtureDxf()], 'test.dxf'));
    const fixture = createTestCanvas();
    const picks: { point: { x: number; y: number }; entityId?: string; shiftKey: boolean }[] = [];
    const surface = new CadCanvasSurface(fixture.canvas, {
      observeResize: false,
      onPick: (pick) => picks.push(pick),
    });
    surface.setDrawing(state);
    expect(surface.pick({ x: 50, y: -25 })).toBe('import-1');
    surface.setSelection(['import-1']);
    expect(fixture.canvas.dataset.selectionCount).toBe('1');
    expect(
      fixture.operations.some(
        (operation) => operation.name === 'set:strokeStyle' && operation.args[0] === '#38bdf8',
      ),
    ).toBe(true);
    surface.setPreview([state.entities[0]].filter((entity) => entity !== undefined));
    expect(fixture.canvas.dataset.previewCount).toBe('1');
    const view = surface.getView();
    surface.setDrawing({ ...state, entities: [...state.entities] }, { fit: false });
    expect(surface.getView()).toEqual(view);
    fixture.fire('pointerdown', {
      button: 0,
      clientX: 400,
      clientY: 300,
      shiftKey: true,
      preventDefault: () => {},
    });
    expect(picks).toHaveLength(1);
    expect(picks[0]?.shiftKey).toBe(true);
    surface.setDrawing(
      { ...state, layers: state.layers.map((layer) => ({ ...layer, locked: true })) },
      { fit: false },
    );
    expect(surface.pick({ x: 50, y: -25 })).toBeUndefined();
    surface.dispose();
  });
});
