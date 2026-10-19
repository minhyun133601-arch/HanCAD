import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { DrawSession } from './draw-session';
import { peditProgram } from './modify-poly';
import { splineditProgram } from './modify-spline';
import { splineFromPoints } from './draw-spline';
import { editCurveEntity } from './modify-curve-geometry';
import type { CadPolyline } from '@hancad/legacy-bridge';
import { SystemVariables } from '@hancad/sysvars';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const original: CadPolyline = {
  id: 'curve',
  type: 'polyline',
  layer: '0',
  color: '#ffffff',
  lineWidth: 1,
  closed: false,
  points: [
    { x: 0, y: 0 },
    { x: 25, y: -50 },
    { x: 75, y: -50 },
    { x: 100, y: 0 },
  ],
};
test('converted spline replacement passes complete recovery validation', () => {
  const variables = new SystemVariables();
  const spline = { ...original, curve: splineFromPoints(original.points, false, 3, 2) };
  const context = {
    ...outlineContext({ DELOBJ: 1 }),
    get: (name: string) => variables.get(name),
    entities: [spline],
    selectedIds: [spline.id],
  };
  const result = outlineRun(splineditProgram, ['P', '12'], context);
  const state = normalizeCadState({ ...createEmptyCadState(), entities: result.entities });
  expect(state.entities[0]?.sourceType).toBe('LWPOLYLINE');
  expect(state.entities[0]?.curve).toBeUndefined();
});
test('interactive PEDIT acquires a recovered exact source and retains valid widths', () => {
  const variables = new SystemVariables();
  const polyline = editCurveEntity(original, {
    type: 'LWPOLYLINE',
    vertices: original.points
      .slice(0, 3)
      .map((p) => ({ position: { x: p.x, y: -p.y, z: 0 }, bulge: 0, startWidth: 0, endWidth: 0 })),
    normal: { x: 0, y: 0, z: 1 },
    closed: false,
    is3D: false,
    constantWidth: 0,
  });
  const state = normalizeCadState({ ...createEmptyCadState(), entities: [polyline] });
  const session = new DrawSession('PEDIT', peditProgram, {
    context: {
      ...outlineContext(),
      get: (name) => variables.get(name),
      settings: state.settings,
      entities: state.entities,
    },
    onComplete: (result) => {
      normalizeCadState({ ...state, entities: result.entities });
    },
  });
  expect(session.acceptPoint({ x: 10, y: -20 }, {}, polyline.id)).toEqual({ status: 'continue' });
  expect(session.getRequest()?.en).toContain('Edit vertex');
  session.acceptText('W');
  session.acceptText('5');
  expect(session.acceptText('')).toEqual({ status: 'committed' });
});
