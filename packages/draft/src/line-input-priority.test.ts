import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadEntity } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { DraftSession } from './session';
import { circle, source } from './snap-fixtures';
import type { DraftSnapDeferred } from './snap-types';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

describe('LINE coordinate entry and snap priority', () => {
  it.each([
    [0, 'keyboard', true],
    [1, 'keyboard', false],
    [2, 'keyboard', false],
    [0, 'script', true],
    [1, 'script', false],
    [2, 'script', true],
  ] as const)('applies OSNAPCOORD=%s to %s input', (osnapcoord, source, snapped) => {
    const resolve = vi.fn(() => ({ point: { x: 10, y: -20 } }));
    const session = new DraftSession('LINE', createEmptyCadState().settings, {
      coordinates: () => ({ osnapcoord }),
      resolveTypedPoint: resolve,
      onCommit: () => {},
    });
    expect(session.acceptText('11,21', { source }).status).toBe('continue');
    expect(session.getSnapshot().points).toEqual([snapped ? { x: 10, y: -20 } : { x: 11, y: -21 }]);
    expect(resolve).toHaveBeenCalledTimes(snapped ? 1 : 0);
  });

  it('forces an explicit snap even with keyboard priority and consumes it after one source sample', () => {
    const resolve = vi.fn(() => ({ point: { x: 10, y: -20 } }));
    const sampled = vi.fn();
    const session = new DraftSession('LINE', createEmptyCadState().settings, {
      coordinates: () => ({ osnapcoord: 1 }),
      resolveTypedPoint: resolve,
      onPointSampleAccepted: sampled,
      onCommit: () => {},
    });
    session.acceptText('FROM');
    session.acceptText('END 11,21');
    expect(resolve).toHaveBeenCalledWith({ x: 11, y: -21 }, 'endpoint');
    expect(session.getPointInput().snapOverride).toBeUndefined();
    session.acceptText('@5,5');
    expect(session.getSnapshot().points).toEqual([{ x: 15, y: -25 }]);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(sampled).toHaveBeenCalledTimes(2);
  });

  it('preserves a rejected one-shot override, while NON bypasses both running and explicit snaps', () => {
    const resolve =
      vi.fn<NonNullable<ConstructorParameters<typeof DraftSession>[2]['resolveTypedPoint']>>();
    const session = new DraftSession('LINE', createEmptyCadState().settings, {
      coordinates: () => ({ osnapcoord: 0 }),
      resolveTypedPoint: resolve,
      onCommit: () => {},
    });
    expect(session.acceptText('END 1,2').status).toBe('error');
    expect(session.getPointInput().snapOverride).toBe('endpoint');
    session.acceptText('NON 1,2');
    expect(session.getSnapshot().points).toEqual([{ x: 1, y: -2 }]);
    expect(resolve).toHaveBeenCalledTimes(1);
    resolve.mockReturnValue({ point: { x: 1, y: -2 } });
    expect(session.acceptText('END 2,3')).toMatchObject({ status: 'error', error: 'zeroLength' });
    expect(session.getPointInput().snapOverride).toBe('endpoint');
    expect(session.getSnapshot().points).toHaveLength(1);
  });

  it('treats a shortcut-menu one-shot as an explicit override at typed coordinate prompts', () => {
    const resolve = vi.fn(() => ({ point: { x: 10, y: -20 } }));
    const session = new DraftSession('LINE', createEmptyCadState().settings, {
      coordinates: () => ({ osnapcoord: 1 }),
      getSnapOverride: () => 'endpoint',
      resolveTypedPoint: resolve,
      onCommit: () => {},
    });
    session.acceptText('11,21');
    expect(resolve).toHaveBeenCalledWith({ x: 11, y: -21 }, 'endpoint');
    expect(session.getSnapshot().points).toEqual([{ x: 10, y: -20 }]);
  });

  it('accepts all Phase 04 coordinate examples without rounding or creating modifier reference segments', () => {
    const commits: CadEntity[][] = [];
    const session = new DraftSession('LINE', createEmptyCadState().settings, {
      onCommit: (entities) => commits.push(entities),
    });
    session.acceptText('100,50');
    session.acceptText('@100<30');
    const second = session.getSnapshot().points[1]!;
    expect(second.x).toBeCloseTo(100 + 50 * Math.sqrt(3), 12);
    expect(second.y).toBeCloseTo(-100, 12);
    session.acceptText('#0,0');
    session.moveCursor({ x: 50, y: -50 }, { constrained: true });
    session.acceptText('100');
    expect(session.getSnapshot().points[3]!.x).toBeCloseTo(100 / Math.sqrt(2), 12);
    for (const value of [
      '.X 10,20',
      '30,40',
      'FROM 100,100',
      '@10,10',
      'TT 50,50',
      'M2P 0,0',
      '20,40',
    ])
      session.acceptText(value);
    expect(session.getSnapshot().points.slice(4)).toEqual([
      { x: 10, y: -40, z: 0 },
      { x: 110, y: -110 },
      { x: 10, y: -20 },
    ]);
    expect(commits).toHaveLength(0);
    session.acceptText('');
    expect(commits).toHaveLength(1);
    expect(commits[0]).toHaveLength(6);
  });

  it('distinguishes no continuation, first-point Undo, and continuation from the last line', () => {
    const session = new DraftSession('LINE', createEmptyCadState().settings, {
      onCommit: () => {},
    });
    expect(session.acceptText('')).toEqual({ status: 'error', error: 'noContinuation' });
    session.acceptText('1,2');
    session.acceptText('U');
    expect(session.getSnapshot()).toMatchObject({ prompt: 'firstPoint', points: [] });
    const continuing = new DraftSession('LINE', createEmptyCadState().settings, {
      continuation: { point: { x: 2, y: -3, z: 4 } },
      onCommit: () => {},
    });
    continuing.acceptText('');
    continuing.acceptText('@5,6');
    expect(continuing.getSnapshot().points).toEqual([
      { x: 2, y: -3, z: 4 },
      { x: 7, y: -9, z: 4 },
    ]);
  });
});

it('previews the resolved deferred tangent and commits that exact segment, retaining the first sample after rejection', () => {
  const deferred: DraftSnapDeferred = {
    kind: 'tangent',
    source: source(circle()),
    near: { x: 5, y: -8.660254037844386 },
  };
  const commits: CadEntity[][] = [];
  const session = new DraftSession('LINE', createEmptyCadState().settings, {
    onCommit: (entities) => commits.push(entities),
  });
  session.acceptPoint(deferred.near, { snapped: true, deferred });
  session.moveCursor({ x: 0, y: 0 }, { constrained: true });
  expect(session.getSnapshot().preview).toEqual([]);
  expect(session.acceptPoint({ x: 0, y: 0 }, { constrained: true }).status).toBe('error');
  expect(session.getAidContext().deferred).toBeDefined();
  session.moveCursor({ x: 20, y: 0 }, { constrained: true });
  const preview = session.getSnapshot().preview[0];
  expect(preview).toMatchObject({ type: 'line', b: { x: 20, y: 0 } });
  if (preview?.type !== 'line') throw new Error('Missing tangent preview');
  expect(preview.a.x).toBeCloseTo(5, 10);
  expect(preview.a.y).toBeCloseTo(-Math.sqrt(75), 10);
  session.acceptPoint({ x: 20, y: 0 }, { constrained: true });
  session.finish();
  expect(commits[0]?.[0]).toMatchObject({ a: preview.a, b: preview.b });
});
