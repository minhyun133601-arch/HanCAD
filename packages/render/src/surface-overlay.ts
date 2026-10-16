import { getLegacyRuntime } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import type { CadSelectionDrag, CadView, CadWorldView } from './pointer-controller';
import { relativeEntity } from './geometry';
import { CanvasContextError } from './errors';
import { drawSnapOverlay } from './snap-overlay';
import type { CadSnapMarker } from './snap-overlay';
import { drawSelectionOverlay } from './selection-overlay';
import { drawDraftingAids } from './drafting-aids';
import type { CadAidSettings } from './drafting-aids';

interface OverlayState {
  width: number;
  height: number;
  ratio: number;
  view: CadView;
  origin: CadPoint;
  preview: readonly CadEntity[];
  unit: string;
  snap: CadSnapMarker | undefined;
  area: CadSelectionDrag | undefined;
  aids: CadAidSettings;
  cursor: CadPoint | undefined;
  window: CadWorldView | undefined;
  worldToScreen: (p: CadPoint) => CadPoint;
}
export function drawSurfaceOverlay(canvas: HTMLCanvasElement, state: OverlayState): string {
  const context = canvas.getContext('2d');
  if (!context) throw new CanvasContextError('preview');
  const { ratio, view, origin, area } = state;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.save();
  context.setTransform(
    ratio * view.scale,
    0,
    0,
    ratio * view.scale,
    ratio * (state.width / 2 + view.tx),
    ratio * (state.height / 2 + view.ty),
  );
  for (const entity of state.preview)
    getLegacyRuntime().core.cadExporters.drawEntity(context, relativeEntity(entity, origin), {
      scale: view.scale,
      unit: state.unit,
      color: '#fbbf24',
    });
  if (state.snap) drawSnapOverlay(context, state.snap, origin, view.scale);
  if (area) drawSelectionOverlay(context, area, origin, view.scale);
  context.restore();
  drawDraftingAids(
    context,
    { width: state.width, height: state.height },
    state.worldToScreen,
    state.aids,
    state.cursor,
    state.window,
  );
  return area
    ? area.gesture === 'fence'
      ? 'fence'
      : area.end.x >= area.start.x
        ? 'window'
        : 'crossing'
    : '';
}
