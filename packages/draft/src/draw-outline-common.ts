import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { parseDraftAngle, parseDraftNumber } from './coordinates';
import { draftEntityBase } from './entities';
import { drawPoint } from './draw-program';
import type { DrawContext, DrawRequest, DrawValue } from './draw-program';

export const TAU = Math.PI * 2;
export const outlineEditable = (context: DrawContext, entity: CadEntity): boolean =>
  context.editableIds?.has(entity.id) ?? true;
export function outlineSourceStyle(context: DrawContext, entity: CadEntity): DrawContext {
  const settings = { ...context.settings };
  const names = [
    'layer',
    'color',
    'lineWidth',
    'aci',
    'trueColor',
    'linetype',
    'linetypeScale',
    'lineweight',
    'transparency',
    'plinegen',
  ] as const;
  for (const name of names)
    if (entity[name] !== undefined) Object.assign(settings, { [name]: entity[name] });
  return { ...context, settings };
}
export const length = (a: CadPoint, b: CadPoint): number => Math.hypot(b.x - a.x, b.y - a.y);
export const unit = (p: CadPoint): CadPoint => {
  const magnitude = Math.hypot(p.x, p.y);
  return magnitude > 1e-12 ? { x: p.x / magnitude, y: p.y / magnitude } : { x: 1, y: 0 };
};
export const rotate = (p: CadPoint, angle: number): CadPoint => ({
  x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
  y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
});
export const offset = (p: CadPoint, direction: CadPoint, distance: number): CadPoint => ({
  ...p,
  x: p.x + direction.x * distance,
  y: p.y + direction.y * distance,
});
export const vector = (a: CadPoint, b: CadPoint): CadPoint => ({ x: b.x - a.x, y: b.y - a.y });
export const cross = (a: CadPoint, b: CadPoint): number => a.x * b.y - a.y * b.x;
export const dot = (a: CadPoint, b: CadPoint): number => a.x * b.x + a.y * b.y;
export const mod = (n: number, divisor = TAU): number => ((n % divisor) + divisor) % divisor;

const fallbackMemory = new WeakMap<object, Map<string, number | string>>();
export function outlineMemory(context: DrawContext): Map<string, number | string> {
  if (context.memory) return context.memory;
  let values = fallbackMemory.get(context.settings);
  if (!values) {
    values = new Map();
    fallbackMemory.set(context.settings, values);
  }
  return values;
}
export function outlineDefault(context: DrawContext, name: string, fallback: number): number {
  const value = context.get(name);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export function outlinePolyline(
  context: DrawContext,
  points: readonly CadPoint[],
  closed = false,
  bulges: readonly number[] = [],
  widths?: { start: readonly number[]; end: readonly number[] },
  id?: string,
): CadPolyline {
  return {
    ...draftEntityBase(context.settings, id),
    type: 'polyline',
    points: points.map((p) => ({ ...p })),
    closed,
    bulges: points.map((_, index) => bulges[index] ?? 0),
    ...(widths
      ? {
          startWidths: points.map((_, index) => widths.start[index] ?? 0),
          endWidths: points.map((_, index) => widths.end[index] ?? 0),
        }
      : {}),
    plinegen: outlineDefault(context, 'PLINEGEN', 0) === 1,
    elevation: points[0]?.z ?? outlineDefault(context, 'ELEVATION', 0),
    thickness: outlineDefault(context, 'THICKNESS', 0),
  };
}
export function outlineAngle(
  value: DrawValue,
  context: DrawContext,
  base?: CadPoint,
  included = false,
): number | undefined {
  const point = drawPoint(value);
  if (point && base) return Math.atan2(-(point.y - base.y), point.x - base.x);
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return parseDraftAngle(value, {
    ...context.coordinates(),
    ...(included ? { angbase: 0, angdir: 0 } : {}),
  });
}
export function* outlineNumber(
  context: DrawContext,
  ko: string,
  en: string,
  options: {
    fallback?: number;
    min?: number;
    strict?: boolean;
    partial?: CadEntity[];
    base?: CadPoint;
    preview?: DrawRequest['preview'];
  } = {},
): Generator<DrawRequest, number, DrawValue> {
  while (true) {
    const value = yield {
      kind: 'number',
      ko,
      en,
      ...(options.partial ? { partial: options.partial } : {}),
      ...(options.base ? { base: options.base } : {}),
      ...(options.preview ? { preview: options.preview } : {}),
    };
    let number =
      typeof value === 'string' ? parseDraftNumber(value, context.coordinates()) : undefined;
    if (typeof value === 'string' && !value.trim()) number = options.fallback;
    const first = drawPoint(value);
    if (first) {
      if (options.base) number = length(options.base, first);
      else {
        const second = drawPoint(
          yield {
            kind: 'point',
            ko: '두 번째 점 지정:',
            en: 'Specify second point:',
            base: first,
            ...(options.partial ? { partial: options.partial } : {}),
          },
        );
        if (second) number = length(first, second);
      }
    }
    if (
      number !== undefined &&
      (options.min === undefined || (options.strict ? number > options.min : number >= options.min))
    )
      return number;
  }
}
export function* outlinePoint(
  ko: string,
  en: string,
  options: Omit<DrawRequest, 'ko' | 'en' | 'kind'> = {},
): Generator<DrawRequest, CadPoint, DrawValue> {
  while (true) {
    const point = drawPoint(yield { kind: 'point', ko, en, ...options });
    if (point) return point;
  }
}
