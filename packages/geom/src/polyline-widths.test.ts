import { describe, expect, it } from 'vitest';
import { geometryBounds, geometryFromFields, geometryLength, transformGeometry } from './index';
import type { Affine3, PolylineGeometry } from './index';

function parse(type: 'POLYLINE' | 'LWPOLYLINE', fields: Readonly<Record<string, unknown>>) {
  const result = geometryFromFields(type, fields);
  if (
    result.status !== 'ok' ||
    (result.geometry.type !== 'POLYLINE' && result.geometry.type !== 'LWPOLYLINE')
  )
    throw new Error(JSON.stringify(result));
  return result.geometry;
}
function widths(curve: PolylineGeometry) {
  return curve.vertices.map(({ startWidth, endWidth }) => [startWidth, endWidth]);
}

describe('DXF POLYLINE header widths through geometry inquiry and transforms', () => {
  it('inherits each missing VERTEX width independently and retains explicit zero overrides', () => {
    const fields = {
      startWidth: 4,
      endWidth: 8,
      constantWidth: 100,
      vertices: [
        { position: [0, 0], startWidth: 0 },
        { position: [10, 0], startWidth: 2, endWidth: 0 },
        { position: [20, 0] },
      ],
    };
    const original = structuredClone(fields),
      curve = parse('POLYLINE', fields);
    expect(widths(curve)).toEqual([
      [0, 8],
      [2, 0],
      [4, 8],
    ]);
    expect(curve.constantWidth).toBe(0);
    expect(geometryLength(curve)).toBe(20);
    expect(geometryBounds(curve)).toEqual({
      min: { x: 0, y: -4, z: 0 },
      max: { x: 20, y: 4, z: 0 },
      kind: 'finite',
      quality: 'exact',
    });
    expect(fields).toEqual(original);
  });

  it('carries inherited tapered widths through similarity and nonuniform transforms', () => {
    const curve = parse('POLYLINE', {
      startWidth: 4,
      endWidth: 8,
      vertices: [{ position: [0, 0] }, { position: [10, 0] }],
    });
    expect(widths(curve)).toEqual([
      [4, 8],
      [4, 8],
    ]);
    const matrix: Affine3 = [2, 0, 0, 5, 0, 2, 0, 7, 0, 0, 2, 11],
      scaled = transformGeometry(curve, matrix);
    if (scaled.type !== 'POLYLINE') throw new Error(scaled.type);
    expect(widths(scaled)).toEqual([
      [8, 16],
      [8, 16],
    ]);
    expect(geometryBounds(scaled)).toMatchObject({
      min: { x: 5, y: -1, z: 11 },
      max: { x: 25, y: 15, z: 11 },
    });
    const stretched = transformGeometry(curve, [3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0]);
    expect(stretched.type).toBe('TRANSFORMED');
    expect(geometryBounds(stretched)).toMatchObject({
      min: { x: 0, y: -8, z: 0 },
      max: { x: 30, y: 8, z: 0 },
      quality: 'conservative',
    });
    expect(widths(curve)).toEqual([
      [4, 8],
      [4, 8],
    ]);
  });

  it('keeps LWPOLYLINE code 43 separate from POLYLINE defaults and 3D extents', () => {
    const vertices = [{ position: [0, 0] }, { position: [10, 0] }];
    const light = parse('LWPOLYLINE', {
      startWidth: 40,
      endWidth: 80,
      constantWidth: 6,
      vertices,
    });
    expect(widths(light)).toEqual([
      [6, 6],
      [6, 6],
    ]);
    expect(geometryBounds(light).max.y).toBe(3);
    const variable = parse('LWPOLYLINE', {
      constantWidth: 6,
      vertices: [{ position: [0, 0], startWidth: 2 }, { position: [10, 0] }],
    });
    expect(widths(variable)).toEqual([
      [2, 0],
      [0, 0],
    ]);
    const three = parse('POLYLINE', { flags: 8, startWidth: 4, endWidth: 8, vertices });
    expect(geometryBounds(three)).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 0, z: 0 },
      kind: 'finite',
      quality: 'exact',
    });
  });
});
