import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyCadState,
  drawingToDxf,
  normalizeCadState,
  readCadFile,
} from '@hancad/legacy-bridge';
import type { CadEntity } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { appendCadEntities, draftCircle, draftPolyline } from './entities';
import { parseDraftPoint } from './coordinates';
import { DraftSession } from './session';
import { transformCadSelection } from './selection';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it('keeps absent Z absent for absolute XY and inherits elevation only for relative input', () => {
  const base = { x: 1, y: -2, z: 7 };
  expect(parseDraftPoint('3,4', base)).toEqual({ x: 3, y: -4 });
  expect(parseDraftPoint('5<0', base)).toEqual({ x: 5, y: 0 });
  expect(parseDraftPoint('@3,4', base)).toEqual({ x: 4, y: -6, z: 7 });
  expect(parseDraftPoint('3,4', base, { elevation: 9 })).toEqual({ x: 3, y: -4, z: 9 });
  expect(parseDraftPoint('3,4,0', base)).toEqual({ x: 3, y: -4, z: 0 });
});

it('preserves precise optional LINE Z through append, normalization, copy and DXF reload', async () => {
  const drawing = createEmptyCadState();
  const commits: CadEntity[][] = [];
  const session = new DraftSession('LINE', drawing.settings, {
    onCommit: (entities) => commits.push(entities),
  });
  session.acceptText('200000000.12345678,450000000.8765432,7.123456789');
  session.acceptText('@3,4,5.987654321');
  session.finish();
  const state = appendCadEntities(drawing, commits[0]!);
  expect(normalizeCadState(state).entities).toEqual(state.entities);
  const transformed = transformCadSelection(
    state,
    [state.entities[0]!.id],
    { x: 10, y: -20 },
    true,
  ).state;
  const copy = transformed.entities[1];
  expect(copy).toMatchObject({ a: { z: 7.123456789 }, b: { z: 13.11111111 } });
  const loaded = await readCadFile(new File([drawingToDxf(transformed)], 'coordinate-z.dxf'));
  expect(
    loaded.state.entities.map((entity) =>
      entity.type === 'line' ? { a: entity.a, b: entity.b } : {},
    ),
  ).toEqual(
    transformed.entities.map((entity) =>
      entity.type === 'line' ? { a: entity.a, b: entity.b } : {},
    ),
  );
});

it('retains a vertical LINE and validates Z instead of silently discarding invalid values', async () => {
  const drawing = createEmptyCadState();
  const commits: CadEntity[][] = [];
  const session = new DraftSession('LINE', drawing.settings, {
    onCommit: (entities) => commits.push(entities),
  });
  session.acceptText('0,0,5');
  expect(session.acceptText('@0,0,10').status).toBe('continue');
  session.finish();
  const state = appendCadEntities(drawing, commits[0]!);
  expect(state.entities).toHaveLength(1);
  const loaded = await readCadFile(new File([drawingToDxf(state)], 'vertical.dxf'));
  expect(loaded.state.entities[0]).toMatchObject({ a: { z: 5 }, b: { z: 15 } });
  expect(() =>
    normalizeCadState({
      ...state,
      entities: [{ ...state.entities[0], a: { x: 0, y: 0, z: NaN } }],
    }),
  ).toThrow();
});

it('round-trips elevated circles and uniform or varied polyline elevations', async () => {
  const drawing = createEmptyCadState();
  const state = appendCadEntities(drawing, [
    draftCircle(drawing.settings, { x: 10, y: -20, z: 30 }, 5),
    draftPolyline(drawing.settings, [
      { x: 0, y: 0, z: 4 },
      { x: 10, y: -10, z: 4 },
    ]),
    draftPolyline(drawing.settings, [
      { x: 20, y: 0, z: 4 },
      { x: 30, y: -10, z: 8 },
    ]),
  ]);
  const dxf = drawingToDxf(state);
  expect(dxf).toContain('AcDb3dPolyline');
  const loaded = await readCadFile(new File([dxf], 'elevations.dxf'));
  expect(loaded.state.entities[0]).toMatchObject({ center: { z: 30 } });
  expect(loaded.state.entities[1]).toMatchObject({ points: [{ z: 4 }, { z: 4 }] });
  expect(loaded.state.entities[2]).toMatchObject({ points: [{ z: 4 }, { z: 8 }] });
});
