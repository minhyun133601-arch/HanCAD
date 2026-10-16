import type { DisplayText, Vec2 } from './types';

/** Fallback until the font provider supplies measured advances; CJK uses one em. */
export function textLineWidth(text: string, height: number): number {
  let ems = 0;
  for (const char of text)
    ems += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : char === ' ' ? 0.33 : 0.6;
  return ems * height;
}
export function textLocalBox(text: DisplayText): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const lines = text.text.split(/\r?\n/),
    height = text.height;
  const width = text.width ?? Math.max(0, ...lines.map((line) => textLineWidth(line, height)));
  const left = text.align === 'center' ? -width / 2 : 0;
  return {
    minX: left,
    minY: -(lines.length - 1) * 1.25 * height - height * 0.25,
    maxX: left + width,
    maxY: height,
  };
}
export function textWorldPoint(text: DisplayText, x: number, y: number): Vec2 {
  const cosine = Math.cos(text.rotation),
    sine = Math.sin(text.rotation);
  return { x: text.position.x + x * cosine - y * sine, y: text.position.y + x * sine + y * cosine };
}
export function textCorners(text: DisplayText): Vec2[] {
  const box = textLocalBox(text);
  return [
    [box.minX, box.minY],
    [box.maxX, box.minY],
    [box.maxX, box.maxY],
    [box.minX, box.maxY],
  ].map(([x, y]) => textWorldPoint(text, x!, y!));
}
