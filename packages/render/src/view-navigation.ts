import type { CadPoint } from '@hancad/legacy-bridge';
import type { CadWorldView } from './pointer-controller';

export interface ViewBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface ViewportSize {
  width: number;
  height: number;
}

export function fitWorldBounds(
  bounds: ViewBounds,
  viewport: ViewportSize,
  margin = 1,
): CadWorldView {
  const aspect = Math.max(1, viewport.width) / Math.max(1, viewport.height);
  return {
    center: {
      x: bounds.minX + (bounds.maxX - bounds.minX) / 2,
      y: bounds.minY + (bounds.maxY - bounds.minY) / 2,
    },
    height:
      Math.max(1e-6, bounds.maxY - bounds.minY, (bounds.maxX - bounds.minX) / aspect) / margin,
  };
}
export function unionViewBounds(a: ViewBounds, b?: ViewBounds): ViewBounds {
  return b
    ? {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY),
      }
    : { ...a };
}
export function windowWorldView(
  a: CadPoint,
  b: CadPoint,
  viewport: ViewportSize,
): CadWorldView | undefined {
  if (a.x === b.x || a.y === b.y) return undefined;
  return fitWorldBounds(
    {
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    },
    viewport,
  );
}
/** Bare values are relative to grid limits; X to this view; XP to the paper viewport. */
export function scaleWorldView(
  value: string,
  current: CadWorldView,
  limits: CadWorldView,
  paperHeight?: number,
): CadWorldView | undefined {
  const match = /^\s*(\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(xp|x)?\s*$/i.exec(value);
  if (!match) return undefined;
  const factor = Number(match[1]);
  if (!(factor > 0) || !Number.isFinite(factor)) return undefined;
  const suffix = match[2]?.toUpperCase();
  const reference = suffix === 'XP' ? paperHeight : suffix === 'X' ? current.height : limits.height;
  if (reference === undefined || !(reference > 0) || !Number.isFinite(reference)) return undefined;
  const height = reference / factor;
  return height > 0 && Number.isFinite(height)
    ? { center: { ...current.center }, height }
    : undefined;
}
export function sameWorldView(a: CadWorldView, b: CadWorldView): boolean {
  const tolerance = Math.max(a.height, b.height) * 1e-10;
  return (
    Math.abs(a.center.x - b.center.x) <= tolerance &&
    Math.abs(a.center.y - b.center.y) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}
/** AutoCAD restores at most ten prior views; Previous consumes, rather than toggles. */
export class PreviousViews {
  private readonly entries: CadWorldView[] = [];
  record(before: CadWorldView, after: CadWorldView): void {
    if (sameWorldView(before, after)) return;
    this.entries.push(structuredClone(before));
    if (this.entries.length > 10) this.entries.shift();
  }
  take(): CadWorldView | undefined {
    return this.entries.pop();
  }
  clear(): void {
    this.entries.length = 0;
  }
  get size(): number {
    return this.entries.length;
  }
}

export interface TransitionSettings {
  enabled: number;
  duration: number;
  minimumFps: number;
}
/** Geometric height interpolation maintains uniform apparent zoom speed. */
export class ViewTransition {
  private frame: number | undefined;
  constructor(
    private readonly read: () => CadWorldView,
    private readonly write: (view: CadWorldView) => void,
  ) {}
  cancel(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }
  start(target: CadWorldView, settings: TransitionSettings, complete: () => void = () => {}): void {
    this.cancel();
    const before = this.read();
    if (
      !(settings.enabled & 1) ||
      settings.duration <= 0 ||
      typeof requestAnimationFrame !== 'function'
    ) {
      this.write(target);
      complete();
      return;
    }
    let began: number | undefined, last: number | undefined;
    const tick = (now: number): void => {
      began ??= now;
      const slow = last !== undefined && now - last > 1000 / Math.max(1, settings.minimumFps);
      last = now;
      const progress = slow ? 1 : Math.min(1, (now - began) / settings.duration);
      const t = progress * progress * (3 - 2 * progress);
      this.write({
        center: {
          x: before.center.x + (target.center.x - before.center.x) * t,
          y: before.center.y + (target.center.y - before.center.y) * t,
        },
        height: before.height * (target.height / before.height) ** t,
      });
      if (progress < 1) this.frame = requestAnimationFrame(tick);
      else {
        this.frame = undefined;
        complete();
      }
    };
    this.frame = requestAnimationFrame(tick);
  }
}
