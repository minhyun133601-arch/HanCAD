import { describe, expect, it, vi } from 'vitest';
import { createTestCanvas } from '../../legacy-bridge/src/test-canvas';
import { CadPointerController } from './pointer-controller';
import type { CadView } from './pointer-controller';

describe('realtime command pointer navigation', () => {
  it('pans with the left button, zooms about view center, and hides crosshair on leave', () => {
    const fixture = createTestCanvas();
    let view: CadView = { scale: 1, tx: 0, ty: 0 },
      mode: 'pan' | 'zoom' = 'pan';
    const navigate = vi.fn(),
      cursor = vi.fn(),
      pick = vi.fn();
    const pointer = new CadPointerController(
      fixture.canvas,
      { getNavigationMode: () => mode, onNavigate: navigate },
      {
        view: () => view,
        viewport: () => ({ x: 800, y: 600 }),
        changeView: (next) => {
          view = next;
        },
        worldPoint: (point) => point,
        pick,
        coordinates: vi.fn(),
        fit: vi.fn(),
        invalidate: vi.fn(),
        worldView: () => ({
          center: { x: -view.tx / view.scale, y: -view.ty / view.scale },
          height: 600 / view.scale,
        }),
        cursorLocal: cursor,
      },
    );
    const event = (x: number, y: number, buttons = 1) => ({
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
      buttons,
      preventDefault: vi.fn(),
    });
    fixture.fire('pointerdown', event(400, 300));
    fixture.fire('pointermove', event(430, 320));
    fixture.fire('pointerup', event(430, 320, 0));
    expect(view).toEqual({ scale: 1, tx: 30, ty: 20 });
    expect(navigate.mock.lastCall?.[0]).toBe('pan');
    expect(pick).not.toHaveBeenCalled();
    mode = 'zoom';
    fixture.fire('pointerdown', event(400, 300));
    fixture.fire('pointermove', event(400, 0));
    fixture.fire('pointerup', event(400, 0, 0));
    expect(view).toEqual({ scale: 2, tx: 60, ty: 40 });
    expect(navigate.mock.lastCall?.[0]).toBe('zoom');
    fixture.fire('pointerleave', {});
    expect(cursor.mock.lastCall).toEqual([]);
    fixture.fire('pointermove', event(850, 100, 0));
    expect(cursor.mock.lastCall).toEqual([undefined]);
    pointer.dispose();
  });
});
