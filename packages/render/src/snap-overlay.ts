import type { CadPoint } from '@hancad/legacy-bridge';

export type CadSnapKind =
  'endpoint' | 'midpoint' | 'center' | 'quadrant' | 'nearest' | 'intersection';
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
      }
    }
    context.stroke();
  }
  if (marker.label) {
    context.font = `${12 / scale}px "Malgun Gothic", sans-serif`;
    const width = context.measureText(marker.label).width || (marker.label.length * 12) / scale;
    context.fillStyle = '#f7f7e8';
    context.fillRect(x + 12 / scale, y + 12 / scale, width + 12 / scale, 22 / scale);
    context.fillStyle = '#17212b';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(marker.label, x + 18 / scale, y + 23 / scale);
  }
  context.restore();
}
