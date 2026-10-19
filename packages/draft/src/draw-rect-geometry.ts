import type { CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import type { DrawContext } from './draw-program';
import { outlinePolyline, rotate } from './draw-outline-common';

export interface RectangleOptions {
  chamferA: number;
  chamferB: number;
  fillet: number;
  width: number;
  elevation: number;
  thickness: number;
  rotation: number;
}
export function rectangleAreaLoss(options: RectangleOptions): number {
  return options.fillet > 0
    ? (4 - Math.PI) * options.fillet * options.fillet
    : 2 * options.chamferA * options.chamferB;
}
export function rectangleCornersFit(
  options: RectangleOptions,
  width: number,
  height: number,
): boolean {
  return options.fillet > 0
    ? 2 * options.fillet <= Math.min(width, height)
    : options.chamferA > 0 &&
        options.chamferB > 0 &&
        2 * options.chamferA <= width &&
        2 * options.chamferB <= height;
}
export function rectangleEntity(
  context: DrawContext,
  origin: CadPoint,
  dx: number,
  dy: number,
  options: RectangleOptions,
  id?: string,
): CadPolyline {
  const w = Math.abs(dx),
    h = Math.abs(dy),
    sx = Math.sign(dx) || 1,
    sy = Math.sign(dy) || 1;
  const radius = options.fillet,
    rounded = radius > 0 && 2 * radius <= Math.min(w, h);
  const a = rounded ? radius : options.chamferA,
    b = rounded ? radius : options.chamferB;
  const trimmed = rounded || (a > 0 && b > 0 && 2 * a <= w && 2 * b <= h);
  const vertices: CadPoint[] = trimmed
    ? [
        { x: a, y: 0 },
        { x: w - a, y: 0 },
        { x: w, y: b },
        { x: w, y: h - b },
        { x: w - a, y: h },
        { x: a, y: h },
        { x: 0, y: h - b },
        { x: 0, y: b },
      ]
    : [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
  const points = vertices.map((p) => {
    const q = rotate({ x: p.x * sx, y: p.y * sy }, -options.rotation);
    return {
      x: origin.x + q.x,
      y: origin.y + q.y,
      ...(options.elevation === 0 && origin.z === undefined ? {} : { z: options.elevation }),
    };
  });
  const bulge = Math.sign(dx * dy) * Math.tan(Math.PI / 8);
  const bulges = points.map((_, index) => (rounded && index % 2 === 1 ? bulge : 0));
  return {
    ...outlinePolyline(context, points, true, bulges, undefined, id),
    constantWidth: options.width,
    elevation: options.elevation,
    thickness: options.thickness,
    sourceType: 'RECTANG',
  };
}
