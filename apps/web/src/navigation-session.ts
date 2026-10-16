import { parseDraftPoint, validDraftPoint } from '@hancad/draft';
import { reverseHangulInput } from '@hancad/input';
import type { CadPoint } from '@hancad/legacy-bridge';
import { fitWorldBounds, scaleWorldView, unionViewBounds, windowWorldView } from '@hancad/render';
import type { CadNavigationKind, CadWorldView, ViewBounds, ViewportSize } from '@hancad/render';

export type NavigationStage =
  | 'zoom'
  | 'window-first'
  | 'window-second'
  | 'center'
  | 'height'
  | 'scale'
  | 'objects'
  | 'pan-base'
  | 'pan-second'
  | 'realtime-pan'
  | 'realtime-zoom'
  | 'dynamic';
export interface NavigationHost {
  view(): CadWorldView;
  viewport(): ViewportSize;
  limits(): ViewBounds;
  bounds(ids?: readonly string[]): ViewBounds | undefined;
  selected(): readonly string[];
  allIds(): readonly string[];
  apply(view: CadWorldView, kind: CadNavigationKind, smooth?: boolean): void;
  /** Temporarily shows the dynamic overview without adding navigation history. */
  preview?(view: CadWorldView): void;
  previous(): boolean;
  redraw(): void;
  regenerate(height?: number): void;
  paperHeight?(): number | undefined;
}
export interface NavigationSnapshot {
  stage: NavigationStage;
  window?: CadWorldView;
  selectedIds?: readonly string[];
}

/** Shared text/mouse state machine; every accepted view goes through one host operation. */
export class NavigationSession {
  private stage: NavigationStage;
  private first: CadPoint | undefined;
  private readonly ids = new Set<string>();
  private dynamicWindow: CadWorldView | undefined;
  private dynamicOriginal: CadWorldView | undefined;
  private dynamicSizing = false;
  private dynamicAnchor: CadPoint | undefined;
  private active = true;

  constructor(
    command: 'ZOOM' | 'PAN',
    private readonly host: NavigationHost,
    private readonly changed: () => void,
    private readonly print: (ko: string, en: string) => void,
    commandLine = false,
    private readonly transparent = false,
    private readonly acceptedPoint?: (point: CadPoint) => void,
  ) {
    this.stage = command === 'ZOOM' ? 'zoom' : commandLine ? 'pan-base' : 'realtime-pan';
  }
  getSnapshot(): NavigationSnapshot | undefined {
    return this.active
      ? {
          stage: this.stage,
          ...(this.dynamicWindow ? { window: structuredClone(this.dynamicWindow) } : {}),
          ...(this.stage === 'objects' ? { selectedIds: [...this.ids] } : {}),
        }
      : undefined;
  }
  get mode(): 'pan' | 'zoom' | undefined {
    return this.stage === 'realtime-pan'
      ? 'pan'
      : this.stage === 'realtime-zoom'
        ? 'zoom'
        : undefined;
  }
  get selectingObjects(): boolean {
    return this.active && this.stage === 'objects';
  }
  get needsPoint(): boolean {
    return (
      this.active &&
      [
        'zoom',
        'window-first',
        'window-second',
        'center',
        'pan-base',
        'pan-second',
        'dynamic',
      ].includes(this.stage)
    );
  }
  cancel(): void {
    if (this.dynamicOriginal) this.host.preview?.(this.dynamicOriginal);
    this.dynamicOriginal = undefined;
    this.active = false;
    this.dynamicWindow = undefined;
    this.changed();
  }
  private finish(): void {
    this.cancel();
  }
  private error(): void {
    this.print(
      '점 또는 유효한 옵션 키워드를 지정해야 합니다.',
      'A point or valid option keyword is required.',
    );
  }
  private apply(view: CadWorldView, kind: CadNavigationKind = 'zoom'): void {
    if (this.dynamicOriginal) {
      this.host.preview?.(this.dynamicOriginal);
      this.dynamicOriginal = undefined;
    }
    this.host.apply(view, kind);
    this.finish();
  }
  private fit(ids?: readonly string[], all = false): void {
    const bounds = this.host.bounds(ids);
    if (ids && !bounds) {
      this.print('객체를 선택하지 않았습니다.', 'No objects selected.');
      return;
    }
    const target = all
      ? unionViewBounds(this.host.limits(), bounds)
      : (bounds ?? this.host.limits());
    const view = fitWorldBounds(target, this.host.viewport(), 0.95);
    if (all) this.host.regenerate(view.height);
    this.apply(view);
  }
  /** Returns true only when the text supplied an accepted point. */
  acceptText(raw: string): boolean {
    if (!this.active) return false;
    const value = reverseHangulInput(raw.trim()).replace(/^_/, '').toUpperCase();
    if (this.stage === 'realtime-pan' || this.stage === 'realtime-zoom') {
      if (!value) this.finish();
      else this.error();
      return false;
    }
    if (this.stage === 'objects') {
      if (!value) {
        this.fit([...this.ids]);
        return false;
      }
      if (value === 'ALL' || value === 'A') {
        this.select(this.host.allIds(), false);
      } else this.error();
      return false;
    }
    if (this.stage === 'dynamic') {
      if (!value && this.dynamicWindow) this.apply(this.dynamicWindow);
      else this.error();
      return false;
    }
    if (this.stage === 'zoom') {
      if (!value) this.stage = 'realtime-zoom';
      else if (value === 'A' || value === 'ALL') {
        if (this.transparent) {
          this.print(
            '투명 명령에서는 이 옵션을 사용할 수 없습니다.',
            'This option is not available transparently.',
          );
          return false;
        }
        this.fit(undefined, true);
        return false;
      } else if (value === 'E' || value === 'EXTENTS') {
        this.fit();
        return false;
      } else if (value === 'P' || value === 'PREVIOUS') {
        if (!this.host.previous()) this.print('이전 뷰가 없습니다.', 'No previous view.');
        this.finish();
        return false;
      } else if (value === 'C' || value === 'CENTER') this.stage = 'center';
      else if (value === 'S' || value === 'SCALE') this.stage = 'scale';
      else if (value === 'W' || value === 'WINDOW') this.stage = 'window-first';
      else if (value === 'R' || value === 'REALTIME') this.stage = 'realtime-zoom';
      else if (value === 'O' || value === 'OBJECT') {
        const selected = this.host.selected();
        if (selected.length) {
          this.fit(selected);
          return false;
        }
        this.stage = 'objects';
      } else if (value === 'D' || value === 'DYNAMIC') {
        this.stage = 'dynamic';
        this.dynamicWindow = this.host.view();
        this.dynamicOriginal = structuredClone(this.dynamicWindow);
        this.host.preview?.(
          fitWorldBounds(
            unionViewBounds(this.host.limits(), this.host.bounds()),
            this.host.viewport(),
            0.95,
          ),
        );
      } else {
        const point = parseDraftPoint(raw);
        if (point) return this.acceptPoint(point);
        else if (this.scale(value)) return false;
        else {
          this.error();
          return false;
        }
      }
      this.changed();
      this.host.redraw();
      return false;
    }
    if (this.stage === 'scale') {
      if (!this.scale(value)) this.error();
      return false;
    }
    if (this.stage === 'height') {
      const current = this.host.view();
      const height = value === '' ? current.height : Number(value);
      if (height > 0 && Number.isFinite(height))
        this.apply({ center: this.first ?? current.center, height });
      else {
        const scaled = scaleWorldView(
          value,
          current,
          fitWorldBounds(this.host.limits(), this.host.viewport()),
          this.host.paperHeight?.(),
        );
        if (scaled) this.apply({ ...scaled, center: this.first ?? current.center });
        else this.error();
      }
      return false;
    }
    if (this.stage === 'pan-second' && !value && this.first) {
      const view = this.host.view();
      this.apply(
        { ...view, center: { x: view.center.x - this.first.x, y: view.center.y - this.first.y } },
        'pan',
      );
      return false;
    }
    const point = parseDraftPoint(raw, this.first);
    if (point) return this.acceptPoint(point);
    this.error();
    return false;
  }
  private scale(value: string): boolean {
    if (/XP$/i.test(value) && this.host.paperHeight?.() === undefined) {
      this.print(
        '도면 공간 축척은 배치의 모형 뷰포트에서 지정해야 합니다.',
        'Paper space scale requires an active model viewport in a layout.',
      );
      return false;
    }
    const scaled = scaleWorldView(
      value,
      this.host.view(),
      fitWorldBounds(this.host.limits(), this.host.viewport()),
      this.host.paperHeight?.(),
    );
    if (!scaled) return false;
    this.apply(scaled);
    return true;
  }
  acceptPoint(point: CadPoint, entityId?: string, remove = false): boolean {
    if (!this.active || !validDraftPoint(point)) return false;
    if (this.stage === 'objects') {
      if (entityId) {
        if (remove) this.ids.delete(entityId);
        else this.ids.add(entityId);
        this.changed();
      }
      return false;
    } else if (this.stage === 'zoom' || this.stage === 'window-first') {
      this.first = { ...point };
      this.stage = 'window-second';
      this.changed();
    } else if (this.stage === 'window-second' && this.first) {
      const view = windowWorldView(this.first, point, this.host.viewport());
      if (view) this.apply(view);
      else {
        this.error();
        return false;
      }
    } else if (this.stage === 'center') {
      this.first = { ...point };
      this.stage = 'height';
      this.changed();
    } else if (this.stage === 'pan-base') {
      this.first = { ...point };
      this.stage = 'pan-second';
      this.changed();
    } else if (this.stage === 'pan-second' && this.first) {
      const view = this.host.view();
      this.apply(
        {
          ...view,
          center: {
            x: view.center.x - (point.x - this.first.x),
            y: view.center.y - (point.y - this.first.y),
          },
        },
        'pan',
      );
    } else if (this.stage === 'dynamic') {
      this.moveCursor(point);
      this.dynamicSizing = !this.dynamicSizing;
      this.dynamicAnchor = { ...point };
      this.changed();
    } else return false;
    this.acceptedPoint?.({ ...point });
    return true;
  }
  select(ids: readonly string[], remove: boolean): void {
    for (const id of ids)
      if (remove) this.ids.delete(id);
      else this.ids.add(id);
    this.changed();
  }
  moveCursor(point: CadPoint): void {
    if (this.stage === 'window-second' && this.first) {
      this.dynamicWindow = windowWorldView(this.first, point, this.host.viewport());
    } else if (this.stage === 'dynamic' && this.dynamicWindow) {
      if (this.dynamicSizing && this.dynamicAnchor) {
        const aspect = this.host.viewport().width / this.host.viewport().height;
        this.dynamicWindow = {
          ...this.dynamicWindow,
          height: Math.max(1e-6, (2 * Math.abs(point.x - this.dynamicWindow.center.x)) / aspect),
        };
      } else this.dynamicWindow = { ...this.dynamicWindow, center: { ...point } };
    } else return;
    this.host.redraw();
    this.changed();
  }
}
