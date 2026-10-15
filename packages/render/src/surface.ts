import { drawingBounds, getLegacyRuntime } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { RetainedScene } from './scene';
import type { SceneStats } from './scene';
import { relativeEntity } from './geometry';
import { CadPointerController } from './pointer-controller';
import type { CadCanvasOptions, CadView } from './pointer-controller';
import { drawSnapOverlay } from './snap-overlay';
import { drawSelectionOverlay } from './selection-overlay';
import type { CadSnapKind, CadSnapMarker } from './snap-overlay';
import { CanvasContextError } from './errors';
export type { CadSnapKind } from './snap-overlay';
export type {
  CadCanvasOptions,
  CadNavigationSettings,
  CadPointerPick,
  CadSelectionDrag,
  CadView,
} from './pointer-controller';

/** Input drawing snapshots must be immutable. This renderer never edits the caller's model. */
export class CadCanvasSurface {
  private state: LegacyCadState | undefined;
  private view: CadView = { scale: 1, tx: 0, ty: 0 };
  private origin: CadPoint = { x: 0, y: 0 };
  private width = 1;
  private height = 1;
  private observer: ResizeObserver | undefined;
  private readonly pointer!: CadPointerController;
  private disposed = false;
  private preview: readonly CadEntity[] = [];
  private selected = new Set<string>();
  private previewHiddenIds = new Set<string>();
  private snapMarker: CadSnapMarker | undefined;
  private scene: RetainedScene | undefined;
  private readonly base: HTMLCanvasElement | undefined;
  private readonly overlay: HTMLCanvasElement | undefined;
  private baseDirty = true;
  private stats: SceneStats = { entities: 0, calls: 0 };
  private animationFrame: number | undefined;
  private pendingCoordinates: CadPoint | undefined;
  private revision = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: CadCanvasOptions = {},
  ) {
    const layer = canvas.ownerDocument?.createElement('canvas');
    if (layer && canvas.parentElement) {
      this.overlay = layer;
      layer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      layer.setAttribute('aria-hidden', 'true');
      canvas.parentElement.append(layer);
    } else this.base = layer;
    try {
      this.resize();
      if (options.observeResize !== false && typeof ResizeObserver === 'function') {
        this.observer = new ResizeObserver(() => {
          this.resize();
          this.render();
        });
        this.observer.observe(canvas);
      }
      this.pointer = new CadPointerController(canvas, options, {
        view: () => this.getView(),
        viewport: () => ({ x: this.width, y: this.height }),
        changeView: (view) => {
          this.view = view;
          this.requestRender(true);
        },
        worldPoint: (point) => this.worldPoint(point),
        pick: (point) => this.pick(point),
        coordinates: (point) => {
          if (typeof requestAnimationFrame === 'function' && options.onCoordinates) {
            this.pendingCoordinates = point;
            this.requestRender();
          } else options.onCoordinates?.(point);
        },
        fit: () => this.fit(),
        invalidate: () => this.requestRender(),
      });
      this.render();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  setDrawing(state: LegacyCadState, options: { fit?: boolean } = {}): void {
    this.pointer.cancel();
    this.state = state;
    this.scene = new RetainedScene(state);
    this.baseDirty = true;
    this.selected = new Set(state.selectedIds);
    if (options.fit === false) this.render();
    else this.fit();
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
    this.requestRender(true);
  }
  setSelection(ids: readonly string[]): void {
    const next = new Set(ids);
    if (next.size === this.selected.size && [...next].every((id) => this.selected.has(id))) return;
    this.selected = next;
    this.baseDirty = true;
    this.render();
  }
  setSnapMarker(
    point?: CadPoint,
    kind: CadSnapKind = 'endpoint',
    label?: string,
    showMarker = true,
  ): void {
    if (
      (!point && !this.snapMarker) ||
      (point &&
        this.snapMarker &&
        point.x === this.snapMarker.point.x &&
        point.y === this.snapMarker.point.y &&
        kind === this.snapMarker.kind &&
        label === this.snapMarker.label &&
        showMarker === this.snapMarker.showMarker)
    )
      return;
    this.snapMarker =
      point === undefined
        ? undefined
        : { point: { ...point }, kind, showMarker, ...(label === undefined ? {} : { label }) };
    this.requestRender();
  }
  pick(point: CadPoint): string | undefined {
    return this.scene?.pick(point, 8 / this.view.scale);
  }
  getView(): CadView {
    return { ...this.view };
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

  fit(): void {
    this.pointer.cancel();
    this.baseDirty = true;
    this.resize();
    if (this.state) {
      const bounds = this.state.entities.length
        ? drawingBounds(this.state)
        : { minX: 0, minY: -297, maxX: 420, maxY: 0 };
      this.origin = {
        x: bounds.minX + (bounds.maxX - bounds.minX) / 2,
        y: bounds.minY + (bounds.maxY - bounds.minY) / 2,
      };
      this.view = {
        scale: Math.max(
          1e-6,
          Math.min(
            1e6,
            Math.min(
              this.width / Math.max(1, bounds.maxX - bounds.minX),
              this.height / Math.max(1, bounds.maxY - bounds.minY),
            ) * 0.86,
          ),
        ),
        tx: 0,
        ty: 0,
      };
    } else this.view = { scale: 1, tx: 0, ty: 0 };
    this.render();
  }

  render(): void {
    if (this.disposed) return;
    if (this.animationFrame !== undefined) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
    const started = performance.now();
    const mainContext = this.canvas.getContext('2d');
    let context = mainContext;
    if (!context) throw new CanvasContextError('main');
    const ratio = this.canvas.width / this.width;
    if (this.overlay) {
      this.canvas.dataset.baseReused = this.baseDirty ? '0' : '1';
      if (this.baseDirty) this.drawBase(context, ratio);
      else this.canvas.dataset.geometryMs = '0';
      if (this.overlay.width !== this.canvas.width || this.overlay.height !== this.canvas.height) {
        this.overlay.width = this.canvas.width;
        this.overlay.height = this.canvas.height;
      }
      context = this.overlay.getContext('2d');
      if (!context) throw new CanvasContextError('preview');
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, this.overlay.width, this.overlay.height);
    } else if (this.base) {
      const baseContext = this.base.getContext('2d');
      if (!baseContext) throw new CanvasContextError('cache');
      if (this.base.width !== this.canvas.width || this.base.height !== this.canvas.height) {
        this.base.width = this.canvas.width;
        this.base.height = this.canvas.height;
        this.baseDirty = true;
      }
      this.canvas.dataset.baseReused = this.baseDirty ? '0' : '1';
      if (this.baseDirty) this.drawBase(baseContext, ratio);
      else this.canvas.dataset.geometryMs = '0';
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(this.base, 0, 0);
    } else this.drawBase(context, ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.canvas.dataset.entityCount = String(this.scene?.entities.length ?? 0);
    this.canvas.dataset.previewCount = String(this.preview.length);
    this.canvas.dataset.previewHiddenCount = String(this.previewHiddenIds.size);
    this.canvas.dataset.selectionCount = String(this.selected.size);
    this.canvas.dataset.snapActive = this.snapMarker ? '1' : '0';
    this.canvas.dataset.snapKind = this.snapMarker?.kind ?? '';
    this.canvas.dataset.zoom = String(this.view.scale);
    context.save();
    context.setTransform(
      ratio * this.view.scale,
      0,
      0,
      ratio * this.view.scale,
      ratio * (this.width / 2 + this.view.tx),
      ratio * (this.height / 2 + this.view.ty),
    );
    const exporters = getLegacyRuntime().core.cadExporters;
    for (const entity of this.preview)
      exporters.drawEntity(context, relativeEntity(entity, this.origin), {
        scale: this.view.scale,
        unit: this.state?.settings.unit ?? '',
        color: '#fbbf24',
      });
    if (this.snapMarker) drawSnapOverlay(context, this.snapMarker, this.origin, this.view.scale);
    const area = this.pointer.getSelectionArea();
    this.canvas.dataset.selectionArea = area
      ? area.gesture === 'fence'
        ? 'fence'
        : area.end.x >= area.start.x
          ? 'window'
          : 'crossing'
      : '';
    if (area) drawSelectionOverlay(context, area, this.origin, this.view.scale);
    context.restore();
    this.canvas.dataset.drawnEntities = String(this.stats.entities);
    this.canvas.dataset.drawCalls = String(this.stats.calls);
    this.canvas.dataset.renderMs = String(performance.now() - started);
    this.canvas.dataset.frame = String(++this.revision);
  }

  dispose(): void {
    this.disposed = true;
    this.overlay?.remove();
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.observer?.disconnect();
    this.pointer?.dispose();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || 800));
    const height = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || 600));
    if (this.width !== width || this.height !== height) this.baseDirty = true;
    this.width = width;
    this.height = height;
    const ratio = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    if (this.canvas.width !== Math.round(this.width * ratio))
      this.canvas.width = Math.round(this.width * ratio);
    if (this.canvas.height !== Math.round(this.height * ratio))
      this.canvas.height = Math.round(this.height * ratio);
  }
  private applyView(context: CanvasRenderingContext2D): void {
    context.translate(this.width / 2 + this.view.tx, this.height / 2 + this.view.ty);
    context.scale(this.view.scale, this.view.scale);
    context.translate(-this.origin.x, -this.origin.y);
  }
  private drawBase(context: CanvasRenderingContext2D, ratio: number): void {
    const started = performance.now();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#212830';
    context.fillRect(0, 0, this.width, this.height);
    context.save();
    this.applyView(context);
    const first = this.worldPoint({ x: 0, y: 0 });
    const last = this.worldPoint({ x: this.width, y: this.height });
    this.stats = this.scene?.draw(
      context,
      { minX: first.x, minY: first.y, maxX: last.x, maxY: last.y },
      this.view.scale,
      this.selected,
      {
        origin: this.origin,
        scale: this.view.scale,
        ratio,
        tx: this.width / 2 + this.view.tx,
        ty: this.height / 2 + this.view.ty,
      },
      this.previewHiddenIds,
    ) ?? { entities: 0, calls: 0 };
    context.restore();
    this.baseDirty = false;
    this.canvas.dataset.geometryMs = String(performance.now() - started);
  }
  private requestRender(geometryChanged = false): void {
    if (geometryChanged) this.baseDirty = true;
    if (this.disposed || this.animationFrame !== undefined) return;
    if (typeof requestAnimationFrame !== 'function') {
      this.render();
      return;
    }
    this.animationFrame = requestAnimationFrame(() => {
      this.animationFrame = undefined;
      if (this.pendingCoordinates) {
        const point = this.pendingCoordinates;
        this.pendingCoordinates = undefined;
        this.options.onCoordinates?.(point);
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
