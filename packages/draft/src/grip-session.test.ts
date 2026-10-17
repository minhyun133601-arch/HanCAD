import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadLine, CadPolyline } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { draftLine, draftPolyline } from './entities';
import { defaultGripProvider } from './grip-providers';
import { GripSession } from './grip-session';
import type { GripSessionOptions } from './grip-types';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture(options: GripSessionOptions = {}) {
  const state = createEmptyCadState();
  state.entities = [draftLine(state.settings, { x: 10, y: -10 }, { x: 110, y: -10 }, 'line')];
  const grips = defaultGripProvider.grips(state.entities[0]!, true);
  const session = new GripSession(state, ['line'], [grips[0]!], grips[0]!, options);
  return { state, grips, session, result: () => session.getResult().entities[0] as CadLine };
}
describe('grip command coroutine', () => {
  it('cycles Stretch → Move → Rotate → Scale → Mirror and three blanks scale by 2 about the picked grip', () => {
    const { session, result, state } = fixture();
    expect(session.getSnapshot().mode).toBe('STRETCH');
    for (const mode of ['MOVE', 'ROTATE', 'SCALE'] as const) {
      session.acceptText('');
      expect(session.getSnapshot().mode).toBe(mode);
    }
    session.moveCursor({ x: 15, y: -40 });
    expect(session.acceptText('2')).toMatchObject({ finish: true, accepted: true });
    expect(result()).toMatchObject({ a: { x: 10, y: -10 }, b: { x: 210, y: -10 } });
    expect(state.entities[0]).toMatchObject({ b: { x: 110, y: -10 } });
    session.cycle();
    expect(session.getSnapshot().mode).toBe('MIRROR');
    session.cycle();
    expect(session.getSnapshot().mode).toBe('STRETCH');
  });
  it('stretches one endpoint, moves a whole selection and rotates/mirrors around the picked grip', () => {
    const stretch = fixture();
    stretch.session.acceptPoint({ x: 30, y: -40 });
    expect(stretch.result()).toMatchObject({ a: { x: 30, y: -40 }, b: { x: 110, y: -10 } });
    const move = fixture();
    move.session.setMode('MOVE');
    move.session.acceptPoint({ x: 50, y: -60 });
    expect(move.result()).toMatchObject({ a: { x: 50, y: -60 }, b: { x: 150, y: -60 } });
    const rotate = fixture();
    rotate.session.setMode('ROTATE');
    rotate.session.acceptText('90');
    expect(rotate.result().b.x).toBeCloseTo(10, 12);
    expect(rotate.result().b.y).toBeCloseTo(-110, 12);
    const mirror = fixture();
    mirror.session.setMode('MIRROR');
    mirror.session.acceptPoint({ x: 20, y: 0 });
    expect(mirror.result().b.x).toBeCloseTo(10, 12);
    expect(mirror.result().b.y).toBeCloseTo(90, 12);
  });
  it('uses a changed base point, keeps repeated copies provisional and locally undoes only the last copy', () => {
    const { session, state } = fixture();
    session.setMode('MOVE');
    session.acceptText('B');
    expect(session.getSnapshot().prompt).toContain('기준점');
    session.acceptText('0,0');
    session.acceptText('C');
    session.acceptText('100,100');
    session.acceptText('200,100');
    expect(session.getSnapshot().preview).toHaveLength(2);
    expect(state.entities).toHaveLength(1);
    session.acceptText('U');
    expect(session.getSnapshot().preview).toHaveLength(1);
    expect(session.acceptText('X')).toEqual({ finish: true });
    const copies = session.getResult().entities;
    expect(copies).toHaveLength(2);
    expect(copies[0]).toEqual(state.entities[0]);
    expect(copies[1]).toMatchObject({ a: { x: 110, y: -110 }, b: { x: 210, y: -110 } });
    expect(new Set(copies.map((entity) => entity.id)).size).toBe(2);
  });
  it('scales by a numeric reference or two reference points and rejects a zero reference', () => {
    const scalar = fixture();
    scalar.session.setMode('SCALE');
    scalar.session.acceptText('R');
    expect(scalar.session.acceptText('0').error).toBe(true);
    scalar.session.acceptText('100');
    scalar.session.acceptText('50');
    expect(scalar.result().b).toEqual({ x: 60, y: -10 });
    const points = fixture();
    points.session.setMode('SCALE');
    points.session.acceptText('R');
    points.session.acceptText('@');
    points.session.acceptText('110,10');
    points.session.acceptText('200');
    expect(points.result().b).toEqual({ x: 210, y: -10 });
  });
  it('rotates from numeric and point reference angles instead of adding the final absolute angle', () => {
    const numeric = fixture();
    numeric.session.setMode('ROTATE');
    numeric.session.acceptText('R');
    numeric.session.acceptText('90');
    numeric.session.acceptText('0');
    expect(numeric.result().b.y).toBeCloseTo(90, 12);
    const points = fixture();
    points.session.setMode('ROTATE');
    points.session.acceptText('R');
    points.session.acceptPoint({ x: 0, y: 0 });
    points.session.acceptPoint({ x: 10, y: -10 });
    points.session.acceptText('0');
    expect(points.result().b.x).toBeCloseTo(10 + 100 / Math.sqrt(2), 10);
    expect(points.result().b.y).toBeCloseTo(-10 + 100 / Math.sqrt(2), 10);
  });
  it('stretches several hot grips in multiple entities without changing cold endpoints', () => {
    const { state, grips } = fixture();
    state.entities.push(draftLine(state.settings, { x: 10, y: -40 }, { x: 110, y: -40 }, 'other'));
    const other = defaultGripProvider.grips(state.entities[1]!, true)[1]!;
    const session = new GripSession(state, ['line', 'other'], [grips[0]!, other], grips[0]!);
    session.acceptPoint({ x: 20, y: -20 });
    expect(session.getResult().entities).toMatchObject([
      { a: { x: 20, y: -20 }, b: { x: 110, y: -10 } },
      { a: { x: 10, y: -40 }, b: { x: 120, y: -50 } },
    ]);
  });
  it('shares point filters, FROM, M2P, direct distance and exact typed osnap resolution', () => {
    const resolve = vi.fn((point) => ({ x: point.x + 0.25, y: point.y - 0.125 }));
    const override = vi.fn();
    const onAcceptedPoint = vi.fn();
    const { session, result } = fixture({
      resolveTypedPoint: resolve,
      onSnapOverride: override,
      onAcceptedPoint,
    });
    session.acceptText('END');
    expect(override).toHaveBeenCalledWith('endpoint');
    session.acceptText('20,30');
    expect(result().a).toEqual({ x: 20.25, y: -30.125 });
    expect(onAcceptedPoint).toHaveBeenCalledWith({ x: 20.25, y: -30.125 });
    const from = fixture();
    from.session.acceptText('FROM');
    from.session.acceptText('0,0');
    from.session.acceptText('@25,50');
    expect(from.result().a).toEqual({ x: 25, y: -50 });
    const midpoint = fixture();
    midpoint.session.acceptText('M2P');
    midpoint.session.acceptText('0,0');
    midpoint.session.acceptText('40,60');
    expect(midpoint.result().a).toEqual({ x: 20, y: -30 });
    const direct = fixture();
    direct.session.moveCursor({ x: 110, y: -10 });
    direct.session.acceptText('20');
    expect(direct.result().a).toEqual({ x: 30, y: -10 });
    const filter = fixture();
    filter.session.acceptText('.X');
    filter.session.acceptText('20,999');
    filter.session.acceptText('0,30');
    expect(filter.result().a).toEqual({ x: 20, y: -30, z: 0 });
  });
  it('uses multifunction add/remove/arc/line actions and keeps failed arc input active', () => {
    const state = createEmptyCadState();
    const entity = draftPolyline(
      state.settings,
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      false,
      false,
      'pline',
    ) as CadPolyline;
    state.entities = [entity];
    let grip = defaultGripProvider.grips(entity, true)[0]!;
    let session = new GripSession(state, ['pline'], [grip], grip);
    session.setAction('addVertex');
    session.acceptPoint({ x: 50, y: -20 });
    const added = session.getResult().entities[0] as CadPolyline;
    expect(added.points).toHaveLength(4);
    expect(added.points[1]).toEqual({ x: 50, y: -20 });
    state.entities = [added];
    grip = defaultGripProvider.grips(added, true)[1]!;
    session = new GripSession(state, ['pline'], [grip], grip);
    expect(session.setAction('removeVertex')).toMatchObject({ finish: true });
    expect((session.getResult().entities[0] as CadPolyline).points).toEqual(entity.points);
    state.entities = [entity];
    grip = defaultGripProvider.grips(entity, true)[0]!;
    session = new GripSession(state, ['pline'], [grip], grip);
    session.setAction('convertArc');
    expect(session.acceptPoint({ x: 50, y: 0 })).toMatchObject({ error: true });
    session.acceptPoint({ x: 50, y: -50 });
    const curved = session.getResult().entities[0] as CadPolyline;
    expect(curved.bulges?.[0]).toBeCloseTo(1, 12);
    state.entities = [curved];
    grip = defaultGripProvider.grips(curved, true)[0]!;
    session = new GripSession(state, ['pline'], [grip], grip);
    expect(session.setAction('convertLine')).toMatchObject({ finish: true });
    expect((session.getResult().entities[0] as CadPolyline).bulges?.[0]).toBe(0);
  });
  it('cycles multifunction line lengthen and interprets typed length from the fixed endpoint', () => {
    const { session, result } = fixture();
    session.cycleAction();
    expect(session.acceptText('200')).toMatchObject({ finish: true });
    expect(result()).toMatchObject({ a: { x: -90, y: -10 }, b: { x: 110, y: -10 } });
  });
  it('honors interactive/script OSNAPCOORD priorities and one-point menu overrides', () => {
    const resolve = vi.fn(() => ({ x: 80, y: -40 }));
    const literal = fixture({ coordinates: () => ({ osnapcoord: 1 }), resolveTypedPoint: resolve });
    literal.session.acceptText('20,30');
    expect(literal.result().a).toEqual({ x: 20, y: -30 });
    expect(resolve).not.toHaveBeenCalled();
    const running = fixture({ coordinates: () => ({ osnapcoord: 0 }), resolveTypedPoint: resolve });
    running.session.acceptText('20,30');
    expect(running.result().a).toEqual({ x: 80, y: -40 });
    const script = fixture({ coordinates: () => ({ osnapcoord: 2 }), resolveTypedPoint: resolve });
    script.session.acceptText('20,30', 'script');
    expect(script.result().a).toEqual({ x: 80, y: -40 });
    const menu = fixture({ getSnapOverride: () => 'endpoint', resolveTypedPoint: resolve });
    menu.session.acceptText('20,30');
    expect(menu.result().a).toEqual({ x: 80, y: -40 });
  });
  it('completes TK with Enter, displays subsidiary modifier prompts and does not consume scale coordinate filters as factors', () => {
    const track = fixture();
    track.session.acceptText('TK');
    expect(track.session.getSnapshot().prompt).toBe('첫 번째 추적점:');
    track.session.acceptText('20,20');
    expect(track.session.getSnapshot().prompt).toContain('추적을 끝내려면 Enter');
    expect(track.session.acceptText('')).toMatchObject({ finish: true });
    expect(track.result().a).toEqual({ x: 20, y: -20 });
    const filter = fixture();
    filter.session.setMode('SCALE');
    filter.session.acceptText('.X');
    expect(filter.session.getSnapshot().inputMode).toBe('point');
    filter.session.acceptText('20');
    expect(filter.session.getSnapshot().changed).toBe(false);
    filter.session.acceptText('30');
    expect(filter.result().b.x).toBeCloseTo(10 + 100 * Math.sqrt(500), 9);
  });
  it('projects angle-locked mouse previews and final picks identically and suppresses source-point previews', () => {
    const locked = fixture();
    locked.session.acceptText('<30');
    locked.session.moveCursor({ x: 110, y: -10 });
    const preview = locked.session.getSnapshot().preview[0] as CadLine;
    expect(preview.a.x).toBeCloseTo(85, 10);
    expect(preview.a.y).toBeCloseTo(-10 - 25 * Math.sqrt(3), 10);
    locked.session.acceptPoint({ x: 110, y: -10 });
    expect(locked.result().a).toEqual(preview.a);
    const from = fixture();
    from.session.acceptText('FROM');
    from.session.moveCursor({ x: 40, y: 40 });
    expect(from.session.getSnapshot().preview).toEqual([]);
  });
});
