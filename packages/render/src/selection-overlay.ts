import type { CadPoint } from '@hancad/legacy-bridge';
import type { CadSelectionDrag } from './pointer-controller';

export function drawSelectionOverlay(
  context: CanvasRenderingContext2D,
  area: CadSelectionDrag,
  origin: CadPoint,
  scale: number,
): void {
  context.lineWidth = 1 / scale;
  if (area.gesture === 'fence') {
    context.strokeStyle = '#fbbf24';
    context.setLineDash([3 / scale, 3 / scale]);
    context.beginPath();
    for (const [index, point] of (area.points ?? [area.start, area.end]).entries()) {
      if (index === 0) context.moveTo(point.x - origin.x, point.y - origin.y);
      else context.lineTo(point.x - origin.x, point.y - origin.y);
    }
    context.stroke();
    return;
  }
  const crossing = area.end.x < area.start.x;
  context.strokeStyle = crossing ? '#4ade80' : '#60a5fa';
  context.fillStyle = crossing ? 'rgba(74,222,128,0.15)' : 'rgba(96,165,250,0.15)';
  context.setLineDash(crossing ? [5 / scale, 3 / scale] : []);
  const x = Math.min(area.start.x, area.end.x) - origin.x;
  const y = Math.min(area.start.y, area.end.y) - origin.y;
  const width = Math.abs(area.end.x - area.start.x);
  const height = Math.abs(area.end.y - area.start.y);
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);
}
