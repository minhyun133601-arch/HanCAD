import type { DisplayGeometry, TessellationOptions, Vec2 } from './types';

/** PDSIZE zero/negative uses the view height captured by the last regeneration. */
export function pointDisplaySize(pdsize: number, regenViewHeight: number): number {
  return pdsize > 0 ? pdsize : Math.abs(regenViewHeight) * (pdsize === 0 ? 0.05 : -pdsize / 100);
}
export function pointSymbolGeometry(
  position: Vec2,
  options: Partial<TessellationOptions> = {},
): DisplayGeometry {
  const mode = Math.trunc(options.pdmode ?? 0),
    base = mode & 31;
  const half = pointDisplaySize(options.pdsize ?? 0, options.regenViewHeight ?? 1) / 2;
  const parts: DisplayGeometry[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) =>
    parts.push({
      type: 'line',
      start: { x: position.x + ax, y: position.y + ay },
      end: { x: position.x + bx, y: position.y + by },
    });
  if (base === 0) parts.push({ type: 'point', position });
  if (base === 2) {
    line(-half, 0, half, 0);
    line(0, -half, 0, half);
  }
  if (base === 3) {
    line(-half, -half, half, half);
    line(-half, half, half, -half);
  }
  if (base === 4) line(0, 0, 0, half);
  if (mode & 32)
    parts.push({
      type: 'arc',
      center: position,
      radius: half,
      startAngle: 0,
      sweepAngle: Math.PI * 2,
    });
  if (mode & 64) {
    line(-half, -half, half, -half);
    line(half, -half, half, half);
    line(half, half, -half, half);
    line(-half, half, -half, -half);
  }
  return { type: 'composite', parts, triangles: [] };
}
