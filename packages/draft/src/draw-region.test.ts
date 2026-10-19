import { describe, expect, it } from 'vitest';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { drawRegion } from './draw-region';
import { regionLoops } from './draw-region-geometry';

const base = { layer: '0', color: '#fff', lineWidth: 1 };
const line = (id: string, a: CadPoint, b: CadPoint): CadEntity => ({
  ...base,
  id,
  type: 'line',
  a,
  b,
});
const poly = (id: string, points: CadPoint[]): CadEntity => ({
  ...base,
  id,
  type: 'polyline',
  points,
  closed: true,
});
const circle = (id: string, x: number, y: number, radius: number): CadEntity => ({
  ...base,
  id,
  type: 'circle',
  center: { x, y },
  radius,
});
const picked = (entity: CadEntity) => ({ entity, point: { x: 0, y: 0 } });
describe('REGION exact boundary topology', () => {
  it('filters locked/hidden objects for All and individual picks when edit eligibility is provided', () => {
    const context = outlineContext(),
      allowed = circle('allowed', 0, 0, 10),
      locked = circle('locked', 100, 0, 10);
    context.entities = [allowed, locked];
    context.editableIds = new Set(['allowed']);
    const result = outlineRun(drawRegion, [picked(locked), 'ALL', ''], context);
    expect(result.entities).toHaveLength(1);
    expect(result.eraseIds).toEqual(['allowed']);
  });
  it('joins unordered and reversed line edges into one exact planar region', () => {
    const lines = [
      line('a', { x: 0, y: 0 }, { x: 20, y: 0 }),
      line('c', { x: 0, y: -10 }, { x: 20, y: -10 }),
      line('b', { x: 20, y: -10 }, { x: 20, y: 0 }),
      line('d', { x: 0, y: 0 }, { x: 0, y: -10 }),
    ];
    const context = outlineContext();
    context.entities = lines;
    const result = outlineRun(drawRegion, ['ALL', ''], context);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.sourceType).toBe('REGION');
    expect(result.entities[0]?.regionArea).toBeCloseTo(200, 10);
    expect(result.entities[0]?.regionLoops?.[0]).toHaveLength(4);
    expect(new Set(result.eraseIds)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });
  it('retains exact circle and semicircle boundaries with areas to 1e-9', () => {
    const c = circle('circle', 20, -50, 10);
    const full = outlineRun(drawRegion, [picked(c), '']);
    expect(full.entities[0]?.regionLoops?.[0]?.[0]).toMatchObject({
      type: 'CIRCLE',
      center: { x: 20, y: 50, z: 0 },
      radius: 10,
    });
    expect(full.entities[0]?.regionArea).toBeCloseTo(Math.PI * 100, 10);
    const semicircle = poly('half', [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ]);
    if (semicircle.type === 'polyline') semicircle.bulges = [1, 0];
    const half = outlineRun(drawRegion, [picked(semicircle), '']);
    expect(half.entities[0]?.regionArea).toBeCloseTo(Math.PI * 50, 10);
    expect(half.entities[0]?.regionLoops?.[0]?.[0]?.type).toBe('ARC');
  });
  it('creates each nested disjoint loop independently and honors DELOBJ=0', () => {
    const context = outlineContext({ DELOBJ: 0 });
    const result = outlineRun(
      drawRegion,
      [picked(circle('outer', 0, 0, 20)), picked(circle('inner', 0, 0, 10)), ''],
      context,
    );
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]?.regionArea).toBeCloseTo(Math.PI * 400, 9);
    expect(result.entities[1]?.regionArea).toBeCloseTo(Math.PI * 100, 9);
    expect(result.eraseIds).toBeUndefined();
  });
  it('accepts planar vertical 3D boundaries and rejects nonplanar boundaries', () => {
    const vertical = poly('vertical', [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: -10, z: 0 },
      { x: 0, y: -10, z: 20 },
      { x: 0, y: 0, z: 20 },
    ]);
    const result = outlineRun(drawRegion, [picked(vertical), '']);
    expect(result.entities[0]?.regionArea).toBeCloseTo(200, 10);
    const nonplanar = poly('twisted', [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: -10, z: 1 },
      { x: 0, y: -10, z: 0 },
    ]);
    const rejected = outlineRun(drawRegion, [picked(nonplanar), '']);
    expect(rejected.entities).toHaveLength(0);
    expect(rejected.eraseIds).toEqual([]);
    expect(rejected.messages?.[0]?.ko).toContain('닫힌 평면 루프');
  });
  it('rejects crossing loops, self-crossings and open chains without erasing their sources', () => {
    expect(regionLoops([circle('a', 0, 0, 10), circle('b', 10, 0, 10)])).toHaveLength(0);
    const bow = poly('bow', [
      { x: 0, y: 0 },
      { x: 10, y: -10 },
      { x: 0, y: -10 },
      { x: 20, y: 0 },
    ]);
    expect(regionLoops([bow])).toHaveLength(0);
    expect(regionLoops([line('open', { x: 0, y: 0 }, { x: 10, y: 0 })])).toHaveLength(0);
  });
  it('does not convert WIPEOUT or filled geometry into a fabricated region', () => {
    const wipeout = {
      ...poly('wipe', [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: -10 },
      ]),
      sourceType: 'WIPEOUT',
    };
    expect(regionLoops([wipeout])).toHaveLength(0);
  });
});
