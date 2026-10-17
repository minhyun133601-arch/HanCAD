import { describe, expect, it } from 'vitest';
import { defaultCoordinateSettings } from '@hancad/draft';
import type { GripDimensionContext } from '@hancad/draft';
import type { DynamicEdit } from './dynamic-input-state';
import {
  gripDimensionConstraints,
  gripDimensionLocks,
  gripDimensionToken,
} from './grip-dynamic-input';

const line: GripDimensionContext = {
  key: 'line/a',
  kind: 'linear',
  origin: { x: 0, y: 0 },
  original: { x: 100, y: 0 },
  point: { x: 100, y: 0 },
  originalLength: 100,
  originalAngle: 0,
  length: 100,
  angle: 0,
};
const edit = (field: DynamicEdit['field'], locked: DynamicEdit['locked']): DynamicEdit => ({
  field,
  locked,
  engaged: true,
  relative: true,
});

describe('reciprocal grip dimension locks', () => {
  it('replaces either length-family lock while retaining an independent angular lock', () => {
    expect(
      gripDimensionLocks(edit('lengthChange', { result: '180', absoluteAngle: '90' }), '25', line),
    ).toEqual({ lengthChange: '25', absoluteAngle: '90' });
    expect(
      gripDimensionLocks(edit('result', { lengthChange: '80', angleChange: '30' }), '125', line),
    ).toEqual({ result: '125', angleChange: '30' });
  });
  it('replaces either angular-family lock while retaining an independent length lock', () => {
    expect(
      gripDimensionLocks(edit('angleChange', { absoluteAngle: '90', result: '150' }), '30', line),
    ).toEqual({ angleChange: '30', result: '150' });
    expect(
      gripDimensionLocks(
        edit('absoluteAngle', { angleChange: '90', lengthChange: '25' }),
        '30',
        line,
      ),
    ).toEqual({ absoluteAngle: '30', lengthChange: '25' });
  });
  it('uses the newly typed reciprocal value for both Enter and live mouse projection', () => {
    const state = edit('lengthChange', { result: '180', absoluteAngle: '90' });
    const token = gripDimensionToken(state, '25', line, defaultCoordinateSettings)!;
    const [x, y] = token.slice(1).split(',').map(Number);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(125, 10);
    const projected = gripDimensionConstraints(state, '25', line, defaultCoordinateSettings)
      .project!({ x: -30, y: -50 });
    expect(projected.x).toBeCloseTo(0, 10);
    expect(projected.y).toBeCloseTo(-125, 10);
  });
  it('preserves locks on a blank Tab and replaces coupled arc fields with the new radius/result choice', () => {
    const arc: GripDimensionContext = {
      ...line,
      kind: 'arc',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      original: { x: 50, y: -50 },
      point: { x: 50, y: -50 },
      radius: 50,
      originalLength: Math.PI * 50,
      length: Math.PI * 50,
      originalAngle: Math.PI,
      angle: Math.PI,
    };
    const radius = edit('radius', {
      result: '180',
      lengthChange: '10',
      absoluteAngle: '120',
      angleChange: '30',
    });
    expect(gripDimensionLocks(radius, '', arc)).toEqual(radius.locked);
    expect(gripDimensionLocks(radius, '75', arc)).toEqual({ radius: '75' });
    expect(gripDimensionLocks(edit('result', { radius: '75' }), '160', arc)).toEqual({
      result: '160',
    });
    expect(gripDimensionConstraints(radius, '40', arc, defaultCoordinateSettings).invalid).toBe(
      true,
    );
  });
});
