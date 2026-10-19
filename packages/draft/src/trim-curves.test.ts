import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CurveGeometry } from '@hancad/geom';
import { evaluateGeometry } from '@hancad/geom';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { editCurveEntity } from './modify-curve-geometry';
import { draftCircle, draftLine } from './entities';
import { trimExtendEntity } from './trim-curves';
import { TrimExtendSession } from './trim-session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const edge = (x: number): CurveGeometry => ({
  type: 'LINE',
  start: { x, y: -20, z: 0 },
  end: { x, y: 20, z: 0 },
});
describe('exact TRIM and EXTEND curves', () => {
  it('trims a circle between two crossings into one analytic ARC through the parameter seam', () => {
    const c = createEmptyCadState(),
      circle = draftCircle(c.settings, { x: 0, y: 0 }, 10, 'c');
    const result = trimExtendEntity(circle, { x: 10, y: 0 }, [edge(5)], 'TRIM');
    expect(result).toHaveLength(1);
    expect(result?.[0]?.curve?.type).toBe('ARC');
    const curve = result?.[0]?.curve;
    if (curve?.type !== 'ARC') throw Error('Expected ARC');
    expect(curve.sweepAngle).toBeCloseTo((4 * Math.PI) / 3, 12);
    expect(result?.[0]?.id).toBe('c');
  });
  it('extends an arc on its natural circle, preserving radius and exact curve identity', () => {
    const c = createEmptyCadState(),
      base = draftCircle(c.settings, { x: 0, y: 0 }, 10, 'a');
    const arc: CurveGeometry = {
      type: 'ARC',
      center: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
      radius: 10,
      startAngle: 0,
      sweepAngle: Math.PI / 4,
    };
    const result = trimExtendEntity(
      editCurveEntity(base, arc),
      { x: 7, y: -7 },
      [edge(0)],
      'EXTEND',
    );
    expect(result?.[0]?.curve).toMatchObject({ type: 'ARC', sweepAngle: Math.PI / 2, radius: 10 });
  });
  it('trims rational NURBS exactly instead of retaining a sampled display outline', () => {
    const c = createEmptyCadState(),
      line = draftLine(c.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 's');
    const spline: CurveGeometry = {
      type: 'SPLINE',
      degree: 2,
      knots: [0, 0, 0, 1, 1, 1],
      controlPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 5, z: 0 },
        { x: 10, y: 0, z: 0 },
      ],
      weights: [1, 0.7, 1],
      fitPoints: [],
      closed: false,
      periodic: false,
      fitTolerance: 0,
      knotParameterization: 'chord',
    };
    const result = trimExtendEntity(
      editCurveEntity(line, spline),
      { x: 2, y: -1 },
      [edge(5)],
      'TRIM',
    );
    expect(result).toHaveLength(1);
    const curve = result?.[0]?.curve;
    if (!curve) throw Error('Missing source');
    expect(curve.type).toBe('SPLINE');
    const actual = evaluateGeometry(curve, 0.5),
      expected = evaluateGeometry(spline, 0.75);
    expect(actual.x).toBeCloseTo(expected.x, 9);
    expect(actual.y).toBeCloseTo(expected.y, 9);
  });
  it('Project None rejects elevated false crossings while UCS permits them', () => {
    const c = createEmptyCadState(),
      line = draftLine(c.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'l'),
      boundary: CurveGeometry = {
        type: 'LINE',
        start: { x: 5, y: -10, z: 3 },
        end: { x: 5, y: 10, z: 3 },
      };
    expect(
      trimExtendEntity(line, { x: 9, y: 0 }, [boundary], 'TRIM', false, false, 'None'),
    ).toBeUndefined();
    expect(
      trimExtendEntity(line, { x: 9, y: 0 }, [boundary], 'TRIM', false, false, 'UCS'),
    ).toHaveLength(1);
  });
  it('trims XLINE outer domains into rays and its middle interval into two rays', () => {
    const c = createEmptyCadState();
    const line = draftLine(c.settings, { x: 0, y: 0 }, { x: 1, y: 0 }, 'infinite');
    const source = editCurveEntity(line, {
      type: 'XLINE',
      basePoint: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    });
    const middle = trimExtendEntity(source, { x: 5, y: 0 }, [edge(2), edge(8)], 'TRIM');
    expect(middle?.map((entity) => entity.curve)).toEqual([
      { type: 'RAY', basePoint: { x: 2, y: 0, z: 0 }, direction: { x: -1, y: -0, z: -0 } },
      { type: 'RAY', basePoint: { x: 8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    ]);
    expect(trimExtendEntity(source, { x: -5, y: 0 }, [edge(2)], 'TRIM')?.[0]?.curve).toMatchObject({
      type: 'RAY',
      basePoint: { x: 2 },
    });
  });
  it('trims RAY into bounded LINE and surviving RAY, and extends its finite base', () => {
    const c = createEmptyCadState();
    const line = draftLine(c.settings, { x: 0, y: 0 }, { x: 1, y: 0 }, 'ray');
    const source = editCurveEntity(line, {
      type: 'RAY',
      basePoint: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    });
    const middle = trimExtendEntity(source, { x: 5, y: 0 }, [edge(2), edge(8)], 'TRIM');
    expect(middle?.map((entity) => entity.curve)).toEqual([
      { type: 'LINE', start: { x: 0, y: 0, z: 0 }, end: { x: 2, y: 0, z: 0 } },
      { type: 'RAY', basePoint: { x: 8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    ]);
    expect(trimExtendEntity(source, { x: 9, y: 0 }, [edge(2)], 'TRIM')?.[0]?.type).toBe('line');
    expect(
      trimExtendEntity(source, { x: 0, y: 0 }, [edge(-5)], 'EXTEND')?.[0]?.curve,
    ).toMatchObject({ type: 'RAY', basePoint: { x: -5 } });
  });
  it('dragged fence trims an infinite source beyond its unit display sample and local U restores it', () => {
    const c = createEmptyCadState();
    const line = draftLine(c.settings, { x: 0, y: 0 }, { x: 1, y: 0 }, 'x');
    c.entities = [
      editCurveEntity(line, {
        type: 'XLINE',
        basePoint: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
      }),
      draftLine(c.settings, { x: 20, y: -10 }, { x: 20, y: 10 }, 'edge'),
    ];
    const session = new TrimExtendSession('TRIM', c);
    expect(
      session.acceptFence([
        { x: 30, y: -2 },
        { x: 30, y: 2 },
      ]),
    ).toEqual({ changed: true });
    expect(session.getSnapshot().state.entities[0]?.curve).toMatchObject({
      type: 'RAY',
      direction: { x: -1 },
    });
    session.acceptText('U');
    expect(session.getSnapshot().state.entities).toEqual(c.entities);
  });
  it('Fence/Crossing/Erase are accepted shadow edits and command-local Undo restores each operation', () => {
    const c = createEmptyCadState();
    c.entities = [
      draftLine(c.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'l'),
      draftLine(c.settings, { x: 5, y: -10 }, { x: 5, y: 10 }, 'b'),
    ];
    const session = new TrimExtendSession('TRIM', c);
    session.acceptText('F');
    session.acceptText('8,-2');
    session.acceptText('8,2');
    session.acceptText('');
    expect(session.getSnapshot().state.entities.find((e) => e.id === 'l')).toMatchObject({
      b: { x: 5, y: 0 },
    });
    session.acceptText('U');
    expect(session.getSnapshot().state.entities).toEqual(c.entities);
    session.acceptText('R');
    session.acceptPick({ x: 2, y: 0 }, c.entities[0]);
    session.acceptText('');
    expect(session.getSnapshot().state.entities).toHaveLength(1);
    session.acceptText('U');
    expect(session.getSnapshot().state.entities).toEqual(c.entities);
    session.acceptText('P');
    expect(session.acceptText('None')).toEqual({ project: 0 });
  });
});
