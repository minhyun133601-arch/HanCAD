import { describe, expect, it } from 'vitest';
import { builtinLinetypes, fitPattern, patternIntervals } from '../style/linetype';
import { encodeDashSegment } from './dash-distance';
import type { DashDistanceSlice } from './dash-distance';

const options = { maxLocalDistance: 8 };
const modulo = (value: number, period: number) => ((value % period) + period) % period;
function encodedInk(
  slices: readonly DashDistanceSlice[],
  distance: number,
  start: number,
  end: number,
  lengths: readonly number[],
): boolean {
  const fraction = (distance - start) / (end - start);
  const slice = slices.find((candidate) => candidate.from <= fraction && candidate.to >= fraction)!;
  if (!slice.patterned) return true;
  const phase = modulo(
    slice.start + ((slice.end - slice.start) * (fraction - slice.from)) / (slice.to - slice.from),
    lengths.reduce((sum, length) => sum + Math.abs(length), 0),
  );
  let offset = 0;
  for (const length of lengths) {
    if (length >= 0 && phase >= offset && phase <= offset + length) return true;
    offset += Math.abs(length);
  }
  return false;
}

describe('stable fitted dash phase encoding', () => {
  it('matches reference intervals for DASHED/CENTER/HIDDEN/PHANTOM, including equal end caps', () => {
    for (const name of ['DASHED', 'CENTER', 'HIDDEN', 'PHANTOM']) {
      const definition = builtinLinetypes().get(name)!;
      const length = 123.456,
        slices = encodeDashSegment(
          0,
          length,
          length,
          definition.patternLength,
          definition.elements[0]!.length,
          options,
        );
      const reference = patternIntervals(length, definition),
        lengths = definition.elements.map((element) => element.length);
      const fit = fitPattern(length, definition.patternLength, lengths[0]!)!;
      expect(slices[0]!.patterned).toBe(false);
      expect(slices.at(-1)!.patterned).toBe(false);
      expect(slices[0]!.to * length).toBeCloseTo(fit.endDash, 10);
      expect((1 - slices.at(-1)!.from) * length).toBeCloseTo(fit.endDash, 10);
      for (let sample = 0.0123; sample < length; sample += 0.17321)
        expect(encodedInk(slices, sample, 0, length, lengths), `${name} at ${sample}`).toBe(
          reference.some(([low, high]) => low <= sample && high >= sample),
        );
    }
  });
  it('retains subunit phase after Float32 upload at cumulative distances over one hundred million', () => {
    const start = 100000000.12345,
      end = start + 100,
      length = 200000003.125;
    const period = 0.625,
      first = 0.375,
      tolerance = 0.00025;
    const slices = encodeDashSegment(start, end, length, period, first, {
      maxLocalDistance: tolerance * 2 ** 20,
    });
    const fit = fitPattern(length, period, first)!;
    expect(slices).toHaveLength(1);
    const slice = slices[0]!;
    for (let fraction = 0; fraction <= 1; fraction += 0.0125) {
      const global = start + (end - start) * fraction;
      const expected = modulo(global - fit.endDash + first, period);
      const uploaded = modulo(
        Math.fround(slice.start) * (1 - fraction) + Math.fround(slice.end) * fraction,
        Math.fround(period),
      );
      const circularError = Math.min(
        Math.abs(uploaded - expected),
        period - Math.abs(uploaded - expected),
      );
      expect(circularError).toBeLessThan(tolerance);
    }
    expect(Math.fround(start)).not.toBe(start);
  });
  it('splits long visible spans into bounded local distances with continuous phase and complete coverage', () => {
    const start = 1e8 + 0.123,
      end = start + 1000;
    const slices = encodeDashSegment(start, end, 2e8, 19.05, 12.7, options);
    expect(slices.length).toBeGreaterThan(100);
    expect(slices[0]!.from).toBe(0);
    expect(slices.at(-1)!.to).toBe(1);
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i]!;
      expect(slice.end - slice.start).toBeLessThanOrEqual(options.maxLocalDistance + 1e-7);
      if (i) {
        const previous = slices[i - 1]!;
        expect(slice.from).toBe(previous.to);
        expect(modulo(previous.end, 19.05)).toBeCloseTo(slice.start, 6);
      }
    }
  });
  it('keeps clipped first/last caps and short/continuous/zero runs solid', () => {
    expect(encodeDashSegment(0, 5, 5, 19.05, 12.7, options)).toEqual([
      { from: 0, to: 1, start: 0, end: 0, patterned: false },
    ]);
    expect(encodeDashSegment(0, 5, 100, 0, 0, options)[0]!.patterned).toBe(false);
    expect(encodeDashSegment(0, 0, 0, 1, 1, options)[0]!.patterned).toBe(false);
    expect(encodeDashSegment(98, 100, 100, 19.05, 12.7, options)[0]!.patterned).toBe(false);
    const threshold = encodeDashSegment(0, 19.05, 19.05, 19.05, 12.7, options);
    expect(threshold[0]!.to * 19.05).toBeCloseTo(6.35, 10);
    expect(threshold.some(({ patterned }) => patterned)).toBe(true);
  });
  it('encodes a constant phase across a miter triangle that falls inside the fitted pattern region', () => {
    const encoded = encodeDashSegment(50, 50, 100, 19.05, 12.7, options);
    expect(encoded).toHaveLength(1);
    expect(encoded[0]!.patterned).toBe(true);
    expect(encoded[0]!.start).toBe(encoded[0]!.end);
    expect(encoded[0]!.start).toBeGreaterThanOrEqual(0);
    expect(encoded[0]!.start).toBeLessThan(19.05);
  });
  it('guards unclipped enormous spans and rejects invalid intervals', () => {
    expect(() => encodeDashSegment(0, 1e8, 1e8, 10, 5, options)).toThrow('Clip');
    expect(() => encodeDashSegment(10, 5, 20, 10, 5, options)).toThrow('Invalid');
    expect(() => encodeDashSegment(0, 10, 5, 10, 5, options)).toThrow('Invalid');
    expect(() => encodeDashSegment(0, 10, 20, 10, 5, { maxLocalDistance: 0 })).toThrow('Invalid');
  });
});
