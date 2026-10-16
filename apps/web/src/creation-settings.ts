import type { CadSettings } from '@hancad/legacy-bridge';
import { colorFromDxf, resolveDisplayColor, rgbToCss } from '@hancad/render';
import { CreationStyleError } from './creation-style-error';

const names: Readonly<Record<string, number>> = {
  RED: 1,
  YELLOW: 2,
  GREEN: 3,
  CYAN: 4,
  BLUE: 5,
  MAGENTA: 6,
  WHITE: 7,
};

/** Applies current creation variables once when a command begins. */
export function creationSettings(
  settings: CadSettings,
  get: (name: string) => unknown,
): CadSettings {
  const value = String(get('CECOLOR')).trim().toUpperCase();
  let aci: number;
  let trueColor: number | undefined;
  if (value === 'BYLAYER') aci = 256;
  else if (value === 'BYBLOCK') aci = 0;
  else {
    if (value.includes('$')) throw new CreationStyleError('unsupported-color-book');
    if (/^HSL\s*:/.test(value)) throw new CreationStyleError('unsupported-hsl');
    const rgb = /^RGB\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/.exec(value);
    const colorIndex = names[value] ?? (/^\d+$/.test(value) ? Number(value) : Number.NaN);
    if (rgb) {
      const channels = rgb.slice(1).map(Number);
      if (channels.some((channel) => channel > 255)) throw new CreationStyleError('invalid-rgb');
      trueColor = ((channels[0] ?? 0) << 16) | ((channels[1] ?? 0) << 8) | (channels[2] ?? 0);
      aci = 256;
    } else if (/^RGB\s*:/.test(value)) throw new CreationStyleError('invalid-rgb');
    else if (Number.isInteger(colorIndex) && colorIndex >= 1 && colorIndex <= 255) aci = colorIndex;
    else throw new CreationStyleError('invalid-color');
  }
  const transparency = Number(get('CETRANSPARENCY'));
  const result: CadSettings = {
    ...settings,
    aci,
    linetype: String(get('CELTYPE')),
    lineweight: Number(get('CELWEIGHT')),
    linetypeScale: Number(get('CELTSCALE')),
    plinegen: Number(get('PLINEGEN')) === 1,
    transparency:
      transparency === -1
        ? 'bylayer'
        : transparency === -2
          ? 'byblock'
          : Math.max(0, Math.min(90, transparency)),
  };
  delete result.trueColor;
  if (trueColor !== undefined) result.trueColor = trueColor;
  if (aci !== 256 || trueColor !== undefined) {
    result.color = rgbToCss(
      resolveDisplayColor(colorFromDxf(aci, trueColor), {
        layer: { kind: 'aci', index: 7 },
        background: 0x212830,
      }),
    );
  }
  return result;
}
