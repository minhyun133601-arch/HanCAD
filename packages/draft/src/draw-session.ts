import type { CadEntity, CadPoint, CadSettings } from '@hancad/legacy-bridge';
import { PointInputController } from './point-input';
import type { PointInputContext } from './point-input';
import { validDraftPoint } from './coordinates';
import { scalarDrawPreview } from './draw-preview';
import type {
  DraftInputResult,
  DraftPointOptions,
  DraftSessionOptions,
  DraftSnapshot,
  DraftTextOptions,
  DraftTool,
} from './types';
import type {
  DrawContext,
  DrawFactory,
  DrawProgram,
  DrawRequest,
  DrawResult,
  DrawValue,
} from './draw-program';

export interface DrawSessionOptions extends Omit<DraftSessionOptions, 'onCommit'> {
  context: DrawContext;
  onComplete: (
    result: DrawResult,
    changes: ReadonlyMap<string, number | string | readonly number[]>,
  ) => void;
  onNotice?: (notice: { ko: string; en: string }) => void;
}

/** One coroutine owns interactive, scripted and cursor-preview acquisition. */
export class DrawSession {
  private readonly program: DrawProgram;
  private readonly pointInput: PointInputController;
  private readonly changes = new Map<string, number | string | readonly number[]>();
  private request: DrawRequest | undefined;
  private cursor: CadPoint | undefined;
  private cursorOptions: DraftPointOptions = {};
  private scalarPreview: string | undefined;
  private readonly history: DrawValue[] = [];
  private status: DraftSnapshot['status'] = 'active';
  private partial: CadEntity[] = [];
  private partialEraseIds: string[] = [];
  private settings: CadSettings;

  constructor(
    readonly tool: DraftTool,
    private readonly factory: DrawFactory,
    private readonly options: DrawSessionOptions,
  ) {
    this.settings = options.context.settings;
    this.pointInput = new PointInputController(options);
    const context: DrawContext = {
      ...options.context,
      get: (name) => this.changes.get(name) ?? options.context.get(name),
      set: (name, value) => {
        this.changes.set(name, value);
      },
    };
    this.program = factory(context);
    this.advance();
  }
  setSettings(settings: CadSettings): void {
    Object.assign(this.settings, settings);
    this.notify();
  }
  getRequest(): DrawRequest | undefined {
    return this.request;
  }
  getPointInput() {
    return this.pointInput.getState();
  }
  getAidContext() {
    const base = this.pointInput.getState().temporaryBase ?? this.request?.base;
    return {
      pointInput: this.pointInput.getState(),
      ...(base ? { basePoint: base } : {}),
      trackingPoints: this.pointInput.getState().trackingPoints,
    };
  }
  getSnapEntities(): CadEntity[] {
    return structuredClone(this.partial);
  }
  getSnapshot(): DraftSnapshot {
    const request = this.request;
    return {
      tool: this.tool,
      status: this.status,
      prompt: 'firstPoint',
      canClose: false,
      points: request?.base ? [request.base] : [],
      preview: this.preview(),
      pointInput: this.pointInput.getState(),
      ...(request
        ? {
            promptText: { ko: request.ko, en: request.en },
            inputMode:
              request.kind === 'entity'
                ? ('selection' as const)
                : request.kind === 'angle'
                  ? ('number' as const)
                  : request.kind,
            ...(request.kind === 'angle'
              ? { scalarKind: 'angle' as const }
              : request.kind === 'number'
                ? { scalarKind: 'distance' as const }
                : {}),
          }
        : {}),
    };
  }
  moveCursor(point: CadPoint, options: DraftPointOptions = {}): void {
    if (this.status !== 'active' || !validDraftPoint(point)) return;
    this.cursorOptions = options;
    this.scalarPreview = options.scalar;
    this.cursor = this.pointCapable()
      ? this.pointInput.project(this.constrain(point, options), this.inputContext())
      : { ...point };
    if (this.request?.freehand) {
      this.advance({ sample: this.cursor });
      return;
    }
    this.notify();
  }
  acceptPoint(
    point: CadPoint,
    options: DraftPointOptions = {},
    entityId?: string,
  ): DraftInputResult {
    if (this.status !== 'active') return { status: 'error', error: 'closedSession' };
    if (!validDraftPoint(point)) return { status: 'error', error: 'point' };
    if (
      options.scalar !== undefined &&
      (this.request?.kind === 'number' || this.request?.kind === 'angle')
    )
      return this.acceptText(options.scalar);
    if (this.request?.kind === 'entity') {
      const entity = this.options.context.entities.find((item) => item.id === entityId);
      if (!entity) return { status: 'error', error: 'point' };
      return this.advance({ entity, point });
    }
    if (!this.pointCapable()) return { status: 'error', error: 'point' };
    const sampleCount = this.pointInput.getAcceptedSampleCount();
    const context = this.inputContext();
    const resolved = this.pointInput.acceptPoint(
      this.pointInput.project(this.constrain(point, options), context),
      context,
    );
    if (resolved.kind === 'invalid') return { status: 'error', error: 'point' };
    if (this.pointInput.getAcceptedSampleCount() > sampleCount)
      this.options.onPointSampleAccepted?.();
    if (resolved.kind === 'continue') {
      this.notify();
      return { status: 'continue' };
    }
    return this.acceptResolved(resolved.point);
  }
  acceptText(text: string, textOptions: DraftTextOptions = {}): DraftInputResult {
    if (this.status !== 'active') return { status: 'error', error: 'closedSession' };
    if (text === '\u001b') return this.cancel();
    const keyword = this.keyword(text);
    if (keyword) return this.advance(keyword);
    const modifier = this.pointInput.getState().stage !== 'point';
    const pointSyntax =
      /[,#@<]|^(?:_?(?:FROM|FRO|M2P|MTP|TK|TT|TRACK|TRACKING|ENDP?|ENDPOINT|MID|MIDPOINT|CEN|CENTER|NODE?|NOD|QUA|QUAD|QUADRANT|INT|INTERSECTION|EXT|EXTENSION|INS|INSERTION|PER|PERPENDICULAR|TAN|TANGENT|NEA|NEAR|NEAREST|APP|APPINT|PAR|PARALLEL|NON|NONE)|\.(?:X|Y|Z|XY|XZ|YZ))(?:\s|$)/i.test(
        text.trim(),
      );
    if (
      this.pointCapable() &&
      ((this.request?.kind === 'point' && text.trim()) || modifier || pointSyntax)
    ) {
      const sampleCount = this.pointInput.getAcceptedSampleCount();
      const context = this.inputContext();
      const result = this.pointInput.acceptText(text, {
        ...context,
        resolveTypedPoint: (point, override) => {
          const mode = override ?? this.options.getSnapOverride?.(),
            priority = context.settings?.osnapcoord ?? 2;
          const running = priority === 0 || (priority === 2 && textOptions.source === 'script');
          if (mode === 'none' || (!mode && !running)) return point;
          return (
            this.options.resolveTypedPoint?.(point, mode)?.point ??
            (mode && this.options.resolveTypedPoint ? null : point)
          );
        },
      });
      if (result.kind !== 'invalid') {
        if (this.pointInput.getAcceptedSampleCount() > sampleCount)
          this.options.onPointSampleAccepted?.();
        if (result.kind === 'continue') {
          this.notify();
          return { status: 'continue' };
        }
        return this.acceptResolved(result.point);
      }
      if (modifier || pointSyntax) return { status: 'error', error: 'point' };
      // Other raw strings are interpreted by the command coroutine.
    }
    return this.advance(text);
  }
  cancel(): DraftInputResult {
    if (this.status !== 'active') return { status: 'error', error: 'closedSession' };
    this.status = 'cancelled';
    this.cursor = undefined;
    this.request = undefined;
    this.program.return({ entities: [] });
    if (this.partial.length || this.partialEraseIds.length || this.changes.size)
      this.options.onComplete(
        { entities: structuredClone(this.partial), eraseIds: [...this.partialEraseIds] },
        this.changes,
      );
    this.notify();
    return { status: 'cancelled' };
  }
  private acceptResolved(point: CadPoint): DraftInputResult {
    this.options.onAcceptedPoint?.(point);
    return this.advance(point);
  }
  private advance(value?: DrawValue): DraftInputResult {
    let next: IteratorResult<DrawRequest, DrawResult>;
    try {
      next = value === undefined ? this.program.next() : this.program.next(value);
    } catch {
      this.cancel();
      return { status: 'error', error: 'point' };
    }
    if (value !== undefined) this.history.push(value);
    this.cursor = undefined;
    this.scalarPreview = undefined;
    if (next.done) {
      this.status = 'committed';
      this.request = undefined;
      try {
        this.options.onComplete(next.value, this.changes);
      } catch {
        this.status = 'cancelled';
        this.options.onNotice?.({
          ko: '객체를 작성할 수 없습니다.',
          en: 'Cannot create the objects.',
        });
        this.notify();
        return { status: 'error', error: 'point' };
      }
    } else {
      if (next.value.checkpoint) {
        try {
          this.options.onComplete(next.value.checkpoint, new Map(this.changes));
        } catch {
          this.status = 'cancelled';
          this.request = undefined;
          this.options.onNotice?.({
            ko: '객체를 작성할 수 없습니다.',
            en: 'Cannot create the objects.',
          });
          this.notify();
          return { status: 'error', error: 'point' };
        }
        this.changes.clear();
        this.partial = [];
        this.partialEraseIds = [];
      }
      this.request = next.value;
      if (next.value.partial) this.partial = structuredClone(next.value.partial);
      if (next.value.partialEraseIds) this.partialEraseIds = [...next.value.partialEraseIds];
      if (next.value.notice) this.options.onNotice?.(next.value.notice);
      this.pointInput.reset();
    }
    this.notify();
    return { status: this.status === 'committed' ? 'committed' : 'continue' };
  }
  private inputContext(): PointInputContext {
    const base = this.request?.base,
      lockedAngle = this.pointInput.getState().lockedAngle;
    const cursor =
      this.cursor ??
      (base && lockedAngle !== undefined
        ? { x: base.x + Math.cos(lockedAngle), y: base.y - Math.sin(lockedAngle) }
        : undefined);
    return {
      ...(base ? { base } : {}),
      ...(cursor ? { cursor } : {}),
      ...(this.cursorOptions.trackingBase ? { trackingBase: this.cursorOptions.trackingBase } : {}),
      ...(this.options.coordinates ? { settings: this.options.coordinates() } : {}),
    };
  }
  private preview(): CadEntity[] {
    if (this.status !== 'active') return [];
    try {
      if (
        this.scalarPreview !== undefined &&
        (this.request?.kind === 'number' || this.request?.kind === 'angle')
      )
        return scalarDrawPreview(
          this.factory,
          this.options.context,
          this.history,
          this.scalarPreview,
        );
      return this.cursor && this.request?.preview
        ? this.request.preview(this.cursor)
        : structuredClone(this.partial);
    } catch {
      this.cursor = undefined;
      this.options.onNotice?.({
        ko: '지정한 점으로 미리보기를 작성할 수 없습니다.',
        en: 'Cannot construct a preview at the specified point.',
      });
      return structuredClone(this.partial);
    }
  }
  private constrain(point: CadPoint, options: DraftPointOptions): CadPoint {
    if (options.snapped || options.constrained || this.pointInput.getState().sourcePoint)
      return point;
    const result = { ...point },
      base = this.request?.base;
    if (this.settings.gridSnap && this.settings.gridSize > 0) {
      result.x = Math.round(result.x / this.settings.gridSize) * this.settings.gridSize;
      result.y = Math.round(result.y / this.settings.gridSize) * this.settings.gridSize;
    }
    if (base && this.settings.ortho) {
      if (Math.abs(result.x - base.x) >= Math.abs(result.y - base.y)) result.y = base.y;
      else result.x = base.x;
    }
    return result;
  }
  private pointCapable(): boolean {
    return (
      this.request?.kind === 'point' ||
      this.request?.kind === 'number' ||
      this.request?.kind === 'angle'
    );
  }
  private keyword(text: string): string | undefined {
    const normalized = text.trim().replace(/^_+/, '').replace(/\s+/g, '').toUpperCase();
    if (!normalized) return undefined;
    const options = /\[([^\]]+)\]/.exec(this.request?.en ?? '')?.[1]?.split('/') ?? [];
    for (const option of options) {
      const label = option.replace(/\s*\(.*/, '').trim();
      const abbreviation = label.replace(/[^A-Z0-9]/g, '');
      if (normalized === abbreviation || normalized === label.replace(/\s+/g, '').toUpperCase())
        return abbreviation || normalized;
    }
    return undefined;
  }
  private notify(): void {
    this.options.onChange?.(this.getSnapshot());
  }
}
