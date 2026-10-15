import { describe, expect, it } from 'vitest';
import {
  ACI_RGB,
  colorFromDxf,
  colorFromHex,
  foregroundColor,
  resolveDisplayColor,
  resolveTransparency,
  transparencyFromDxf,
} from './aci';
import {
  LINEWEIGHT_BYBLOCK,
  LINEWEIGHT_BYLAYER,
  LINEWEIGHT_DEFAULT,
  formatLineweight,
  isLineweightValue,
  lineweightPixels,
  resolveLineweight,
} from './lineweight';
import {
  LinetypeParseError,
  builtinLinetypes,
  effectiveLinetypeScale,
  fitPattern,
  isContinuous,
  linetypeFields,
  linetypeFromFields,
  parseLin,
  patternIntervals,
} from './linetype';

const dark = 0x212830;
const light = 0xffffff;

describe('ACI table', () => {
  it('has 256 entries matching the published construction', () => {
    expect(ACI_RGB).toHaveLength(256);
    const samples: Record<number, number> = {
      1: 0xff0000,
      7: 0xffffff,
      8: 0x808080,
      9: 0xc0c0c0,
      10: 0xff0000,
      11: 0xff7f7f,
      12: 0xa50000,
      13: 0xa55252,
      19: 0x261313,
      21: 0xff9f7f,
      23: 0xa56752,
      29: 0x261713,
      33: 0xa57c52,
      43: 0xa59152,
      60: 0xbfff00,
      109: 0x132617,
      140: 0x00bfff,
      171: 0x7f7fff,
      210: 0xff00ff,
      249: 0x261317,
      250: 0x333333,
      251: 0x5b5b5b,
      252: 0x848484,
      253: 0xadadad,
      254: 0xd6d6d6,
      255: 0xffffff,
    };
    for (const [index, rgb] of Object.entries(samples))
      expect(ACI_RGB[Number(index)], `ACI ${index}`).toBe(rgb);
  });

  it('decodes DXF 62/420 and transitional hex colors', () => {
    expect(colorFromDxf(256)).toEqual({ kind: 'bylayer' });
    expect(colorFromDxf(0)).toEqual({ kind: 'byblock' });
    expect(colorFromDxf(-5)).toEqual({ kind: 'aci', index: 5 });
    expect(colorFromDxf(5, 0x123456)).toEqual({ kind: 'rgb', rgb: 0x123456 });
    expect(colorFromHex('#00Ff80')).toEqual({ kind: 'rgb', rgb: 0x00ff80 });
    expect(colorFromHex('red')).toBeUndefined();
  });

  it('resolves ByLayer, ByBlock and inverts color 7 against the background', () => {
    const layer = { kind: 'aci', index: 7 } as const;
    expect(foregroundColor(dark)).toBe(0xffffff);
    expect(foregroundColor(light)).toBe(0x000000);
    expect(resolveDisplayColor({ kind: 'bylayer' }, { layer, background: dark })).toBe(0xffffff);
    expect(resolveDisplayColor({ kind: 'bylayer' }, { layer, background: light })).toBe(0);
    expect(resolveDisplayColor({ kind: 'byblock' }, { layer, background: light })).toBe(0);
    expect(
      resolveDisplayColor(
        { kind: 'byblock' },
        { layer, block: { kind: 'aci', index: 1 }, background: dark },
      ),
    ).toBe(0xff0000);
    expect(resolveDisplayColor({ kind: 'rgb', rgb: 0xffffff }, { layer, background: light })).toBe(
      0xffffff,
    );
    expect(resolveDisplayColor({ kind: 'aci', index: 30 }, { layer, background: dark })).toBe(
      0xff7f00,
    );
  });

  it('decodes transparency and honors TRANSPARENCYDISPLAY', () => {
    expect(transparencyFromDxf(undefined)).toBe('bylayer');
    expect(transparencyFromDxf(0x01000000)).toBe('byblock');
    expect(transparencyFromDxf(0x02000000 | 127)).toBe(50);
    expect(transparencyFromDxf(0x02000000 | 255)).toBe(0);
    expect(resolveTransparency('bylayer', 40)).toBe(40);
    expect(resolveTransparency(70, 40, 0, false)).toBe(0);
    expect(resolveTransparency(120, 0)).toBe(90);
  });
});

describe('lineweights', () => {
  it('resolves ByLayer, ByBlock and Default through LWDEFAULT', () => {
    expect(resolveLineweight(LINEWEIGHT_BYLAYER, 50, 25)).toBe(50);
    expect(resolveLineweight(LINEWEIGHT_BYLAYER, LINEWEIGHT_DEFAULT, 30)).toBe(30);
    expect(resolveLineweight(LINEWEIGHT_BYBLOCK, 50, 25)).toBe(25);
    expect(resolveLineweight(LINEWEIGHT_DEFAULT, 50, 18)).toBe(18);
    expect(resolveLineweight(70, 50, 25)).toBe(70);
    expect(isLineweightValue(53)).toBe(true);
    expect(isLineweightValue(52)).toBe(false);
  });

  it('maps lineweights to model-space pixels only when displayed', () => {
    expect(lineweightPixels(211, false)).toBe(1);
    expect(lineweightPixels(0, true)).toBe(1);
    expect(lineweightPixels(25, true)).toBe(1);
    expect(lineweightPixels(30, true)).toBe(2);
    expect(lineweightPixels(50, true)).toBe(2);
    expect(lineweightPixels(70, true)).toBe(3);
    expect(lineweightPixels(100, true)).toBe(4);
    expect(lineweightPixels(211, true)).toBe(9);
    expect(lineweightPixels(100, true, 2)).toBe(8);
    expect(formatLineweight(30, 1)).toBe('0.30 mm');
    expect(formatLineweight(LINEWEIGHT_BYLAYER, 1)).toBe('ByLayer');
  });
});

describe('linetypes', () => {
  it('parses the built-in metric library with standard names', () => {
    const library = builtinLinetypes();
    for (const name of ['DASHED', 'CENTER', 'HIDDEN', 'PHANTOM', 'ACAD_ISO02W100', 'GAS_LINE'])
      expect(library.has(name), name).toBe(true);
    expect(library.get('DASHED')?.elements.map((element) => element.length)).toEqual([12.7, -6.35]);
    expect(library.get('CENTER')?.patternLength).toBeCloseTo(50.8, 10);
    expect(library.get('PHANTOM')?.patternLength).toBeCloseTo(63.5, 10);
    const gas = library.get('GAS_LINE');
    expect(gas?.elements[2]?.complex).toMatchObject({ kind: 'text', value: 'GAS', scale: 2.54 });
    expect(isContinuous(library.get('TRACKS'))).toBe(true);
  });

  it('parses comments, case and complex shapes and reports malformed input', () => {
    const [shape] = parseLin(
      ';; comment\n*fence,Fence\nA,1,-.5,[BOX,ltypeshp.shx,x=-.1,s=.1,r=90],-.5,2\n',
    );
    expect(shape?.name).toBe('FENCE');
    expect(shape?.elements[2]?.complex).toMatchObject({
      kind: 'shape',
      value: 'BOX',
      rotation: 90,
    });
    expect(() => parseLin('*BAD\nB,1,-1')).toThrow(LinetypeParseError);
    expect(() => parseLin('*BAD\nA,1')).toThrow(LinetypeParseError);
    expect(() => parseLin('*BAD\nA,-1,1')).toThrow(LinetypeParseError);
    expect(() => parseLin('A,1,-1')).toThrow(LinetypeParseError);
  });

  it('round-trips database LTYPE fields', () => {
    const dashed = builtinLinetypes().get('DASHED')!;
    const restored = linetypeFromFields('dashed', linetypeFields(dashed));
    expect(restored.elements).toEqual(dashed.elements);
    expect(restored.patternLength).toBeCloseTo(dashed.patternLength);
    expect(isContinuous(linetypeFromFields('CONTINUOUS', { pattern: [] }))).toBe(true);
  });

  it('fits whole patterns with equal end dashes and continuous short runs', () => {
    expect(fitPattern(10, 19.05, 12.7)).toBeUndefined();
    expect(fitPattern(19.05, 19.05, 12.7)).toEqual({ endDash: 6.35, repetitions: 1 });
    const fit = fitPattern(100, 19.05, 12.7)!;
    expect(fit.repetitions).toBe(5);
    expect(fit.endDash).toBeCloseTo((100 - 5 * 19.05 + 12.7) / 2, 10);
    const dashed = builtinLinetypes().get('DASHED')!;
    const intervals = patternIntervals(100, dashed);
    expect(intervals[0]?.[0]).toBe(0);
    expect(intervals[0]?.[1]).toBeCloseTo(fit.endDash, 10);
    expect(intervals.at(-1)?.[1]).toBe(100);
    expect(intervals.at(-1)![1] - intervals.at(-1)![0]).toBeCloseTo(fit.endDash, 10);
    const drawn = intervals.reduce((sum, [a, b]) => sum + b - a, 0);
    expect(drawn).toBeCloseTo(100 - 5 * 6.35, 8);
    expect(patternIntervals(5, dashed)).toEqual([[0, 5]]);
  });

  it('applies LTSCALE, the object scale and MSLTSCALE annotation scale', () => {
    const context = { ltscale: 2, msltscale: 1, annotationScale: 0.01, modelSpace: true };
    expect(effectiveLinetypeScale(0.5, context)).toBeCloseTo(100);
    expect(effectiveLinetypeScale(0.5, { ...context, msltscale: 0 })).toBeCloseTo(1);
    expect(effectiveLinetypeScale(1, { ...context, modelSpace: false })).toBeCloseTo(2);
  });
});
