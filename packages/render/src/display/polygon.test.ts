import { describe, expect, it } from 'vitest';
import { triangulatePolygon } from './polygon';
import { legacyDisplayEntity, LegacyDisplaySource } from '../sources/legacy-source';
import { entityStyle } from '../webgl/styles';
import type { RenderEnvironment } from '../webgl/styles';
import { collectGeometry } from './tessellate';
import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';

describe('filled drawing objects and wipeout masks', () => {
  it('triangulates a concave survey-coordinate boundary without filling its notch', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 3 },
      { x: 0, y: 3 },
    ].map((p) => ({ x: p.x + 200000000, y: p.y + 500000000 }));
    const triangles = triangulatePolygon(points);
    const area = triangles.reduce(
      (sum, [a, b, c]) => sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2,
      0,
    );
    expect(area).toBeCloseTo(5, 9);
    expect(triangles).toHaveLength(4);
  });
  it('FILLMODE suppresses solid fill and preserves its boundary', () => {
    const entity: CadEntity = {
      id: 'solid',
      type: 'polyline',
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ],
      drawFill: [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
      ],
      sourceType: 'SOLID',
      layer: '0',
      color: '#fff',
      lineWidth: 1,
    };
    const geometry = legacyDisplayEntity(entity).geometry;
    expect(collectGeometry(geometry, { tolerance: 0.1, fillmode: true }).triangles).toHaveLength(1);
    const wire = collectGeometry(geometry, { tolerance: 0.1, fillmode: false });
    expect(wire.triangles).toHaveLength(0);
    expect(wire.runs.length).toBeGreaterThan(0);
  });
  it('masks use the live background and frames retain original object selection identity', () => {
    const entity: CadEntity = {
      id: 'mask',
      type: 'polyline',
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ],
      drawFill: [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
      ],
      sourceType: 'WIPEOUT',
      layer: '0',
      color: '#fff',
      lineWidth: 1,
    };
    const source = new LegacyDisplaySource(),
      state = { entities: [entity], settings: { unit: 'mm' } } as LegacyCadState;
    const displays = source.sync(state).entities;
    expect(displays).toHaveLength(2);
    expect(displays[1]).toMatchObject({ sourceId: 'mask', wipeoutFrame: true });
    const environment: RenderEnvironment = {
      background: 0x123456,
      variable: (name) => (name === 'WIPEOUTFRAME' ? 0 : undefined),
      layers: new Map(),
      linetypes: new Map(),
      selected: new Set(),
      hidden: new Set(),
    };
    expect(entityStyle(displays[0]!, environment, new Map()).slice(0, 3)).toEqual([
      0x12 / 255,
      0x34 / 255,
      0x56 / 255,
    ]);
    expect(entityStyle(displays[1]!, environment, new Map())[3]).toBe(0);
    environment.variable = () => 2;
    expect(entityStyle(displays[1]!, environment, new Map())[3]).toBe(1);
    expect(source.sync({ ...state, entities: [] }).removed).toEqual(['mask', 'mask::frame']);
  });
});
