import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { draftCircle, draftLine, draftPolyline } from './entities';
import { snapDraftPoint } from './snapping';

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
