import { describe, expect, it, vi } from 'vitest';
import { NavigationSession } from './navigation-session';
import type { NavigationHost } from './navigation-session';
import type { CadWorldView } from '@hancad/render';

function fixture() {
  let view: CadWorldView = { center: { x: 0, y: 0 }, height: 600 };
  const applied = vi.fn((next: CadWorldView) => {
    view = next;
  });
  const host: NavigationHost = {
    view: () => view,
    viewport: () => ({ width: 800, height: 600 }),
    limits: () => ({ minX: 0, minY: -297, maxX: 420, maxY: 0 }),
    bounds: (ids) => (ids && !ids.length ? undefined : { minX: 0, minY: -20, maxX: 100, maxY: 0 }),
    selected: () => [],
    allIds: () => ['one', 'two'],
    apply: applied,
    previous: vi.fn(() => true),
    regenerate: vi.fn(),
    redraw: vi.fn(),
  };
  const print = vi.fn();
  return {
    host,
    applied,
    print,
    create: (command: 'ZOOM' | 'PAN' = 'ZOOM', line = false, transparent = false) =>
      new NavigationSession(command, host, vi.fn(), print, line, transparent),
  };
}
describe('interactive and scripted navigation', () => {
  it('supports all/extents/previous and enforces transparent All restriction', () => {
    const test = fixture();
    test.create().acceptText('A');
    expect(test.host.regenerate).toHaveBeenCalledOnce();
    expect(test.applied.mock.lastCall?.[0].height).toBeCloseTo(315 / 0.95);
    test.create().acceptText('E');
    expect(test.applied.mock.lastCall?.[0].height).toBeCloseTo(75 / 0.95);
    test.create().acceptText('P');
    expect(test.host.previous).toHaveBeenCalledOnce();
    const transparent = test.create('ZOOM', false, true);
    transparent.acceptText('A');
    expect(transparent.getSnapshot()?.stage).toBe('zoom');
    expect(test.print).toHaveBeenCalled();
  });
  it('accepts window points and center/height with WCS Y converted once', () => {
    const test = fixture();
    const window = test.create();
    window.acceptText('W');
    window.acceptText('0,0');
    window.acceptText('100,50');
    expect(test.applied.mock.lastCall?.[0]).toEqual({ center: { x: 50, y: -25 }, height: 75 });
    const center = test.create();
    center.acceptText('C');
    center.acceptText('200000000,450000000');
    center.acceptText('10');
    expect(test.applied.mock.lastCall?.[0]).toEqual({
      center: { x: 200000000, y: -450000000 },
      height: 10,
    });
    expect(center.getSnapshot()).toBeUndefined();
  });
  it('shares scale and object selection logic across queued text and mouse input', () => {
    const test = fixture();
    test.create().acceptText('2x');
    expect(test.applied.mock.lastCall?.[0].height).toBe(300);
    const objects = test.create();
    objects.acceptText('O');
    objects.acceptPoint({ x: 0, y: 0 }, 'one');
    objects.acceptText('');
    expect(test.applied.mock.lastCall?.[0].height).toBeCloseTo(75 / 0.95);
    const scale = test.create();
    scale.acceptText('S');
    scale.acceptText('2xp');
    expect(scale.getSnapshot()?.stage).toBe('scale');
    test.host.paperHeight = () => 297;
    scale.acceptText('2XP');
    expect(test.applied.mock.lastCall?.[0].height).toBe(148.5);
  });
  it('highlights object selections and waits for confirmation after All', () => {
    const test = fixture(),
      objects = test.create();
    objects.acceptText('O');
    objects.acceptText('ALL');
    expect(objects.getSnapshot()?.selectedIds).toEqual(['one', 'two']);
    expect(test.applied).not.toHaveBeenCalled();
    objects.acceptPoint({ x: 0, y: 0 }, 'two', true);
    expect(objects.getSnapshot()?.selectedIds).toEqual(['one']);
    objects.acceptText('');
    expect(test.applied).toHaveBeenCalledOnce();
  });
  it('pans through two points or an entered displacement and offers realtime modes', () => {
    const test = fixture();
    const pan = test.create('PAN', true);
    pan.acceptText('0,0');
    pan.acceptText('@20,10');
    expect(test.applied.mock.lastCall).toEqual([{ center: { x: -20, y: 10 }, height: 600 }, 'pan']);
    const displacement = test.create('PAN', true);
    displacement.acceptText('5,2');
    displacement.acceptText('');
    expect(test.applied.mock.lastCall?.[0].center).toEqual({ x: -25, y: 12 });
    expect(test.create('PAN').mode).toBe('pan');
    const realtime = test.create();
    realtime.acceptText('');
    expect(realtime.mode).toBe('zoom');
    realtime.acceptText('');
    expect(realtime.getSnapshot()).toBeUndefined();
  });
  it('moves and resizes a dynamic box then applies only on Enter', () => {
    const test = fixture(),
      dynamic = test.create();
    dynamic.acceptText('D');
    dynamic.moveCursor({ x: 20, y: -30 });
    dynamic.acceptPoint({ x: 20, y: -30 });
    dynamic.moveCursor({ x: 120, y: -30 });
    expect(dynamic.getSnapshot()?.window).toEqual({ center: { x: 20, y: -30 }, height: 150 });
    expect(test.applied).not.toHaveBeenCalled();
    dynamic.acceptText('');
    expect(test.applied).toHaveBeenCalledOnce();
  });
  it('shows a temporary dynamic overview and restores the original before acceptance or cancel', () => {
    const test = fixture(),
      original = test.host.view();
    const preview = vi.fn();
    test.host.preview = preview;
    const dynamic = test.create();
    dynamic.acceptText('D');
    expect(preview.mock.lastCall?.[0].height).toBeCloseTo(315 / 0.95);
    dynamic.moveCursor({ x: 20, y: -30 });
    dynamic.acceptText('');
    expect(preview.mock.lastCall?.[0]).toEqual(original);
    expect(test.applied.mock.lastCall?.[0].center).toEqual({ x: 20, y: -30 });
    const second = test.create(),
      beforeCancel = test.host.view();
    second.acceptText('D');
    second.cancel();
    expect(preview.mock.lastCall?.[0]).toEqual(beforeCancel);
  });
});
