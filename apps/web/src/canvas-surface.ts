import { CadCanvasSurface } from '@hancad/render';
import type { CadCanvasOptions } from '@hancad/render';
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
    this.renderer = new CadCanvasSurface(this.canvas, options);
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
  setSelection(ids: readonly string[]): void {
    this.renderer.setSelection(ids);
  }
  setSnapMarker(point?: CadPoint): void {
    this.renderer.setSnapMarker(point);
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
