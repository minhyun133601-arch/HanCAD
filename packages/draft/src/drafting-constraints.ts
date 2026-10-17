import { isoplaneAngles, snapGridPoint, type DraftingGrid } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';

export interface DraftingConstraintSettings {
  ortho: boolean;
  snap: boolean;
  grid: DraftingGrid;
  polar: boolean;
  /** POLARANG and POLARADDANG use degrees; ANGBASE/SNAPANG use radians. */
  polarIncrement: number;
  polarAdditional: readonly number[];
  polarMode: number;
  angleBase: number;
  clockwise: boolean;
  polarSnap: boolean;
  polarDistance: number;
}
export interface DraftingConstraint {
  point: CadPoint;
  kind?: 'ortho' | 'polar' | 'grid';
  base?: CadPoint;
  angle?: number;
}
export const heading = (a: CadPoint, b: CadPoint): number => Math.atan2(a.y - b.y, b.x - a.x);
export const normalizeHeading = (angle: number): number =>
  ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

export function directionVector(angle: number): CadPoint {
  const exact = (value: number): number =>
    Math.abs(value) < 1e-14 ? 0 : Math.abs(1 - Math.abs(value)) < 1e-14 ? Math.sign(value) : value;
  return { x: exact(Math.cos(angle)), y: exact(-Math.sin(angle)) };
}

export function projectDirection(point: CadPoint, base: CadPoint, angle: number): CadPoint {
  const { x, y } = directionVector(angle);
  const along = (point.x - base.x) * x + (point.y - base.y) * y;
  return { x: base.x + along * x, y: base.y + along * y };
}

export function polarAngles(settings: DraftingConstraintSettings, previousAngle = 0): number[] {
  const increment = (Math.abs(settings.polarIncrement) * Math.PI) / 180;
  const origin = settings.angleBase + (settings.polarMode & 1 ? previousAngle : 0);
  const sign = settings.clockwise ? -1 : 1;
  const angles: number[] = [];
  if (increment > 1e-9) {
    // No unbounded enumeration for very small, valid increments: resolve near the
    // cursor with nearestPolarAngle; these values describe acquired Otrack axes.
    const count = Math.min(720, Math.ceil((2 * Math.PI) / increment));
    for (let i = 0; i < count; i++) angles.push(normalizeHeading(origin + sign * i * increment));
  }
  if (settings.polarMode & 4)
    for (const degrees of settings.polarAdditional)
      angles.push(normalizeHeading(settings.angleBase + (sign * degrees * Math.PI) / 180));
  return angles;
}

export function nearestPolarAngle(
  angle: number,
  settings: DraftingConstraintSettings,
  previousAngle = 0,
): number | undefined {
  const origin = settings.angleBase + (settings.polarMode & 1 ? previousAngle : 0);
  const direction = settings.clockwise ? -1 : 1;
  const step = (Math.abs(settings.polarIncrement) * Math.PI) / 180;
  const candidates: number[] = [];
  if (step > 1e-9) {
    const relative = normalizeHeading(direction * (angle - origin));
    candidates.push(origin + direction * Math.round(relative / step) * step);
  }
  if (settings.polarMode & 4)
    for (const value of settings.polarAdditional)
      candidates.push(settings.angleBase + (direction * value * Math.PI) / 180);
  return candidates.sort((a, b) => angularDistance(a, angle) - angularDistance(b, angle))[0];
}
export function angularDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/** Exact object snaps are resolved before this pure mouse-position constraint. */
export function constrainDraftingPoint(
  point: CadPoint,
  base: CadPoint | undefined,
  previous: CadPoint | undefined,
  tolerance: number,
  settings: DraftingConstraintSettings,
): DraftingConstraint {
  if (base) {
    const angle = heading(base, point);
    if (settings.ortho) {
      const axes = settings.grid.isometric
        ? isoplaneAngles(settings.grid.isoplane)
        : [0, Math.PI / 2];
      const candidates = axes.map((a) => a + settings.grid.angle);
      const chosen =
        candidates.sort(
          (a, b) => Math.abs(Math.sin(angle - a)) - Math.abs(Math.sin(angle - b)),
        )[0] ?? 0;
      return { point: projectDirection(point, base, chosen), kind: 'ortho', base, angle: chosen };
    }
    if (settings.polar) {
      const selected = nearestPolarAngle(angle, settings, previous ? heading(previous, base) : 0);
      if (selected !== undefined) {
        let target = projectDirection(point, base, selected);
        if (Math.hypot(target.x - point.x, target.y - point.y) <= tolerance) {
          if (settings.snap && settings.polarSnap) {
            const step = settings.polarDistance || settings.grid.spacing.x;
            const distance = Math.hypot(target.x - base.x, target.y - base.y);
            if (step > 0)
              target = {
                x: base.x + Math.cos(selected) * Math.round(distance / step) * step,
                y: base.y - Math.sin(selected) * Math.round(distance / step) * step,
              };
          }
          return { point: target, kind: 'polar', base, angle: selected };
        }
      }
    }
  }
  if (settings.snap && !settings.polarSnap)
    return { point: snapGridPoint(point, settings.grid), kind: 'grid' };
  return { point: { ...point } };
}
