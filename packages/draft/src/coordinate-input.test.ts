import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { DraftSession } from './session';
import { lineContinuation } from './line-continuation';
import { PointInputController } from './point-input';
import {
  formatDraftAngle,
  formatDraftNumber,
  parseDraftAngle,
  parseDraftNumber,
  parseDraftPoint,
} from './coordinates';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

describe('coordinate unit notation and geometry precision', () => {
  it.each([
    ['1.25e3', 1250],
    ['-0.125', -0.125],
    ['3/8', 0.375],
    ['2 3/8', 2.375],
    ['2-3/8', 2.375],
    ['-2-3/8', -2.375],
    [`1'2.5"`, 14.5],
    [`1'-2 1/2"`, 14.5],
    [`-2'3/4"`, -24.75],
    ['7"', 7],
    ["5'", 60],
  ])('reads %s as drawing units without applying display precision', (text, expected) => {
    expect(parseDraftNumber(String(text), { lunits: 4, luprec: 0 })).toBe(expected);
  });
  it.each(['1/0', 'NaN', 'Infinity', '1e13', '2/3/4', '5 feet', ''])(
    'rejects invalid lengths %s',
    (text) => {
      expect(parseDraftNumber(text)).toBeUndefined();
    },
  );
  it('parses degrees, DMS, grads, radians and surveyor bearings with a configurable zero/direction', () => {
    expect(parseDraftAngle(`30d30'0"`)).toBeCloseTo((30.5 * Math.PI) / 180);
    expect(parseDraftAngle('100g')).toBeCloseTo(Math.PI / 2);
    expect(parseDraftAngle('1.25r')).toBe(1.25);
    expect(parseDraftAngle('N45dE')).toBeCloseTo(Math.PI / 4);
    expect(parseDraftAngle('S30dW')).toBeCloseTo((4 * Math.PI) / 3);
    expect(parseDraftAngle('30', { angbase: Math.PI / 2, angdir: 1 })).toBeCloseTo(Math.PI / 3);
    expect(parseDraftAngle('100', { aunits: 2 })).toBeCloseTo(Math.PI / 2);
    expect(parseDraftAngle('1.25', { aunits: 3 })).toBe(1.25);
    expect(parseDraftAngle(`10d60'`)).toBeUndefined();
  });
  it('formats all linear/angular modes while retaining exact input coordinates', () => {
    expect(
      [1, 2, 3, 4, 5].map((lunits) => formatDraftNumber(14.375, { lunits, luprec: 3 })),
    ).toEqual(['1.438E+01', '14.375', `1'-2.375"`, `1'-2 3/8"`, '14 3/8']);
    expect(formatDraftNumber(11.9999, { lunits: 3, luprec: 2 })).toBe(`1'-0.00"`);
    expect(formatDraftAngle(Math.PI / 4, { aunits: 4, auprec: 4 })).toBe(`N 45d0'0" E`);
    expect(formatDraftAngle(0, { aunits: 4 })).toBe('E');
    expect(formatDraftAngle(Math.PI / 2, { aunits: 4 })).toBe('N');
    expect(formatDraftAngle(Math.PI / 2, { aunits: 2, auprec: 2 })).toBe('100.00g');
    expect(formatDraftAngle(Math.PI / 2, { aunits: 3, auprec: 4 })).toBe('1.5708r');
    expect(parseDraftPoint('1.234567,8.765432', undefined, { luprec: 0 })).toEqual({
      x: 1.234567,
      y: -8.765432,
    });
  });
  it('accepts absolute/relative XYZ, polar, cylindrical and spherical values at survey coordinates', () => {
    const base = { x: 200000000, y: -450000000, z: 10 };
    expect(parseDraftPoint('@3,4,5', base)).toEqual({ x: 200000003, y: -450000004, z: 15 });
    expect(parseDraftPoint('#0,0,0', base, {}, true)).toEqual({ x: 0, y: 0, z: 0 });
    expect(parseDraftPoint('3,4', { x: 10, y: -20 }, {}, true)).toEqual({ x: 13, y: -24 });
    expect(parseDraftPoint('@5<0,7', base)).toEqual({ x: 200000005, y: -450000000, z: 17 });
    const spherical = parseDraftPoint('@10<30<60', base)!;
    expect(spherical.x).toBeCloseTo(base.x + 5 * Math.cos(Math.PI / 6), 6);
    expect(spherical.y).toBeCloseTo(base.y - 2.5, 6);
    expect(spherical.z).toBeCloseTo(10 + 10 * Math.sin(Math.PI / 3), 10);
  });
});

describe('stateful point modifiers and complete LINE', () => {
  it.each(['X', 'Y', 'Z', 'XY', 'XZ', 'YZ'])(
    'assembles .%s with the remaining coordinates from a second point',
    (filter) => {
      const input = new PointInputController();
      input.acceptText(`.${filter}`);
      expect(input.acceptPoint({ x: 10, y: -20, z: 30 })).toEqual({ kind: 'continue' });
      const result = input.acceptPoint({ x: 40, y: -50, z: 60 });
      expect(result).toEqual({
        kind: 'point',
        point: {
          x: filter.includes('X') ? 10 : 40,
          y: filter.includes('Y') ? -20 : -50,
          z: filter.includes('Z') ? 30 : 60,
        },
      });
    },
  );
  it('supports nested filters, FROM, M2P and TT without drawing their reference samples', () => {
    const session = new DraftSession('LINE', createEmptyCadState().settings, {
      onCommit: () => {},
    });
    for (const token of ['.X', '10,100', '.Y', '20', '0']) session.acceptText(token);
    expect(session.getSnapshot().points).toEqual([{ x: 10, y: -20, z: 0 }]);
    for (const token of ['FROM', '100,100', '@10,10']) session.acceptText(token);
    expect(session.getSnapshot().points.at(-1)).toEqual({ x: 110, y: -110 });
    for (const token of ['M2P', '0,0', '20,40']) session.acceptText(token);
    expect(session.getSnapshot().points.at(-1)).toEqual({ x: 10, y: -20 });
    session.acceptText('TT');
    session.acceptText('50,50');
    expect(session.getAidContext().trackingPoints).toEqual([{ x: 50, y: -50 }]);
    expect(session.getSnapshot().points).toHaveLength(3);
  });
  it('tracks temporary orthogonal offsets, uses tracking-base distance and locks an entered angle', () => {
    const session = new DraftSession('LINE', createEmptyCadState().settings, {
      onCommit: () => {},
    });
    for (const token of ['TK', '0,0']) session.acceptText(token);
    session.moveCursor({ x: 30, y: -3 });
    session.acceptText('10');
    session.moveCursor({ x: 12, y: -30 });
    session.acceptText('20');
    session.acceptText('');
    expect(session.getSnapshot().points).toEqual([{ x: 10, y: -20 }]);
    session.acceptText('<30');
    session.acceptText('100');
    expect(session.getSnapshot().points.at(-1)?.x).toBeCloseTo(10 + 50 * Math.sqrt(3));
    expect(session.getSnapshot().points.at(-1)?.y).toBeCloseTo(-70);
    session.moveCursor({ x: 130, y: -70 }, { trackingBase: { x: 120, y: -70 } });
    session.acceptText('5');
    expect(session.getSnapshot().points.at(-1)).toEqual({ x: 125, y: -70 });
  });
  it('exposes typed snaps and continues a previous line or arc tangent in one undo-sized batch', () => {
    const settings = createEmptyCadState().settings;
    const commits: unknown[] = [],
      snaps: string[] = [];
    const continuation = lineContinuation([
      {
        id: 'arc',
        type: 'arc',
        layer: '0',
        color: '#fff',
        lineWidth: 1,
        center: { x: 0, y: 0 },
        radius: 10,
        startAngle: 0,
        endAngle: Math.PI / 2,
        clockwise: true,
      },
    ]);
    const session = new DraftSession('LINE', settings, {
      continuation: continuation!,
      onCommit: (entities) => commits.push(entities),
      onSnapOverride: (mode) => snaps.push(mode),
    });
    session.acceptText('');
    session.acceptText('20');
    expect(session.getSnapshot().points[1]?.x).toBeCloseTo(-20);
    expect(session.getSnapshot().points[1]?.y).toBeCloseTo(10);
    session.acceptText('END');
    expect(snaps).toEqual(['endpoint']);
    expect(session.getPointInput().snapOverride).toBe('endpoint');
    session.acceptText('0,0');
    session.acceptText('U');
    session.acceptText('0,20');
    session.acceptText('C');
    expect(commits).toHaveLength(1);
    expect(session.getSnapshot().status).toBe('committed');
  });
});
