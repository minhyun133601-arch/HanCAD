import { describe, expect, it } from 'vitest';
import type { CadEntity } from '@hancad/legacy-bridge';
import { drawRevcloud } from './draw-cloud';
import { cloudDirectionReversed } from './draw-cloud-geometry';
import { outlineContext, outlineOnly, outlineRun } from './draw-outline-fixtures';

const origin = { x: 0, y: 0 };
const variables = { REVCLOUDAPPROXARCLEN: 10, REVCLOUDARCVARIANCE: 0 };
describe('REVCLOUD command constructions', () => {
  it('creates an exact uniform rectangular scallop polyline and reverses its arcs', () => {
    const context = outlineContext({ ...variables });
    const result = outlineOnly(drawRevcloud, [origin, { x: 30, y: -20 }, ''], context);
    expect(result.points).toHaveLength(10);
    expect(result.cloudVertices).toEqual([
      origin,
      { x: 30, y: 0 },
      { x: 30, y: -20 },
      { x: 0, y: -20 },
    ]);
    expect(result.cloudArcLength).toBe(10);
    expect(result.sourceType).toBe('REVCLOUD');
    for (const bulge of result.bulges ?? [])
      expect(bulge).toBeCloseTo(-Math.tan((110 * Math.PI) / 720), 12);
    const reversed = outlineOnly(drawRevcloud, [origin, { x: 30, y: -20 }, 'Y'], context);
    expect(reversed.bulges).toEqual(result.bulges?.map((b) => -b));
  });
  it('supports Polygonal, local Undo and remembered Calligraphy style', () => {
    const context = outlineContext({ ...variables });
    const result = outlineOnly(
      drawRevcloud,
      ['S', 'C', 'P', origin, { x: 30, y: 0 }, { x: 40, y: -40 }, 'U', { x: 0, y: -30 }, 'C', ''],
      context,
    );
    expect(result.cloudVertices).toEqual([origin, { x: 30, y: 0 }, { x: 0, y: -30 }]);
    expect(result.cloudStyle).toBe('Calligraphy');
    expect(result.endWidths?.every((w) => w === 1)).toBe(true);
    expect(context.get('REVCLOUDCREATEMODE')).toBe(2);
    const again = outlineOnly(drawRevcloud, ['R', origin, { x: 30, y: -20 }, ''], context);
    expect(again.cloudStyle).toBe('Calligraphy');
  });
  it('remembers approximate Arc length and applies DIMSCALE only when enabled', () => {
    const context = outlineContext({ ...variables, REVCLOUDSCALEMODE: 1, DIMSCALE: 2 });
    const result = outlineOnly(drawRevcloud, ['A', '2', origin, { x: 20, y: -20 }, ''], context);
    expect(context.get('REVCLOUDAPPROXARCLEN')).toBe(2);
    expect(result.cloudArcLength).toBe(4);
    expect(result.points).toHaveLength(20);
  });
  it('initializes chord size from the current view diagonal once', () => {
    const context = outlineContext();
    context.viewDiagonal = 500;
    const result = outlineOnly(drawRevcloud, [origin, { x: 30, y: -20 }, ''], context);
    expect(result.cloudArcLength).toBe(10);
    expect(context.get('REVCLOUDAPPROXARCLEN')).toBe(10);
  });
  it('converts a closed Object while retaining exact source-circle boundary vertices', () => {
    const context = outlineContext({ ...variables });
    const circle: CadEntity = {
      id: 'circle',
      type: 'circle',
      center: origin,
      radius: 10,
      layer: '0',
      color: '#fff',
      lineWidth: 1,
    };
    const result = outlineRun(
      drawRevcloud,
      ['O', { entity: circle, point: { x: 10, y: 0 } }, ''],
      context,
    );
    expect(result.eraseIds).toEqual(['circle']);
    const cloud = result.entities[0];
    expect(cloud?.cloudVertices).toHaveLength(6);
    for (const point of cloud?.cloudVertices ?? [])
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(10, 12);
  });
  it('streams Freehand samples, closes near the first point and retains accepted work', () => {
    const context = outlineContext({ ...variables });
    const cloud = outlineOnly(
      drawRevcloud,
      [
        'F',
        origin,
        { sample: { x: 10, y: 0 } },
        { sample: { x: 10, y: -10 } },
        { sample: origin },
        '',
      ],
      context,
    );
    expect(cloud.closed).toBe(true);
    expect(cloud.cloudVertices).toHaveLength(3);
    const program = drawRevcloud(context);
    program.next();
    program.next('F');
    program.next(origin);
    const state = program.next({ sample: { x: 10, y: 0 } });
    if (state.done) throw new Error('Expected freehand sampling request');
    expect(state.value.freehand).toBe(true);
    expect(state.value.partial).toHaveLength(1);
    expect(state.value.partial?.[0]).toMatchObject({ closed: false });
  });
  it('replaces the selected side between existing cloud vertices with a new polygonal path', () => {
    const context = outlineContext({ ...variables });
    const source = outlineOnly(drawRevcloud, [origin, { x: 30, y: -20 }, ''], context);
    const result = outlineRun(
      drawRevcloud,
      [
        'M',
        { entity: source, point: origin },
        { x: -10, y: 0 },
        { x: -10, y: -20 },
        { x: 0, y: -20 },
        { x: 30, y: -10 },
        '',
      ],
      context,
    );
    expect(result.eraseIds).toEqual([source.id]);
    expect(result.entities[0]?.cloudVertices).toEqual([
      origin,
      { x: -10, y: 0 },
      { x: -10, y: -20 },
      { x: 0, y: -20 },
    ]);
  });
  it('preserves the reversed scallop sense when Modify replaces a side', () => {
    const context = outlineContext({ ...variables });
    const source = outlineOnly(drawRevcloud, [origin, { x: 30, y: -20 }, 'Y'], context);
    const result = outlineRun(
      drawRevcloud,
      [
        'M',
        { entity: source, point: origin },
        { x: -10, y: 0 },
        { x: -10, y: -20 },
        { x: 0, y: -20 },
        { x: 30, y: -10 },
        '',
      ],
      context,
    );
    expect(cloudDirectionReversed(result.entities[0]!)).toBe(true);
    expect(result.eraseIds).toEqual([source.id]);
  });
});
