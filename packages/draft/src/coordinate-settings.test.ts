import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadEntity } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { draftLine } from './entities';
import { DimensionSession } from './dimension-session';
import { MeasureSession, formatMeasurement, measureBetween } from './measure-session';
import { ModifySession } from './modify-session';
import { OffsetSession } from './offset-session';
import { TextSession } from './text-session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it('reads live angle settings at each point prompt in inquiry and modification commands', () => {
  const drawing = createEmptyCadState();
  let aunits = 2;
  const coordinates = () => ({ aunits });
  const measure = new MeasureSession(drawing.settings, {
    coordinates,
    precision: 4,
    onComplete: () => {},
  });
  measure.acceptText('10<100');
  expect(measure.getSnapshot().points[0]!.x).toBeCloseTo(0, 12);
  expect(measure.getSnapshot().points[0]!.y).toBeCloseTo(-10, 12);
  const modify = new ModifySession('MOVE', undefined, coordinates);
  const line = draftLine(drawing.settings, { x: 0, y: 0 }, { x: 10, y: 0 });
  modify.select({ ...drawing, entities: [line] }, [line.id]);
  modify.acceptText('0,0');
  aunits = 3;
  const result = modify.acceptText(`@10<${Math.PI / 2}`);
  expect(result.delta?.x).toBeCloseTo(0, 12);
  expect(result.delta?.y).toBeCloseTo(-10, 12);
  expect(
    formatMeasurement(measureBetween({ x: 0, y: 0 }, { x: 3, y: -4 }), {
      coordinates: { lunits: 3, luprec: 2, aunits: 2, auprec: 2, angbase: Math.PI / 2, angdir: 1 },
      linearPrecision: 4,
      angularPrecision: 0,
      angleBase: 0,
      clockwise: false,
    }),
  ).toEqual({ distance: `0'-5.00"`, deltaX: `0'-3.00"`, deltaY: `0'-4.00"`, angle: '40.97g' });
});

it('uses current angle units for TEXT and dimension rotation and OFFSET reference points', () => {
  const drawing = createEmptyCadState();
  const coordinates = () => ({ aunits: 2 });
  const text = new TextSession(drawing.settings, {
    coordinates,
    textSize: 3.5,
    onCommit: () => {},
  });
  text.acceptText('10<100');
  text.acceptText('3.5');
  text.acceptText('100');
  expect(text.getSnapshot().point?.y).toBeCloseTo(-10, 12);
  expect(text.getSnapshot().rotation).toBeCloseTo(-Math.PI / 2, 12);
  const commits: CadEntity[][] = [];
  const dimension = new DimensionSession('DIMLINEAR', drawing.settings, {
    coordinates,
    onCommit: (entities) => commits.push(entities),
  });
  for (const input of ['0,0', '10,10', 'R', '100', '20,20']) dimension.acceptText(input);
  const created = commits[0]?.[0];
  if (created?.type !== 'dimension') throw new Error('Missing dimension');
  expect(created.axisAngle).toBeCloseTo(-Math.PI / 2, 12);
  const offset = new OffsetSession(drawing, { coordinates, distance: -1, gapType: 0 });
  offset.acceptText('10<100');
  expect(offset.getSnapshot().basePoint?.x).toBeCloseTo(0, 12);
  expect(offset.getSnapshot().basePoint?.y).toBeCloseTo(-10, 12);
});
