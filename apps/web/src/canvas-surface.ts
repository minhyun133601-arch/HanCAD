import { CadCanvasSurface } from '@hancad/render';
import type { CadCanvasOptions, CadSnapKind } from '@hancad/render';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';

/** Owns the DOM canvas; React only provides the host element. */
export class CanvasSurface {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: CadCanvasSurface;

  constructor(host: HTMLElement, label: string, options: CadCanvasOptions = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', label);
    this.canvas.setAttribute('data-testid', 'drawing-canvas');
    this.canvas.className = 'drawing-canvas';
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
  setSelection(ids: readonly string[]): void {
    this.renderer.setSelection(ids);
  }
  setSnapMarker(point?: CadPoint, kind?: CadSnapKind, label?: string, showMarker = true): void {
    this.renderer.setSnapMarker(point, kind, label, showMarker);
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
  fit(): void {
    this.renderer.fit();
  }

  dispose(): void {
    this.renderer.dispose();
    this.canvas.remove();
  }
}
