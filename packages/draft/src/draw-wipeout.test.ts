import { describe, expect, it } from 'vitest';
import type { CadPolyline } from '@hancad/legacy-bridge';
import { outlineContext, outlineOnly, outlineRun } from './draw-outline-fixtures';
import { drawWipeout, validWipeoutBoundary } from './draw-wipeout';

const origin = { x: 0, y: 0 };
describe('WIPEOUT polygon and frame commands', () => {
  it('refuses deletion of an ineligible source and still permits a retained-source mask', () => {
    const source: CadPolyline = {
      id: 'locked',
      type: 'polyline',
      points: [origin, { x: 10, y: 0 }, { x: 10, y: -10 }],
      closed: true,
      layer: 'locked',
      color: '#fff',
      lineWidth: 1,
    };
    const context = outlineContext();
    context.editableIds = new Set();
    const result = outlineRun(
      drawWipeout,
      ['P', { entity: source, point: origin }, 'Y', 'N'],
      context,
    );
    expect(result.entities).toHaveLength(1);
    expect(result.eraseIds).toBeUndefined();
  });
  it('retains concave polygon masks, local Undo and display-only frame mode', () => {
    const context = outlineContext({ WIPEOUTFRAME: 2 });
    const result = outlineOnly(
      drawWipeout,
      [
        origin,
        { x: 20, y: 0 },
        { x: 20, y: -20 },
        { x: 30, y: -30 },
        'U',
        { x: 10, y: -10 },
        { x: 0, y: -20 },
        'C',
      ],
      context,
    );
    expect(result.sourceType).toBe('WIPEOUT');
    expect(result.frameMode).toBe(2);
    expect(result.drawFill?.[0]).toEqual(result.points);
    expect(result.points).toHaveLength(5);
  });
  it('converts a closed zero-width Polyline and optionally erases its source', () => {
    const source: CadPolyline = {
      id: 'boundary',
      type: 'polyline',
      points: [origin, { x: 10, y: 0 }, { x: 10, y: -10 }],
      closed: true,
      layer: '0',
      color: '#fff',
      lineWidth: 1,
    };
    const result = outlineRun(drawWipeout, ['', { entity: source, point: origin }, 'Y']);
    expect(result.eraseIds).toEqual(['boundary']);
    expect(result.entities[0]?.drawFill?.[0]).toEqual(source.points);
    const retained = outlineRun(drawWipeout, ['P', { entity: source, point: origin }, '']);
    expect(retained.eraseIds).toBeUndefined();
  });
  it('supports all three frame modes without adding drawing geometry', () => {
    for (const [token, value] of [
      ['ON', 1],
      ['OFF', 0],
      ['D', 2],
    ] as const) {
      const context = outlineContext();
      const result = outlineRun(drawWipeout, ['F', token], context);
      expect(context.get('WIPEOUTFRAME')).toBe(value);
      expect(result.entities).toEqual([]);
    }
  });
  it('rejects self-intersections, collinear loops and nonplanar masks', () => {
    expect(
      validWipeoutBoundary([origin, { x: 10, y: -10 }, { x: 0, y: -10 }, { x: 10, y: 0 }]),
    ).toBe(false);
    expect(validWipeoutBoundary([origin, { x: 10, y: 0 }, { x: 20, y: 0 }])).toBe(false);
    expect(validWipeoutBoundary([origin, { x: 10, y: 0 }, { x: 10, y: -10, z: 1 }])).toBe(false);
  });
});
