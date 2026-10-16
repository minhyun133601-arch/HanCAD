import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadPoint } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { DraftSession } from './session';
import { DimensionSession } from './dimension-session';
import { MeasureSession } from './measure-session';
import { ModifySession } from './modify-session';
import { TextSession } from './text-session';
import { OffsetSession } from './offset-session';
import { draftLine } from './entities';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it('reports exact constrained and direct-distance points while ignoring preview, Undo and rejected input', () => {
  const points: CadPoint[] = [];
  const settings = { ...createEmptyCadState().settings, ortho: true };
  const session = new DraftSession('LINE', settings, {
    onCommit: () => {},
    onAcceptedPoint: (p) => points.push(p),
  });
  session.acceptText('0,0');
  session.moveCursor({ x: 40, y: -7 });
  session.acceptPoint({ x: 40, y: -7 });
  session.moveCursor({ x: 80, y: 4 });
  session.acceptText('10');
  session.acceptText('invalid');
  session.acceptText('U');
  expect(points).toEqual([
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 50, y: 0 },
  ]);
});

it('reports a final rectangle corner and dimension placement even when their commands close immediately', () => {
  const points: CadPoint[] = [];
  const settings = createEmptyCadState().settings;
  const rectangle = new DraftSession('RECTANG', settings, {
    onCommit: () => {},
    onAcceptedPoint: (p) => points.push(p),
  });
  rectangle.acceptText('10,20');
  rectangle.acceptText('@30,40');
  expect(points.at(-1)).toEqual({ x: 40, y: -60 });
  const dimension = new DimensionSession('DIMLINEAR', settings, {
    onCommit: () => {},
    onAcceptedPoint: (p) => points.push(p),
  });
  dimension.acceptText('0,0');
  dimension.acceptText('50,0');
  dimension.acceptText('25,20');
  expect(points.at(-1)).toEqual({ x: 25, y: -20 });
});

it('reports the second DIST point and constrained MOVE target rather than only their retained bases', () => {
  const drawing = createEmptyCadState();
  const points: CadPoint[] = [];
  const measure = new MeasureSession(drawing.settings, {
    precision: 4,
    onComplete: () => {},
    onAcceptedPoint: (p) => points.push(p),
  });
  measure.acceptText('10,20');
  measure.acceptText('@30,40');
  expect(points.at(-1)).toEqual({ x: 40, y: -60 });
  const entity = draftLine(drawing.settings, { x: 0, y: 0 }, { x: 10, y: 0 });
  const modify = new ModifySession('MOVE', (p) => points.push(p));
  modify.select({ ...drawing, entities: [entity] }, [entity.id]);
  modify.acceptText('0,0');
  expect(modify.getSnapshot().basePoint).toEqual({ x: 0, y: 0 });
  modify.acceptPoint({ x: 40, y: 5 }, true);
  expect(points.at(-1)).toEqual({ x: 40, y: 0 });
});

it('keeps TEXT automatic next-line placement out of accepted points and publishes OFFSET distance picks', () => {
  const settings = createEmptyCadState().settings;
  const points: CadPoint[] = [];
  const text = new TextSession(settings, {
    textSize: 2.5,
    onCommit: () => {},
    onAcceptedPoint: (p) => points.push(p),
  });
  text.acceptText('10,20');
  text.acceptText('2.5');
  text.acceptText('0');
  text.acceptText('한글');
  expect(points).toEqual([{ x: 10, y: -20 }]);
  const offset = new OffsetSession(createEmptyCadState(), {
    distance: 10,
    gapType: 0,
    onAcceptedPoint: (p) => points.push(p),
  });
  offset.acceptText('0,0');
  expect(offset.getSnapshot().basePoint).toEqual({ x: 0, y: 0 });
  offset.acceptText('0,5');
  expect(points.at(-1)).toEqual({ x: 0, y: -5 });
});
