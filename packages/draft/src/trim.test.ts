import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAD_ENTITY_LIMIT, createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadEntity, CadLine, LegacyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { draftCircle, draftLine, draftPolyline } from './entities';
import { trimExtendLine } from './trim-geometry';
import { TrimExtendSession } from './trim-session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

function line(
  state: LegacyCadState,
  id: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): CadLine {
  return draftLine(state.settings, { x: ax, y: ay }, { x: bx, y: by }, id) as CadLine;
}
function fixture() {
  const state = createEmptyCadState();
  state.entities = [
    line(state, 'target', 0, 0, 100, 0),
    line(state, 'left', 20, -10, 20, 10),
    line(state, 'right', 70, -10, 70, 10),
  ];
  return state;
}
function target(session: TrimExtendSession, id = 'target') {
  return session.getSnapshot().state.entities.find((e) => e.id === id);
}

describe('TRIM/EXTEND accepted edits and geometry', () => {
  it('removes the picked interval between multiple cuts, preserves identity/style and commits once', () => {
    const state = fixture(),
      before = structuredClone(state);
    const session = new TrimExtendSession('TRIM', state);
    session.moveCursor({ x: 40, y: 0 }, state.entities[0]);
    expect(session.getSnapshot().preview).toHaveLength(2);
    expect(session.getSnapshot().previewHiddenIds).toEqual(['target']);
    expect(state).toEqual(before);
    expect(session.acceptPick({ x: 40, y: 0 }, state.entities[0])).toEqual({ changed: true });
    const shadow = session.getSnapshot().state;
    expect(session.getSnapshot().previewHiddenIds).toEqual([]);
    expect(shadow.entities).toHaveLength(4);
    expect(shadow.entities[0]).toMatchObject({
      id: 'target',
      a: { x: 0, y: 0 },
      b: { x: 20, y: 0 },
      color: state.settings.color,
      layer: state.settings.layer,
      lineWidth: state.settings.lineWidth,
    });
    expect(shadow.entities[1]).toMatchObject({ a: { x: 70, y: 0 }, b: { x: 100, y: 0 } });
    expect(new Set(shadow.entities.map((e) => e.id)).size).toBe(4);
    expect(session.acceptText('')).toEqual({ finish: true });
    expect(session.finish()).toBe(shadow);
    expect(session.finish()).toBeUndefined();
    expect(session.acceptPick({ x: 1, y: 0 }, shadow.entities[0])).toEqual({ error: 'closed' });
    expect(state).toEqual(before);
  });

  it('selects finite Standard boundaries, supports all-boundary Enter and rejects uncut targets', () => {
    const state = fixture();
    const session = new TrimExtendSession('TRIM', state, { mode: 0 });
    expect(session.getSnapshot()).toMatchObject({ prompt: 'trimBoundary', inputMode: 'entity' });
    session.acceptPick({ x: 20, y: 3 }, state.entities[1]);
    expect(session.getSnapshot().boundaryIds).toEqual(['left']);
    session.acceptText('');
    session.acceptPick({ x: 40, y: 0 }, state.entities[0]);
    expect(target(session)).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 20, y: 0 } });
    session.acceptText('U');
    expect(target(session)).toEqual(state.entities[0]);
    expect(session.finish()).toBeUndefined();
    const all = new TrimExtendSession('TRIM', state, { mode: 0 });
    all.acceptText('');
    all.acceptPick({ x: 40, y: 0 }, state.entities[0]);
    expect(all.getSnapshot().state.entities).toHaveLength(4);
    const lone = new TrimExtendSession(
      'TRIM',
      { ...state, entities: [state.entities[0]!] },
      { mode: 0 },
    );
    lone.acceptText('');
    expect(lone.acceptPick({ x: 50, y: 0 }, state.entities[0])).toEqual({
      error: 'noIntersection',
    });
    expect(lone.finish()).toBeUndefined();
  });

  it('Quick mode deletes an uncut LINE, while Escape retains accepted edits and drops previews', () => {
    const state = fixture();
    state.entities = [state.entities[0]!];
    const session = new TrimExtendSession('TRIM', state);
    session.moveCursor({ x: 50, y: 0 }, state.entities[0]);
    expect(session.getSnapshot().previewHiddenIds).toEqual(['target']);
    session.acceptPick({ x: 50, y: 0 }, state.entities[0]);
    expect(session.getSnapshot().state.entities).toHaveLength(0);
    const accepted = session.cancel();
    expect(accepted?.entities).toEqual([]);
    expect(session.getSnapshot().preview).toEqual([]);
    expect(state.entities).toHaveLength(1);
  });

  it('extends the picked endpoint to the closest forward boundary and Shift swaps tools', () => {
    const state = fixture();
    state.entities[0] = line(state, 'target', 30, 0, 50, 0);
    const session = new TrimExtendSession('EXTEND', state);
    session.moveCursor({ x: 49, y: 0 }, state.entities[0]);
    expect(session.getSnapshot().preview[0]).toMatchObject({
      a: { x: 30, y: 0 },
      b: { x: 70, y: 0 },
    });
    session.acceptPick({ x: 49, y: 0 }, state.entities[0]);
    session.acceptPick({ x: 31, y: 0 }, state.entities[0]);
    expect(target(session)).toMatchObject({ a: { x: 20, y: 0 }, b: { x: 70, y: 0 } });
    session.acceptText('U');
    expect(target(session)).toMatchObject({ a: { x: 30, y: 0 }, b: { x: 70, y: 0 } });
    const trim = new TrimExtendSession('TRIM', state);
    trim.acceptPick({ x: 49, y: 0 }, state.entities[0], true);
    expect(target(trim)).toMatchObject({ b: { x: 70, y: 0 } });
    const swapped = new TrimExtendSession('EXTEND', fixture());
    swapped.acceptPick({ x: 40, y: 0 }, target(swapped), true);
    expect(swapped.getSnapshot().state.entities).toHaveLength(4);
  });

  it('handles circle/arc/closed-polyline boundaries without extending finite arcs accidentally', () => {
    const state = fixture(),
      original = state.entities[0] as CadLine;
    const circle = draftCircle(state.settings, { x: 50, y: 0 }, 20, 'circle');
    expect(trimExtendLine(original, { x: 50, y: 0 }, [circle], 'TRIM')).toMatchObject([
      { a: { x: 0, y: 0 }, b: { x: 30, y: 0 } },
      { a: { x: 70, y: 0 }, b: { x: 100, y: 0 } },
    ]);
    const arc: CadEntity = {
      ...original,
      id: 'arc',
      type: 'arc',
      center: { x: 50, y: 0 },
      radius: 20,
      startAngle: -Math.PI / 4,
      endAngle: Math.PI / 4,
      clockwise: true,
    };
    expect(trimExtendLine(original, { x: 20, y: 0 }, [arc], 'TRIM')).toMatchObject([
      { a: { x: 70, y: 0 }, b: { x: 100, y: 0 } },
    ]);
    const polygon = draftPolyline(
      state.settings,
      [
        { x: 30, y: -10 },
        { x: 70, y: -10 },
        { x: 70, y: 10 },
        { x: 30, y: 10 },
      ],
      true,
      false,
      'poly',
    );
    expect(trimExtendLine(original, { x: 50, y: 0 }, [polygon], 'TRIM')).toMatchObject([
      { b: { x: 30, y: 0 } },
      { a: { x: 70, y: 0 } },
    ]);
  });

  it('uses EDGEMODE imaginary line boundaries and remembers mode and edge options', () => {
    const state = fixture();
    state.entities = [line(state, 'target', 0, 0, 100, 0), line(state, 'edge', 60, 10, 60, 20)];
    const session = new TrimExtendSession('TRIM', state, { mode: 0 });
    session.acceptText('');
    expect(session.acceptPick({ x: 90, y: 0 }, state.entities[0])).toEqual({
      error: 'noIntersection',
    });
    session.acceptText('E');
    expect(session.getSnapshot()).toMatchObject({ prompt: 'trimEdge', inputMode: 'keyword' });
    expect(session.acceptText('EXTEND')).toEqual({ edgeMode: 1 });
    session.acceptPick({ x: 90, y: 0 }, state.entities[0]);
    expect(target(session)).toMatchObject({ b: { x: 60, y: 0 } });
    session.acceptText('O');
    expect(session.acceptText('QUICK')).toEqual({ mode: 1 });
    expect(session.getSnapshot()).toMatchObject({ prompt: 'trimTarget', mode: 1, edgeMode: 1 });
    session.acceptText('O');
    expect(session.acceptText('STANDARD')).toEqual({ mode: 0 });
    expect(session.getSnapshot().prompt).toBe('trimBoundary');
    expect(session.acceptText('garbage')).toEqual({ error: 'input' });
  });

  it('uses visible locked boundaries, protects locked/hidden targets and reports unsupported targets', () => {
    const state = fixture();
    state.layers.push(
      { name: 'locked', visible: true, locked: true, color: '#ffffff' },
      { name: 'hidden', visible: false, locked: false, color: '#ffffff' },
    );
    state.entities[1] = { ...state.entities[1]!, layer: 'locked' };
    state.entities[2] = { ...state.entities[2]!, layer: 'hidden' };
    const circle = draftCircle(state.settings, { x: 200, y: 0 }, 10, 'circle');
    state.entities.push(circle);
    const session = new TrimExtendSession('TRIM', state);
    expect(session.acceptPick({ x: 20, y: 0 }, state.entities[1])).toEqual({ error: 'locked' });
    expect(session.acceptPick({ x: 70, y: 0 }, state.entities[2])).toEqual({ error: 'locked' });
    expect(session.acceptPick({ x: 210, y: 0 }, circle)).toEqual({ error: 'unsupported' });
    session.acceptPick({ x: 50, y: 0 }, state.entities[0]);
    expect(target(session)).toMatchObject({ b: { x: 20, y: 0 } });
    const standard = new TrimExtendSession('TRIM', state, { mode: 0 });
    standard.acceptPick({ x: 20, y: 0 }, state.entities[1]);
    expect(standard.getSnapshot().boundaryIds).toEqual(['left']);
  });

  it('trims all crossed fence targets and undoes the complete fence together', () => {
    const state = fixture();
    state.entities.push(line(state, 'target2', 0, 5, 100, 5));
    const session = new TrimExtendSession('TRIM', state);
    expect(
      session.acceptFence([
        { x: 40, y: -5 },
        { x: 40, y: 9 },
      ]),
    ).toEqual({ changed: true });
    expect(session.getSnapshot().state.entities).toHaveLength(6);
    expect(target(session, 'target2')).toMatchObject({ b: { x: 20, y: 5 } });
    session.acceptText('U');
    expect(session.getSnapshot().state.entities).toEqual(state.entities);
    expect(session.getSnapshot().changed).toBe(false);
    expect(
      session.acceptFence([
        { x: NaN, y: 0 },
        { x: 40, y: 9 },
      ]),
    ).toEqual({ error: 'input' });
  });

  it('keeps parallel, duplicate, tangent and survey-coordinate intersections finite', () => {
    const state = fixture();
    const far = line(state, 'far', 1e8, -2e8, 1e8 + 100, -2e8);
    const cut = line(state, 'cut', 1e8 + 40, -2e8 - 10, 1e8 + 40, -2e8 + 10);
    const parallel = line(state, 'parallel', 1e8, -2e8 + 5, 1e8 + 100, -2e8 + 5);
    expect(
      trimExtendLine(far, { x: 1e8 + 80, y: -2e8 }, [cut, cut, parallel], 'TRIM'),
    ).toMatchObject([{ b: { x: 1e8 + 40, y: -2e8 } }]);
    const tangent = draftCircle(state.settings, { x: 50, y: 20 }, 20, 'tangent');
    expect(
      trimExtendLine(state.entities[0] as CadLine, { x: 80, y: 0 }, [tangent], 'TRIM'),
    ).toMatchObject([{ b: { x: 50, y: 0 } }]);
    expect(trimExtendLine(far, { x: 1e8, y: -2e8 }, [parallel], 'EXTEND')).toBeUndefined();
  });

  it('rejects a split beyond drawing capacity before modifying accepted state or history', () => {
    const state = fixture();
    const [original, left, right] = state.entities;
    const filler = draftCircle(state.settings, { x: 1000, y: 1000 }, 1, 'filler');
    state.entities = Array<CadEntity>(CAD_ENTITY_LIMIT).fill(filler);
    state.entities[0] = original!;
    state.entities[1] = left!;
    state.entities[2] = right!;
    const session = new TrimExtendSession('TRIM', state, { mode: 0 });
    session.acceptPick({ x: 20, y: 0 }, left);
    session.acceptPick({ x: 70, y: 0 }, right);
    session.acceptText('');
    const before = session.getSnapshot().state;
    session.moveCursor({ x: 40, y: 0 }, original);
    expect(session.getSnapshot().preview).toEqual([]);
    expect(session.getSnapshot().previewHiddenIds).toEqual([]);
    expect(session.acceptPick({ x: 40, y: 0 }, original)).toEqual({ error: 'entityLimit' });
    expect(
      session.acceptFence([
        { x: 40, y: -5 },
        { x: 40, y: 5 },
      ]),
    ).toEqual({ error: 'entityLimit' });
    expect(session.getSnapshot().state).toBe(before);
    expect(session.getSnapshot().state.entities).toHaveLength(CAD_ENTITY_LIMIT);
    expect(session.getSnapshot().state.entities[0]).toBe(original);
    expect(session.getSnapshot().changed).toBe(false);
    expect(session.acceptText('U')).toEqual({ changed: false });
    expect(session.cancel()).toBeUndefined();
  });
});
