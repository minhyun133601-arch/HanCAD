import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadEntity } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { DraftSession, appendCadEntities, deleteCadEntities, parseDraftPoint } from './index';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

describe('2D drafting command sessions', () => {
  it('creates LINE segments from exact absolute/relative/polar coordinates as one immutable command', () => {
    const drawing = createEmptyCadState();
    const commits: CadEntity[][] = [];
    const session = new DraftSession('LINE', drawing.settings, {
      onCommit: (entities) => commits.push(entities),
    });
    session.acceptText('100,50');
    session.acceptText('@100,0');
    session.acceptText('@100<90');
    expect(session.getSnapshot().points).toEqual([
      { x: 100, y: -50 },
      { x: 200, y: -50 },
      { x: 200, y: -150 },
    ]);
    session.moveCursor({ x: 300, y: -150 });
    expect(session.getSnapshot().preview).toHaveLength(3);
    expect(commits).toHaveLength(0);
    expect(session.finish()).toEqual({ status: 'committed' });
    expect(commits).toHaveLength(1);
    expect(commits[0]).toHaveLength(2);
    const result = appendCadEntities(drawing, commits[0] ?? []);
    expect(result.entities).toHaveLength(2);
    expect(drawing.entities).toHaveLength(0);
    expect(new Set(result.entities.map((entity) => entity.id)).size).toBe(2);
    const originalLine = commits[0]?.[0];
    const addedLine = result.entities[0];
    if (originalLine?.type === 'line' && addedLine?.type === 'line') {
      addedLine.a.x = -10;
      expect(originalLine.a.x).toBe(100);
    }
    result.settings.color = '#ffffff';
    expect(drawing.settings.color).not.toBe('#ffffff');
  });

  it('supports LINE local Undo/Close and preserves accepted segments when Escape cancels the preview', () => {
    const settings = createEmptyCadState().settings;
    const commits: CadEntity[][] = [];
    const closed = new DraftSession('LINE', settings, {
      onCommit: (entities) => commits.push(entities),
    });
    closed.acceptText('0,0');
    closed.acceptText('100,0');
    closed.acceptText('100,100');
    closed.acceptText('U');
    expect(closed.getSnapshot().points).toHaveLength(2);
    closed.acceptText('100,50');
    closed.acceptText('C');
    expect(commits[0]).toHaveLength(3);
    const firstPoint = new DraftSession('LINE', settings, {
      onCommit: (entities) => commits.push(entities),
    });
    firstPoint.acceptText('0,0');
    firstPoint.cancel();
    expect(commits).toHaveLength(1);
    const accepted = new DraftSession('LINE', settings, {
      onCommit: (entities) => commits.push(entities),
    });
    accepted.acceptText('0,0');
    accepted.acceptText('@20,0');
    accepted.moveCursor({ x: 50, y: 50 });
    expect(accepted.cancel()).toEqual({ status: 'cancelled' });
    expect(commits[1]).toHaveLength(1);
    expect(accepted.getSnapshot().preview).toEqual([]);
    expect(accepted.acceptText('100,100')).toEqual({ status: 'error', error: 'closedSession' });
  });

  it('creates circles from positive radius input or mouse distance at survey coordinates', () => {
    const settings = createEmptyCadState().settings;
    const commits: CadEntity[][] = [];
    const numeric = new DraftSession('CIRCLE', settings, {
      onCommit: (entities) => commits.push(entities),
    });
    numeric.acceptText('10,20');
    expect(numeric.acceptText('0')).toEqual({ status: 'error', error: 'positiveRadius' });
    expect(numeric.acceptText('25')).toEqual({ status: 'committed' });
    expect(commits[0]?.[0]).toMatchObject({
      type: 'circle',
      center: { x: 10, y: -20 },
      radius: 25,
    });
    const mouse = new DraftSession('CIRCLE', settings, {
      onCommit: (entities) => commits.push(entities),
    });
    mouse.acceptPoint({ x: 1e8, y: -2e8 });
    mouse.moveCursor({ x: 1e8 + 3, y: -2e8 - 4 });
    expect(mouse.getSnapshot().preview[0]).toMatchObject({ radius: 5 });
    mouse.acceptPoint({ x: 1e8 + 3, y: -2e8 - 4 });
    expect(commits[1]?.[0]).toMatchObject({ center: { x: 1e8, y: -2e8 }, radius: 5 });
  });

  it('creates rectangular and closed/open polyline geometry and rejects degenerate corners', () => {
    const settings = createEmptyCadState().settings;
    const commits: CadEntity[][] = [];
    const rectangle = new DraftSession('RECTANG', settings, {
      onCommit: (entities) => commits.push(entities),
    });
    rectangle.acceptText('0,0');
    expect(rectangle.acceptText('@100,0')).toEqual({ status: 'error', error: 'zeroLength' });
    rectangle.moveCursor({ x: 100, y: -50 });
    expect(rectangle.getSnapshot().preview[0]).toMatchObject({ type: 'rect', closed: true });
    rectangle.acceptText('@100,50');
    expect(commits[0]?.[0]).toMatchObject({
      type: 'rect',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: -50 },
        { x: 0, y: -50 },
      ],
      closed: true,
    });
    const closed = new DraftSession('PLINE', settings, {
      onCommit: (entities) => commits.push(entities),
    });
    closed.acceptText('0,0');
    closed.acceptText('100,0');
    closed.acceptText('100,50');
    closed.acceptText('C');
    expect(commits[1]?.[0]).toMatchObject({ type: 'polyline', closed: true });
    const open = new DraftSession('PLINE', settings, {
      onCommit: (entities) => commits.push(entities),
    });
    open.acceptText('0,0');
    open.acceptText('100,0');
    open.acceptText('');
    expect(commits[2]?.[0]).toMatchObject({ type: 'polyline', closed: false });
  });

  it('uses cursor direction for direct distance while explicit coordinates bypass Ortho/grid constraints', () => {
    const settings = createEmptyCadState().settings;
    const session = new DraftSession('LINE', settings, { onCommit: () => {} });
    session.acceptText('0,0');
    session.moveCursor({ x: 3, y: -4 });
    session.acceptText('50');
    expect(session.getSnapshot().points.at(-1)).toEqual({ x: 30, y: -40 });
    session.setSettings({ ...settings, ortho: true, gridSnap: true });
    session.acceptPoint({ x: 71, y: -44 });
    expect(session.getSnapshot().points.at(-1)).toEqual({ x: 70, y: -40 });
    session.acceptText('77,43');
    expect(session.getSnapshot().points.at(-1)).toEqual({ x: 77, y: -43 });
    const copy = session.getSnapshot();
    const first = copy.points[0];
    if (first) first.x = 999;
    expect(session.getSnapshot().points[0]?.x).toBe(0);
    expect(parseDraftPoint('@3,4', { x: 1e8, y: -2e8 })).toEqual({ x: 1e8 + 3, y: -2e8 - 4 });
    expect(parseDraftPoint('NaN,4')).toBeUndefined();
    expect(parseDraftPoint('1e20,0')).toBeUndefined();
  });

  it('preserves exact object snaps in previews and accepted points with grid and Ortho enabled', () => {
    const settings = {
      ...createEmptyCadState().settings,
      ortho: true,
      gridSnap: true,
      gridSize: 10,
    };
    const commits: CadEntity[][] = [];
    for (const tool of ['LINE', 'PLINE'] as const) {
      const session = new DraftSession(tool, settings, {
        onCommit: (entities) => commits.push(entities),
      });
      session.acceptPoint({ x: 3, y: -4 }, { snapped: true });
      const endpoint = { x: 37, y: -19 };
      session.moveCursor(endpoint, { snapped: true });
      const preview = session.getSnapshot().preview[0];
      expect(
        preview?.type === 'line'
          ? preview.b
          : preview?.type === 'polyline'
            ? preview.points.at(-1)
            : undefined,
      ).toEqual(endpoint);
      session.acceptPoint(endpoint, { snapped: true });
      endpoint.x = 999;
      expect(session.getSnapshot().points).toEqual([
        { x: 3, y: -4 },
        { x: 37, y: -19 },
      ]);
      session.finish();
    }
    expect(commits[0]?.[0]).toMatchObject({
      type: 'line',
      a: { x: 3, y: -4 },
      b: { x: 37, y: -19 },
    });
    expect(commits[1]?.[0]).toMatchObject({
      type: 'polyline',
      points: [
        { x: 3, y: -4 },
        { x: 37, y: -19 },
      ],
    });
    const circle = new DraftSession('CIRCLE', settings, {
      onCommit: (entities) => commits.push(entities),
    });
    circle.acceptPoint({ x: 3, y: -4 }, { snapped: true });
    circle.acceptPoint({ x: 6, y: -8 }, { snapped: true });
    expect(commits[2]?.[0]).toMatchObject({ type: 'circle', center: { x: 3, y: -4 }, radius: 5 });
    const invalid = new DraftSession('LINE', settings, { onCommit: () => {} });
    expect(invalid.acceptPoint({ x: NaN, y: 0 }, { snapped: true })).toEqual({
      status: 'error',
      error: 'point',
    });
  });

  it('deletes only selected visible unlocked entities and leaves input snapshots unchanged', () => {
    const drawing = normalizeCadState({
      layers: [
        { name: 'locked', locked: true },
        { name: 'hidden', visible: false },
      ],
      entities: [
        { id: 'editable', type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
        { id: 'locked', type: 'circle', center: { x: 0, y: 0 }, radius: 5, layer: 'locked' },
        { id: 'hidden', type: 'line', a: { x: 0, y: 0 }, b: { x: 0, y: 10 }, layer: 'hidden' },
      ],
      selectedIds: ['editable', 'locked', 'hidden'],
    });
    const before = JSON.stringify(drawing);
    const result = deleteCadEntities(drawing, ['editable', 'locked', 'hidden']);
    expect(result.deleted).toBe(1);
    expect(result.state.entities.map((entity) => entity.id)).toEqual(['locked', 'hidden']);
    expect(JSON.stringify(drawing)).toBe(before);
  });
});
