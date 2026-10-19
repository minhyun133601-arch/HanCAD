import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { CadPointerController } from './pointer-controller';
import type {
  CadCanvasOptions,
  CadNavigationKind,
  CadView,
  CadWorldView,
} from './pointer-controller';
import type { CadSnapKind, CadSnapMarker } from './snap-overlay';
import { CanvasContextError } from './errors';
import { WebGlRenderer } from './webgl/renderer';
import { defaultAidSettings } from './drafting-aids';
import { drawSurfaceOverlay } from './surface-overlay';
import { fitWorldBounds, PreviousViews, sameWorldView, ViewTransition } from './view-navigation';
import type { ViewBounds } from './view-navigation';
import type { CadTrackingOverlay } from './tracking-overlay';
import type { CadEditOverlay } from './edit-overlay';
export type { CadSnapKind } from './snap-overlay';
export type {
  CadCanvasOptions,
  CadNavigationKind,
  CadNavigationSettings,
  CadPointerPick,
  CadSelectionDrag,
  CadView,
  CadWorldView,
} from './pointer-controller';

/** The public boundary remains legacy Y-down; GPU and database geometry use WCS Y-up. */
export class CadCanvasSurface {
  private state: LegacyCadState | undefined;
  private view: CadView = { scale: 1, tx: 0, ty: 0 };
  private origin: CadPoint = { x: 0, y: 0 };
  private width = 1;
  private height = 1;
  private observer: ResizeObserver | undefined;
  private readonly pointer!: CadPointerController;
  private readonly gpu!: WebGlRenderer;
  private readonly overlay: HTMLCanvasElement;
  private readonly previous = new PreviousViews();
  private readonly transition: ViewTransition;
  private disposed = false;
  private preview: readonly CadEntity[] = [];
  private selected = new Set<string>();
  private previewHiddenIds = new Set<string>();
  private snapMarker: CadSnapMarker | undefined;
  private trackingOverlay: CadTrackingOverlay | undefined;
  private editOverlay: CadEditOverlay = { grips: [] };
  private baseDirty = true;
  private animationFrame: number | undefined;
  private pendingCoordinates: CadPoint | undefined;
  private cursorLocal: CadPoint | undefined;
  private revision = 0;
  private transitionTarget: CadWorldView | undefined;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: CadCanvasOptions = {},
  ) {
    this.overlay = canvas.ownerDocument.createElement('canvas');
    this.overlay.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    this.overlay.setAttribute('aria-hidden', 'true');
    canvas.parentElement?.append(this.overlay);
    this.transition = new ViewTransition(
      () => this.getWorldView(),
      (view) => this.applyWorldView(view),
    );
    try {
      this.resize();
      try {
        this.gpu = new WebGlRenderer(canvas, {
          ...(options.getSystemVariable ? { variable: options.getSystemVariable } : {}),
          ...(options.getLayerStyles ? { layers: options.getLayerStyles } : {}),
          ...(options.getLinetypes ? { linetypes: options.getLinetypes } : {}),
          ...(options.getNativeDisplayEntities
            ? { nativeEntities: options.getNativeDisplayEntities }
            : {}),
          ...(options.getLineweightDisplayScale
            ? { lineweightDisplayScale: options.getLineweightDisplayScale }
            : {}),
          aids: () => this.options.getAidSettings?.() ?? defaultAidSettings,
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'WebGL2 unavailable')
          throw new CanvasContextError('main');
        throw error;
      }
      if (options.observeResize !== false && typeof ResizeObserver === 'function') {
        this.observer = new ResizeObserver(() => {
          this.resize();
          this.render();
        });
        this.observer.observe(canvas);
      }
      this.pointer = new CadPointerController(
        canvas,
        {
          ...options,
          onNavigate: (kind, before, after) => {
            this.previous.record(before, after);
            this.options.onNavigate?.(kind, before, after);
          },
        },
        {
          view: () => this.getView(),
          viewport: () => ({ x: this.width, y: this.height }),
          changeView: (view) => {
            this.transition.cancel();
            this.transitionTarget = undefined;
            this.canvas.dataset.viewTransition = '0';
            this.view = view;
            this.requestRender(true);
          },
          worldPoint: (point) => this.worldPoint(point),
          pick: (point) => this.pick(point),
          coordinates: (point) => {
            if (this.options.getNavigationWindow?.()) this.options.onCoordinates?.(point);
            else this.pendingCoordinates = point;
            this.requestRender();
          },
          fit: () => this.fit(),
          invalidate: () => this.requestRender(),
          worldView: () => this.getWorldView(),
          cursorLocal: (point) => {
            this.cursorLocal = point;
            this.requestRender();
          },
        },
      );
      this.canvas.dataset.renderer = 'webgl2';
      this.render();
      this.canvas.dataset.viewTransition = '0';
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  setDrawing(state: LegacyCadState, options: { fit?: boolean } = {}): void {
    this.pointer.cancel();
    this.state = state;
    this.gpu.setDrawing(state);
    this.selected = new Set(state.selectedIds);
    this.gpu.setSelection(this.selected, this.previewHiddenIds);
    this.baseDirty = true;
    if (options.fit === false) this.render();
    else {
      this.previous.clear();
      this.fit(true);
    }
  }
  setPreview(entities: readonly CadEntity[]): void {
    if (!entities.length && !this.preview.length) return;
    this.preview = structuredClone(entities);
    this.requestRender();
  }
  setPreviewHiddenIds(ids: readonly string[]): void {
    const next = new Set(ids);
    if (
      next.size === this.previewHiddenIds.size &&
      [...next].every((id) => this.previewHiddenIds.has(id))
    )
      return;
    this.previewHiddenIds = next;
    this.gpu.setSelection(this.selected, next);
    this.requestRender(true);
  }
  setSelection(ids: readonly string[]): void {
    const next = new Set(ids);
    if (next.size === this.selected.size && [...next].every((id) => this.selected.has(id))) return;
    this.selected = next;
    this.gpu.setSelection(next, this.previewHiddenIds);
    this.baseDirty = true;
    this.render();
  }
  setEditOverlay(overlay: CadEditOverlay): void {
    this.editOverlay = overlay;
    this.requestRender();
  }
  setSnapMarker(
    point?: CadPoint,
    kind: CadSnapKind = 'endpoint',
    label?: string,
    showMarker = true,
  ): void {
    if (!point && !this.snapMarker) return;
    this.snapMarker = point
      ? { point: { ...point }, kind, showMarker, ...(label === undefined ? {} : { label }) }
      : undefined;
    this.requestRender();
  }
  setTrackingOverlay(overlay?: CadTrackingOverlay): void {
    this.trackingOverlay = overlay;
    this.canvas.dataset.trackingPoints = String(overlay?.points.length ?? 0);
    this.canvas.dataset.trackingPaths = String(overlay?.paths.length ?? 0);
    this.canvas.dataset.trackingTooltip = overlay?.tooltip ?? '';
    this.requestRender();
  }
  pick(point: CadPoint): string | undefined {
    const size = this.options.getAidSettings?.().pickbox ?? defaultAidSettings.pickbox;
    return this.gpu.pick(point, Math.max(0.5, size / 2) / this.view.scale);
  }
  pickAll(point: CadPoint, includeLocked = false): string[] {
    const size = this.options.getAidSettings?.().pickbox ?? defaultAidSettings.pickbox;
    return this.gpu.pickAll(point, Math.max(0.5, size / 2) / this.view.scale, includeLocked);
  }
  query(bounds: ViewBounds): string[] {
    return this.gpu.query(bounds);
  }
  setHighlight(ids: readonly string[]): void {
    this.gpu.setHighlight(ids);
    this.requestRender(true);
  }
  getView(): CadView {
    return { ...this.view };
  }
  getWorldView(): CadWorldView {
    return {
      center: {
        x: this.origin.x - this.view.tx / this.view.scale,
        y: this.origin.y - this.view.ty / this.view.scale,
      },
      height: this.height / this.view.scale,
    };
  }
  getViewportSize() {
    return { width: this.width, height: this.height };
  }
  getCursorPosition(): CadPoint | undefined {
    return this.cursorLocal ? { ...this.cursorLocal } : undefined;
  }
  setWorldView(view: CadWorldView): void {
    if (this.transitionTarget && sameWorldView(view, this.transitionTarget)) return;
    this.transition.cancel();
    this.transitionTarget = undefined;
    this.canvas.dataset.viewTransition = '0';
    this.pointer.cancel();
    this.applyWorldView(view);
  }
  private applyWorldView(view: CadWorldView, request = true): void {
    if (
      !(view.height > 0) ||
      !Number.isFinite(view.height) ||
      !Number.isFinite(view.center.x) ||
      !Number.isFinite(view.center.y)
    )
      return;
    // Rebase on every recorded view so even high zoom at survey coordinates stays precise.
    this.origin = { ...view.center };
    this.view = { scale: Math.max(1e-6, Math.min(1e6, this.height / view.height)), tx: 0, ty: 0 };
    this.baseDirty = true;
    if (request) this.requestRender(true);
  }
  navigate(view: CadWorldView, kind: CadNavigationKind = 'zoom', smooth = true): void {
    if (
      !(view.height > 0) ||
      !Number.isFinite(view.height) ||
      !Number.isFinite(view.center.x) ||
      !Number.isFinite(view.center.y)
    )
      return;
    view = {
      center: { ...view.center },
      height: Math.max(this.height / 1e6, Math.min(this.height / 1e-6, view.height)),
    };
    const before = this.getWorldView();
    this.pointer.cancel();
    this.previous.record(before, view);
    this.transitionTarget = view;
    this.options.onNavigate?.(kind, before, view);
    this.canvas.dataset.viewTransition = '1';
    const settings = this.options.getNavigationSettings?.();
    this.transition.start(
      view,
      {
        enabled: smooth ? (settings?.transitionEnabled ?? 3) : 0,
        duration: settings?.transitionDuration ?? 750,
        minimumFps: settings?.transitionFps ?? 7,
      },
      () => {
        this.transitionTarget = undefined;
        this.canvas.dataset.viewTransition = '0';
      },
    );
  }
  zoomPrevious(): boolean {
    const target = this.previous.take();
    if (!target) return false;
    const before = this.getWorldView();
    this.setWorldView(target);
    this.options.onNavigate?.('zoom', before, this.getWorldView());
    return true;
  }
  getDrawingBounds(ids?: readonly string[]): ViewBounds | undefined {
    const bounds = this.gpu.getBounds(ids);
    return bounds
      ? { minX: bounds.minX, minY: -bounds.maxY, maxX: bounds.maxX, maxY: -bounds.minY }
      : undefined;
  }
  fit(regenerate = false): void {
    this.transition.cancel();
    this.transitionTarget = undefined;
    this.canvas.dataset.viewTransition = '0';
    this.pointer?.cancel();
    this.resize();
    const bounds = this.getDrawingBounds() ?? { minX: 0, minY: -297, maxX: 420, maxY: 0 };
    this.applyWorldView(fitWorldBounds(bounds, this.getViewportSize(), 0.95), false);
    if (regenerate) this.gpu.regenerate(this.getWorldView().height);
    this.render();
  }
  zoomExtents(): void {
    const bounds = this.getDrawingBounds() ?? { minX: 0, minY: -297, maxX: 420, maxY: 0 };
    this.navigate(fitWorldBounds(bounds, this.getViewportSize(), 0.95));
  }
  regenerate(height?: number): void {
    this.gpu.regenerate(height ?? this.getWorldView().height);
    this.redraw();
  }
  redraw(): void {
    this.baseDirty = true;
    this.render();
  }
  setStressDataset(count: number): void {
    if (!Number.isInteger(count) || count < 0 || count > 1000000)
      throw new RangeError('Stress count must be 0..1000000.');
    this.gpu.setStress(count);
    this.canvas.dataset.stressCount = String(count);
    this.fit();
  }
  worldToScreen(point: CadPoint): CadPoint {
    return {
      x: this.width / 2 + this.view.tx + (point.x - this.origin.x) * this.view.scale,
      y: this.height / 2 + this.view.ty + (point.y - this.origin.y) * this.view.scale,
    };
  }
  cancelPointerInteraction(): void {
    this.pointer.cancel();
  }
  render(): void {
    if (this.disposed) return;
    if (this.animationFrame !== undefined) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
    const started = performance.now(),
      ratio = this.canvas.width / this.width;
    this.canvas.dataset.baseReused = this.baseDirty ? '0' : '1';
    if (this.baseDirty) {
      const view = this.getWorldView(),
        background = this.options.getAidSettings?.().background ?? '#212830';
      const stats = this.gpu.draw(
        { x: view.center.x, y: -view.center.y },
        this.view.scale,
        this.width,
        this.height,
        parseInt(background.slice(1), 16),
      );
      this.canvas.dataset.geometryMs = String(performance.now() - started);
      this.canvas.dataset.drawnEntities = String(stats.entities);
      this.canvas.dataset.drawCalls = String(stats.calls);
      this.canvas.dataset.rebuiltChunks = String(stats.rebuilt);
      this.canvas.dataset.entityCount = String(stats.count);
      this.baseDirty = false;
      if (stats.pending) this.requestRender(true);
    } else this.canvas.dataset.geometryMs = '0';
    const selectionArea = drawSurfaceOverlay(this.overlay, {
      width: this.width,
      height: this.height,
      ratio,
      view: this.view,
      origin: this.origin,
      preview: this.preview,
      unit: this.state?.settings.unit ?? '',
      snap: this.snapMarker,
      area: this.pointer?.getSelectionArea(),
      aids: this.options.getAidSettings?.() ?? defaultAidSettings,
      cursor: this.cursorLocal,
      window: this.options.getNavigationWindow?.(),
      worldToScreen: (p) => this.worldToScreen(p),
      ...(this.trackingOverlay ? { tracking: this.trackingOverlay } : {}),
      edit: this.editOverlay,
      ...(this.options.getSystemVariable ? { variable: this.options.getSystemVariable } : {}),
    });
    Object.assign(this.canvas.dataset, {
      previewCount: String(this.preview.length),
      previewHiddenCount: String(this.previewHiddenIds.size),
      selectionCount: String(this.selected.size),
      gripCount: String(this.editOverlay.grips.length),
      snapActive: this.snapMarker ? '1' : '0',
      snapKind: this.snapMarker?.kind ?? '',
      zoom: String(this.view.scale),
      selectionArea,
      renderMs: String(performance.now() - started),
      frame: String(++this.revision),
    });
  }
  dispose(): void {
    this.disposed = true;
    this.overlay?.remove();
    this.transition?.cancel();
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.observer?.disconnect();
    this.pointer?.dispose();
    this.gpu?.dispose();
  }
  private resize(): void {
    const rect = this.canvas.getBoundingClientRect(),
      width = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || 800)),
      height = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || 600));
    if (this.width !== width || this.height !== height) this.baseDirty = true;
    this.width = width;
    this.height = height;
    const ratio = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    const w = Math.round(width * ratio),
      h = Math.round(height * ratio);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    if (this.overlay.width !== w) this.overlay.width = w;
    if (this.overlay.height !== h) this.overlay.height = h;
  }
  private requestRender(geometryChanged = false): void {
    if (geometryChanged) this.baseDirty = true;
    if (this.disposed || this.animationFrame !== undefined) return;
    if (typeof requestAnimationFrame !== 'function') {
      if (this.pendingCoordinates) {
        this.options.onCoordinates?.(this.pendingCoordinates);
        this.pendingCoordinates = undefined;
      }
      this.render();
      return;
    }
    this.animationFrame = requestAnimationFrame(() => {
      this.animationFrame = undefined;
      if (this.pendingCoordinates) {
        this.options.onCoordinates?.(this.pendingCoordinates);
        this.pendingCoordinates = undefined;
      }
      this.render();
    });
  }
  private worldPoint(point: CadPoint): CadPoint {
    return {
      x: this.origin.x + (point.x - this.width / 2 - this.view.tx) / this.view.scale,
      y: this.origin.y + (point.y - this.height / 2 - this.view.ty) / this.view.scale,
    };
  }
}
