import { hslToRgb } from '@hancad/render';

const names: Readonly<Record<string, number>> = {
  RED: 1,
  YELLOW: 2,
  GREEN: 3,
  CYAN: 4,
  BLUE: 5,
  MAGENTA: 6,
  WHITE: 7,
};
export function parseColorValue(input: string): string {
  const value = input.trim().toUpperCase();
  if (value === 'BYLAYER' || value === '256') return 'BYLAYER';
  if (value === 'BYBLOCK' || value === '0') return 'BYBLOCK';
  if (value in names) return String(names[value]);
  if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 255)
    return String(Number(value));
  const channels = /^(RGB|HSL)\s*:\s*([^:]+)$/.exec(value);
  if (channels) {
    const parts =
      channels[2]?.split(',').map((s) => (s.trim() ? Number(s.trim()) : Number.NaN)) ?? [];
    if (parts.length !== 3 || !parts.every(Number.isFinite))
      throw new Error('Invalid color channels.');
    let rgb: number;
    if (channels[1] === 'HSL') rgb = hslToRgb(parts[0]!, parts[1]!, parts[2]!);
    else {
      if (!parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
        throw new Error('Invalid RGB channels.');
      rgb = (parts[0]! << 16) | (parts[1]! << 8) | parts[2]!;
    }
    return `RGB:${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255}`;
  }
  throw new Error('Invalid color value.');
}

export function colorValueRgb(value: string): number {
  const match = /^RGB:(\d+),(\d+),(\d+)$/.exec(value);
  return match ? (Number(match[1]) << 16) | (Number(match[2]) << 8) | Number(match[3]) : 0xffffff;
}
