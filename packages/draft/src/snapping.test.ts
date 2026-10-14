import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { draftCircle, draftLine, draftPolyline } from './entities';
import { snapDraftPoint } from './snapping';
import { DraftSession } from './session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it('honors snap modes and screen-scaled tolerance at large coordinates without mutation', () => {
  const state = createEmptyCadState();
  state.entities = [
    draftLine(
      state.settings,
      { x: 200000000, y: -500000000 },
      { x: 200000100, y: -500000000 },
      'survey-line',
    ),
  ];
  const before = structuredClone(state);
  expect(snapDraftPoint(state, { x: 200000001, y: -499999999 }, 2, 1)).toEqual({
    point: { x: 200000000, y: -500000000 },
    kind: 'endpoint',
    entityId: 'survey-line',
  });
  expect(snapDraftPoint(state, { x: 200000050, y: -499999999 }, 2, 2)?.kind).toBe('midpoint');
  expect(snapDraftPoint(state, { x: 200000050, y: -499999999 }, 2, 1)).toBeUndefined();
  expect(snapDraftPoint(state, { x: 200000025, y: -499999999 }, 2, 512)?.point).toEqual({
    x: 200000025,
    y: -500000000,
  });
  expect(snapDraftPoint(state, { x: 200000001, y: -499999999 }, 2, 16385)).toBeUndefined();
  expect(snapDraftPoint(state, { x: 200000001, y: -499999999 }, 2, 32)).toBeUndefined();
  expect(state).toEqual(before);
});

it('snaps visible circle/polyline geometry and allows snapping to locked layers', () => {
  const state = createEmptyCadState();
  state.entities = [
    draftCircle(state.settings, { x: 50, y: -50 }, 10, 'circle'),
    draftPolyline(
      state.settings,
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: -100 },
      ],
      true,
      false,
      'polyline',
    ),
  ];
  state.layers[0]!.locked = true;
  expect(snapDraftPoint(state, { x: 51, y: -49 }, 2, 4)?.point).toEqual({ x: 50, y: -50 });
  expect(snapDraftPoint(state, { x: 61, y: -49 }, 2, 16)?.point).toEqual({ x: 60, y: -50 });
  expect(snapDraftPoint(state, { x: 51, y: -49 }, 2, 2)?.point).toEqual({ x: 50, y: -50 });
  state.layers[0]!.visible = false;
  expect(snapDraftPoint(state, { x: 51, y: -49 }, 2, 4)).toBeUndefined();
});

it('respects arc sweeps for quadrant/nearest and rejects invalid input', () => {
  const state = createEmptyCadState();
  state.entities = [
    {
      id: 'arc',
      type: 'arc',
      layer: '0',
      color: '#ffffff',
      lineWidth: 1,
      center: { x: 0, y: 0 },
      radius: 10,
      startAngle: 0,
      endAngle: Math.PI / 2,
      clockwise: true,
    },
  ];
  expect(snapDraftPoint(state, { x: 10, y: 0 }, 1, 16)?.kind).toBe('quadrant');
  expect(snapDraftPoint(state, { x: -10, y: 0 }, 1, 16)).toBeUndefined();
  expect(snapDraftPoint(state, { x: 8, y: 8 }, 2, 512)?.kind).toBe('nearest');
  expect(snapDraftPoint(state, { x: -8, y: -8 }, 2, 512)).toBeUndefined();
  expect(snapDraftPoint(state, { x: NaN, y: 0 }, 2, 1)).toBeUndefined();
  expect(snapDraftPoint(state, { x: 0, y: 0 }, Infinity, 1)).toBeUndefined();
});

it('finds exact finite line and closed-polyline intersections at survey coordinates', () => {
  const state = createEmptyCadState();
  const origin = { x: 200000000, y: -500000000 };
  state.entities = [
    draftLine(state.settings, origin, { x: origin.x + 100, y: origin.y + 100 }, 'diagonal'),
    draftLine(
      state.settings,
      { x: origin.x, y: origin.y + 100 },
      { x: origin.x + 100, y: origin.y },
      'crossing',
    ),
  ];
  const before = structuredClone(state);
  expect(snapDraftPoint(state, { x: origin.x + 51, y: origin.y + 49 }, 2, 32)).toEqual({
    point: { x: origin.x + 50, y: origin.y + 50 },
    kind: 'intersection',
    entityId: 'diagonal',
  });
  expect(snapDraftPoint(state, { x: origin.x + 51, y: origin.y + 49 }, 2, 1)).toBeUndefined();
  expect(snapDraftPoint(state, { x: origin.x + 51, y: origin.y + 49 }, 2, 16416)).toBeUndefined();
  expect(state).toEqual(before);
  state.entities = [
    draftPolyline(
      state.settings,
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
      ],
      true,
      false,
      'closed',
    ),
    draftLine(state.settings, { x: 0, y: 10 }, { x: 20, y: 10 }, 'horizontal'),
  ];
  expect(snapDraftPoint(state, { x: 10.2, y: 10.1 }, 1, 32)?.point).toEqual({ x: 10, y: 10 });
  state.entities = [
    draftLine(state.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'short'),
    draftLine(state.settings, { x: 20, y: -10 }, { x: 20, y: 10 }, 'outside'),
  ];
  expect(snapDraftPoint(state, { x: 20, y: 0 }, 2, 32)).toBeUndefined();
});

it('finds line/circle and circle/circle intersections including tangent points', () => {
  const state = createEmptyCadState();
  state.entities = [
    draftCircle(state.settings, { x: 0, y: 0 }, 10, 'circle'),
    draftLine(state.settings, { x: -20, y: 6 }, { x: 20, y: 6 }, 'secant'),
  ];
  expect(snapDraftPoint(state, { x: 8.2, y: 6.1 }, 1, 32)?.point).toEqual({ x: 8, y: 6 });
  expect(snapDraftPoint(state, { x: -8.2, y: 6.1 }, 1, 32)?.point).toEqual({ x: -8, y: 6 });
  state.entities[1] = draftLine(state.settings, { x: -20, y: 10 }, { x: 20, y: 10 }, 'tangent');
  expect(snapDraftPoint(state, { x: 0.2, y: 10.1 }, 1, 32)?.point).toEqual({ x: 0, y: 10 });
  state.entities[1] = draftCircle(state.settings, { x: 12, y: 0 }, 10, 'other-circle');
  expect(snapDraftPoint(state, { x: 6.2, y: 8.1 }, 1, 32)?.point).toEqual({ x: 6, y: 8 });
  state.entities[1] = draftCircle(state.settings, { x: 20, y: 0 }, 10, 'tangent-circle');
  expect(snapDraftPoint(state, { x: 10.2, y: 0.1 }, 1, 32)?.point).toEqual({ x: 10, y: 0 });
  state.layers[0]!.visible = false;
  expect(snapDraftPoint(state, { x: 10, y: 0 }, 1, 32)).toBeUndefined();
});

it('keeps arc intersections on their actual sweeps and locates the nearest arc endpoint', () => {
  const state = createEmptyCadState();
  state.entities = [
    {
      id: 'arc',
      type: 'arc',
      layer: '0',
      color: '#ffffff',
      lineWidth: 1,
      center: { x: 0, y: 0 },
      radius: 10,
      startAngle: 0,
      endAngle: Math.PI / 2,
      clockwise: true,
    },
    draftLine(state.settings, { x: -20, y: 6 }, { x: 20, y: 6 }, 'secant'),
  ];
  expect(snapDraftPoint(state, { x: 8.2, y: 6.1 }, 1, 32)?.point).toEqual({ x: 8, y: 6 });
  expect(snapDraftPoint(state, { x: -8.2, y: 6.1 }, 1, 32)).toBeUndefined();
  expect(snapDraftPoint(state, { x: 10, y: -0.5 }, 1, 512)?.point).toEqual({ x: 10, y: 0 });
  state.entities[1] = draftCircle(state.settings, { x: 12, y: 0 }, 10, 'circle');
  expect(snapDraftPoint(state, { x: 6.2, y: 8.1 }, 1, 32)?.point).toEqual({ x: 6, y: 8 });
  expect(snapDraftPoint(state, { x: 6.2, y: -8.1 }, 1, 32)).toBeUndefined();
});

it('does not invent intersections from extrapolated long segments or small disjoint curves', () => {
  const state = createEmptyCadState();
  state.entities = [
    draftLine(state.settings, { x: 0, y: 0 }, { x: 1e10, y: 0 }, 'long'),
    draftLine(state.settings, { x: 1e10 + 0.1, y: -10 }, { x: 1e10 + 0.1, y: 10 }, 'beyond-end'),
  ];
  expect(snapDraftPoint(state, { x: 1e10 + 0.1, y: 0 }, 1, 32)).toBeUndefined();
  state.entities = [
    draftCircle(state.settings, { x: 0, y: 0 }, 1e-7, 'tiny'),
    draftLine(state.settings, { x: -1e-6, y: 1.1e-7 }, { x: 1e-6, y: 1.1e-7 }, 'outside'),
  ];
  expect(snapDraftPoint(state, { x: 0, y: 1.1e-7 }, 1e-7, 32)).toBeUndefined();
});

it('snaps accepted LINE/PLINE segments before Enter without snapping their moving cursor legs', () => {
  for (const tool of ['LINE', 'PLINE'] as const) {
    const state = createEmptyCadState();
    state.entities = [draftLine(state.settings, { x: 50, y: -150 }, { x: 50, y: 150 }, 'existing')];
    const before = structuredClone(state);
    const session = new DraftSession(tool, state.settings, { onCommit: () => {} });
    session.acceptText('0,0');
    expect(session.getSnapEntities()).toEqual([]);
    session.acceptText('100,0');
    session.acceptText('100,50');
    session.moveCursor({ x: 0, y: -100 });
    const accepted = session.getSnapEntities();
    expect(snapDraftPoint(state, { x: 0.2, y: 0.1 }, 1, 1, accepted)?.point).toEqual({
      x: 0,
      y: 0,
    });
    expect(snapDraftPoint(state, { x: 50.2, y: 0.1 }, 1, 32)).toBeUndefined();
    expect(snapDraftPoint(state, { x: 50.2, y: 0.1 }, 1, 32, accepted)?.point).toEqual({
      x: 50,
      y: 0,
    });
    expect(snapDraftPoint(state, { x: 0.2, y: -100.1 }, 1, 1, accepted)).toBeUndefined();
    expect(snapDraftPoint(state, { x: 50.2, y: -75.1 }, 1, 32, accepted)).toBeUndefined();
    const first = accepted[0];
    if (first?.type === 'line') first.a.x = 999;
    else if (first?.type === 'polyline') first.points[0]!.x = 999;
    expect(session.getSnapshot().points[0]).toEqual({ x: 0, y: 0 });
    expect(state).toEqual(before);
    session.finish();
    expect(session.getSnapEntities()).toEqual([]);
  }
});
