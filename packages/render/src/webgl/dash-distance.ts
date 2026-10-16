import { fitPattern } from '../style/linetype';

export interface DashDistanceSlice {
  /** Fractions along the original, already view-clipped source segment. */
  from: number;
  to: number;
  /** Continuous local phase; the fragment shader takes modulo patternLength. */
  start: number;
  end: number;
  /** False is a solid fitted end dash or a run shorter than one pattern. */
  patterned: boolean;
}
export interface DashDistanceOptions {
  /** Normally chord tolerance * 2**20, bounding float32 distance error in pixels. */
  maxLocalDistance: number;
  /** A guard against encoding an unclipped enormous segment. Default: 65536. */
  maxSlices?: number;
}
const modulo = (value: number, period: number): number => {
  const remainder = value % period;
  return remainder < 0 ? remainder + period : remainder;
};

/**
 * Fits in double precision before removing the enormous cumulative offset.
 * A patterned slice is uploaded with runLength = -1; solid slices use 0.
 * The phase depends on the effective pattern, so changing that pattern or its
 * scale requires re-encoding. Color/selection/visibility do not affect it.
 */
export function encodeDashSegment(
  startDistance: number,
  endDistance: number,
  runLength: number,
  patternLength: number,
  firstDash: number,
  options: DashDistanceOptions,
): readonly DashDistanceSlice[] {
  const maxSlices = options.maxSlices ?? 65536;
  if (
    ![
      startDistance,
      endDistance,
      runLength,
      patternLength,
      firstDash,
      options.maxLocalDistance,
    ].every(Number.isFinite) ||
    startDistance < 0 ||
    endDistance < startDistance ||
    runLength < endDistance ||
    patternLength < 0 ||
    firstDash < 0 ||
    options.maxLocalDistance <= 0 ||
    !Number.isSafeInteger(maxSlices) ||
    maxSlices < 1
  )
    throw new RangeError('Invalid dash distance interval');
  const span = endDistance - startDistance;
  const solid = [{ from: 0, to: 1, start: 0, end: 0, patterned: false }];
  if (patternLength === 0) return solid;
  if (firstDash > patternLength) throw new RangeError('First dash exceeds pattern length');
  const fit = fitPattern(runLength, patternLength, firstDash);
  if (!fit) return solid;
  // `%` avoids subtracting a large rounded product when only its remainder is needed.
  let remainder = modulo(runLength, patternLength);
  if (fit.repetitions > Math.floor(runLength / patternLength)) remainder -= patternLength;
  const endDash = (remainder + firstDash) / 2;
  if (span === 0) {
    if (startDistance < endDash || startDistance > runLength - endDash) return solid;
    const phase = modulo(
      modulo(startDistance, patternLength) + modulo(firstDash - endDash, patternLength),
      patternLength,
    );
    return [{ from: 0, to: 1, start: phase, end: phase, patterned: true }];
  }
  const patternStart = Math.max(startDistance, endDash);
  const patternEnd = Math.min(endDistance, runLength - endDash);
  if (patternEnd <= patternStart) return solid;
  const count = Math.max(1, Math.ceil((patternEnd - patternStart) / options.maxLocalDistance));
  const caps = Number(patternStart > startDistance) + Number(patternEnd < endDistance);
  if (count + caps > maxSlices)
    throw new RangeError('Clip the dash segment to the view before phase encoding');
  const result: DashDistanceSlice[] = [];
  const fraction = (distance: number) => (distance - startDistance) / span;
  if (patternStart > startDistance)
    result.push({ from: 0, to: fraction(patternStart), start: 0, end: 0, patterned: false });
  const adjustment = modulo(firstDash - endDash, patternLength);
  for (let index = 0; index < count; index++) {
    const low = patternStart + ((patternEnd - patternStart) * index) / count;
    const high = patternStart + ((patternEnd - patternStart) * (index + 1)) / count;
    const phase = modulo(modulo(low, patternLength) + adjustment, patternLength);
    result.push({
      from: fraction(low),
      to: fraction(high),
      start: phase,
      end: phase + (high - low),
      patterned: true,
    });
  }
  if (patternEnd < endDistance)
    result.push({ from: fraction(patternEnd), to: 1, start: 0, end: 0, patterned: false });
  return result;
}
