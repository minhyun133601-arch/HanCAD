import type { CadPoint } from '@hancad/legacy-bridge';
import type { CadAidSettings } from './drafting-aids';
import type { DisplayLayerStyle } from './sources/style-tables';
import type { LinetypeDefinition } from './style/linetype';

export interface CadView {
  scale: number;
  tx: number;
  ty: number;
}
export interface CadPointerPick {
  point: CadPoint;
  entityId?: string;
  shiftKey: boolean;
}
export interface CadSelectionDrag {
  start: CadPoint;
  end: CadPoint;
  shiftKey: boolean;
  ctrlKey: boolean;
  phase: 'start' | 'move' | 'end' | 'cancel';
  reason?: 'escape';
  gesture?: 'area' | 'fence';
  points?: readonly CadPoint[];
}
/** The displayed model region: center in drawing-session coordinates and height in units. */
export interface CadWorldView {
  center: CadPoint;
  height: number;
}
export type CadNavigationKind = 'zoom' | 'pan';
export interface CadNavigationSettings {
  zoomFactor: number;
  zoomWheel: number;
  middleButtonPan: number;
  transitionEnabled?: number;
  transitionDuration?: number;
  transitionFps?: number;
}
export interface CadCanvasOptions {
  onCoordinates?: (point: CadPoint) => void;
  onPick?: (pick: CadPointerPick) => void;
  canSelectArea?: () => boolean;
  selectionGesture?: () => 'area' | 'fence';
  suppressSelectionBox?: (start: CadPoint) => boolean;
  onSelectionDrag?: (event: CadSelectionDrag) => void;
  getNavigationSettings?: () => CadNavigationSettings;
  getNavigationMode?: () => 'pan' | 'zoom' | undefined;
  getNavigationWindow?: () => CadWorldView | undefined;
  getAidSettings?: () => CadAidSettings;
  getSystemVariable?: (name: string) => unknown;
  getLinetypes?: () => ReadonlyMap<string, LinetypeDefinition>;
  getLayerStyles?: () => ReadonlyMap<string, DisplayLayerStyle>;
  /** Called once per completed wheel step, pan drag or extents fit with the prior view. */
  onNavigate?: (kind: CadNavigationKind, before: CadWorldView, after: CadWorldView) => void;
  observeResize?: boolean;
}
interface PointerHost {
  view: () => CadView;
  viewport: () => CadPoint;
  changeView: (view: CadView) => void;
  worldPoint: (local: CadPoint) => CadPoint;
  pick: (point: CadPoint) => string | undefined;
  coordinates: (point: CadPoint) => void;
  fit: () => void;
  invalidate: () => void;
  worldView: () => CadWorldView;
  cursorLocal?: (point?: CadPoint) => void;
}
interface Press {
  pointerId: number;
  local: CadPoint;
  start: CadPoint;
  end: CadPoint;
  shiftKey: boolean;
  ctrlKey: boolean;
  suppressBox: boolean;
  dragging: boolean;
  gesture: 'area' | 'fence';
  points: CadPoint[];
}

/** Keeps canvas capture, selection gestures and view navigation out of drawing code. */
export class CadPointerController {
  private pan:
    | {
        pointerId: number;
        button: number;
        mode: 'pan' | 'zoom';
        local: CadPoint;
        view: CadView;
        moved: boolean;
        before: CadWorldView;
      }
    | undefined;
  private press: Press | undefined;
  private middleClick: { time: number; local: CadPoint } | undefined;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: CadCanvasOptions,
    private readonly host: PointerHost,
  ) {
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerenter', this.onPointerEnter);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('lostpointercapture', this.onPointerCancel);
    canvas.addEventListener('auxclick', this.onAuxClick);
    canvas.ownerDocument?.addEventListener?.('keydown', this.onKeyDown, true);
    canvas.ownerDocument?.defaultView?.addEventListener('blur', this.onBlur);
  }

  getSelectionArea(): CadSelectionDrag | undefined {
    return this.press?.dragging && !this.press.suppressBox
      ? this.selectionEvent(this.press, 'move')
      : undefined;
  }
  cancel(reason?: 'escape'): void {
    const press = this.press;
    const pan = this.pan;
    this.press = undefined;
    this.pan = undefined;
    this.middleClick = undefined;
    if (press?.dragging) {
      this.options.onSelectionDrag?.(this.selectionEvent(press, 'cancel', reason));
      this.host.invalidate();
    }
    if (press) this.release(press.pointerId);
    if (pan) this.release(pan.pointerId);
  }
  dispose(): void {
    this.cancel();
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerenter', this.onPointerEnter);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onPointerCancel);
    this.canvas.removeEventListener('auxclick', this.onAuxClick);
    this.canvas.ownerDocument?.removeEventListener?.('keydown', this.onKeyDown, true);
    this.canvas.ownerDocument?.defaultView?.removeEventListener('blur', this.onBlur);
  }
  private localPoint(event: MouseEvent): CadPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private release(pointerId: number): void {
    if (this.canvas.hasPointerCapture?.(pointerId)) this.canvas.releasePointerCapture(pointerId);
  }
  private selectionEvent(
    press: Press,
    phase: CadSelectionDrag['phase'],
    reason?: 'escape',
  ): CadSelectionDrag {
    return {
      start: { ...press.start },
      end: { ...press.end },
      shiftKey: press.shiftKey,
      ctrlKey: press.ctrlKey,
      phase,
      gesture: press.gesture,
      ...(press.gesture === 'fence' ? { points: press.points.map((point) => ({ ...point })) } : {}),
      ...(reason === undefined ? {} : { reason }),
    };
  }
  private pick(point: CadPoint, shiftKey: boolean): void {
    const entityId = this.host.pick(point);
    this.options.onPick?.({ point, shiftKey, ...(entityId === undefined ? {} : { entityId }) });
  }
  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    const settings = this.options.getNavigationSettings?.();
    const factor = Math.max(3, Math.min(100, settings?.zoomFactor ?? 60));
    const direction = settings?.zoomWheel === 1 ? -1 : 1;
    const divisor = event.deltaMode === 1 ? 3 : event.deltaMode === 2 ? 1 : 100;
    const steps = Math.max(-10, Math.min(10, event.deltaY / divisor)) * direction;
    const local = this.localPoint(event);
    const view = this.host.view();
    const before = this.host.worldView();
    const scale = Math.max(1e-6, Math.min(1e6, view.scale * (1 + factor / 100) ** -steps));
    const ratio = scale / view.scale;
    const { x: width, y: height } = this.host.viewport();
    this.host.changeView({
      scale,
      tx: local.x - width / 2 - (local.x - width / 2 - view.tx) * ratio,
      ty: local.y - height / 2 - (local.y - height / 2 - view.ty) * ratio,
    });
    if (this.pan) this.pan = { ...this.pan, local, view: this.host.view() };
    else this.options.onNavigate?.('zoom', before, this.host.worldView());
  };
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    if (event.button === 1 && this.options.getNavigationSettings?.().middleButtonPan === 0) return;
    this.canvas.focus?.({ preventScroll: true });
    const local = this.localPoint(event);
    const mode = event.button === 0 ? this.options.getNavigationMode?.() : 'pan';
    if (event.button === 0 && !mode) {
      const point = this.host.worldPoint(local);
      if (!this.options.canSelectArea?.()) {
        this.pick(point, event.shiftKey);
        return;
      }
      this.cancel();
      this.press = {
        pointerId: event.pointerId,
        local,
        start: point,
        end: point,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        suppressBox: !event.shiftKey && (this.options.suppressSelectionBox?.(point) ?? false),
        dragging: false,
        gesture: this.options.selectionGesture?.() ?? 'area',
        points: [{ ...point }],
      };
    } else {
      const previous = this.middleClick;
      this.middleClick = undefined;
      if (
        event.button === 1 &&
        previous &&
        event.timeStamp - previous.time <= 500 &&
        Math.hypot(local.x - previous.local.x, local.y - previous.local.y) <= 6
      ) {
        const before = this.host.worldView();
        this.host.fit();
        this.options.onNavigate?.('zoom', before, this.host.worldView());
        return;
      }
      this.cancel();
      this.pan = {
        pointerId: event.pointerId,
        button: event.button,
        mode: mode ?? 'pan',
        local,
        view: this.host.view(),
        moved: false,
        before: this.host.worldView(),
      };
    }
    this.canvas.setPointerCapture?.(event.pointerId);
  };
  private readonly onPointerMove = (event: PointerEvent): void => {
    const local = this.localPoint(event);
    this.updateCursorLocal(local);
    if (this.pan && (event.pointerId === undefined || event.pointerId === this.pan.pointerId)) {
      if (event.buttons !== undefined && !(event.buttons & (this.pan.button === 1 ? 4 : 1)))
        this.cancel();
      else {
        const dx = local.x - this.pan.local.x;
        const dy = local.y - this.pan.local.y;
        this.pan.moved ||= Math.hypot(dx, dy) >= 4;
        if (this.pan.mode === 'zoom') {
          const height = this.host.viewport().y;
          const scale = Math.max(
            1e-6,
            Math.min(1e6, this.pan.view.scale * 2 ** ((-dy * 2) / height)),
          );
          const ratio = scale / this.pan.view.scale;
          this.host.changeView({
            scale,
            tx: this.pan.view.tx * ratio,
            ty: this.pan.view.ty * ratio,
          });
        } else
          this.host.changeView({
            ...this.pan.view,
            tx: this.pan.view.tx + dx,
            ty: this.pan.view.ty + dy,
          });
      }
    }
    const point = this.host.worldPoint(local);
    const press = this.press;
    if (press && (event.pointerId === undefined || event.pointerId === press.pointerId)) {
      if (event.buttons !== undefined && !(event.buttons & 1)) this.cancel();
      else {
        press.end = point;
        press.ctrlKey = event.ctrlKey;
        if (press.gesture === 'fence') this.appendFencePoint(press, point);
        if (press.dragging || Math.hypot(local.x - press.local.x, local.y - press.local.y) >= 4) {
          const phase = press.dragging ? 'move' : 'start';
          press.dragging = true;
          this.options.onSelectionDrag?.(this.selectionEvent(press, phase));
          this.host.invalidate();
        }
      }
    }
    this.host.coordinates(point);
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    const pan = this.pan;
    if (pan && event.pointerId === pan.pointerId && event.button === pan.button) {
      this.pan = undefined;
      if (!pan.moved && pan.button === 1)
        this.middleClick = { time: event.timeStamp, local: this.localPoint(event) };
      else this.options.onNavigate?.(pan.mode, pan.before, this.host.worldView());
      this.release(pan.pointerId);
    }
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId || event.button !== 0) return;
    this.press = undefined;
    press.end = this.host.worldPoint(this.localPoint(event));
    press.ctrlKey = event.ctrlKey;
    if (press.gesture === 'fence') this.appendFencePoint(press, press.end);
    this.release(press.pointerId);
    if (press.dragging) {
      this.options.onSelectionDrag?.(this.selectionEvent(press, 'end'));
      this.host.invalidate();
    } else this.pick(press.start, press.shiftKey);
  };
  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.press?.pointerId || event.pointerId === this.pan?.pointerId)
      this.cancel();
  };
  private appendFencePoint(press: Press, point: CadPoint): void {
    const last = press.points.at(-1);
    if (!last || point.x !== last.x || point.y !== last.y) press.points.push({ ...point });
  }
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') return;
    if (this.press || this.pan) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.cancel('escape');
  };
  private readonly onBlur = (): void => this.cancel();
  private readonly onPointerEnter = (event: PointerEvent): void => {
    this.updateCursorLocal(this.localPoint(event));
    this.host.invalidate();
  };
  private readonly onPointerLeave = (): void => {
    this.host.cursorLocal?.();
    this.host.invalidate();
  };
  private updateCursorLocal(local: CadPoint): void {
    const viewport = this.host.viewport();
    this.host.cursorLocal?.(
      local.x >= 0 && local.y >= 0 && local.x <= viewport.x && local.y <= viewport.y
        ? local
        : undefined,
    );
  }
  private readonly onAuxClick = (event: MouseEvent): void => {
    if (event.button === 1) event.preventDefault();
  };
}
