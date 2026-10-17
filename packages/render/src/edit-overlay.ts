import type { CadBounds, CadPoint } from '@hancad/legacy-bridge';
import { ACI_RGB, rgbToCss } from './style/aci';
import { drawSelectionOverlay } from './selection-overlay';
import type { CadSelectionDrag } from './pointer-controller';

export interface CadGripDisplay {
  entityId: string;
  key: string;
  point: CadPoint;
  kind: string;
  hot: boolean;
  hover: boolean;
}
export interface CadEditOverlay {
  grips: readonly CadGripDisplay[];
  groupBounds?: readonly CadBounds[];
  selection?: CadSelectionDrag;
}
export function drawEditOverlay(
  context: CanvasRenderingContext2D,
  overlay: CadEditOverlay,
  project: (point: CadPoint) => CadPoint,
  variable: (name: string) => unknown,
): void {
  const number = (name: string, fallback: number) => {
    const value = variable(name);
    return typeof value === 'number' ? value : fallback;
  };
  context.save();
  if (overlay.selection) {
    const selection = overlay.selection;
    drawSelectionOverlay(
      context,
      {
        ...selection,
        start: project(selection.start),
        end: project(selection.end),
        ...(selection.points ? { points: selection.points.map(project) } : {}),
      },
      { x: 0, y: 0 },
      1,
      variable,
    );
  }
  context.lineWidth = 1;
  context.setLineDash([4, 3]);
  context.strokeStyle = '#a5b4fc';
  for (const bounds of overlay.groupBounds ?? []) {
    const a = project({ x: bounds.minX, y: bounds.minY });
    const b = project({ x: bounds.maxX, y: bounds.maxY });
    context.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
  context.setLineDash([]);
  const size = number('GRIPSIZE', 5);
  context.strokeStyle = rgbToCss(ACI_RGB[number('GRIPCONTOUR', 251)] ?? 0x555555);
  for (const grip of overlay.grips) {
    const point = project(grip.point);
    const index = grip.hot
      ? number('GRIPHOT', 12)
      : grip.hover
        ? number('GRIPHOVER', 11)
        : number('GRIPCOLOR', 150);
    context.fillStyle = rgbToCss(ACI_RGB[index] ?? 0x0000ff);
    if (grip.kind === 'midpoint') {
      context.beginPath();
      context.moveTo(point.x, point.y - size / 2);
      context.lineTo(point.x + size / 2, point.y + size / 2);
      context.lineTo(point.x - size / 2, point.y + size / 2);
      context.closePath();
      context.fill();
      context.stroke();
    } else {
      context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      context.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
    }
  }
  context.restore();
}
