import type { CadPoint } from '@hancad/legacy-bridge';
import { cross, dot, length, mod, offset, rotate, TAU, unit, vector } from './draw-outline-common';

export interface PlineSegment {
  end: CadPoint;
  bulge: number;
}
/** The complementary sweep traverses the same circle in the opposite direction. */
export function alternateArcBulge(bulge: number): number {
  return Math.abs(bulge) > 1e-12 ? -1 / bulge : 0;
}
export function tangentBulge(
  start: CadPoint,
  end: CadPoint,
  tangent: CadPoint,
): number | undefined {
  const chord = vector(start, end);
  if (Math.hypot(chord.x, chord.y) < 1e-12) return undefined;
  const sweep = 2 * Math.atan2(cross(tangent, chord), dot(tangent, chord));
  return Math.abs(sweep) < TAU - 1e-10 ? Math.tan(sweep / 4) : undefined;
}
export function endTangent(start: CadPoint, end: CadPoint, bulge: number): CadPoint {
  return rotate(unit(vector(start, end)), 2 * Math.atan(bulge));
}
export function centerSegment(
  start: CadPoint,
  center: CadPoint,
  end: CadPoint,
  sweep?: number,
): PlineSegment | undefined {
  const radial = vector(center, start),
    radius = length(start, center);
  if (radius <= 1e-12) return undefined;
  const theta =
    sweep ?? -mod(Math.atan2(radial.y, radial.x) - Math.atan2(end.y - center.y, end.x - center.x));
  if (Math.abs(theta) < 1e-12 || Math.abs(theta) >= TAU - 1e-12) return undefined;
  return { end: offset(center, rotate(unit(radial), theta), radius), bulge: Math.tan(theta / 4) };
}
export function radiusSegment(
  start: CadPoint,
  end: CadPoint,
  radius: number,
  tangent: CadPoint,
): PlineSegment | undefined {
  const chordLength = length(start, end);
  if (chordLength < 1e-12 || chordLength > 2 * radius + 1e-10) return undefined;
  const chord = unit(vector(start, end)),
    midpoint = offset(start, chord, chordLength / 2);
  const height = Math.sqrt(Math.max(0, radius * radius - (chordLength * chordLength) / 4));
  const candidates = [-1, 1].map((sign) => {
    const center = offset(midpoint, rotate(chord, Math.PI / 2), sign * height);
    const radial = unit(vector(center, start));
    const direction = dot(rotate(radial, Math.PI / 2), tangent) >= 0 ? 1 : -1;
    const delta = Math.atan2(end.y - center.y, end.x - center.x) - Math.atan2(radial.y, radial.x);
    const sweep = direction > 0 ? mod(delta) : -mod(-delta);
    const alignment = dot(rotate(radial, (direction * Math.PI) / 2), tangent);
    return { end: { ...end }, bulge: Math.tan(sweep / 4), alignment };
  });
  candidates.sort((a, b) => b.alignment - a.alignment || Math.abs(a.bulge) - Math.abs(b.bulge));
  return candidates[0];
}
export function threePointSegment(a: CadPoint, b: CadPoint, c: CadPoint): PlineSegment | undefined {
  const u = vector(a, b),
    v = vector(a, c),
    determinant = 2 * cross(u, v);
  if (Math.abs(determinant) <= 1e-12 * Math.max(1, length(a, b) * length(a, c))) return undefined;
  const uu = dot(u, u),
    vv = dot(v, v);
  const center = {
    x: a.x + (uu * v.y - vv * u.y) / determinant,
    y: a.y + (u.x * vv - v.x * uu) / determinant,
  };
  const start = Math.atan2(a.y - center.y, a.x - center.x);
  const through = mod(Math.atan2(b.y - center.y, b.x - center.x) - start);
  const finish = mod(Math.atan2(c.y - center.y, c.x - center.x) - start);
  const sweep = through < finish ? finish : finish - TAU;
  return { end: { ...c }, bulge: Math.tan(sweep / 4) };
}
