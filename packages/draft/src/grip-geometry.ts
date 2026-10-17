import type { CadPoint } from '@hancad/legacy-bridge';

export function gripCircumcenter(a: CadPoint, b: CadPoint, c: CadPoint): CadPoint | undefined {
  const bx = b.x - a.x,
    by = b.y - a.y,
    cx = c.x - a.x,
    cy = c.y - a.y;
  const d = 2 * (bx * cy - by * cx);
  if (Math.abs(d) <= 1e-12 * Math.max(1, Math.hypot(bx, by) * Math.hypot(cx, cy))) return;
  return {
    x: a.x + (cy * (bx * bx + by * by) - by * (cx * cx + cy * cy)) / d,
    y: a.y + (bx * (cx * cx + cy * cy) - cx * (bx * bx + by * by)) / d,
  };
}

/** Bulges use the same signed XY sweep as transitional Y-down entity coordinates. */
export function gripBulgeThrough(a: CadPoint, middle: CadPoint, b: CadPoint): number {
  const center = gripCircumcenter(a, middle, b);
  if (!center) return 0;
  const start = Math.atan2(a.y - center.y, a.x - center.x),
    end = Math.atan2(b.y - center.y, b.x - center.x),
    mid = Math.atan2(middle.y - center.y, middle.x - center.x),
    tau = Math.PI * 2;
  const positive = (v: number): number => ((v % tau) + tau) % tau;
  const sweep =
    positive(mid - start) <= positive(end - start) ? positive(end - start) : -positive(start - end);
  return Math.tan(sweep / 4);
}
