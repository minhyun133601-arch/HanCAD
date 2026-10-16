import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fitWorldBounds,
  scaleWorldView,
  windowWorldView,
  PreviousViews,
  ViewTransition,
} from './view-navigation';

afterEach(() => vi.unstubAllGlobals());
describe('view navigation math and history', () => {
  const viewport = { width: 800, height: 600 };
  const limits = fitWorldBounds({ minX: 0, minY: -297, maxX: 420, maxY: 0 }, viewport);
  const current = { center: { x: 200000000, y: -450000000 }, height: 100 };
  it('fits windows in either direction and preserves large coordinate centers', () => {
    const a = { x: 200000000, y: -450000000 },
      b = { x: a.x + 40, y: a.y + 20 };
    expect(windowWorldView(a, b, viewport)).toEqual(windowWorldView(b, a, viewport));
    expect(windowWorldView(a, b, viewport)).toEqual({
      center: { x: a.x + 20, y: a.y + 10 },
      height: 30,
    });
    expect(windowWorldView(a, { ...a, x: a.x + 1 }, viewport)).toBeUndefined();
  });
  it('distinguishes absolute, current and paper space scale factors', () => {
    expect(scaleWorldView('2', current, limits)?.height).toBe(157.5);
    expect(scaleWorldView('.5x', current, limits)?.height).toBe(200);
    expect(scaleWorldView('2xp', current, limits, 297)?.height).toBe(148.5);
    expect(scaleWorldView('2xp', current, limits)).toBeUndefined();
    for (const invalid of ['0', '-2x', 'Infinity', 'x', '1xx', '2abc'])
      expect(scaleWorldView(invalid, current, limits)).toBeUndefined();
  });
  it('consumes at most ten previous views and ignores unchanged navigations', () => {
    const stack = new PreviousViews();
    stack.record(current, current);
    expect(stack.size).toBe(0);
    for (let i = 0; i < 12; i++)
      stack.record({ ...current, height: i + 1 }, { ...current, height: i + 2 });
    expect(stack.size).toBe(10);
    for (let i = 12; i >= 3; i--) expect(stack.take()?.height).toBe(i);
    expect(stack.take()).toBeUndefined();
  });
  it('animates uniformly, falls back when below VTFPS, and cancels scheduled frames', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
      frames.set(++next, frame);
      return next;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    let view = current;
    const complete = vi.fn();
    const transition = new ViewTransition(
      () => view,
      (value) => {
        view = value;
      },
    );
    transition.start(
      { ...current, height: 25 },
      { enabled: 1, duration: 1000, minimumFps: 7 },
      complete,
    );
    frames.get(1)?.(0);
    frames.get(2)?.(100);
    expect(view.height).toBeLessThan(100);
    expect(view.height).toBeGreaterThan(25);
    frames.get(3)?.(400);
    expect(view.height).toBe(25);
    expect(complete).toHaveBeenCalledOnce();
    transition.start(current, { enabled: 1, duration: 1000, minimumFps: 7 });
    transition.cancel();
    expect(frames.has(next)).toBe(false);
  });
});
