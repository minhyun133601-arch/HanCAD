import { CadCanvasSurface } from '@hancad/render';
import type {
  CadCanvasOptions,
  CadSnapKind,
  CadWorldView,
  CadNavigationKind,
  CadTrackingOverlay,
  CadEditOverlay,
} from '@hancad/render';
import type { CadBounds, CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';

/** Owns the DOM canvas; React only provides the host element. */
export class CanvasSurface {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: CadCanvasSurface;

  constructor(host: HTMLElement, label: string, options: CadCanvasOptions = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', label);
    this.canvas.setAttribute('data-testid', 'drawing-canvas');
    this.canvas.className = 'drawing-canvas';
    this.canvas.tabIndex = 0;
    host.append(this.canvas);
    try {
      this.renderer = new CadCanvasSurface(this.canvas, options);
    } catch (error) {
      this.canvas.remove();
      throw error;
    }
  }

  setLabel(label: string): void {
    this.canvas.setAttribute('aria-label', label);
  }

  setDrawing(state: LegacyCadState, fit = true): void {
    this.renderer.setDrawing(state, { fit });
  }
  setPreview(entities: readonly CadEntity[]): void {
    this.renderer.setPreview(entities);
  }
  setPreviewHiddenIds(ids: readonly string[]): void {
    this.renderer.setPreviewHiddenIds(ids);
  }
  worldToScreen(point: CadPoint): CadPoint {
    return this.renderer.worldToScreen(point);
  }
  getCursorPosition(): CadPoint | undefined {
    return this.renderer.getCursorPosition();
  }
  setSelection(ids: readonly string[]): void {
    this.renderer.setSelection(ids);
  }
  setEditOverlay(overlay: CadEditOverlay): void {
    this.renderer.setEditOverlay(overlay);
  }
  setSnapMarker(point?: CadPoint, kind?: CadSnapKind, label?: string, showMarker = true): void {
    this.renderer.setSnapMarker(point, kind, label, showMarker);
  }
  setTrackingOverlay(overlay?: CadTrackingOverlay): void {
    this.renderer.setTrackingOverlay(overlay);
  }
  cancelPointerInteraction(): void {
    this.renderer.cancelPointerInteraction();
  }
  getView() {
    return this.renderer.getView();
  }
  pick(point: CadPoint): string | undefined {
    return this.renderer.pick(point);
  }
  pickAll(point: CadPoint, includeLocked = false): string[] {
    return this.renderer.pickAll(point, includeLocked);
  }
  setHighlight(ids: readonly string[]): void {
    this.renderer.setHighlight(ids);
  }
  query(bounds: CadBounds): string[] {
    return this.renderer.query(bounds);
  }
  screenToWorld(point: CadPoint): CadPoint {
    const view = this.getWorldView(),
      size = this.getViewportSize(),
      scale = this.getView().scale;
    return {
      x: view.center.x + (point.x - size.width / 2) / scale,
      y: view.center.y + (point.y - size.height / 2) / scale,
    };
  }
  fit(): void {
    this.renderer.fit();
  }
  zoomExtents(): void {
    this.renderer.zoomExtents();
  }
  navigate(view: CadWorldView, kind: CadNavigationKind = 'zoom', smooth = true): void {
    this.renderer.navigate(view, kind, smooth);
  }
  zoomPrevious(): boolean {
    return this.renderer.zoomPrevious();
  }
  regenerate(height?: number): void {
    this.renderer.regenerate(height);
  }
  redraw(): void {
    this.renderer.redraw();
  }
  getDrawingBounds(ids?: readonly string[]) {
    return this.renderer.getDrawingBounds(ids);
  }
  setStressDataset(count: number): void {
    this.renderer.setStressDataset(count);
  }
  getWorldView(): CadWorldView {
    return this.renderer.getWorldView();
  }
  setWorldView(view: CadWorldView): void {
    this.renderer.setWorldView(view);
  }
  getViewportSize(): { width: number; height: number } {
    return this.renderer.getViewportSize();
  }

  dispose(): void {
    this.renderer.dispose();
    this.canvas.remove();
  }
}
