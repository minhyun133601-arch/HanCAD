import type { CoordinateSettings, DraftPoint } from './coordinates';
import { parseDraftAngle, parseDraftNumber, parseDraftPoint, validDraftPoint } from './coordinates';

export type PointSnapOverride =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'geometricCenter'
  | 'node'
  | 'quadrant'
  | 'intersection'
  | 'extension'
  | 'insertion'
  | 'perpendicular'
  | 'tangent'
  | 'nearest'
  | 'apparentIntersection'
  | 'parallel'
  | 'none';
export type PointInputStage =
  | 'point'
  | 'filter-source'
  | 'filter-rest'
  | 'from-base'
  | 'from-offset'
  | 'mid-first'
  | 'mid-second'
  | 'tracking-first'
  | 'tracking-next'
  | 'temporary-tracking';
export interface PointInputState {
  stage: PointInputStage;
  trackingPoints: readonly DraftPoint[];
  sourcePoint: boolean;
  missingAxes?: string;
  temporaryBase?: DraftPoint;
  lockedAngle?: number;
  snapOverride?: PointSnapOverride;
}
export interface PointInputContext {
  base?: DraftPoint;
  cursor?: DraftPoint;
  trackingBase?: DraftPoint;
  settings?: Partial<CoordinateSettings>;
  resolveTypedPoint?: (point: DraftPoint, override?: PointSnapOverride) => DraftPoint | null;
}
export type PointInputResult =
  { kind: 'point'; point: DraftPoint } | { kind: 'continue' } | { kind: 'invalid' };
const overrides: Readonly<Record<string, PointSnapOverride>> = {
  END: 'endpoint',
  ENDP: 'endpoint',
  ENDPOINT: 'endpoint',
  MID: 'midpoint',
  MIDPOINT: 'midpoint',
  CEN: 'center',
  CENTER: 'center',
  GCE: 'geometricCenter',
  GCEN: 'geometricCenter',
  NOD: 'node',
  NODE: 'node',
  QUA: 'quadrant',
  QUAD: 'quadrant',
  QUADRANT: 'quadrant',
  INT: 'intersection',
  INTERSECTION: 'intersection',
  EXT: 'extension',
  EXTENSION: 'extension',
  INS: 'insertion',
  INSERTION: 'insertion',
  PER: 'perpendicular',
  PERPENDICULAR: 'perpendicular',
  TAN: 'tangent',
  TANGENT: 'tangent',
  NEA: 'nearest',
  NEAR: 'nearest',
  NEAREST: 'nearest',
  APP: 'apparentIntersection',
  APPINT: 'apparentIntersection',
  PAR: 'parallel',
  PARALLEL: 'parallel',
  NON: 'none',
  NONE: 'none',
};
const axes = ['x', 'y', 'z'] as const;
type Axis = (typeof axes)[number];

/** Stateful command modifiers shared by interactive and headless point prompts. */
export class PointInputController {
  private stage: PointInputStage = 'point';
  private selectedAxes: Axis[] = [];
  private collected: Partial<Record<Axis, number>> = {};
  private temporaryBase: DraftPoint | undefined;
  private midpoint: DraftPoint | undefined;
  private trackingPoints: DraftPoint[] = [];
  private angle: number | undefined;
  private override: PointSnapOverride | undefined;
  private sampleCount = 0;
  private rejectSample: (() => void) | undefined;

  constructor(
    private readonly options: {
      onSnapOverride?: (mode: PointSnapOverride) => void;
      onTrackingPoint?: (point: DraftPoint) => void;
    } = {},
  ) {}

  getState(): PointInputState {
    return {
      stage: this.stage,
      trackingPoints: structuredClone(this.trackingPoints),
      sourcePoint: [
        'filter-source',
        'filter-rest',
        'from-base',
        'mid-first',
        'mid-second',
        'tracking-first',
        'temporary-tracking',
      ].includes(this.stage),
      ...(this.stage.startsWith('filter')
        ? {
            missingAxes: axes
              .filter((axis) => this.collected[axis] === undefined)
              .join('')
              .toUpperCase(),
          }
        : {}),
      ...(this.temporaryBase ? { temporaryBase: { ...this.temporaryBase } } : {}),
      ...(this.angle === undefined ? {} : { lockedAngle: this.angle }),
      ...(this.override ? { snapOverride: this.override } : {}),
    };
  }
  reset(): void {
    this.stage = 'point';
    this.selectedAxes = [];
    this.collected = {};
    this.temporaryBase = undefined;
    this.midpoint = undefined;
    this.angle = undefined;
    this.override = undefined;
    this.trackingPoints = [];
  }
  setAngle(angle: number): void {
    this.angle = angle;
  }
  getAcceptedSampleCount(): number {
    return this.sampleCount;
  }
  rejectLastSample(): void {
    this.rejectSample?.();
    this.rejectSample = undefined;
  }
  acceptText(input: string, context: PointInputContext = {}): PointInputResult {
    const value = input.trim(),
      upper = value.replace(/^_+/, '').toUpperCase();
    const inline = /^(_?[A-Z][A-Z0-9]*|\.(?:XY|XZ|YZ|X|Y|Z))\s+(.+)$/i.exec(value);
    const keyword = inline?.[1]?.replace(/^_+/, '').toUpperCase() ?? upper;
    const override = overrides[keyword];
    if (override) {
      this.override = override;
      this.options.onSnapOverride?.(override);
      return inline?.[2] ? this.acceptText(inline[2], context) : { kind: 'continue' };
    }
    if (/^\.(X|Y|Z|XY|XZ|YZ)$/.test(keyword)) {
      this.selectedAxes = keyword.slice(1).toLowerCase().split('') as Axis[];
      this.stage = 'filter-source';
      return inline?.[2] ? this.acceptText(inline[2], context) : { kind: 'continue' };
    }
    if (keyword === 'FROM' || keyword === 'FRO') this.stage = 'from-base';
    else if (keyword === 'M2P' || keyword === 'MTP') this.stage = 'mid-first';
    else if (keyword === 'TT') this.stage = 'temporary-tracking';
    else if (['TK', 'TRACK', 'TRACKING'].includes(keyword)) this.stage = 'tracking-first';
    else if (/^<[^<]+$/.test(value)) {
      const angle = parseDraftAngle(value.slice(1), context.settings);
      if (angle === undefined) return { kind: 'invalid' };
      this.angle = angle;
      return { kind: 'continue' };
    } else if (!value && this.stage === 'tracking-next' && this.temporaryBase) {
      return this.complete(this.temporaryBase);
    } else {
      const base = this.temporaryBase ?? context.base;
      let point = parseDraftPoint(value, base, context.settings);
      const scalar = parseDraftNumber(value, context.settings);
      if (
        !point &&
        scalar !== undefined &&
        this.stage === 'filter-source' &&
        this.selectedAxes.length === 1
      ) {
        const axis = this.selectedAxes[0]!;
        point = { x: 0, y: 0, z: 0 };
        point[axis] = axis === 'y' ? -scalar : scalar;
      } else if (!point && scalar !== undefined && this.stage === 'filter-rest') {
        const missing = axes.filter((axis) => this.collected[axis] === undefined);
        if (missing.length === 1 || (missing.length === 2 && missing.includes('z'))) {
          point = { x: 0, y: 0, z: context.settings?.elevation ?? 0 };
          for (const axis of missing)
            point[axis] =
              axis === 'z' && missing.length > 1
                ? (context.settings?.elevation ?? 0)
                : axis === 'y'
                  ? -scalar
                  : scalar;
        }
      } else if (!point && scalar !== undefined && context.cursor && base) {
        const origin = context.trackingBase ?? base;
        const cursor = this.project(context.cursor, { ...context, base: origin });
        const length = Math.hypot(cursor.x - origin.x, cursor.y - origin.y);
        if (length > 1e-12)
          point = {
            x: origin.x + (scalar * (cursor.x - origin.x)) / length,
            y: origin.y + (scalar * (cursor.y - origin.y)) / length,
            ...(origin.z === undefined ? {} : { z: origin.z }),
          };
      }
      if (!point) return { kind: 'invalid' };
      const resolved = context.resolveTypedPoint?.(point, this.override);
      return resolved === null ? { kind: 'invalid' } : this.acceptPoint(resolved ?? point, context);
    }
    return inline?.[2] ? this.acceptText(inline[2], context) : { kind: 'continue' };
  }

  acceptPoint(point: DraftPoint, context: PointInputContext = {}): PointInputResult {
    if (!validDraftPoint(point)) return { kind: 'invalid' };
    const checkpoint = {
      stage: this.stage,
      selectedAxes: [...this.selectedAxes],
      collected: { ...this.collected },
      temporaryBase: this.temporaryBase,
      midpoint: this.midpoint,
      trackingPoints: [...this.trackingPoints],
      angle: this.angle,
      override: this.override,
      sampleCount: this.sampleCount,
    };
    this.rejectSample = () => {
      Object.assign(this, checkpoint);
    };
    this.sampleCount++;
    this.override = undefined;
    if (this.stage === 'filter-source' || this.stage === 'filter-rest') {
      const selected =
        this.stage === 'filter-source'
          ? this.selectedAxes
          : axes.filter((axis) => this.collected[axis] === undefined);
      for (const axis of selected) this.collected[axis] = point[axis] ?? 0;
      if (axes.every((axis) => this.collected[axis] !== undefined)) {
        const result = { x: this.collected.x!, y: this.collected.y!, z: this.collected.z! };
        return this.complete(result);
      }
      this.stage = 'filter-rest';
      return { kind: 'continue' };
    }
    if (this.stage === 'from-base') {
      this.temporaryBase = { ...point };
      this.stage = 'from-offset';
      return { kind: 'continue' };
    }
    if (this.stage === 'mid-first') {
      this.midpoint = { ...point };
      this.stage = 'mid-second';
      return { kind: 'continue' };
    }
    if (this.stage === 'mid-second' && this.midpoint) {
      return this.complete({
        x: (point.x + this.midpoint.x) / 2,
        y: (point.y + this.midpoint.y) / 2,
        ...(point.z === undefined && this.midpoint.z === undefined
          ? {}
          : { z: ((point.z ?? 0) + (this.midpoint.z ?? 0)) / 2 }),
      });
    }
    if (this.stage === 'temporary-tracking') {
      this.trackingPoints.push({ ...point });
      this.options.onTrackingPoint?.({ ...point });
      this.stage = 'point';
      return { kind: 'continue' };
    }
    if (this.stage === 'tracking-first' || this.stage === 'tracking-next') {
      this.temporaryBase =
        this.stage === 'tracking-next' ? this.project(point, context) : { ...point };
      this.stage = 'tracking-next';
      return { kind: 'continue' };
    }
    return this.complete(point);
  }

  project(point: DraftPoint, context: PointInputContext): DraftPoint {
    const base = this.temporaryBase ?? context.base;
    if (!base || this.getState().sourcePoint) return { ...point };
    const dx = point.x - base.x,
      dy = point.y - base.y;
    if (this.stage === 'tracking-next')
      return Math.abs(dx) >= Math.abs(dy) ? { ...point, y: base.y } : { ...point, x: base.x };
    if (this.angle !== undefined) {
      const x = Math.cos(this.angle),
        y = -Math.sin(this.angle),
        length = dx * x + dy * y;
      return { ...point, x: base.x + length * x, y: base.y + length * y };
    }
    return { ...point };
  }
  private complete(point: DraftPoint): PointInputResult {
    this.reset();
    return { kind: 'point', point: { ...point } };
  }
}

export function pointInputPrompt(
  state: PointInputState,
  locale: 'ko-KR' | 'en-US',
): string | undefined {
  const ko = locale === 'ko-KR';
  switch (state.stage) {
    case 'filter-source':
      return ko ? '점 지정:' : 'of:';
    case 'filter-rest':
      return ko ? `점 지정(필요한 ${state.missingAxes}):` : `of (need ${state.missingAxes}):`;
    case 'from-base':
      return ko ? '기준점:' : 'Base point:';
    case 'from-offset':
      return ko ? '<간격띄우기>:' : '<Offset>:';
    case 'mid-first':
      return ko ? '중간의 첫 번째 점:' : 'First point of mid:';
    case 'mid-second':
      return ko ? '중간의 두 번째 점:' : 'Second point of mid:';
    case 'tracking-first':
      return ko ? '첫 번째 추적점:' : 'First tracking point:';
    case 'tracking-next':
      return ko
        ? '다음 점(추적을 끝내려면 Enter 키 누름):'
        : 'Next point (Press ENTER to end tracking):';
    case 'temporary-tracking':
      return ko ? '임시 추적점 지정:' : 'Specify a temporary tracking point:';
    default:
      return undefined;
  }
}
