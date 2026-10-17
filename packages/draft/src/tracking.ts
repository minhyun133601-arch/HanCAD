import type { CadPoint } from '@hancad/legacy-bridge';
import {
  directionVector,
  heading,
  nearestPolarAngle,
  projectDirection,
  type DraftingConstraintSettings,
} from './drafting-constraints';

export interface TrackingPoint {
  point: CadPoint;
  id: string;
}
export interface TrackingPath {
  from: CadPoint;
  to: CadPoint;
  angle: number;
  kind: 'object' | 'polar' | 'extension' | 'parallel';
  points?: readonly CadPoint[];
}
export interface TrackingResult {
  point: CadPoint;
  paths: TrackingPath[];
  base: CadPoint;
  intersection: boolean;
}
interface NearPath {
  point: CadPoint;
  from: CadPoint;
  angle: number;
  distance: number;
}
const distance = (a: CadPoint, b: CadPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Per-command acquisition, independent of rendering and wall-clock APIs. */
export class ObjectTracking {
  private points: TrackingPoint[] = [];
  private hover: { id: string; since: number; done: boolean } | undefined;
  constructor(readonly dwellMilliseconds = 400) {}
  get acquired(): readonly TrackingPoint[] {
    return this.points;
  }
  clear(): void {
    this.points = [];
    this.hover = undefined;
  }
  acquire(point: CadPoint, id = `tt:${point.x},${point.y}`): void {
    if (this.points.some((item) => distance(item.point, point) < 1e-9)) return;
    this.points = [...this.points, { id, point: { ...point } }].slice(-7);
  }
  /** Returns a remaining dwell time so a stationary pointer can acquire a point. */
  move(
    snap: TrackingPoint | undefined,
    time: number,
    enabled: boolean,
    shiftRequired: boolean,
    shift: boolean,
  ): number | undefined {
    if (!enabled || !snap || (shiftRequired && !shift)) {
      this.hover = undefined;
      return;
    }
    const id = `${snap.id}:${snap.point.x},${snap.point.y}`;
    if (this.hover?.id !== id) this.hover = { id, since: time, done: false };
    if (this.hover.done) return;
    const remaining = this.dwellMilliseconds - (time - this.hover.since);
    if (remaining > 0) return remaining;
    const existing = this.points.findIndex((item) => distance(item.point, snap.point) < 1e-9);
    if (existing >= 0) this.points = this.points.filter((_, i) => i !== existing);
    else this.acquire(snap.point, snap.id);
    this.hover.done = true;
  }
  resolve(
    cursor: CadPoint,
    tolerance: number,
    settings: DraftingConstraintSettings,
    previousAngle = 0,
  ): TrackingResult | undefined {
    const near: NearPath[] = [];
    for (const acquired of this.points) {
      const angle = heading(acquired.point, cursor);
      const directions =
        settings.polarMode & 2
          ? [nearestPolarAngle(angle, settings, previousAngle)].filter(
              (a): a is number => a !== undefined,
            )
          : [0, Math.PI / 2];
      for (const direction of directions) {
        const point = projectDirection(cursor, acquired.point, direction),
          separation = distance(point, cursor);
        if (separation <= tolerance && distance(point, acquired.point) > tolerance)
          near.push({ from: acquired.point, point, angle: direction, distance: separation });
      }
    }
    const make = (
      point: CadPoint,
      lines: readonly NearPath[],
      intersection: boolean,
    ): TrackingResult => ({
      point,
      paths: lines.map((line) => ({
        from: line.from,
        to: point,
        angle: line.angle,
        kind: 'object',
      })),
      base: lines[0]?.from ?? point,
      intersection,
    });
    let crossing: TrackingResult | undefined;
    let nearest = tolerance * Math.SQRT2;
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++) {
        const a = near[i]!,
          b = near[j]!;
        const av = directionVector(a.angle),
          bv = directionVector(b.angle);
        const det = av.x * bv.y - av.y * bv.x;
        if (Math.abs(det) < 1e-10 || distance(a.from, b.from) < 1e-9) continue;
        const dx = b.from.x - a.from.x,
          dy = b.from.y - a.from.y;
        const t = (dx * bv.y - dy * bv.x) / det;
        const point = { x: a.from.x + t * av.x, y: a.from.y + t * av.y };
        const d = distance(point, cursor);
        if (d <= nearest) {
          crossing = make(point, [a, b], true);
          nearest = d;
        }
      }
    if (crossing) return crossing;
    near.sort((a, b) => a.distance - b.distance);
    return near[0] ? make(near[0].point, [near[0]], false) : undefined;
  }
}
