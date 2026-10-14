import {
  drawingBounds,
  getLegacyRuntime,
  pickCadEntity,
  visibleCadEntities,
} from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';

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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: CadCanvasOptions = {},
  ) {
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
    this.selected = new Set(state.selectedIds);
    if (options.fit === false) this.render();
    else this.fit();
  }
  setPreview(entities: readonly CadEntity[]): void {
    if (!entities.length && !this.preview.length) return;
    this.preview = structuredClone(entities);
    this.render();
  }
  setSelection(ids: readonly string[]): void {
    const next = new Set(ids);
    if (next.size === this.selected.size && [...next].every((id) => this.selected.has(id))) return;
    this.selected = next;
    this.render();
  }
  setSnapMarker(point?: CadPoint): void {
    if (
      (!point && !this.snapMarker) ||
      (point && this.snapMarker && point.x === this.snapMarker.x && point.y === this.snapMarker.y)
    )
      return;
    this.snapMarker = point === undefined ? undefined : { ...point };
    this.render();
  }
  pick(point: CadPoint): string | undefined {
    return this.state ? pickCadEntity(this.state, point, 8 / this.view.scale)?.id : undefined;
  }
  getView(): CadView {
    return { ...this.view };
  }

  fit(): void {
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
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('2D 캔버스를 사용할 수 없습니다.');
    const ratio = this.canvas.width / this.width;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#212830';
    context.fillRect(0, 0, this.width, this.height);
    const entities = this.state ? visibleCadEntities(this.state) : [];
    this.canvas.dataset.entityCount = String(entities.length);
    this.canvas.dataset.previewCount = String(this.preview.length);
    this.canvas.dataset.selectionCount = String(this.selected.size);
    this.canvas.dataset.snapActive = this.snapMarker ? '1' : '0';
    this.canvas.dataset.zoom = String(this.view.scale);
    if (!this.state) return;
    context.save();
    context.translate(this.width / 2 + this.view.tx, this.height / 2 + this.view.ty);
    context.scale(this.view.scale, this.view.scale);
    context.translate(-this.origin.x, -this.origin.y);
    const exporters = getLegacyRuntime().core.cadExporters;
    for (const entity of entities)
      exporters.drawEntity(context, entity, {
        scale: this.view.scale,
        unit: this.state.settings.unit,
        selected: this.selected.has(entity.id),
      });
    for (const entity of this.preview)
      exporters.drawEntity(context, entity, {
        scale: this.view.scale,
        unit: this.state.settings.unit,
        color: '#fbbf24',
      });
    if (this.snapMarker) {
      const size = 5 / this.view.scale;
      context.strokeStyle = '#4ade80';
      context.lineWidth = 1 / this.view.scale;
      context.strokeRect(this.snapMarker.x - size, this.snapMarker.y - size, size * 2, size * 2);
    }
    context.restore();
  }

  dispose(): void {
    this.disposed = true;
    this.observer?.disconnect();
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || 800));
    this.height = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || 600));
    const ratio = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    if (this.canvas.width !== Math.round(this.width * ratio))
      this.canvas.width = Math.round(this.width * ratio);
    if (this.canvas.height !== Math.round(this.height * ratio))
      this.canvas.height = Math.round(this.height * ratio);
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
    this.render();
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
      this.render();
    }
    this.options.onCoordinates?.(this.worldPoint(this.localPoint(event)));
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pan = undefined;
    if (this.canvas.hasPointerCapture?.(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
  };
}
