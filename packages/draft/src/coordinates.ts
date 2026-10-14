import type { CadPoint } from '@hancad/legacy-bridge';

const numberPattern = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
const cartesian = new RegExp(`^(@|#)?\\s*(${numberPattern})\\s*,\\s*(${numberPattern})$`, 'i');
const polar = new RegExp(`^(@)?\\s*(${numberPattern})\\s*<\\s*(${numberPattern})$`, 'i');
const scalar = new RegExp(`^${numberPattern}$`, 'i');

export function validDraftPoint(point: CadPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Math.abs(point.x) <= 1e12 &&
    Math.abs(point.y) <= 1e12
  );
}

/** User Y up is converted exactly once into the transitional renderer's Y-down model. */
export function parseDraftPoint(
  input: string,
  base: CadPoint = { x: 0, y: 0 },
): CadPoint | undefined {
  const value = input.trim();
  const xy = cartesian.exec(value);
  if (xy) {
    const origin = xy[1] === '@' ? base : { x: 0, y: 0 };
    const point = { x: origin.x + Number(xy[2]), y: origin.y - Number(xy[3]) };
    return validDraftPoint(point) ? point : undefined;
  }
  const ra = polar.exec(value);
  if (ra) {
    const radius = Number(ra[2]);
    const angle = (Number(ra[3]) * Math.PI) / 180;
    if (!Number.isFinite(radius) || radius < 0 || !Number.isFinite(angle)) return undefined;
    const origin = ra[1] ? base : { x: 0, y: 0 };
    const point = {
      x: origin.x + radius * Math.cos(angle),
      y: origin.y - radius * Math.sin(angle),
    };
    return validDraftPoint(point) ? point : undefined;
  }
  return undefined;
}

export function parseDraftNumber(input: string): number | undefined {
  if (!scalar.test(input.trim())) return undefined;
  const value = Number(input);
  return Number.isFinite(value) && Math.abs(value) <= 1e12 ? value : undefined;
}
