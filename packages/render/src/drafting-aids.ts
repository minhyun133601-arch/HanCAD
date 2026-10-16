import type { CadPoint } from '@hancad/legacy-bridge';
import type { CadWorldView } from './pointer-controller';
import type { ViewBounds, ViewportSize } from './view-navigation';
import { isoplaneAngles } from '@hancad/geom';
import { drawTransformedGrid } from './transformed-grid';

export interface CadAidSettings {
  cursorSize: number;
  pickbox: number;
  ucsIcon: number;
  gridMode: number;
  gridUnit: CadPoint;
  snapUnit: CadPoint;
  gridMajor: number;
  gridDisplay: number;
  gridStyle: number;
  limits: ViewBounds;
  background: string;
  snapAngle?: number;
  snapBase?: CadPoint;
  snapStyle?: number;
  isoplane?: number;
  aperture?: number;
  apertureBox?: boolean;
}
export const defaultAidSettings: CadAidSettings = {
  cursorSize: 5,
  pickbox: 3,
  ucsIcon: 3,
  gridMode: 1,
  gridUnit: { x: 10, y: 10 },
  snapUnit: { x: 10, y: 10 },
  gridMajor: 5,
  gridDisplay: 3,
  gridStyle: 0,
  limits: { minX: 0, minY: -297, maxX: 420, maxY: 0 },
  background: '#212830',
};
function lightBackground(background: string): boolean {
  const value = Number.parseInt(background.replace('#', ''), 16);
  return ((value >> 16) & 255) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114 > 150000;
}
/** Chooses a world spacing with bounded visible density, preserving major intervals. */
export function adaptiveGridSpacing(
  unit: number,
  scale: number,
  major: number,
  display: number,
): number | undefined {
  if (!(unit > 0) || !(scale > 0)) return undefined;
  let spacing = unit;
  const ratio = Math.max(2, Math.floor(major));
  if (display & 2) {
    while (spacing * scale < 8) spacing *= ratio;
    if (display & 4) while (spacing * scale > 80) spacing /= ratio;
  } else if (spacing * scale < 2) return undefined;
  return spacing;
}
export function drawGrid(
  context: CanvasRenderingContext2D,
  viewport: ViewportSize,
  view: CadWorldView,
  worldToScreen: (point: CadPoint) => CadPoint,
  settings: CadAidSettings,
): void {
  if (!settings.gridMode) return;
  const scale = viewport.height / view.height;
  const xStep = adaptiveGridSpacing(
    settings.gridUnit.x || settings.snapUnit.x,
    scale,
    settings.gridMajor,
    settings.gridDisplay,
  );
  const yStep = adaptiveGridSpacing(
    settings.gridUnit.y || settings.snapUnit.y,
    scale,
    settings.gridMajor,
    settings.gridDisplay,
  );
  if (xStep === undefined || yStep === undefined) return;
  if (settings.snapAngle || settings.snapBase?.x || settings.snapBase?.y || settings.snapStyle === 1) {
    drawTransformedGrid(context, viewport, view, worldToScreen, settings, xStep, yStep);
    return;
  }
  const halfWidth = (view.height * viewport.width) / viewport.height / 2;
  const visible = {
    minX: view.center.x - halfWidth,
    maxX: view.center.x + halfWidth,
    minY: view.center.y - view.height / 2,
    maxY: view.center.y + view.height / 2,
  };
  const bounds =
    settings.gridDisplay & 1
      ? visible
      : {
          minX: Math.max(visible.minX, settings.limits.minX),
          maxX: Math.min(visible.maxX, settings.limits.maxX),
          minY: Math.max(visible.minY, settings.limits.minY),
          maxY: Math.min(visible.maxY, settings.limits.maxY),
        };
  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) return;
  context.save();
  const first = worldToScreen({ x: bounds.minX, y: bounds.minY }),
    last = worldToScreen({ x: bounds.maxX, y: bounds.maxY });
  context.beginPath();
  context.rect(first.x, first.y, last.x - first.x, last.y - first.y);
  context.clip();
  const light = lightBackground(settings.background),
    major = Math.max(1, Math.floor(settings.gridMajor));
  const color = (strong: boolean): string =>
    light ? (strong ? '#b2bac1' : '#d8dde1') : strong ? '#455563' : '#2e3b46';
  const minXi = Math.ceil(bounds.minX / xStep),
    maxXi = Math.floor(bounds.maxX / xStep);
  const minYi = Math.ceil(bounds.minY / yStep),
    maxYi = Math.floor(bounds.maxY / yStep);
  const dots = Boolean(settings.gridStyle & 1);
  if (maxXi - minXi > 2000 || maxYi - minYi > 2000) {
    context.restore();
    return;
  }
  if (dots) {
    // Dense nonadaptive grids are suppressed instead of producing an unbounded point mesh.
    if ((maxXi - minXi + 1) * (maxYi - minYi + 1) <= 80000)
      for (let x = minXi; x <= maxXi; x++)
        for (let y = minYi; y <= maxYi; y++) {
          const point = worldToScreen({ x: x * xStep, y: y * yStep });
          context.fillStyle = color(x % major === 0 && y % major === 0);
          context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
        }
  } else {
    context.lineWidth = 1;
    for (let x = minXi; x <= maxXi; x++) {
      const pixel = Math.round(worldToScreen({ x: x * xStep, y: 0 }).x) + 0.5;
      context.strokeStyle = color(x % major === 0);
      context.beginPath();
      context.moveTo(pixel, first.y);
      context.lineTo(pixel, last.y);
      context.stroke();
    }
    for (let y = minYi; y <= maxYi; y++) {
      const pixel = Math.round(worldToScreen({ x: 0, y: y * yStep }).y) + 0.5;
      context.strokeStyle = color(y % major === 0);
      context.beginPath();
      context.moveTo(first.x, pixel);
      context.lineTo(last.x, pixel);
      context.stroke();
    }
  }
  const origin = worldToScreen({ x: 0, y: 0 });
  context.lineWidth = 1;
  context.strokeStyle = '#86494c';
  context.beginPath();
  context.moveTo(first.x, origin.y + 0.5);
  context.lineTo(last.x, origin.y + 0.5);
  context.stroke();
  context.strokeStyle = '#47795d';
  context.beginPath();
  context.moveTo(origin.x + 0.5, first.y);
  context.lineTo(origin.x + 0.5, last.y);
  context.stroke();
  context.restore();
}
export function drawDraftingAids(
  context: CanvasRenderingContext2D,
  viewport: ViewportSize,
  worldToScreen: (point: CadPoint) => CadPoint,
  settings: CadAidSettings,
  cursor?: CadPoint,
  window?: CadWorldView,
): void {
  context.save();
  context.lineWidth = 1;
  const foreground = lightBackground(settings.background) ? '#202830' : '#f0f2f5';
  if (settings.ucsIcon & 1) {
    let origin = worldToScreen({ x: 0, y: 0 });
    if (
      !(settings.ucsIcon & 2) ||
      origin.x < 20 ||
      origin.x > viewport.width - 65 ||
      origin.y < 65 ||
      origin.y > viewport.height - 20
    )
      origin = { x: 35, y: viewport.height - 35 };
    context.strokeStyle = foreground;
    context.fillStyle = foreground;
    context.font = '12px Arial';
    context.beginPath();
    context.moveTo(origin.x, origin.y - 48);
    context.lineTo(origin.x, origin.y);
    context.lineTo(origin.x + 48, origin.y);
    context.stroke();
    context.strokeRect(origin.x - 3, origin.y - 3, 6, 6);
    context.fillText('Y', origin.x - 4, origin.y - 55);
    context.fillText('X', origin.x + 53, origin.y + 4);
    context.fillText('W', origin.x + 6, origin.y - 13);
  }
  if (window) {
    const height = Math.abs(
      worldToScreen({ x: window.center.x, y: window.center.y + window.height }).y -
        worldToScreen(window.center).y,
    );
    const width = (height * viewport.width) / viewport.height,
      center = worldToScreen(window.center);
    context.strokeStyle = '#70d8ff';
    context.setLineDash([6, 4]);
    context.strokeRect(center.x - width / 2, center.y - height / 2, width, height);
    context.setLineDash([]);
  }
  if (cursor) {
    const halfX =
      settings.cursorSize >= 100 ? viewport.width : (viewport.width * settings.cursorSize) / 200;
    const halfY =
      settings.cursorSize >= 100 ? viewport.height : (viewport.height * settings.cursorSize) / 200;
    const gap = Math.max(0, settings.pickbox) / 2,
      x = Math.round(cursor.x) + 0.5,
      y = Math.round(cursor.y) + 0.5;
    context.strokeStyle = foreground;
    context.beginPath();
    const axes = settings.snapStyle === 1 ? isoplaneAngles(settings.isoplane ?? 0) : [0, Math.PI / 2];
    for (let i = 0; i < axes.length; i++) {
      const angle = (axes[i] ?? 0) + (settings.snapAngle ?? 0), length = i === 0 ? halfX : halfY;
      const dx = Math.cos(angle), dy = -Math.sin(angle);
      context.moveTo(x - dx * length, y - dy * length); context.lineTo(x - dx * gap, y - dy * gap);
      context.moveTo(x + dx * gap, y + dy * gap); context.lineTo(x + dx * length, y + dy * length);
    }
    context.stroke();
    if (gap > 0) context.strokeRect(x - gap, y - gap, gap * 2, gap * 2);
    if (settings.apertureBox) {
      const aperture = settings.aperture ?? 10;
      context.strokeRect(x - aperture / 2, y - aperture / 2, aperture, aperture);
    }
  }
  context.restore();
}
