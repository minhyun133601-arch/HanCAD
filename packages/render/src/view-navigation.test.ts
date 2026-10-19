import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fitWorldBounds,
  scaleWorldView,
  windowWorldView,
  PreviousViews,
  ViewTransition,
} from './view-navigation';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
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

describe('view animation deadline', () => {
  function animation() {
    vi.useFakeTimers();
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
      frames.set(++next, frame);
      return next;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const original = { center: { x: 0, y: 0 }, height: 100 };
    let view = original;
    const complete = vi.fn();
    const transition = new ViewTransition(
      () => view,
      (value) => {
        view = value;
      },
    );
    function frame(now: number): void {
      const entry = frames.entries().next().value;
      if (!entry) throw new Error('Expected a pending animation frame.');
      frames.delete(entry[0]);
      entry[1](now);
    }
    return { transition, frames, frame, original, complete, view: () => view };
  }
  const settings = { enabled: 1, duration: 750, minimumFps: 7 };
  const target = { center: { x: 50, y: -20 }, height: 25 };

  it('finishes at the wall-clock deadline when no animation frame arrives', () => {
    const test = animation();
    test.transition.start(target, settings, test.complete);
    const staleFrame = [...test.frames.values()][0]!;
    vi.advanceTimersByTime(749);
    expect(test.view()).toEqual(test.original);
    expect(test.complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(test.view()).toEqual(target);
    expect(test.complete).toHaveBeenCalledOnce();
    expect(test.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    staleFrame(1000);
    expect(test.complete).toHaveBeenCalledOnce();
    expect(test.frames.size).toBe(0);
  });

  it('clears the deadline after ordinary RAF completion instead of completing twice', () => {
    const test = animation();
    test.transition.start(target, settings, test.complete);
    test.frame(0);
    test.frame(100);
    expect(test.view().height).toBeLessThan(100);
    expect(test.view().height).toBeGreaterThan(25);
    test.frame(750);
    expect(test.view()).toEqual(target);
    expect(test.complete).toHaveBeenCalledOnce();
    expect(test.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1500);
    expect(test.complete).toHaveBeenCalledOnce();
  });

  it('cancels both queued frames and the deadline without applying a cancelled target', () => {
    const test = animation();
    test.transition.start(target, settings, test.complete);
    const staleFrame = [...test.frames.values()][0]!;
    test.transition.cancel();
    vi.advanceTimersByTime(1500);
    staleFrame(1500);
    expect(test.view()).toEqual(test.original);
    expect(test.complete).not.toHaveBeenCalled();
    expect(test.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts with an independent deadline and ignores the earlier transition generation', () => {
    const test = animation(),
      firstComplete = vi.fn();
    test.transition.start(target, settings, firstComplete);
    const staleFrame = [...test.frames.values()][0]!;
    vi.advanceTimersByTime(500);
    const replacement = { center: { x: -40, y: 60 }, height: 200 };
    test.transition.start(replacement, settings, test.complete);
    staleFrame(800);
    vi.advanceTimersByTime(250);
    expect(test.view()).toEqual(test.original);
    expect(firstComplete).not.toHaveBeenCalled();
    expect(test.complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(test.view()).toEqual(replacement);
    expect(firstComplete).not.toHaveBeenCalled();
    expect(test.complete).toHaveBeenCalledOnce();
    expect(test.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
