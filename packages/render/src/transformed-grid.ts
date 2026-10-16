import { gridCoordinates, gridPoint, type DraftingGrid } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import type { CadAidSettings } from './drafting-aids';
import type { CadWorldView } from './pointer-controller';
import type { ViewportSize } from './view-navigation';

/** Rotated/oblique grids share the mathematical snap lattice, not a screen approximation. */
export function drawTransformedGrid(context: CanvasRenderingContext2D, viewport: ViewportSize,
  view: CadWorldView, worldToScreen: (point: CadPoint) => CadPoint, settings: CadAidSettings,
  xStep: number, yStep: number): void {
  const grid: DraftingGrid = { spacing: { x: xStep, y: yStep }, base: settings.snapBase ?? { x: 0, y: 0 },
    angle: settings.snapAngle ?? 0, isometric: settings.snapStyle === 1, isoplane: settings.isoplane ?? 0 };
  const width = view.height * viewport.width / viewport.height;
  const corners = [-1, 1].flatMap((x) => [-1, 1].map((y) => ({ x: view.center.x + x * width / 2,
    y: view.center.y + y * view.height / 2 })));
  const coordinates = corners.map((point) => gridCoordinates(point, grid));
  const minU = Math.floor(Math.min(...coordinates.map((p) => p.x))) - 1;
  const maxU = Math.ceil(Math.max(...coordinates.map((p) => p.x))) + 1;
  const minV = Math.floor(Math.min(...coordinates.map((p) => p.y))) - 1;
  const maxV = Math.ceil(Math.max(...coordinates.map((p) => p.y))) + 1;
  if (maxU - minU > 2000 || maxV - minV > 2000) return;
  context.save();
  if (!(settings.gridDisplay & 1)) {
    const min = worldToScreen({ x: settings.limits.minX, y: settings.limits.minY });
    const max = worldToScreen({ x: settings.limits.maxX, y: settings.limits.maxY });
    context.beginPath(); context.rect(min.x, min.y, max.x - min.x, max.y - min.y); context.clip();
  }
  const rgb = Number.parseInt(settings.background.slice(1), 16);
  const light = ((rgb >> 16) & 255) * 299 + ((rgb >> 8) & 255) * 587 + (rgb & 255) * 114 > 150000;
  const color = (major: boolean): string => light ? (major ? '#b2bac1' : '#d8dde1') : major ? '#455563' : '#2e3b46';
  const major = Math.max(1, settings.gridMajor);
  if ((settings.gridStyle & 1) || grid.isometric) {
    if ((maxU - minU + 1) * (maxV - minV + 1) <= 80000)
      for (let u = minU; u <= maxU; u++) for (let v = minV; v <= maxV; v++) {
        const point = worldToScreen(gridPoint(u, v, grid));
        context.fillStyle = color(u % major === 0 && v % major === 0);
        context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
      }
  } else {
    const line = (a: CadPoint, b: CadPoint, strong: boolean): void => {
      const from = worldToScreen(a), to = worldToScreen(b);
      context.strokeStyle = color(strong); context.beginPath(); context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y); context.stroke();
    };
    for (let u = minU; u <= maxU; u++) line(gridPoint(u, minV, grid), gridPoint(u, maxV, grid), u % major === 0);
    for (let v = minV; v <= maxV; v++) line(gridPoint(minU, v, grid), gridPoint(maxU, v, grid), v % major === 0);
  }
  context.restore();
}
