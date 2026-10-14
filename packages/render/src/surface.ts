import { drawingBounds, getLegacyRuntime } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { RetainedScene } from './scene';
import type { SceneStats } from './scene';
import { relativeEntity } from './geometry';

export interface CadView {
  scale: number;
  tx: number;
  ty: number;
}
export interface CadCanvasOptions {
  onCoordinates?: (point: CadPoint) => void;
  onPick?: (pick: CadPointerPick) => void;
  observeResize?: boolean;
}
export interface CadPointerPick {
  point: CadPoint;
  entityId?: string;
  shiftKey: boolean;
}

/** Input drawing snapshots must be immutable. This renderer never edits the caller's model. */
export class CadCanvasSurface {
  private state: LegacyCadState | undefined;
  private view: CadView = { scale: 1, tx: 0, ty: 0 };
  private origin: CadPoint = { x: 0, y: 0 };
  private width = 1;
  private height = 1;
  private observer: ResizeObserver | undefined;
  private pan: { x: number; y: number; tx: number; ty: number } | undefined;
  private disposed = false;
  private preview: readonly CadEntity[] = [];
  private selected = new Set<string>();
  private snapMarker: CadPoint | undefined;
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
    this.resize();
    if (options.observeResize !== false && typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => {
        this.resize();
        this.render();
      });
      this.observer.observe(canvas);
    }
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.render();
  }

  setDrawing(state: LegacyCadState, options: { fit?: boolean } = {}): void {
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
  setSelection(ids: readonly string[]): void {
    const next = new Set(ids);
    if (next.size === this.selected.size && [...next].every((id) => this.selected.has(id))) return;
    this.selected = next;
    this.baseDirty = true;
    this.render();
  }
  setSnapMarker(point?: CadPoint): void {
    if (
      (!point && !this.snapMarker) ||
      (point && this.snapMarker && point.x === this.snapMarker.x && point.y === this.snapMarker.y)
    )
      return;
    this.snapMarker = point === undefined ? undefined : { ...point };
    this.requestRender();
  }
  pick(point: CadPoint): string | undefined {
    return this.scene?.pick(point, 8 / this.view.scale);
  }
  getView(): CadView {
    return { ...this.view };
  }

  fit(): void {
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
    if (!context) throw new Error('2D 캔버스를 사용할 수 없습니다.');
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
      if (!context) throw new Error('미리 보기 캔버스를 사용할 수 없습니다.');
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, this.overlay.width, this.overlay.height);
    } else if (this.base) {
      const baseContext = this.base.getContext('2d');
      if (!baseContext) throw new Error('도면 캐시 캔버스를 사용할 수 없습니다.');
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
    this.canvas.dataset.selectionCount = String(this.selected.size);
    this.canvas.dataset.snapActive = this.snapMarker ? '1' : '0';
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
    if (this.snapMarker) {
      const size = 5 / this.view.scale;
      context.strokeStyle = '#4ade80';
      context.lineWidth = 1 / this.view.scale;
      context.strokeRect(
        this.snapMarker.x - this.origin.x - size,
        this.snapMarker.y - this.origin.y - size,
        size * 2,
        size * 2,
      );
    }
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
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
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
  private localPoint(event: MouseEvent): CadPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private worldPoint(point: CadPoint): CadPoint {
    return {
      x: this.origin.x + (point.x - this.width / 2 - this.view.tx) / this.view.scale,
      y: this.origin.y + (point.y - this.height / 2 - this.view.ty) / this.view.scale,
    };
  }
  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const local = this.localPoint(event);
    const world = this.worldPoint(local);
    this.view.scale = Math.max(
      1e-6,
      Math.min(
        1e6,
        this.view.scale * Math.exp(-Math.max(-1000, Math.min(1000, event.deltaY)) * 0.001),
      ),
    );
    this.view.tx = local.x - this.width / 2 - (world.x - this.origin.x) * this.view.scale;
    this.view.ty = local.y - this.height / 2 - (world.y - this.origin.y) * this.view.scale;
    this.requestRender(true);
  };
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button === 0) {
      event.preventDefault();
      this.canvas.focus?.({ preventScroll: true });
      const point = this.worldPoint(this.localPoint(event));
      const entityId = this.pick(point);
      const pick: CadPointerPick = { point, shiftKey: event.shiftKey };
      if (entityId !== undefined) pick.entityId = entityId;
      this.options.onPick?.(pick);
      return;
    }
    if (event.button !== 1) return;
    event.preventDefault();
    this.pan = { x: event.clientX, y: event.clientY, tx: this.view.tx, ty: this.view.ty };
    this.canvas.setPointerCapture?.(event.pointerId);
  };
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.pan) {
      this.view.tx = this.pan.tx + event.clientX - this.pan.x;
      this.view.ty = this.pan.ty + event.clientY - this.pan.y;
      this.requestRender(true);
    }
    const point = this.worldPoint(this.localPoint(event));
    if (typeof requestAnimationFrame === 'function' && this.options.onCoordinates) {
      this.pendingCoordinates = point;
      this.requestRender();
    } else this.options.onCoordinates?.(point);
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pan = undefined;
    if (this.canvas.hasPointerCapture?.(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
  };
}
