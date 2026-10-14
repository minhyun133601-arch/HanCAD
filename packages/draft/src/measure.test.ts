import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadSettings } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { MeasureSession, formatMeasurement, measureBetween } from './measure-session';
import type { MeasureResult } from './measure-session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

function setup(settings: Partial<CadSettings> = {}) {
  const results: MeasureResult[] = [];
  const session = new MeasureSession(
    { ...createEmptyCadState().settings, ...settings },
    {
      precision: 4,
      onComplete: (result) => results.push(result),
    },
  );
  return { session, results };
}

describe('read-only DIST measurement', () => {
  it('measures coordinate and relative point input in WCS without creating drawing entities', () => {
    const { session, results } = setup();
    expect(session.acceptText('200000000,450000000').status).toBe('continue');
    expect(session.getSnapshot().prompt).toBe('secondPoint');
    expect(session.acceptText('@30,40').status).toBe('completed');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ distance: 50, deltaX: 30, deltaY: 40 });
    expect(results[0]?.angle).toBeCloseTo(53.130102354);
    expect(session.getSnapshot()).toMatchObject({ status: 'completed', preview: [] });
    expect(session.acceptPoint({ x: 100, y: 0 })).toMatchObject({ error: 'closedSession' });
    expect(results).toHaveLength(1);
  });

  it('previews a transient line and numeric label, then discards both on cancel', () => {
    const { session, results } = setup();
    const point = { x: 0, y: 0 };
    session.acceptPoint(point);
    point.x = 200;
    session.moveCursor({ x: 30, y: -40 });
    expect(session.getSnapshot().preview).toMatchObject([
      { type: 'line', a: { x: 0, y: 0 }, b: { x: 30, y: -40 } },
      { type: 'text', text: '50.0000' },
    ]);
    session.setSettings(createEmptyCadState().settings, 2);
    expect(session.getSnapshot().preview[1]).toMatchObject({ text: '50.00' });
    expect(session.acceptText('\u001b').status).toBe('cancelled');
    expect(session.getSnapshot().preview).toEqual([]);
    expect(results).toEqual([]);
  });

  it('accepts direct distance and polar input with the cursor direction', () => {
    const { session, results } = setup();
    session.acceptText('10,20');
    session.moveCursor({ x: 13, y: -24 });
    expect(session.acceptText('100').status).toBe('completed');
    expect(results[0]).toMatchObject({ distance: 100, deltaX: 60, deltaY: 80 });
    const polar = setup();
    polar.session.acceptText('0,0');
    polar.session.acceptText('@50<90');
    expect(polar.results[0]?.distance).toBeCloseTo(50);
    expect(polar.results[0]?.deltaY).toBeCloseTo(50);
  });

  it('measures exact snapped points independently of grid or Ortho settings and accepts zero distance', () => {
    const { session, results } = setup({ ortho: true, gridSnap: true, gridSize: 10 });
    session.acceptPoint({ x: 0.2, y: -0.5 });
    session.acceptPoint({ x: 3.2, y: -4.5 });
    expect(results[0]).toMatchObject({ distance: 5, deltaX: 3, deltaY: 4 });
    const zero = setup();
    zero.session.acceptPoint({ x: 10, y: 20 });
    zero.session.acceptPoint({ x: 10, y: 20 });
    expect(zero.results[0]).toEqual({ distance: 0, deltaX: 0, deltaY: 0, angle: 0 });
  });

  it('keeps the current input stage for malformed coordinates or unavailable direct-distance directions', () => {
    const { session, results } = setup();
    expect(session.acceptText('50')).toMatchObject({ error: 'point' });
    expect(session.acceptPoint({ x: Infinity, y: 0 })).toMatchObject({ error: 'point' });
    expect(session.acceptText('')).toMatchObject({ error: 'needPoints' });
    session.acceptText('0,0');
    session.moveCursor({ x: 0, y: 0 });
    expect(session.acceptText('50')).toMatchObject({ error: 'point' });
    expect(session.acceptText('@bad,10')).toMatchObject({ error: 'point' });
    expect(session.getSnapshot().prompt).toBe('secondPoint');
    expect(results).toEqual([]);
  });

  it('formats linear/angular precision, negative components, and angle base/direction without negative zero', () => {
    const options = { linearPrecision: 2, angularPrecision: 1, angleBase: 90, clockwise: true };
    expect(formatMeasurement(measureBetween({ x: 5, y: -5 }, { x: 2, y: -9 }), options)).toEqual({
      distance: '5.00',
      deltaX: '-3.00',
      deltaY: '4.00',
      angle: '323.1',
    });
    expect(
      formatMeasurement(
        { distance: 1, deltaX: -1e-10, deltaY: -1, angle: 359.9999 },
        {
          ...options,
          angleBase: 0,
          clockwise: false,
        },
      ),
    ).toMatchObject({ deltaX: '0.00', angle: '0.0' });
    expect(measureBetween({ x: 0, y: 0 }, { x: 0, y: 1 }).angle).toBe(270);
  });
});
