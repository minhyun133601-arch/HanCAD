import type { CadPoint } from '@hancad/legacy-bridge';

export type CadSnapKind =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'geometricCenter'
  | 'node'
  | 'quadrant'
  | 'intersection'
  | 'extension'
  | 'insertion'
  | 'perpendicular'
  | 'tangent'
  | 'nearest'
  | 'apparentIntersection'
  | 'parallel';
export interface CadSnapMarker {
  point: CadPoint;
  kind: CadSnapKind;
  label?: string;
  showMarker: boolean;
}

/** Original AutoSnap-style symbols, held at the same CSS size at any view scale. */
export function drawSnapOverlay(
  context: CanvasRenderingContext2D,
  marker: CadSnapMarker,
  origin: CadPoint,
  scale: number,
  appearance?: {
    size?: number;
    opacity?: number;
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  },
): void {
  const x = marker.point.x - origin.x;
  const y = marker.point.y - origin.y;
  const size = 5 / scale;
  context.save();
  context.strokeStyle = '#4ade80';
  context.lineWidth = 1 / scale;
  context.setLineDash([]);
  if (marker.showMarker) {
    context.beginPath();
    if (marker.kind === 'endpoint') context.rect(x - size, y - size, size * 2, size * 2);
    else if (marker.kind === 'center') context.arc(x, y, size, 0, Math.PI * 2);
    else if (marker.kind === 'midpoint') {
      context.moveTo(x, y - size);
      context.lineTo(x + size, y + size);
      context.lineTo(x - size, y + size);
      context.closePath();
    } else if (marker.kind === 'quadrant') {
      context.moveTo(x, y - size);
      context.lineTo(x + size, y);
      context.lineTo(x, y + size);
      context.lineTo(x - size, y);
      context.closePath();
    } else if (marker.kind === 'node') {
      context.arc(x, y, size, 0, Math.PI * 2);
      context.moveTo(x - size, y - size);
      context.lineTo(x + size, y + size);
      context.moveTo(x + size, y - size);
      context.lineTo(x - size, y + size);
    } else if (marker.kind === 'insertion') {
      context.rect(x - size, y - size, size * 2, size * 2);
      context.moveTo(x - size, y);
      context.lineTo(x + size, y);
      context.moveTo(x, y - size);
      context.lineTo(x, y + size);
    } else if (marker.kind === 'perpendicular') {
      context.moveTo(x - size, y - size);
      context.lineTo(x - size, y + size);
      context.lineTo(x + size, y + size);
      context.moveTo(x - size, y);
      context.lineTo(x, y);
      context.lineTo(x, y + size);
    } else if (marker.kind === 'tangent') {
      context.arc(x, y, size, 0, Math.PI * 2);
      context.moveTo(x - size * 1.4, y - size);
      context.lineTo(x + size * 1.4, y - size);
    } else if (marker.kind === 'extension') {
      context.moveTo(x - size, y);
      context.lineTo(x + size, y);
      context.moveTo(x, y - size);
      context.lineTo(x, y + size);
    } else if (marker.kind === 'parallel') {
      context.moveTo(x - size, y);
      context.lineTo(x, y - size);
      context.moveTo(x, y + size);
      context.lineTo(x + size, y);
    } else if (marker.kind === 'geometricCenter') {
      for (let index = 0; index < 3; index++) {
        const angle = (index * Math.PI) / 3,
          dx = Math.cos(angle) * size,
          dy = Math.sin(angle) * size;
        context.moveTo(x - dx, y - dy);
        context.lineTo(x + dx, y + dy);
      }
    } else {
      context.moveTo(x - size, y - size);
      context.lineTo(x + size, y + size);
      context.moveTo(x + size, y - size);
      context.lineTo(x - size, y + size);
      if (marker.kind === 'nearest') {
        context.moveTo(x - size, y - size);
        context.lineTo(x + size, y - size);
        context.moveTo(x - size, y + size);
        context.lineTo(x + size, y + size);
      } else if (marker.kind === 'apparentIntersection') {
        context.rect(x - size * 1.3, y - size * 1.3, size * 2.6, size * 2.6);
      }
    }
    context.stroke();
  }
  if (marker.label) {
    const font = 12 + (appearance?.size ?? 0),
      height = (font + 10) / scale;
    context.globalAlpha = appearance?.opacity ?? 1;
    context.font = `${font / scale}px "Malgun Gothic", sans-serif`;
    const width = context.measureText(marker.label).width || (marker.label.length * 12) / scale;
    const bounds = appearance?.bounds;
    const tx = bounds
      ? Math.max(bounds.minX, Math.min(x + 12 / scale, bounds.maxX - width - 12 / scale))
      : x + 12 / scale;
    const ty = bounds
      ? Math.max(bounds.minY, Math.min(y + 12 / scale, bounds.maxY - height))
      : y + 12 / scale;
    context.fillStyle = '#f7f7e8';
    context.fillRect(tx, ty, width + 12 / scale, height);
    context.fillStyle = '#17212b';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(marker.label, tx + 6 / scale, ty + height / 2);
  }
  context.restore();
}
