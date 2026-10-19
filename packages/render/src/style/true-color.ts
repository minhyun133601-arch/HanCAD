export interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

/** HSL uses degrees and percent, as the True Color dialog does. */
export function hslToRgb(hue: number, saturation: number, lightness: number): number {
  if (
    ![hue, saturation, lightness].every(Number.isFinite) ||
    hue < 0 ||
    hue > 360 ||
    saturation < 0 ||
    saturation > 100 ||
    lightness < 0 ||
    lightness > 100
  )
    throw new RangeError('HSL channels must be 0–360, 0–100, 0–100.');
  const s = saturation / 100,
    l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = (hue % 360) / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const values =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const [r = 0, g = 0, b = 0] = values.map((channel) =>
    Math.round((channel + l - chroma / 2) * 255),
  );
  return (r << 16) | (g << 8) | b;
}

export function rgbToHsl(rgb: number): HslColor {
  const r = ((rgb >> 16) & 255) / 255,
    g = ((rgb >> 8) & 255) / 255,
    b = (rgb & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const lightness = (max + min) / 2;
  let hue =
    delta === 0
      ? 0
      : max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return {
    hue,
    saturation: delta === 0 ? 0 : (delta / (1 - Math.abs(2 * lightness - 1))) * 100,
    lightness: lightness * 100,
  };
}
