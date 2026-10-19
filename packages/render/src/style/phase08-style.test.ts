import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveDisplayColor } from './aci';
import { resolveInheritedStyle } from './inheritance';
import type { InheritableStyle, InheritedLayerStyle } from './inheritance';
import { linetypeFields, linetypeFromFields, parseLin } from './linetype';
import { hslToRgb, rgbToHsl } from './true-color';
import { HANCAD_ISO_LIN } from './hancad-iso-lin';

const byLayer: InheritableStyle = {
  layer: '0',
  color: { kind: 'bylayer' },
  linetype: 'BYLAYER',
  lineweight: -1,
  transparency: 'bylayer',
};
const layers = new Map<string, InheritedLayerStyle>([
  [
    '0',
    { color: { kind: 'aci', index: 7 }, linetype: 'CONTINUOUS', lineweight: -3, transparency: 0 },
  ],
  [
    'WALLS',
    { color: { kind: 'aci', index: 1 }, linetype: 'DASHED', lineweight: 50, transparency: 40 },
  ],
  [
    'DETAIL',
    { color: { kind: 'rgb', rgb: 0x123456 }, linetype: 'HIDDEN', lineweight: 70, transparency: 60 },
  ],
]);
describe('nested block inheritance', () => {
  it('distinguishes layer 0 inheritance, explicit child layers and ByBlock across three inserts', () => {
    const outer = { ...byLayer, layer: 'WALLS' };
    const inner = {
      ...byLayer,
      color: { kind: 'byblock' } as const,
      linetype: 'BYBLOCK',
      lineweight: -2,
      transparency: 'byblock' as const,
    };
    const nested = resolveInheritedStyle(inner, [outer, inner, inner], layers, 25);
    expect(nested).toEqual({
      layer: 'WALLS',
      color: { kind: 'aci', index: 1 },
      linetype: 'DASHED',
      lineweight: 50,
      transparency: 40,
      visible: true,
      locked: false,
    });
    expect(
      resolveInheritedStyle({ ...byLayer, layer: 'DETAIL' }, [outer, inner], layers),
    ).toMatchObject({
      layer: 'DETAIL',
      color: { kind: 'rgb', rgb: 0x123456 },
      linetype: 'HIDDEN',
      lineweight: 70,
      transparency: 60,
    });
    expect(
      resolveInheritedStyle({ ...inner, layer: 'DETAIL' }, [outer, inner], layers),
    ).toMatchObject({
      layer: 'DETAIL',
      color: { kind: 'aci', index: 1 },
      linetype: 'DASHED',
      lineweight: 50,
      transparency: 40,
    });
  });
  it('preserves ACI 7 until background resolution and propagates frozen ancestor visibility', () => {
    const white = resolveInheritedStyle({ ...byLayer, color: { kind: 'byblock' } }, [], layers, 30);
    expect(white).toMatchObject({ color: { kind: 'aci', index: 7 }, lineweight: 30 });
    expect(resolveDisplayColor(white.color, { layer: white.color, background: 0xffffff })).toBe(0);
    const hidden = new Map(layers);
    hidden.set('WALLS', { ...layers.get('WALLS')!, visible: false });
    expect(
      resolveInheritedStyle(
        { ...byLayer, layer: 'DETAIL' },
        [{ ...byLayer, layer: 'WALLS' }],
        hidden,
      ).visible,
    ).toBe(false);
    const locked = new Map(layers);
    locked.set('WALLS', { ...layers.get('WALLS')!, locked: true });
    expect(
      resolveInheritedStyle(
        { ...byLayer, layer: 'DETAIL' },
        [{ ...byLayer, layer: 'WALLS' }],
        locked,
      ).locked,
    ).toBe(true);
  });
});
describe('retained complex LIN definitions', () => {
  it('ships its original resource exactly and covers standard names, the ISO set and descriptor limits', () => {
    const resource = readFileSync(
      new URL('../../../../apps/web/public/support/hancadiso.lin', import.meta.url),
      'utf8',
    );
    expect(resource).toBe(HANCAD_ISO_LIN);
    const names = new Set(parseLin(resource).map((item) => item.name));
    for (const name of [
      'DASHED',
      'HIDDEN',
      'CENTER',
      'PHANTOM',
      'DOT',
      'DASHDOT',
      'BORDER',
      'DIVIDE',
    ])
      expect(names.has(name)).toBe(true);
    for (let n = 2; n <= 15; n++)
      expect(names.has(`ACAD_ISO${String(n).padStart(2, '0')}W100`)).toBe(true);
    expect(() =>
      parseLin(`*TOO_LONG\nA,${Array.from({ length: 14 }, (_, i) => (i % 2 ? -1 : 1)).join(',')}`),
    ).toThrow();
    const raw = Array.from({ length: 14 }, (_, i) => (i % 2 ? -1 : 1));
    expect(
      linetypeFromFields('IMPORTED', { pattern: raw }).elements.map((item) => item.length),
    ).toEqual(raw);
  });
  it('preserves quoted commas, Korean text, offsets and angular units through database fields', () => {
    const [definition] = parseLin(
      '; comment\n*HOT,온수\nA,10,-2,["온수,HW",STANDARD,S=2,U=100G,X=-1,Y=.5],-2,[BOX,user.shx,A=1.5707963267948966R,S=.5],0',
    );
    expect(definition?.elements[2]?.complex).toMatchObject({
      value: '온수,HW',
      rotation: 90,
      uprightRotation: true,
    });
    expect(definition?.elements[3]?.complex).toMatchObject({
      kind: 'shape',
      value: 'BOX',
      rotation: 90,
      absoluteRotation: true,
    });
    expect(linetypeFromFields('hot', linetypeFields(definition!))).toEqual(definition);
  });
});
describe('true color RGB and HSL', () => {
  it('converts primary colors, grayscale, and the 360-degree boundary', () => {
    expect(hslToRgb(0, 100, 50)).toBe(0xff0000);
    expect(hslToRgb(120, 100, 50)).toBe(0x00ff00);
    expect(hslToRgb(240, 100, 50)).toBe(0x0000ff);
    expect(hslToRgb(360, 100, 50)).toBe(0xff0000);
    expect(hslToRgb(230, 0, 50)).toBe(0x808080);
    for (const rgb of [0, 0xffffff, 0x123456, 0xff8080, 0x010203]) {
      const hsl = rgbToHsl(rgb);
      expect(hslToRgb(hsl.hue, hsl.saturation, hsl.lightness)).toBe(rgb);
    }
    expect(() => hslToRgb(0, 101, 0)).toThrow(RangeError);
  });
});
