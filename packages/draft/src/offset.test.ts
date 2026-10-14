import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAD_ENTITY_LIMIT, createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadArc, CadEntity, CadLine, CadPolyline } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { draftCircle, draftLine, draftPolyline } from './entities';
import { offsetCadEntity } from './offset-geometry';
import { OffsetSession } from './offset-session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const state = createEmptyCadState();
  state.entities = [
    draftLine(state.settings, { x: 0, y: 0 }, { x: 100, y: 0 }, 'line'),
    draftCircle(state.settings, { x: 40, y: 40 }, 20, 'circle'),
  ];
  return state;
}
function offset(entity: CadEntity, x: number, y: number, distance: number, gapType = 0) {
  return offsetCadEntity(entity, { point: { x, y }, distance, gapType, id: 'result' });
}

describe('exact OFFSET geometry', () => {
  it('creates parallel lines on either picked side and exact Through offsets without modifying sources', () => {
    const source = fixture().entities[0]!;
    const original = structuredClone(source);
    expect(offset(source, 20, 5, 8)).toMatchObject({
      entity: { a: { x: 0, y: 8 }, b: { x: 100, y: 8 } },
    });
    expect(offset(source, 20, -5, 8)).toMatchObject({ entity: { a: { x: 0, y: -8 } } });
    expect(offset(source, 20, -12, -1)).toMatchObject({ entity: { a: { x: 0, y: -12 } } });
    expect(offset(source, 20, 0, 8)).toEqual({ error: 'ambiguousSide' });
    expect(source).toEqual(original);
  });
  it('preserves arc angles and styles while changing concentric radii, rejecting collapsed circles', () => {
    const circle = fixture().entities[1]!;
    expect(offset(circle, 100, 40, 5)).toMatchObject({
      entity: { radius: 25, layer: circle.layer },
    });
    expect(offset(circle, 40, 40, 5)).toMatchObject({ entity: { radius: 15 } });
    expect(offset(circle, 40, 40, 25)).toEqual({ error: 'collapsedOffset' });
    expect(offset(circle, 40, 47, -1)).toMatchObject({ entity: { radius: 7 } });
    expect(offset(circle, 40, 40, -1)).toEqual({ error: 'collapsedOffset' });
    const arc: CadArc = {
      ...circle,
      type: 'arc',
      center: { x: 40, y: 40 },
      radius: 20,
      startAngle: 0.2,
      endAngle: 2.1,
      clockwise: true,
    };
    expect(offset(arc, 80, 40, 5)).toMatchObject({ entity: { ...arc, id: 'result', radius: 25 } });
  });
  it('builds exact closed convex miters and refuses inward offsets requiring topology changes', () => {
    const source = draftPolyline(
      fixture().settings,
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 },
      ],
      true,
      true,
    );
    expect(offset(source, 50, -10, 10)).toMatchObject({
      entity: {
        points: [
          { x: -10, y: -10 },
          { x: 110, y: -10 },
          { x: 110, y: 70 },
          { x: -10, y: 70 },
        ],
      },
    });
    expect(offset(source, 50, 10, 10)).toMatchObject({
      entity: {
        points: [
          { x: 10, y: 10 },
          { x: 90, y: 10 },
          { x: 90, y: 50 },
          { x: 10, y: 50 },
        ],
      },
    });
    expect(offset(source, 50, 10, 31)).toEqual({ error: 'collapsedOffset' });
    expect(offset(source, 50, -10, 1, 1)).toEqual({ error: 'unsupportedGapType' });
    expect(offset(source, 50, -10, 1, 2)).toEqual({ error: 'unsupportedGapType' });
    const reversed = { ...source, points: [...(source as CadPolyline).points].reverse() };
    expect(offset(reversed, 50, -10, 10)).toMatchObject({
      entity: {
        points: [
          { x: -10, y: 70 },
          { x: 110, y: 70 },
          { x: 110, y: -10 },
          { x: -10, y: -10 },
        ],
      },
    });
  });
  it('offsets open straight polylines and rejects self-crossing, concave or folded output', () => {
    const source = draftPolyline(fixture().settings, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(offset(source, 5, 1, 2)).toMatchObject({
      entity: {
        points: [
          { x: 0, y: 2 },
          { x: 8, y: 2 },
          { x: 8, y: 10 },
        ],
      },
    });
    expect(offset(source, 5, 1, 11)).toEqual({ error: 'collapsedOffset' });
    const crossed = draftPolyline(fixture().settings, [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ]);
    expect(offset(crossed, 5, 6, 2)).toEqual({ error: 'unsupportedPolyline' });
    const concave = draftPolyline(
      fixture().settings,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      true,
    );
    expect(offset(concave, 5, -1, 2)).toEqual({ error: 'unsupportedPolyline' });
    expect(offset(source, 4, 2, -1)).toMatchObject({
      entity: {
        points: [
          { x: 0, y: 2 },
          { x: 8, y: 2 },
          { x: 8, y: 10 },
        ],
      },
    });
  });
  it('retains large survey coordinates and rejects invalid numeric or unsupported entities explicitly', () => {
    const source = fixture().entities[0] as CadLine;
    const far = { ...source, a: { x: 400000000, y: 200000000 }, b: { x: 400000100, y: 200000000 } };
    expect(offset(far, 400000050, 200000010, 0.25)).toMatchObject({
      entity: {
        a: { x: 400000000, y: 200000000.25 },
        b: { x: 400000100, y: 200000000.25 },
      },
    });
    expect(offset(source, 5, 1, 0)).toEqual({ error: 'positiveDistance' });
    expect(offset(source, 5, Number.NaN, 1)).toEqual({ error: 'point' });
    expect(offset({ ...source, b: source.a }, 5, 1, 1)).toEqual({ error: 'invalidGeometry' });
    const text: CadEntity = {
      ...source,
      type: 'text',
      point: source.a,
      text: 'A',
      textSize: 2.5,
      rotation: 0,
    };
    expect(offset(text, 5, 1, 1)).toEqual({ error: 'unsupportedEntity' });
  });
});

describe('OFFSET shadow command session', () => {
  it('uses remembered distance, previews without mutation, repeats selection and retains accepted work on Escape', () => {
    const state = fixture();
    const original = structuredClone(state);
    const remember = vi.fn();
    const session = new OffsetSession(state, {
      distance: 10,
      gapType: 0,
      onDistanceChange: remember,
    });
    session.acceptText('');
    expect(session.getSnapshot().prompt).toBe('offsetSelect');
    session.acceptPick({ x: 40, y: 0 }, state.entities[0]);
    session.moveCursor({ x: 40, y: -10 });
    expect(session.getSnapshot().preview[0]).toMatchObject({ a: { x: 0, y: -10 } });
    expect(session.getSnapshot().changed).toBe(false);
    session.acceptPick({ x: 40, y: -10 });
    expect(session.getSnapshot()).toMatchObject({ prompt: 'offsetSelect', changed: true });
    session.acceptPick({ x: 40, y: 40 }, state.entities[1]);
    session.moveCursor({ x: 40, y: 80 });
    expect(session.cancel()).toEqual({ finish: true });
    expect(session.getSnapshot()).toMatchObject({ status: 'cancelled', preview: [] });
    expect(session.getSnapshot().state.entities).toHaveLength(3);
    expect(remember).toHaveBeenCalledWith(10);
    expect(state).toEqual(original);
    expect(session.acceptText('5')).toEqual({ error: 'closedSession' });
  });
  it('takes two snapped points or numeric distance and implements Through as negative OFFSETDIST', () => {
    const state = fixture();
    const remember = vi.fn();
    const session = new OffsetSession(state, {
      distance: -1,
      gapType: 0,
      onDistanceChange: remember,
    });
    session.acceptPick({ x: 4, y: -6 });
    session.moveCursor({ x: 7, y: -10 });
    expect(session.getSnapshot().preview).toHaveLength(1);
    session.acceptText('@3,4');
    expect(session.getSnapshot().distance).toBe(5);
    expect(remember).toHaveBeenLastCalledWith(5);
    const through = new OffsetSession(state, {
      distance: 5,
      gapType: 0,
      onDistanceChange: remember,
    });
    through.acceptText('_Through');
    through.acceptPick({ x: 20, y: 0 }, state.entities[0]);
    expect(through.getSnapshot().prompt).toBe('offsetThrough');
    through.acceptText('30,17');
    expect(through.getSnapshot().state.entities[2]).toMatchObject({ a: { x: 0, y: -17 } });
    expect(remember).toHaveBeenLastCalledWith(-1);
  });
  it('supports Source/Current layers and Erase with command-local Undo restoring source identities', () => {
    const state = fixture();
    state.settings.layer = 'Current';
    const session = new OffsetSession(state, { distance: 5, gapType: 0 });
    session.acceptText('Layer');
    session.acceptText('Current');
    session.acceptText('Erase');
    session.acceptText('Yes');
    session.acceptText('5');
    session.acceptPick({ x: 10, y: 0 }, state.entities[0]);
    session.acceptText('10,10');
    expect(session.getSnapshot().state.entities).toHaveLength(2);
    expect(session.getSnapshot().state.entities[1]).toMatchObject({
      layer: 'Current',
      a: { x: 0, y: -5 },
    });
    expect(session.acceptText('Undo')).toEqual({});
    expect(session.getSnapshot().state.entities).toEqual(state.entities);
    expect(session.getSnapshot().changed).toBe(false);
    expect(session.acceptText('Undo')).toEqual({ error: 'nothingToUndo' });
    expect(session.acceptText('Exit')).toEqual({ finish: true });
  });
  it('repeats Multiple from each newest offset, handles next object Enter and reverses each accepted placement', () => {
    const state = fixture();
    const session = new OffsetSession(state, { distance: 5, gapType: 0 });
    session.acceptText('');
    session.acceptPick({ x: 10, y: 0 }, state.entities[0]);
    session.acceptText('Multiple');
    session.acceptPick({ x: 10, y: -100 });
    session.acceptPick({ x: 10, y: -100 });
    expect(session.getSnapshot().state.entities.slice(2)).toMatchObject([
      { a: { x: 0, y: -5 } },
      { a: { x: 0, y: -10 } },
    ]);
    session.acceptText('U');
    expect(session.getSnapshot().state.entities).toHaveLength(3);
    session.acceptPick({ x: 10, y: -100 });
    expect(session.getSnapshot().state.entities[3]).toMatchObject({ a: { x: 0, y: -10 } });
    session.acceptText('');
    expect(session.getSnapshot().prompt).toBe('offsetSelect');
    session.acceptText('');
    expect(session.getSnapshot().status).toBe('finished');
    expect(new Set(session.getSnapshot().state.entities.map((e) => e.id)).size).toBe(4);
  });
  it('rejects empty, locked, unsupported and invalid input while leaving the command recoverable', () => {
    const state = fixture();
    const session = new OffsetSession(state, { distance: -1, gapType: 0 });
    expect(session.acceptText('0')).toEqual({ error: 'positiveDistance' });
    expect(session.acceptText('-5')).toEqual({ error: 'positiveDistance' });
    session.acceptText('E');
    expect(session.acceptText('maybe')).toEqual({ error: 'invalidOption' });
    session.acceptText('No');
    session.acceptText('10');
    expect(session.acceptPick({ x: 0, y: 0 })).toEqual({ error: 'selectOffsetObject' });
    state.layers[0]!.locked = true;
    expect(session.acceptPick({ x: 0, y: 0 }, state.entities[0])).toEqual({
      error: 'lockedEntity',
    });
    state.layers[0]!.locked = false;
    session.acceptPick({ x: 0, y: 0 }, state.entities[0]);
    expect(session.acceptText('0,0')).toEqual({ error: 'ambiguousSide' });
    expect(session.getSnapshot().changed).toBe(false);
    session.acceptText('0,10');
    expect(session.getSnapshot().changed).toBe(true);
  });
  it('rejects entity capacity overflow before accepting an offset', () => {
    const state = fixture();
    const source = state.entities[0]!;
    state.entities = Array.from({ length: CAD_ENTITY_LIMIT }, () => source);
    const session = new OffsetSession(state, { distance: 5, gapType: 0 });
    session.acceptText('');
    session.acceptPick({ x: 10, y: 0 }, source);
    expect(session.acceptPick({ x: 10, y: -10 })).toEqual({ error: 'entityLimit' });
    expect(session.getSnapshot().changed).toBe(false);
    expect(session.getSnapshot().state.entities).toHaveLength(CAD_ENTITY_LIMIT);
  });
});
