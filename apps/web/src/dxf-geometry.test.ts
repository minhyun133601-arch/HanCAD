import { describe, expect, it } from 'vitest';
import { applyDxfFieldPatch, decodeDxfFields } from '@hancad/db';
import type { DatabaseObject, DxfGroup } from '@hancad/db';
import { geometryBounds, geometryFromFields } from '../../../packages/geom/src/index';

function object(type: string, groups: DxfGroup[]): DatabaseObject {
  return {
    type,
    handle: '100',
    owner: null,
    erased: false,
    reactors: [],
    extensionDictionary: null,
    xdata: {},
    groups,
    fields: { ...decodeDxfFields(type, groups), vendorField: { retained: true } },
  };
}

describe('native DXF edits consumed by pure geometry', () => {
  it('clears VERTEX width overrides into valid POLYLINE inheritance without changing vendor data', () => {
    const groups: DxfGroup[] = [
      { code: 100, value: 'AcDb2dVertex' },
      { code: 10, value: 0 },
      { code: 20, value: 0 },
      { code: 30, value: 0 },
      { code: 40, value: 0 },
      { code: 41, value: 2 },
      { code: 999, value: 'vertex data' },
      { code: 102, value: '{VENDOR' },
      { code: 40, value: 100 },
      { code: 41, value: 200 },
      { code: 102, value: '}' },
      { code: 100, value: 'VendorVertex' },
      { code: 40, value: 300 },
    ];
    const vertex = object('VERTEX', groups),
      original = structuredClone(vertex),
      changed = applyDxfFieldPatch(vertex, { startWidth: null, endWidth: null });
    expect(changed.fields).not.toHaveProperty('startWidth');
    expect(changed.fields).not.toHaveProperty('endWidth');
    expect(changed.fields.vendorField).toEqual({ retained: true });
    expect(changed.groups).toEqual(groups.filter((_item, index) => index !== 4 && index !== 5));
    expect(decodeDxfFields('VERTEX', changed.groups)).not.toHaveProperty('startWidth');
    const header = decodeDxfFields('POLYLINE', [
      { code: 100, value: 'AcDb2dPolyline' },
      { code: 40, value: 4 },
      { code: 41, value: 8 },
    ]);
    const parsed = geometryFromFields('POLYLINE', {
      ...header,
      vertices: [changed.fields, { position: [10, 0, 0] }],
    });
    if (parsed.status !== 'ok') throw new Error(JSON.stringify(parsed));
    expect(geometryBounds(parsed.geometry)).toMatchObject({
      min: { x: 0, y: -4, z: 0 },
      max: { x: 10, y: 4, z: 0 },
    });
    expect(vertex).toEqual(original);
  });

  it('resolves cleared common and geometry defaults while retaining unmapped canonical overlays', () => {
    const groups: DxfGroup[] = [
      { code: 100, value: 'AcDbEntity' },
      { code: 62, value: 3 },
      { code: 100, value: 'AcDbLine' },
      { code: 10, value: 0 },
      { code: 20, value: 0 },
      { code: 30, value: 0 },
      { code: 11, value: 10 },
      { code: 21, value: 0 },
      { code: 31, value: 0 },
      { code: 39, value: 5 },
      { code: 999, value: 'line data' },
    ];
    const line = object('LINE', groups),
      changed = applyDxfFieldPatch(line, { color: null, thickness: null });
    expect(changed.fields).toMatchObject({
      color: 256,
      thickness: 0,
      vendorField: { retained: true },
    });
    expect(changed.groups).toEqual(groups.filter((item) => item.code !== 62 && item.code !== 39));
    expect(geometryFromFields('LINE', changed.fields).status).toBe('ok');
    expect(line.groups).toEqual(groups);
  });
});
