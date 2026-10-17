import type { CadEntity, CadPoint, CadSettings } from '@hancad/legacy-bridge';
import { parseDraftNumber, validDraftPoint } from './coordinates';
import type { DraftPoint } from './coordinates';
import { PointInputController } from './point-input';
import type { PointInputResult } from './point-input';
import { resolveDeferredPair, resolveDeferredSnap } from './snap-deferred';
import type { DraftSnapDeferred } from './snap-types';
import { draftCircle, draftLine, draftPolyline, rectanglePoints } from './entities';
import type {
  DraftError,
  DraftInputResult,
  DraftPointOptions,
  DraftSessionOptions,
  DraftSnapshot,
  DraftTool,
  DraftTextOptions,
} from './types';

const epsilon = 1e-8;

export class DraftSession {
  private readonly points: DraftPoint[] = [];
  private cursor: DraftPoint | undefined;
  private cursorOptions: DraftPointOptions = {};
  private readonly pointInput: PointInputController;
  private deferred: DraftSnapDeferred | undefined;
  private status: DraftSnapshot['status'] = 'active';
  private settings: CadSettings;

  constructor(
    readonly tool: DraftTool,
    settings: CadSettings,
    private readonly options: DraftSessionOptions,
  ) {
    this.settings = structuredClone(settings);
    this.pointInput = new PointInputController(options);
    this.notify();
  }

  setSettings(settings: CadSettings): void {
    this.settings = structuredClone(settings);
    this.notify();
  }

  acceptPoint(point: CadPoint, options: DraftPointOptions = {}): DraftInputResult {
    const samples = this.pointInput.getAcceptedSampleCount();
    const source = this.pointInput.getState().sourcePoint;
    const resolved =
      options.snapped || options.constrained || source ? point : this.constrain(point);
    const result = this.pointInput.acceptPoint(
      this.pointInput.project(resolved, this.inputContext()),
      this.inputContext(),
    );
    return this.reportSample(this.acceptResolved(result, options), samples);
  }

  acceptText(input: string, textOptions: DraftTextOptions = {}): DraftInputResult {
    if (this.status !== 'active') return failure('closedSession');
    const value = input.trim();
    if (!value) {
      if (this.pointInput.getState().stage === 'tracking-next')
        return this.acceptResolved(this.pointInput.acceptText('', this.inputContext()));
      if (this.tool === 'LINE' && !this.points.length && this.options.continuation) {
        const { point, tangent } = this.options.continuation;
        if (tangent) this.pointInput.setAngle(Math.atan2(-tangent.y, tangent.x));
        return this.addPoint(point);
      }
      if (this.tool === 'LINE' && !this.points.length) return failure('noContinuation');
      return this.finish();
    }
    if (value === '\u001b') return this.cancel();
    if (/^(C|CLOSE)$/i.test(value) && (this.tool === 'LINE' || this.tool === 'PLINE'))
      return this.canClose() ? this.finish(true) : failure('point');
    if (/^(U|UNDO)$/i.test(value) && (this.tool === 'LINE' || this.tool === 'PLINE')) {
      if (this.points.length) this.points.pop();
      this.deferred = undefined;
      this.pointInput.reset();
      this.notify();
      return { status: 'continue' };
    }
    if (this.tool === 'CIRCLE' && this.points.length === 1) {
      const radius = parseDraftNumber(value, this.options.coordinates?.());
      if (radius !== undefined)
        return radius > epsilon
          ? this.commit([draftCircle(this.settings, this.points[0] ?? { x: 0, y: 0 }, radius)])
          : failure('positiveRadius');
    }
    let resolvedOptions: DraftPointOptions = {};
    const samples = this.pointInput.getAcceptedSampleCount();
    const context = this.inputContext();
    const result = this.pointInput.acceptText(value, {
      ...context,
      resolveTypedPoint: (point, override) => {
        const mode = override ?? this.options.getSnapOverride?.();
        const priority = context.settings?.osnapcoord ?? 2;
        const running = priority === 0 || (priority === 2 && textOptions.source === 'script');
        if (mode === 'none' || (!mode && !running)) return point;
        const resolved = this.options.resolveTypedPoint?.(point, mode);
        if (!resolved) return mode && this.options.resolveTypedPoint ? null : point;
        resolvedOptions = { ...resolved, snapped: true };
        return resolved.point;
      },
    });
    return this.reportSample(this.acceptResolved(result, resolvedOptions), samples);
  }

  moveCursor(point: CadPoint, options: DraftPointOptions = {}): void {
    if (this.status !== 'active' || !validDraftPoint(point)) return;
    this.cursorOptions = options;
    const source = this.pointInput.getState().sourcePoint;
    this.cursor = this.pointInput.project(
      options.snapped || options.constrained || source ? { ...point } : this.constrain(point),
      this.inputContext(),
    );
    this.notify();
  }

  finish(close = false): DraftInputResult {
    if (this.status !== 'active') return failure('closedSession');
    if (this.points.length < 2 || (this.tool !== 'LINE' && this.tool !== 'PLINE'))
      return failure('needPoints');
    const entities =
      this.tool === 'LINE'
        ? this.lineSegments(this.points)
        : [draftPolyline(this.settings, this.points, close)];
    const first = this.points[0];
    const last = this.points.at(-1);
    if (close && this.tool === 'LINE' && first && last && distance(first, last) > epsilon)
      entities.push(draftLine(this.settings, last, first));
    return this.commit(entities);
  }

  cancel(): DraftInputResult {
    if (this.status !== 'active') return failure('closedSession');
    if (this.points.length >= 2 && (this.tool === 'LINE' || this.tool === 'PLINE')) {
      const entities =
        this.tool === 'LINE'
          ? this.lineSegments(this.points)
          : [draftPolyline(this.settings, this.points)];
      this.options.onCommit(structuredClone(entities));
    }
    this.status = 'cancelled';
    this.cursor = undefined;
    this.notify();
    return { status: 'cancelled' };
  }

  getSnapshot(): DraftSnapshot {
    const prompt =
      this.tool === 'CIRCLE'
        ? this.points.length
          ? 'radius'
          : 'center'
        : this.tool === 'RECTANG'
          ? this.points.length
            ? 'oppositeCorner'
            : 'firstPoint'
          : !this.points.length
            ? 'firstPoint'
            : this.canClose() || this.tool !== 'LINE'
              ? 'nextPoint'
              : 'nextPointUndo';
    return {
      tool: this.tool,
      status: this.status,
      prompt,
      points: structuredClone(this.points),
      preview: this.preview(),
      canClose: this.canClose(),
      pointInput: this.pointInput.getState(),
    };
  }

  /** LINE offers Close from its second segment, as AutoCAD does. */
  private canClose(): boolean {
    if (this.tool === 'LINE') return this.points.length >= 3;
    return this.tool === 'PLINE' && this.points.length >= 2;
  }

  getPointInput() {
    return this.pointInput.getState();
  }
  getAidContext() {
    const pointInput = this.pointInput.getState();
    const basePoint = pointInput.temporaryBase ?? this.points.at(-1);
    const previousPoint = this.points.at(-2);
    return {
      pointInput,
      ...(basePoint ? { basePoint } : {}),
      ...(previousPoint ? { previousPoint } : {}),
      trackingPoints: pointInput.trackingPoints,
      ...(this.deferred ? { deferred: this.deferred } : {}),
    };
  }
  private inputContext() {
    const base = this.points.at(-1);
    const angle = this.pointInput.getState().lockedAngle;
    const cursor =
      this.cursor ??
      (base && angle !== undefined
        ? { x: base.x + Math.cos(angle), y: base.y - Math.sin(angle) }
        : undefined);
    return {
      ...(base ? { base } : {}),
      ...(cursor ? { cursor } : {}),
      ...(this.cursorOptions.trackingBase ? { trackingBase: this.cursorOptions.trackingBase } : {}),
      ...(this.options.coordinates ? { settings: this.options.coordinates() } : {}),
    };
  }
  private acceptResolved(
    result: PointInputResult,
    options: DraftPointOptions = {},
  ): DraftInputResult {
    if (result.kind === 'invalid')
      return failure(
        this.tool === 'CIRCLE' && this.points.length === 1 ? 'positiveRadius' : 'point',
      );
    if (result.kind === 'continue') {
      this.notify();
      return { status: 'continue' };
    }
    let point = result.point;
    const originalFirst = this.points[0],
      originalDeferred = this.deferred;
    if (this.tool === 'LINE' && this.points.length === 1 && this.deferred) {
      const pair = options.deferred
        ? resolveDeferredPair(this.deferred, options.deferred)
        : undefined;
      const first = pair?.first ?? resolveDeferredSnap(this.deferred, point);
      if (!first || (options.deferred && !pair)) return failure('point');
      this.points[0] = { ...first };
      if (pair) point = pair.second;
      this.deferred = undefined;
    }
    const accepted = this.addPoint(point);
    if (accepted.status === 'error' && originalFirst && originalDeferred) {
      this.points[0] = originalFirst;
      this.deferred = originalDeferred;
    }
    if (accepted.status !== 'error' && this.tool === 'LINE' && this.points.length === 1)
      this.deferred = options.deferred;
    return accepted;
  }

  /** Accepted segments remain snap targets before this command enters the journal. */
  getSnapEntities(): CadEntity[] {
    if (this.status !== 'active' || this.points.length < 2) return [];
    if (this.tool === 'LINE') return this.lineSegments(this.points, true);
    if (this.tool === 'PLINE')
      return [draftPolyline(this.settings, this.points, false, false, 'snap-polyline')];
    return [];
  }

  private addPoint(point: CadPoint): DraftInputResult {
    const result = this.applyPoint(point);
    if (result.status !== 'error') this.options.onAcceptedPoint?.({ ...point });
    return result;
  }
  private reportSample(result: DraftInputResult, samples: number): DraftInputResult {
    if (this.pointInput.getAcceptedSampleCount() > samples) {
      if (result.status === 'error') this.pointInput.rejectLastSample();
      else this.options.onPointSampleAccepted?.();
    }
    return result;
  }

  private applyPoint(point: CadPoint): DraftInputResult {
    if (this.status !== 'active') return failure('closedSession');
    if (!validDraftPoint(point)) return failure('point');
    const previous = this.points.at(-1);
    if (previous && distance(previous, point) <= epsilon) return failure('zeroLength');
    if (
      this.tool === 'RECTANG' &&
      previous &&
      (Math.abs(point.x - previous.x) <= epsilon || Math.abs(point.y - previous.y) <= epsilon)
    )
      return failure('zeroLength');
    if (this.tool === 'CIRCLE' && previous) {
      const radius = distance(previous, point);
      return radius <= 1e12
        ? this.commit([draftCircle(this.settings, previous, radius)])
        : failure('positiveRadius');
    }
    if (this.tool === 'RECTANG' && previous)
      return this.commit([
        draftPolyline(this.settings, rectanglePoints(previous, point), true, true),
      ]);
    this.points.push({ ...point });
    this.cursor = undefined;
    this.cursorOptions = {};
    this.notify();
    return { status: 'continue' };
  }

  private preview(): CadEntity[] {
    if (this.status !== 'active' || !this.points.length) return [];
    const first = this.points[0];
    const last = this.points.at(-1);
    if (!first || !last) return [];
    if (this.tool === 'CIRCLE')
      return this.cursor && distance(first, this.cursor) > epsilon
        ? [draftCircle(this.settings, first, distance(first, this.cursor), 'preview-circle')]
        : [];
    if (this.tool === 'RECTANG')
      return this.cursor
        ? [
            draftPolyline(
              this.settings,
              rectanglePoints(first, this.cursor),
              true,
              true,
              'preview-rect',
            ),
          ]
        : [];
    let points = [
      ...this.points,
      ...(this.cursor && distance(last, this.cursor) > epsilon ? [this.cursor] : []),
    ];
    if (this.tool === 'LINE' && this.deferred && this.cursor) {
      const pair = this.cursorOptions.deferred
        ? resolveDeferredPair(this.deferred, this.cursorOptions.deferred)
        : undefined;
      const first = pair?.first ?? resolveDeferredSnap(this.deferred, this.cursor);
      points =
        first && (!this.cursorOptions.deferred || pair) ? [first, pair?.second ?? this.cursor] : [];
    }
    return this.tool === 'LINE'
      ? this.lineSegments(points, true)
      : points.length >= 2
        ? [draftPolyline(this.settings, points, false, false, 'preview-polyline')]
        : [];
  }

  private lineSegments(points: readonly CadPoint[], preview = false): CadEntity[] {
    const entities: CadEntity[] = [];
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1];
      const b = points[index];
      if (a && b)
        entities.push(
          draftLine(this.settings, a, b, preview ? `preview-line-${index}` : undefined),
        );
    }
    return entities;
  }

  private constrain(point: CadPoint): CadPoint {
    let result = { ...point };
    if (this.settings.gridSnap && this.settings.gridSize > 0)
      result = {
        ...point,
        x: Math.round(point.x / this.settings.gridSize) * this.settings.gridSize,
        y: Math.round(point.y / this.settings.gridSize) * this.settings.gridSize,
      };
    const base = this.points.at(-1);
    if (base && this.settings.ortho && (this.tool === 'LINE' || this.tool === 'PLINE')) {
      if (Math.abs(result.x - base.x) >= Math.abs(result.y - base.y)) result.y = base.y;
      else result.x = base.x;
    }
    return result;
  }
  private commit(entities: CadEntity[]): DraftInputResult {
    this.options.onCommit(structuredClone(entities));
    this.status = 'committed';
    this.cursor = undefined;
    this.notify();
    return { status: 'committed' };
  }
  private notify(): void {
    this.options.onChange?.(this.getSnapshot());
  }
}
function distance(a: CadPoint, b: CadPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
}
function failure(error: DraftError): DraftInputResult {
  return { status: 'error', error };
}
