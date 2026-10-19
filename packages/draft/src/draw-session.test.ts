import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { SystemVariables } from '@hancad/sysvars';
import { DrawSession } from './draw-session';
import { repeatDrawFactory } from './draw-multiple';
import { pointProgram } from './draw-basic';
import { drawFactories } from './draw-factories';
import { appendCadEntities } from './entities';
import { lineContinuation } from './line-continuation';
import { outlineContext } from './draw-outline-fixtures';
import type { DraftTool } from './types';
import type { DrawResult } from './draw-program';
import type { DrawSessionOptions } from './draw-session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function host(
  tool: DraftTool,
  context = outlineContext(),
  extra: Partial<DrawSessionOptions> = {},
) {
  const results: DrawResult[] = [],
    changes: Map<string, number | string | readonly number[]>[] = [];
  const factory = drawFactories[tool];
  if (!factory) throw new Error('Missing draw factory');
  const session = new DrawSession(tool, factory, {
    context,
    onComplete: (result, staged) => {
      results.push(result);
      changes.push(new Map(staged));
    },
    ...extra,
  });
  return { session, results, changes };
}
describe('shared DrawSession acquisition and commit host', () => {
  it('starts every registered draw factory against the real system variable catalog', () => {
    for (const [tool, factory] of Object.entries(drawFactories)) {
      const variables = new SystemVariables();
      const context = { ...outlineContext(), get: (name: string) => variables.get(name) };
      expect(
        () => new DrawSession(tool as DraftTool, factory, { context, onComplete: () => {} }),
        tool,
      ).not.toThrow();
    }
  });
  it('commits a typed PLINE once and passes real normalization/recovery validation', () => {
    const state = createEmptyCadState();
    const { session, results } = host('PLINE', { ...outlineContext(), settings: state.settings });
    for (const text of ['0,0', '100,0', '100,60'])
      expect(session.acceptText(text).status).toBe('continue');
    expect(results).toHaveLength(0);
    expect(session.getSnapEntities()).toHaveLength(1);
    expect(session.acceptText('').status).toBe('committed');
    expect(results).toHaveLength(1);
    const next = appendCadEntities(state, results[0]!.entities);
    expect(next.entities).toHaveLength(1);
    expect(next.entities[0]).toMatchObject({
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: -60 },
      ],
    });
    expect(session.cancel().status).toBe('error');
    expect(results).toHaveLength(1);
  });
  it('accepts coordinate text and point modifiers at scalar radius and angle prompts', () => {
    const { session, results } = host('CIRCLE');
    session.acceptText('10,10');
    expect(session.getSnapshot().inputMode).toBe('number');
    session.acceptText('M2P');
    session.acceptText('16,10');
    expect(results).toHaveLength(0);
    session.acceptText('10,18');
    expect(results[0]?.entities[0]).toMatchObject({
      type: 'circle',
      center: { x: 10, y: -10 },
      radius: 5,
    });
    const arc = host('ARC');
    for (const text of ['0,5', 'CENTER', '0,0', 'ANGLE', '-5,0']) arc.session.acceptText(text);
    expect(arc.results[0]?.entities[0]?.curve).toMatchObject({
      type: 'ARC',
      sweepAngle: Math.PI / 2,
    });
  });
  it('reports nonpositive circle radii and diameters without committing or losing the center', () => {
    for (const diameter of [false, true]) {
      const notice = vi.fn(),
        { session, results, changes } = host('CIRCLE', outlineContext(), { onNotice: notice });
      session.acceptText('180,80');
      if (diameter) session.acceptText('D');
      for (const value of ['0', '-5']) {
        expect(session.acceptText(value).status).toBe('continue');
        expect(notice).toHaveBeenLastCalledWith({
          ko: `${diameter ? '지름' : '반지름'}은 0보다 큰 값이어야 합니다.`,
          en: `The ${diameter ? 'diameter' : 'radius'} must be greater than zero.`,
        });
        expect(results).toHaveLength(0);
        expect(changes).toHaveLength(0);
      }
      expect(notice).toHaveBeenCalledTimes(2);
      expect(session.acceptText('25').status).toBe('committed');
      expect(results).toHaveLength(1);
      expect(results[0]?.entities[0]).toMatchObject({
        type: 'circle',
        center: { x: 180, y: -80 },
        radius: diameter ? 12.5 : 25,
      });
      expect(changes[0]?.get('CIRCLERAD')).toBe(diameter ? 12.5 : 25);
    }
  });
  it.each([
    [0, 'keyboard', true],
    [1, 'keyboard', false],
    [2, 'keyboard', false],
    [2, 'script', true],
  ] as const)('honors OSNAPCOORD %s for %s coordinate input', (priority, source, snapped) => {
    const resolver = vi.fn(() => ({ point: { x: 25, y: -25 }, snapped: true }));
    const { session, results } = host('CIRCLE', outlineContext(), {
      coordinates: () => ({ osnapcoord: priority }),
      resolveTypedPoint: resolver,
    });
    session.acceptText('10,10', { source });
    session.acceptText('5');
    expect(results[0]?.entities[0]).toMatchObject({
      center: { x: snapped ? 25 : 10, y: snapped ? -25 : -10 },
    });
    expect(resolver).toHaveBeenCalledTimes(snapped ? 1 : 0);
  });
  it('honors explicit snap overrides and does not consume a rejected reference sample', () => {
    const consume = vi.fn(),
      resolver = vi.fn(() => undefined);
    const { session } = host('CIRCLE', outlineContext(), {
      onPointSampleAccepted: consume,
      resolveTypedPoint: resolver,
      coordinates: () => ({ osnapcoord: 1 }),
    });
    session.acceptText('END');
    expect(session.acceptText('10,10').status).toBe('error');
    expect(consume).not.toHaveBeenCalled();
    expect(session.getPointInput().snapOverride).toBe('endpoint');
    expect(resolver).toHaveBeenCalledWith({ x: 10, y: -10 }, 'endpoint');
  });
  it('projects angle locks on actual mouse acceptance and preserves modifier reference coordinates', () => {
    const context = outlineContext();
    context.settings.ortho = true;
    context.settings.gridSnap = true;
    context.settings.gridSize = 10;
    const { session, results } = host('PLINE', context);
    session.acceptText('0,0');
    session.acceptText('M2P');
    session.acceptPoint({ x: 11, y: -7 });
    session.acceptPoint({ x: 19, y: -13 });
    session.acceptText('<30');
    session.acceptPoint({ x: 30, y: -50 }, { snapped: true });
    session.acceptText('');
    const entity = results[0]?.entities[0];
    if (entity?.type !== 'polyline') throw new Error('Expected polyline');
    expect(entity.points[1]).toEqual({ x: 15, y: -10 });
    const a = entity.points[1]!,
      b = entity.points[2]!;
    expect(Math.atan2(a.y - b.y, b.x - a.x)).toBeCloseTo(Math.PI / 6, 10);
  });
  it('completes temporary tracking on Enter and supports direct distance after a locked angle', () => {
    const { session, results } = host('PLINE');
    for (const value of ['0,0', '<30', '10', '']) session.acceptText(value);
    const entity = results[0]?.entities[0];
    if (entity?.type !== 'polyline') throw new Error('Expected polyline');
    expect(entity.points[1]?.x).toBeCloseTo(Math.sqrt(75), 10);
    expect(entity.points[1]?.y).toBeCloseTo(-5, 10);
  });
  it('stages remembered sysvars, retains accepted entities on Escape, and never duplicates a completion', () => {
    const context = outlineContext({ PLINEWID: 0 });
    const { session, results, changes } = host('PLINE', context);
    for (const value of ['0,0', '10,0', 'W', '2', '4']) session.acceptText(value);
    expect(context.get('PLINEWID')).toBe(0);
    expect(results).toHaveLength(0);
    session.moveCursor({ x: 20, y: -10 });
    session.cancel();
    expect(results).toHaveLength(1);
    expect(results[0]?.entities).toHaveLength(1);
    expect(changes[0]?.get('PLINEWID')).toBe(4);
    session.acceptText('');
    session.cancel();
    expect(results).toHaveLength(1);
  });
  it('does not retry a failed completion callback or leave an active completed generator', () => {
    const complete = vi.fn(() => {
        throw new Error('Rejected persistence');
      }),
      notice = vi.fn();
    const { session } = host('CIRCLE', outlineContext(), {
      onComplete: complete,
      onNotice: notice,
    });
    session.acceptText('0,0');
    expect(session.acceptText('5').status).toBe('error');
    expect(session.getSnapshot().status).toBe('cancelled');
    session.cancel();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledTimes(1);
  });
  it('ignores compatibility outlines for continuation and retains exact curve tangents', () => {
    const first = host('CIRCLE');
    first.session.acceptText('0,0');
    first.session.acceptText('5');
    const extra = host('ELLIPSE');
    for (const value of ['0,0', '10,0', '3']) extra.session.acceptText(value);
    expect(
      lineContinuation([...first.results[0]!.entities, ...extra.results[0]!.entities]),
    ).toBeUndefined();
  });
  it('streams freehand pointer motion only during SKETCH and retains accepted samples', () => {
    const { session, results } = host('SKETCH', outlineContext({ SKETCHINC: 1 }));
    session.moveCursor({ x: 99, y: 99 });
    session.acceptPoint({ x: 0, y: 0 });
    session.moveCursor({ x: 2, y: 0 });
    session.moveCursor({ x: 4, y: -2 });
    session.cancel();
    expect(results[0]?.entities).toHaveLength(2);
  });
  it('MULTIPLE commits each POINT once and starts the next iteration until Escape', () => {
    const results: DrawResult[] = [];
    const session = new DrawSession('POINT', repeatDrawFactory(pointProgram), {
      context: outlineContext(),
      onComplete: (result) => results.push(result),
    });
    session.acceptText('1,2');
    session.acceptText('3,4');
    expect(results).toHaveLength(2);
    expect(results[0]?.entities[0]?.curve).toMatchObject({
      type: 'POINT',
      position: { x: 1, y: 2 },
    });
    expect(results[1]?.entities[0]?.curve).toMatchObject({
      type: 'POINT',
      position: { x: 3, y: 4 },
    });
    expect(session.getSnapshot().status).toBe('active');
    session.cancel();
    expect(results).toHaveLength(2);
  });
  it('locked angle fields preview their scalar construction without committing or mutating defaults', () => {
    const context = outlineContext({ CIRCLERAD: 2 });
    const { session, results } = host('ARC', context);
    for (const value of ['0,5', 'C', '0,0', 'A']) session.acceptText(value);
    expect(session.getSnapshot().scalarKind).toBe('angle');
    session.moveCursor({ x: 100, y: 100 }, { scalar: '90' });
    const curve = session.getSnapshot().preview[0]?.curve;
    expect(curve).toMatchObject({ type: 'ARC', startAngle: Math.PI / 2, sweepAngle: Math.PI / 2 });
    expect(results).toHaveLength(0);
    expect(context.get('CIRCLERAD')).toBe(2);
    session.acceptPoint({ x: 100, y: 100 }, { scalar: '90' });
    expect(results[0]?.entities[0]?.curve).toEqual(curve);
    const circle = host('CIRCLE', context);
    circle.session.acceptText('0,0');
    circle.session.moveCursor({ x: 30, y: 40 }, { scalar: '5' });
    expect(circle.session.getSnapshot().preview[0]).toMatchObject({ type: 'circle', radius: 5 });
    expect(context.get('CIRCLERAD')).toBe(2);
    expect(circle.results).toHaveLength(0);
  });
});
