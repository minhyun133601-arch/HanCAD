/**
 * AutoCAD Color Index (ACI) table and color resolution.
 *
 * Indices 10-249 follow the published ACI construction: 24 hues in 15 degree
 * steps, each with a full and a pale (halfway to white) variant at the
 * brightness levels 1, 0.65, 0.5, 0.3 and 0.15, truncated to 8 bits. Indices
 * 1-9 and the 250-255 gray ramp are the documented fixed values. See
 * docs/DECISIONS.md (Phase 02 display styles) for the source comparison.
 */
const levels = [1, 0.65, 0.5, 0.3, 0.15] as const;
const fixed: Readonly<Record<number, number>> = {
  0: 0x000000,
  1: 0xff0000,
  2: 0xffff00,
  3: 0x00ff00,
  4: 0x00ffff,
  5: 0x0000ff,
  6: 0xff00ff,
  7: 0xffffff,
  8: 0x808080,
  9: 0xc0c0c0,
};

function hueChannels(hueIndex: number): [number, number, number] {
  const hue = (hueIndex * 15) % 360;
  const sector = Math.floor(hue / 60);
  const fraction = (hue % 60) / 60;
  const rising = 255 * fraction;
  const falling = 255 * (1 - fraction);
  switch (sector) {
    case 0:
      return [255, rising, 0];
    case 1:
      return [falling, 255, 0];
    case 2:
      return [0, 255, rising];
    case 3:
      return [0, falling, 255];
    case 4:
      return [rising, 0, 255];
    default:
      return [255, 0, falling];
  }
}

function buildTable(): readonly number[] {
  const table: number[] = [];
  for (let index = 0; index < 256; index++) {
    const known = fixed[index];
    if (known !== undefined) {
      table.push(known);
      continue;
    }
    if (index >= 250) {
      const gray = Math.trunc(51 + ((index - 250) * 204) / 5);
      table.push((gray << 16) | (gray << 8) | gray);
      continue;
    }
    const offset = index - 10;
    const hue = Math.floor(offset / 10);
    const variant = offset % 10;
    const level = levels[variant >> 1]!;
    const pale = (variant & 1) === 1;
    const [red, green, blue] = hueChannels(hue).map((channel) =>
      Math.trunc((pale ? (channel + 255) / 2 : channel) * level),
    ) as [number, number, number];
    table.push((red << 16) | (green << 8) | blue);
  }
  return Object.freeze(table);
}

/** 0xRRGGBB per ACI index; index 0 (ByBlock) and 256 (ByLayer) are not colors. */
export const ACI_RGB: readonly number[] = buildTable();

export type EntityColor =
  | { kind: 'bylayer' }
  | { kind: 'byblock' }
  | { kind: 'aci'; index: number }
  | { kind: 'rgb'; rgb: number };

export const BYLAYER_COLOR: EntityColor = Object.freeze({ kind: 'bylayer' });
export const BYBLOCK_COLOR: EntityColor = Object.freeze({ kind: 'byblock' });

/** DXF group 62 (index) plus optional group 420 (24-bit true color). */
export function colorFromDxf(index: number, trueColor?: number | null): EntityColor {
  if (typeof trueColor === 'number' && Number.isInteger(trueColor) && trueColor >= 0)
    return { kind: 'rgb', rgb: trueColor & 0xffffff };
  const aci = Math.abs(Math.trunc(index));
  if (aci === 256) return BYLAYER_COLOR;
  if (aci === 0) return BYBLOCK_COLOR;
  if (aci >= 1 && aci <= 255) return { kind: 'aci', index: aci };
  return BYLAYER_COLOR;
}

/** Parses `#rrggbb` (the transitional model's explicit color) into a true color. */
export function colorFromHex(value: string): EntityColor | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  return match?.[1] ? { kind: 'rgb', rgb: parseInt(match[1], 16) } : undefined;
}

export function isDarkBackground(rgb: number): boolean {
  const red = (rgb >> 16) & 255,
    green = (rgb >> 8) & 255,
    blue = rgb & 255;
  return (red * 0.299 + green * 0.587 + blue * 0.114) / 255 < 0.5;
}

/** ACI 7 is white on dark backgrounds and black on light backgrounds. */
export function foregroundColor(background: number): number {
  return isDarkBackground(background) ? 0xffffff : 0x000000;
}

export interface ColorContext {
  /** Resolved layer color; ByLayer at the top level uses this. */
  layer: EntityColor;
  /** Block-reference color for ByBlock; top-level ByBlock displays as color 7. */
  block?: EntityColor;
  background: number;
}

/** Display RGB of an entity color, including ByLayer/ByBlock and color 7 inversion. */
export function resolveDisplayColor(color: EntityColor, context: ColorContext): number {
  let current = color;
  for (let depth = 0; depth < 3; depth++) {
    if (current.kind === 'bylayer') current = context.layer;
    else if (current.kind === 'byblock') current = context.block ?? { kind: 'aci', index: 7 };
    else break;
  }
  if (current.kind === 'rgb') return current.rgb;
  if (current.kind !== 'aci' || current.index === 7) return foregroundColor(context.background);
  return ACI_RGB[current.index] ?? foregroundColor(context.background);
}

export function rgbToCss(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

/**
 * Entity transparency in percent (0-90); `bylayer`/`byblock` defer to the owner.
 * DXF group 440 stores 0x02000000 | alpha for an explicit value and
 * 0x01000000 for ByBlock; an absent value (0 in HanCAD fields) is ByLayer.
 */
export type EntityTransparency = 'bylayer' | 'byblock' | number;

export function transparencyFromDxf(raw: number | null | undefined): EntityTransparency {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw === 0) return 'bylayer';
  if ((raw & 0x01000000) !== 0 && (raw & 0x02000000) === 0) return 'byblock';
  if ((raw & 0x02000000) !== 0) {
    const alpha = raw & 255;
    return Math.max(0, Math.min(90, Math.round((1 - alpha / 255) * 100)));
  }
  return 'bylayer';
}

export function resolveTransparency(
  value: EntityTransparency,
  layer: number,
  block = 0,
  displayEnabled = true,
): number {
  if (!displayEnabled) return 0;
  const percent = value === 'bylayer' ? layer : value === 'byblock' ? block : value;
  return Math.max(0, Math.min(90, Number.isFinite(percent) ? percent : 0));
}
