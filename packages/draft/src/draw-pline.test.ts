import { describe, expect, it } from 'vitest';
import { drawPline } from './draw-pline';
import { outlineContext, outlineOnly } from './draw-outline-fixtures';
import { endTangent } from './draw-pline-geometry';
import { restoreDrawMetadata } from '../../legacy-bridge/src/draw-metadata';
import type { LegacyCadState } from '@hancad/legacy-bridge';

const origin = { x: 0, y: 0 };
describe('PLINE headless parity scripts', () => {
  it('accepts a picked included-angle direction and exposes its angle rubber band', () => {
    const entity = outlineOnly(drawPline, [
      origin,
      'A',
      'A',
      { x: 10, y: -10 },
      { x: 20, y: 0 },
      '',
    ]);
    expect(entity.bulges?.[0]).toBeCloseTo(-Math.tan(Math.PI / 16), 12);
  });
  it('reads live Ctrl reversal for tangent previews and accepted complementary arcs', () => {
    const context = outlineContext();
    let held = false;
    context.isControlPressed = () => held;
    const program = drawPline(context);
    program.next();
    program.next(origin);
    const state = program.next('A');
    if (state.done) throw new Error('Expected arc endpoint request');
    const end = { x: 10, y: -10 };
    const before = state.value.preview?.(end)[0];
    held = true;
    const after = state.value.preview?.(end)[0];
    if (before?.type !== 'polyline' || after?.type !== 'polyline')
      throw new Error('Expected preview polylines');
    expect(before.bulges?.[0]).toBeCloseTo(-Math.tan(Math.PI / 8), 12);
    expect(after.bulges?.[0]).toBeCloseTo(1 / Math.tan(Math.PI / 8), 12);
    program.next(end);
    const result = program.next('');
    expect(result.done).toBe(true);
    if (result.done) expect(result.value.entities[0]).toMatchObject({ bulges: after.bulges });
  });
  it('applies Ctrl to Center, Direction and Radius endpoint branches but preserves explicit Angle', () => {
    const context = outlineContext();
    context.isControlPressed = () => true;
    const end = { x: 10, y: -10 };
    for (const option of [
      ['CE', { x: 0, y: -10 }, end],
      ['D', '0', end],
      ['R', '10', end],
    ]) {
      const entity = outlineOnly(drawPline, [origin, 'A', ...option, ''], context);
      expect(entity.bulges?.[0]).toBeCloseTo(1 / Math.tan(Math.PI / 8), 11);
    }
    const explicit = outlineOnly(drawPline, [origin, 'A', 'A', '90', end, ''], context);
    expect(explicit.bulges?.[0]).toBeCloseTo(-Math.tan(Math.PI / 8), 12);
  });
  it('crosses recovery normalization with canonical width arrays for every vertex', () => {
    const context = outlineContext();
    const entity = outlineOnly(drawPline, [origin, { x: 10, y: 0 }, ''], context);
    const state: LegacyCadState = {
      version: 1,
      name: 'width-boundary',
      entities: [structuredClone(entity)],
      layers: [],
      selectedIds: [],
      settings: context.settings,
    };
    expect(() => restoreDrawMetadata(state, { entities: [entity] })).not.toThrow();
    expect(state.entities[0]).toMatchObject({ startWidths: [0, 0], endWidths: [0, 0] });
  });
  it('keeps line/arc/line tangent geometry and tapered widths exactly', () => {
    const context = outlineContext({ PLINEGEN: 1 });
    const entity = outlineOnly(
      drawPline,
      [origin, { x: 10, y: 0 }, 'A', { x: 20, y: -10 }, 'L', 'W', '2', '4', 'L', '5', ''],
      context,
    );
    expect(entity.points).toHaveLength(4);
    expect(entity.bulges?.[0]).toBe(0);
    expect(entity.bulges?.[1]).toBeCloseTo(-Math.tan(Math.PI / 8), 12);
    expect(entity.points[3]?.x).toBeCloseTo(20, 12);
    expect(entity.points[3]?.y).toBeCloseTo(-15, 12);
    expect(entity.startWidths).toEqual([0, 0, 2, 0]);
    expect(entity.endWidths).toEqual([0, 0, 4, 0]);
    expect(entity.plinegen).toBe(true);
    expect(context.get('PLINEWID')).toBe(4);
  });
  it('accepts halfwidth defaults, Undo and line Close without duplicate closure vertices', () => {
    const entity = outlineOnly(drawPline, [
      origin,
      'H',
      '2',
      '',
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      'U',
      { x: 10, y: -10 },
      'C',
    ]);
    expect(entity.points).toEqual([origin, { x: 10, y: 0 }, { x: 10, y: -10 }]);
    expect(entity.closed).toBe(true);
    expect(entity.startWidths).toEqual([4, 4, 4]);
    expect(entity.endWidths).toEqual([4, 4, 4]);
  });
  it('continues the last endpoint on Enter and exposes accepted segments during nested prompts', () => {
    const context = outlineContext();
    context.continuation = { point: { x: 5, y: -5 }, tangent: { x: 0, y: -1 } };
    const program = drawPline(context);
    program.next();
    program.next('');
    program.next({ x: 5, y: -15 });
    const state = program.next('W');
    expect(state.done).toBe(false);
    if (!state.done) {
      expect(state.value.partial?.[0]).toMatchObject({
        points: [
          { x: 5, y: -5 },
          { x: 5, y: -15 },
        ],
      });
      expect(state.value.en).toContain('starting width');
    }
  });
  it('creates positive and negative included angles, major arcs and arc Close', () => {
    for (const [angle, bulge] of [
      ['90', -Math.tan(Math.PI / 8)],
      ['-90', Math.tan(Math.PI / 8)],
      ['270', -Math.tan((3 * Math.PI) / 8)],
    ] as const) {
      const entity = outlineOnly(drawPline, [origin, 'A', 'A', angle, { x: 10, y: -10 }, '']);
      expect(entity.bulges?.[0]).toBeCloseTo(bulge, 12);
    }
    const closed = outlineOnly(drawPline, [origin, { x: 10, y: 0 }, 'A', { x: 20, y: -10 }, 'CL']);
    expect(closed.closed).toBe(true);
    expect(closed.bulges?.[2]).toBeDefined();
  });
  it('supports Center endpoint, Angle and chord Length branches', () => {
    const center = { x: 0, y: -10 };
    const end = { x: 10, y: -10 };
    for (const tail of [[end], ['A', '90'], ['L', String(Math.sqrt(200))]]) {
      const entity = outlineOnly(drawPline, [origin, 'A', 'CE', center, ...tail, '']);
      expect(entity.points[1]?.x).toBeCloseTo(10, 11);
      expect(entity.points[1]?.y).toBeCloseTo(-10, 11);
      expect(entity.bulges?.[0]).toBeCloseTo(-Math.tan(Math.PI / 8), 12);
    }
  });
  it('supports Angle Center, Angle Radius and Radius Angle chord-direction branches', () => {
    const center = { x: 0, y: -10 };
    const branches = [
      ['A', '90', 'CE', center],
      ['A', '90', 'R', '10', ''],
      ['R', '10', 'A', '90', ''],
    ];
    for (const branch of branches) {
      const entity = outlineOnly(drawPline, [origin, 'A', ...branch, '']);
      expect(entity.points[1]?.x).toBeCloseTo(10, 11);
      expect(entity.points[1]?.y).toBeCloseTo(-10, 11);
      expect(entity.bulges?.[0]).toBeCloseTo(-Math.tan(Math.PI / 8), 12);
    }
  });
  it('supports Direction, Radius endpoint and Second point through exact circular bulges', () => {
    const branches = [
      ['D', '0', { x: 10, y: -10 }],
      ['R', '10', { x: 10, y: -10 }],
      ['S', { x: Math.sqrt(50), y: Math.sqrt(50) - 10 }, { x: 10, y: -10 }],
    ];
    for (const branch of branches) {
      const entity = outlineOnly(drawPline, [origin, 'A', ...branch, '']);
      expect(entity.bulges?.[0]).toBeCloseTo(-Math.tan(Math.PI / 8), 10);
      const tangent = endTangent(entity.points[0]!, entity.points[1]!, entity.bulges![0]!);
      expect(tangent.x).toBeCloseTo(0, 10);
      expect(tangent.y).toBeCloseTo(-1, 10);
    }
  });
  it('ignores ANGBASE for included angles while respecting it for tangent directions', () => {
    const context = outlineContext();
    context.coordinates = () => ({ angbase: Math.PI / 2, angdir: 1 });
    const angle = outlineOnly(drawPline, [origin, 'A', 'A', '90', { x: 10, y: -10 }, ''], context);
    expect(angle.bulges?.[0]).toBeCloseTo(-Math.tan(Math.PI / 8), 12);
    const direction = outlineOnly(
      drawPline,
      [origin, 'A', 'D', '90', { x: 10, y: -10 }, ''],
      context,
    );
    expect(direction.bulges?.[0]).toBeCloseTo(-Math.tan(Math.PI / 8), 12);
  });
});
