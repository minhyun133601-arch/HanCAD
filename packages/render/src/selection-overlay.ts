import type { CadPoint } from '@hancad/legacy-bridge';
import { ACI_RGB, rgbToCss } from './style/aci';
import type { CadSelectionDrag } from './pointer-controller';

export function drawSelectionOverlay(
  context: CanvasRenderingContext2D,
  area: CadSelectionDrag,
  origin: CadPoint,
  scale: number,
  variable: (name: string) => unknown = () => undefined,
): void {
  const number = (name: string, fallback: number) => {
    const value = variable(name);
    return typeof value === 'number' ? value : fallback;
  };
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
  const crossing =
    area.mode === 'crossing' ||
    (area.mode !== 'window' &&
      (area.gesture === 'crossing' ||
        (area.gesture !== 'window' &&
          (area.gesture === 'lasso' ? (area.points?.[1]?.x ?? area.end.x) : area.end.x) <
            area.start.x)));
  const rgb =
    ACI_RGB[number(crossing ? 'CROSSINGAREACOLOR' : 'WINDOWAREACOLOR', crossing ? 100 : 150)] ??
    0x0000ff;
  context.strokeStyle = rgbToCss(rgb);
  const opacity = number('SELECTIONAREA', 1) === 0 ? 0 : number('SELECTIONAREAOPACITY', 25) / 100;
  context.fillStyle = `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${opacity})`;
  context.setLineDash(crossing ? [5 / scale, 3 / scale] : []);
  if (area.gesture === 'lasso') {
    context.beginPath();
    for (const [index, point] of (area.points ?? [area.start, area.end]).entries()) {
      if (index === 0) context.moveTo(point.x - origin.x, point.y - origin.y);
      else context.lineTo(point.x - origin.x, point.y - origin.y);
    }
    context.closePath();
    if (opacity > 0) context.fill();
    context.stroke();
    return;
  }
  const x = Math.min(area.start.x, area.end.x) - origin.x;
  const y = Math.min(area.start.y, area.end.y) - origin.y;
  const width = Math.abs(area.end.x - area.start.x);
  const height = Math.abs(area.end.y - area.start.y);
  if (opacity > 0) context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);
}
