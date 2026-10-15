import { describe, expect, it } from 'vitest';
import { DrawingDatabase } from './database';
import { serializeHcd, deserializeHcd } from './hcd';
import { applyDxfFieldPatch, decodeDxfFields, editDxfFields } from './dxf-codec';
import { dxfObjectSchemas, getDxfObjectSchema } from './dxf-schema';
import type { DxfGroup } from './types';
import { entityFields } from './types';

const group = (code: number, value: DxfGroup['value']): DxfGroup => ({ code, value });
const subclass = (name: string): DxfGroup => group(100, name);

describe('DXF field schema and ordered opaque preservation', () => {
  it('indexes standard entity/object/table families and explicitly reports pending typed fields', () => {
    for (const name of [
      'LINE',
      'POINT',
      'CIRCLE',
      'ARC',
      'ELLIPSE',
      'LWPOLYLINE',
      'POLYLINE',
      'VERTEX',
      'SPLINE',
      'XLINE',
      'RAY',
      'DICTIONARY',
      'LAYOUT',
      'BLOCK_RECORD',
    ])
      expect(getDxfObjectSchema(name)?.status).toBe('mapped');
    for (const name of [
      '3DSOLID',
      'ACAD_PROXY_ENTITY',
      'ACAD_PROXY_OBJECT',
      'MTEXT',
      'HATCH',
      'MLEADER',
      'DIMASSOC',
      'VISUALSTYLE',
      'MATERIAL',
      'XRECORD',
      'APPID',
    ])
      expect(getDxfObjectSchema(name)?.status).toBe('opaque');
    expect(new Set(dxfObjectSchemas.map((schema) => schema.type)).size).toBe(
      dxfObjectSchemas.length,
    );
    expect(getDxfObjectSchema('vendor_unknown')).toBeUndefined();
  });

  it('patches common and geometry values by subclass without disturbing unknown, duplicate, application or XDATA groups', () => {
    const groups = [
      group(0, 'LINE'),
      group(5, 'ABC'),
      group(330, '21'),
      subclass('AcDbEntity'),
      group(8, 'old'),
      group(62, 2),
      group(62, 7),
      group(999, 'unchanged'),
      group(102, '{VENDOR'),
      group(10, 999),
      group(8, 'vendor'),
      group(102, '}'),
      subclass('AcDbLine'),
      group(10, 1),
      group(20, 2),
      group(30, 3),
      group(11, 4),
      group(21, 5),
      group(31, 6),
      subclass('VendorSubclass'),
      group(10, 777),
      group(1001, 'HANAPP'),
      group(1010, 12),
      group(8, 'xdata'),
    ];
    const before = structuredClone(groups);
    const decoded = decodeDxfFields('LINE', groups);
    expect(decoded).toMatchObject({ layer: 'old', color: 7, start: [1, 2, 3], end: [4, 5, 6] });
    expect(editDxfFields('LINE', groups, decoded)).toEqual(groups);
    const patched = editDxfFields('LINE', groups, {
      layer: 'new',
      color: 1,
      start: [100000000, 2, 3],
    });
    expect(decodeDxfFields('LINE', patched)).toMatchObject({
      layer: 'new',
      color: 1,
      start: [100000000, 2, 3],
    });
    expect(patched).toEqual(
      groups.map((item, index) =>
        index === 4
          ? group(8, 'new')
          : index === 6
            ? group(62, 1)
            : index === 13
              ? group(10, 100000000)
              : item,
      ),
    );
    expect(groups).toEqual(before);
    expect(
      editDxfFields('LINE', patched, { color: null }).filter((item) => item.code === 62),
    ).toEqual([]);
  });

  it('keeps optional bulges and unequal widths attached to their own repeated polyline vertex during edits and resizes', () => {
    const groups = [
      subclass('AcDbEntity'),
      group(8, '0'),
      subclass('AcDbPolyline'),
      group(90, 2),
      group(70, 1),
      group(10, 0),
      group(20, 0),
      group(999, 'vertex zero metadata'),
      group(10, 10),
      group(20, 0),
      group(40, 2),
      group(41, 3),
      group(42, 1),
      group(91, 9),
      group(999, 'retained trailing data'),
      group(210, 0),
      group(220, 0),
      group(230, 1),
    ];
    const vertices = [
      { position: [0, 0], startWidth: 1, endWidth: 2, bulge: 0.5 },
      { position: [20, 5], startWidth: 2, endWidth: 3, bulge: 1, id: 9 },
      { position: [30, 10], bulge: -1 },
    ];
    const patched = editDxfFields('LWPOLYLINE', groups, { vertices });
    expect(decodeDxfFields('LWPOLYLINE', patched)).toMatchObject({
      vertexCount: 3,
      flags: 1,
      vertices,
    });
    expect(patched.filter((item) => item.code === 999)).toEqual(
      groups.filter((item) => item.code === 999),
    );
    const shortened = editDxfFields('LWPOLYLINE', patched, { vertices: [vertices[0]!] });
    expect(decodeDxfFields('LWPOLYLINE', shortened)).toMatchObject({
      vertexCount: 1,
      vertices: [vertices[0]],
    });
    expect(shortened.filter((item) => item.code === 999)).toHaveLength(2);
  });

  it('retains omitted VERTEX widths for POLYLINE inheritance and distinguishes explicit zero without rewriting unknown groups', () => {
    const header = [subclass('AcDb2dPolyline'), group(40, 4), group(41, 8)];
    expect(decodeDxfFields('POLYLINE', header)).toMatchObject({ startWidth: 4, endWidth: 8 });
    const groups = [
      subclass('AcDbEntity'),
      group(8, '0'),
      subclass('AcDbVertex'),
      subclass('AcDb2dVertex'),
      group(10, 0),
      group(20, 0),
      group(30, 0),
      group(999, 'inherited vertex widths'),
      group(102, '{VENDOR'),
      group(40, 100),
      group(41, 200),
      group(102, '}'),
      subclass('VendorVertex'),
      group(40, 300),
      group(41, 400),
    ];
    const before = structuredClone(groups),
      inherited = decodeDxfFields('VERTEX', groups);
    expect(inherited).not.toHaveProperty('startWidth');
    expect(inherited).not.toHaveProperty('endWidth');
    expect(editDxfFields('VERTEX', groups, inherited)).toEqual(before);
    const overridden = editDxfFields('VERTEX', groups, { startWidth: 0 });
    expect(decodeDxfFields('VERTEX', overridden).startWidth).toBe(0);
    expect(decodeDxfFields('VERTEX', overridden)).not.toHaveProperty('endWidth');
    expect(overridden.filter((item) => item.code === 40)).toEqual([
      group(40, 0),
      group(40, 100),
      group(40, 300),
    ]);
    expect(overridden.filter((item) => item.code === 41)).toEqual([group(41, 200), group(41, 400)]);
    expect(editDxfFields('VERTEX', overridden, { startWidth: null })).toEqual(before);
    expect(groups).toEqual(before);
  });

  it('maps NURBS knots, weights, repeated control/fit points and tolerances without imposing geometry behavior', () => {
    const groups = [
      subclass('AcDbEntity'),
      group(8, '0'),
      subclass('AcDbSpline'),
      group(70, 4),
      group(71, 2),
      group(72, 6),
      group(73, 3),
      ...[0, 0, 0, 1, 1, 1].map((value) => group(40, value)),
      ...[1, 0.7071067811865476, 1].map((value) => group(41, value)),
      group(10, 1),
      group(20, 0),
      group(30, 0),
      group(10, 1),
      group(20, 1),
      group(30, 0),
      group(10, 0),
      group(20, 1),
      group(30, 0),
      group(999, 'knot/control-point tail'),
    ];
    const fields = decodeDxfFields('SPLINE', groups);
    expect(fields).toMatchObject({
      degree: 2,
      weights: [1, 0.7071067811865476, 1],
      controlPoints: [
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
      fitTolerance: 1e-10,
    });
    expect(editDxfFields('SPLINE', groups, fields)).toEqual(groups);
    const patched = editDxfFields('SPLINE', groups, {
      controlPoints: [
        [2, 0, 0],
        [2, 2, 0],
        [0, 2, 0],
      ],
      fitPoints: [
        [1, 1, 0],
        [2, 2, 0],
      ],
    });
    expect(decodeDxfFields('SPLINE', patched)).toMatchObject({
      controlPointCount: 3,
      fitPointCount: 2,
      fitPoints: [
        [1, 1, 0],
        [2, 2, 0],
      ],
    });
    expect(patched).toContainEqual(group(999, 'knot/control-point tail'));
  });

  it('distinguishes layout ownership from subclass block pointers and dictionary entry handles from reactors', () => {
    const layout = [
      group(330, 'AA'),
      group(102, '{ACAD_REACTORS'),
      group(330, 'BB'),
      group(102, '}'),
      subclass('AcDbPlotSettings'),
      group(330, 'CC'),
      subclass('AcDbLayout'),
      group(1, 'Layout1'),
      group(330, 'DD'),
      group(71, 1),
    ];
    expect(decodeDxfFields('LAYOUT', layout)).toMatchObject({ blockRecord: 'DD', name: 'Layout1' });
    expect(editDxfFields('LAYOUT', layout, { blockRecord: 'EE' })).toEqual(
      layout.map((item, index) => (index === 8 ? group(330, 'EE') : item)),
    );
    const dictionary = [
      group(330, 'AA'),
      group(102, '{ACAD_XDICTIONARY'),
      group(360, 'FF'),
      group(102, '}'),
      subclass('AcDbDictionary'),
      group(3, 'old'),
      group(350, '10'),
      group(999, 'unmapped dictionary data'),
      group(3, 'hard'),
      group(360, '20'),
    ];
    const entries = [
      { name: 'changed', handle: '11', hardOwner: true },
      { name: 'hard', handle: '20', hardOwner: true },
    ];
    const changed = editDxfFields('DICTIONARY', dictionary, { entries });
    expect(decodeDxfFields('DICTIONARY', changed).entries).toEqual(entries);
    expect(changed).toContainEqual(group(360, 'FF'));
    expect(changed).toContainEqual(group(999, 'unmapped dictionary data'));
  });

  it('keeps proxy records fully opaque and makes mapped edits undoable and HCD-lossless', () => {
    const raw = [group(0, 'VENDOR_UNKNOWN'), group(9999, { data: [1, '한글', false] })];
    expect(editDxfFields('VENDOR_UNKNOWN', raw, {})).toEqual(raw);
    expect(() => editDxfFields('VENDOR_UNKNOWN', raw, { radius: 4 })).toThrow('unavailable');
    const database = new DrawingDatabase();
    let handle = '';
    database.transaction('LINE', (transaction) => {
      handle = transaction.add({
        type: 'LINE',
        groups: [
          subclass('AcDbEntity'),
          group(8, '0'),
          subclass('AcDbLine'),
          group(10, 1),
          group(20, 2),
          group(30, 3),
          group(11, 4),
          group(21, 5),
          group(31, 6),
          group(9999, { vendor: 'unchanged' }),
        ],
      }).handle;
    });
    const before = database.serialize();
    database.transaction('EDIT', (transaction) =>
      transaction.modify(handle, (object) =>
        Object.assign(object, applyDxfFieldPatch(object, { start: [10, 20, 30] })),
      ),
    );
    const after = database.serialize();
    database.undo();
    expect(database.serialize()).toBe(before);
    database.redo();
    expect(database.serialize()).toBe(after);
    expect(deserializeHcd(serializeHcd(database)).database.serialize()).toBe(after);
    expect(() => editDxfFields('LINE', [], { start: [1, 2, Number.NaN] })).toThrow();
    expect(() => editDxfFields('CIRCLE', [], { radius: 'wrong' })).toThrow('DXF group 40');
    expect(() => editDxfFields('SPLINE', [], { degree: 1.5 })).toThrow('DXF group 71');
    expect(() => editDxfFields('SPLINE', [], { knots: ['wrong'] })).toThrow('DXF group 40');
  });

  it('keeps canonical entity attributes when an entity has not acquired a raw DXF group stream yet', () => {
    const database = new DrawingDatabase();
    let handle = '';
    database.transaction('NEW LINE', (transaction) => {
      handle = transaction.add({
        type: 'LINE',
        fields: entityFields({ layer: 'custom', color: 3, start: [0, 0, 0], end: [10, 0, 0] }),
      }).handle;
    });
    const changed = applyDxfFieldPatch(database.get(handle)!, { end: [20, 0, 0] });
    expect(changed.fields).toMatchObject({
      layer: 'custom',
      color: 3,
      start: [0, 0, 0],
      end: [20, 0, 0],
    });
    expect(decodeDxfFields('LINE', changed.groups).end).toEqual([20, 0, 0]);
  });
});
