import type { CadEntity, CadPoint, CadSettings } from '@hancad/legacy-bridge';
import {
  formatDraftAngle,
  formatDraftNumber,
  parseDraftNumber,
  parseDraftPoint,
  validDraftPoint,
} from './coordinates';
import type { CoordinateProvider, CoordinateSettings } from './coordinates';
import { draftLine } from './entities';

export interface MeasureResult {
  distance: number;
  deltaX: number;
  deltaY: number;
  angle: number;
}
export interface MeasureSnapshot {
  status: 'active' | 'completed' | 'cancelled';
  prompt: 'firstPoint' | 'secondPoint';
  points: readonly CadPoint[];
  preview: readonly CadEntity[];
}
export interface MeasureInputResult {
  status: 'continue' | 'completed' | 'cancelled' | 'error';
  error?: 'point' | 'needPoints' | 'closedSession';
}
export interface MeasureSessionOptions {
  coordinates?: CoordinateProvider;
  onAcceptedPoint?: (point: CadPoint) => void;
  precision: number;
  onComplete: (result: MeasureResult) => void;
  onChange?: (snapshot: MeasureSnapshot) => void;
}
export interface MeasureDisplayOptions {
  coordinates?: Partial<CoordinateSettings>;
  linearPrecision: number;
  angularPrecision: number;
  angleBase: number;
  clockwise: boolean;
}

const normalizeAngle = (angle: number): number => ((angle % 360) + 360) % 360;
const precision = (value: number): number => Math.max(0, Math.min(8, Math.trunc(value)));
const fixed = (value: number, digits: number): string => {
  const places = precision(digits);
  return (Math.abs(value) < 0.5 * 10 ** -places ? 0 : value).toFixed(places);
};

/** Transitional model points are Y down; reported components and angles are WCS Y up. */
export function measureBetween(first: CadPoint, second: CadPoint): MeasureResult {
  const deltaX = second.x - first.x;
  const deltaY = first.y - second.y;
  return {
    distance: Math.hypot(deltaX, deltaY),
    deltaX,
    deltaY,
    angle: normalizeAngle((Math.atan2(deltaY, deltaX) * 180) / Math.PI),
  };
}

export function formatMeasurement(result: MeasureResult, options: MeasureDisplayOptions) {
  if (options.coordinates) {
    const linear = (value: number) => formatDraftNumber(value, options.coordinates);
    return {
      distance: linear(result.distance),
      deltaX: linear(result.deltaX),
      deltaY: linear(result.deltaY),
      angle: formatDraftAngle((result.angle * Math.PI) / 180, options.coordinates),
    };
  }
  const angle = normalizeAngle((result.angle - options.angleBase) * (options.clockwise ? -1 : 1));
  return {
    distance: fixed(result.distance, options.linearPrecision),
    deltaX: fixed(result.deltaX, options.linearPrecision),
    deltaY: fixed(result.deltaY, options.linearPrecision),
    angle: fixed(
      normalizeAngle(Number(fixed(angle, options.angularPrecision))),
      options.angularPrecision,
    ),
  };
}

/** Read-only inquiry: all graphics are transient and completion never creates entities. */
export class MeasureSession {
  private first: CadPoint | undefined;
  private cursor: CadPoint | undefined;
  private status: MeasureSnapshot['status'] = 'active';
  private digits: number;

  constructor(
    private settings: CadSettings,
    private readonly options: MeasureSessionOptions,
  ) {
    this.settings = { ...settings };
    this.digits = options.precision;
  }

  setSettings(settings: CadSettings, digits = this.digits): void {
    this.settings = { ...settings };
    this.digits = digits;
    this.notify();
  }

  acceptPoint(point: CadPoint): MeasureInputResult {
    const result = this.applyPoint(point);
    if (result.status !== 'error') this.options.onAcceptedPoint?.({ ...point });
    return result;
  }

  private applyPoint(point: CadPoint): MeasureInputResult {
    if (this.status !== 'active') return { status: 'error', error: 'closedSession' };
    if (!validDraftPoint(point)) return { status: 'error', error: 'point' };
    if (!this.first) {
      this.first = { ...point };
      this.cursor = undefined;
      this.notify();
      return { status: 'continue' };
    }
    const result = measureBetween(this.first, point);
    this.status = 'completed';
    this.cursor = undefined;
    this.options.onComplete(result);
    this.notify();
    return { status: 'completed' };
  }

  acceptText(input: string): MeasureInputResult {
    if (this.status !== 'active') return { status: 'error', error: 'closedSession' };
    if (input.trim() === '\u001b') return this.cancel();
    if (!input.trim()) return { status: 'error', error: 'needPoints' };
    const distance = parseDraftNumber(input, this.options.coordinates?.());
    if (distance !== undefined && this.first && this.cursor) {
      const length = Math.hypot(this.cursor.x - this.first.x, this.cursor.y - this.first.y);
      if (length > 1e-8)
        return this.acceptPoint({
          x: this.first.x + ((this.cursor.x - this.first.x) * distance) / length,
          y: this.first.y + ((this.cursor.y - this.first.y) * distance) / length,
        });
    }
    const point = parseDraftPoint(input, this.first, this.options.coordinates?.());
    return point ? this.acceptPoint(point) : { status: 'error', error: 'point' };
  }

  moveCursor(point: CadPoint): void {
    if (this.status !== 'active' || !validDraftPoint(point)) return;
    this.cursor = { ...point };
    this.notify();
  }

  cancel(): MeasureInputResult {
    if (this.status !== 'active') return { status: 'error', error: 'closedSession' };
    this.status = 'cancelled';
    this.cursor = undefined;
    this.notify();
    return { status: 'cancelled' };
  }

  getSnapshot(): MeasureSnapshot {
    const preview: CadEntity[] = [];
    if (this.status === 'active' && this.first && this.cursor) {
      const line = draftLine(this.settings, this.first, this.cursor, 'preview-measure-line');
      const textSize = this.settings.dimTextSize * this.settings.dimScale;
      preview.push(line, {
        id: 'preview-measure-value',
        type: 'text',
        layer: this.settings.layer,
        color: this.settings.color,
        lineWidth: this.settings.lineWidth,
        point: { x: this.cursor.x, y: this.cursor.y - textSize * 1.5 },
        text: this.options.coordinates
          ? formatDraftNumber(measureBetween(this.first, this.cursor).distance, {
              ...this.options.coordinates(),
              luprec: this.digits,
            })
          : fixed(measureBetween(this.first, this.cursor).distance, this.digits),
        textSize,
        rotation: 0,
      });
    }
    return {
      status: this.status,
      prompt: this.first ? 'secondPoint' : 'firstPoint',
      points: this.first ? [{ ...this.first }] : [],
      preview,
    };
  }

  private notify(): void {
    this.options.onChange?.(this.getSnapshot());
  }
}
