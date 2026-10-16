import type { CadPoint } from '@hancad/legacy-bridge';
import type { ViewportSize } from './view-navigation';

export interface CadTrackingPath {
  from: CadPoint; to: CadPoint; angle: number;
  kind: 'object' | 'polar' | 'extension' | 'parallel';
  fullScreen: boolean;
}
export interface CadTrackingOverlay {
  points: readonly CadPoint[];
  paths: readonly CadTrackingPath[];
  cursor?: CadPoint;
  tooltip?: string;
  /** AUTOSNAP's magnet affects the crosshair only; exact pick coordinates are separate. */
  magnet?: CadPoint;
}

export function drawTrackingOverlay(context: CanvasRenderingContext2D, viewport: ViewportSize,
  worldToScreen: (point: CadPoint) => CadPoint, tracking: CadTrackingOverlay): void {
  context.save();
  context.strokeStyle = '#71ca88'; context.lineWidth = 1; context.setLineDash([2, 4]);
  for (const path of tracking.paths) {
    const from = worldToScreen(path.from), to = worldToScreen(path.to);
    const radius = Math.hypot(viewport.width, viewport.height);
    const x = Math.cos(path.angle) * radius, y = -Math.sin(path.angle) * radius;
    context.beginPath();
    context.moveTo(path.fullScreen ? from.x - x : from.x, path.fullScreen ? from.y - y : from.y);
    context.lineTo(path.fullScreen ? from.x + x : to.x, path.fullScreen ? from.y + y : to.y);
    context.stroke();
  }
  context.setLineDash([]);
  for (const point of tracking.points) {
    const p = worldToScreen(point);
    context.beginPath(); context.moveTo(p.x - 3, p.y); context.lineTo(p.x + 3, p.y);
    context.moveTo(p.x, p.y - 3); context.lineTo(p.x, p.y + 3); context.stroke();
  }
  if (tracking.tooltip && tracking.cursor) {
    const p = worldToScreen(tracking.cursor);
    context.font = '12px "Malgun Gothic", sans-serif';
    const width = context.measureText(tracking.tooltip).width;
    const x = Math.max(1, Math.min(p.x + 15, viewport.width - width - 15));
    const y = Math.max(1, Math.min(p.y + 20, viewport.height - 24));
    context.fillStyle = '#fffce9'; context.fillRect(x, y, width + 12, 23);
    context.fillStyle = '#17212b'; context.textAlign = 'left'; context.textBaseline = 'middle';
    context.fillText(tracking.tooltip, x + 6, y + 12);
  }
  context.restore();
}
