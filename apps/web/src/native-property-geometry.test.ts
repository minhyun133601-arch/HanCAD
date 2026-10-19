import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyDxfFieldPatch, decodeDxfFields, entityFields } from '@hancad/db';
import type { JsonObject } from '@hancad/db';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { draftLine } from '@hancad/draft';
import { fromObjectCoordinates, geometryFromFields } from '@hancad/geom';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { changeEntityProperty, entityProperties } from './entity-properties';
import { nativeGeometryFields } from './native-property-geometry';
import {
  commitNativePropertyState,
  nativePropertyIds,
  nativePropertyState,
} from './native-property-state';

const instances: SystemVariables[] = [];
beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => {
  for (const vars of instances.splice(0)) vars.dispose();
  vi.unstubAllGlobals();
});
function fixture() {
  const vars = new SystemVariables(),
    db = vars.database,
    state = createEmptyCadState();
  instances.push(vars);
  const add = (type: string, fields: JsonObject, owner?: string, rawOnly = false): string => {
    let handle = '';
    db.transaction('fixture', (tx) => {
      handle = tx.add({
        type,
        owner: owner ?? db.find('BLOCK_RECORD', '*Model_Space')!.handle,
        fields: entityFields(fields),
        groups: [{ code: 999, value: 'vendor-data' }],
        xdata: { APP: [{ code: 1000, value: 'keep' }] },
      }).handle;
      tx.modify(handle, (object) => {
        Object.assign(object, applyDxfFieldPatch(object, fields));
        if (rawOnly) object.fields = {};
        else Object.assign(object.fields, structuredClone(fields));
      });
    });
    return handle;
  };
  const ready = () => {
    db.transaction('fixture', (tx) => tx.setVariable('view', JSON.stringify(state)));
    db.clearHistory();
  };
  const id = (handle: string) => nativePropertyIds(db, state).get(handle)!;
  const edit = (handles: string[], changes: [string, string][], legacyIds: string[] = []) => {
    const source = JSON.parse(String(db.getVariable('view'))) as LegacyCadState;
    let next = nativePropertyState(db, source);
    for (const [key, value] of changes)
      next = changeEntityProperty(next, [...handles.map(id), ...legacyIds], key, value);
    const original = db.serialize(),
      count = db.undoCount;
    commitNativePropertyState(vars, 'PROPERTIES', source, next, (label, view) =>
      db.transaction(label, (tx) => tx.setVariable('view', JSON.stringify(view))),
    );
    const edited = db.serialize();
    expect(db.undoCount).toBe(count + 1);
    expect(db.undo()).toBe(1);
    expect(db.serialize()).toBe(original);
    expect(db.redo()).toBe(1);
    expect(db.serialize()).toBe(edited);
  };
  return { vars, db, state, add, ready, id, edit };
}

it('edits raw ARC WCS centers through OCS and radius/angles without losing raw data', () => {
  const f = fixture(),
    normal = [0, 0.6, 0.8],
    h = f.add(
      'ARC',
      {
        center: [2, 3, 4],
        extrusion: normal,
        radius: 5,
        startAngle: 15,
        endAngle: 100,
      },
      undefined,
      true,
    );
  f.ready();
  const old = nativePropertyState(f.db, f.state).entities[0]!.curve!;
  expect(old.type).toBe('ARC');
  f.edit(
    [h],
    [
      ['center.x', '10+2'],
      ['radius', 'sqrt(81)'],
      ['endAngle', '180/2'],
    ],
  );
  const object = f.db.get(h)!,
    fields = nativeGeometryFields(object, f.db.all());
  const parsed = geometryFromFields('ARC', fields);
  expect(parsed.status).toBe('ok');
  if (parsed.status !== 'ok' || parsed.geometry.type !== 'ARC') throw new Error('ARC missing');
  expect(parsed.geometry.center.x).toBeCloseTo(12);
  expect(parsed.geometry.radius).toBe(9);
  expect(fields.startAngle).toBe(15);
  expect(fields.endAngle).toBeCloseTo(90);
  expect(fields.extrusion).toEqual(normal);
  expect(object.groups).toContainEqual({ code: 999, value: 'vendor-data' });
  expect(object.xdata.APP).toEqual([{ code: 1000, value: 'keep' }]);
});

it('edits POINT and ELLIPSE geometry and rejects invalid size atomically', () => {
  const f = fixture(),
    point = f.add('POINT', { position: [2, 3, 4] }),
    ellipse = f.add('ELLIPSE', {
      center: [10, 20, 30],
      majorAxis: [10, 0, 0],
      ratio: 0.5,
      startParameter: 0,
      endParameter: Math.PI * 2,
    });
  f.ready();
  f.edit([point], [['curve.position.z', '2*(3+4)']]);
  f.edit(
    [ellipse],
    [
      ['curve.majorRadius', '20'],
      ['curve.ratio', '3/4'],
      ['curve.center.y', '40'],
    ],
  );
  expect(f.db.get(point)?.fields.position).toEqual([2, 3, 14]);
  expect(f.db.get(ellipse)?.fields).toMatchObject({
    majorAxis: [20, 0, 0],
    ratio: 0.75,
    center: [10, 40, 30],
  });
  const source = nativePropertyState(f.db, f.state),
    before = f.db.serialize();
  for (const input of ['0', '-1', '2'])
    expect(() => changeEntityProperty(source, [f.id(ellipse)], 'curve.ratio', input)).toThrow();
  expect(f.db.serialize()).toBe(before);
});

it('edits LWPOLYLINE OCS vertices, elevation, bulge and widths while retaining vertex IDs', () => {
  const f = fixture(),
    h = f.add('LWPOLYLINE', {
      flags: 128,
      elevation: 5,
      extrusion: [0, 0.6, 0.8],
      constantWidth: 2,
      vertices: [
        { position: [1, 2], id: 41, vendor: 'first' },
        { position: [5, 6], id: 42 },
      ],
    });
  f.ready();
  f.edit(
    [h],
    [
      ['curve.vertices.1.ocs.x', '3*4'],
      ['curve.elevation', '9'],
      ['curve.vertices.1.bulge', '1/2'],
      ['curve.vertices.1.startWidth', '3'],
      ['curve.closed', 'true'],
    ],
  );
  const fields = f.db.get(h)!.fields,
    vertices = fields.vertices as JsonObject[];
  expect(fields).toMatchObject({
    flags: 129,
    elevation: 9,
    extrusion: [0, 0.6, 0.8],
    constantWidth: 0,
  });
  expect(vertices[0]).toMatchObject({ id: 41, vendor: 'first', startWidth: 2, endWidth: 2 });
  expect(vertices[1]).toMatchObject({ id: 42, bulge: 0.5, startWidth: 3, endWidth: 2 });
  expect(Number((vertices[1]!.position as number[])[0])).toBeCloseTo(12);
  expect(Number((vertices[1]!.position as number[])[1])).toBeCloseTo(6);
  const parsed = geometryFromFields('LWPOLYLINE', fields);
  if (parsed.status !== 'ok' || parsed.geometry.type !== 'LWPOLYLINE')
    throw new Error('Polyline missing');
  const expected = fromObjectCoordinates({ x: 12, y: 6, z: 9 }, { x: 0, y: 0.6, z: 0.8 });
  expect(parsed.geometry.vertices[1]!.position).toEqual(expected);
});

it('patches owned raw POLYLINE VERTEX records and preserves the owner graph and inherited widths', () => {
  const f = fixture(),
    h = f.add('POLYLINE', { position: [0, 0, 7], flags: 128, startWidth: 2, endWidth: 4 }),
    first = f.add('VERTEX', { position: [1, 2, 99], flags: 0 }, h, true),
    second = f.add('VERTEX', { position: [10, 20, 88], bulge: 0.2 }, h, true),
    seq = f.add('SEQEND', {}, h);
  f.ready();
  const untouched = f.db.get(second);
  f.edit(
    [h],
    [
      ['curve.vertices.0.ocs.y', '6*2'],
      ['curve.vertices.0.startWidth', '8'],
      ['curve.closed', 'true'],
    ],
  );
  const fields = decodeDxfFields('VERTEX', f.db.get(first)!.groups);
  expect(fields).toMatchObject({ position: [1, 12, 99], startWidth: 8 });
  expect(f.db.get(second)).toEqual(untouched);
  expect(f.db.get(first)?.owner).toBe(h);
  expect(f.db.get(seq)?.owner).toBe(h);
  expect(f.db.get(h)?.fields).toMatchObject({
    flags: 129,
    position: [0, 0, 7],
    startWidth: 2,
    endWidth: 4,
  });
  expect(f.db.get(first)?.groups).toContainEqual({ code: 999, value: 'vendor-data' });
  const inquiry = nativePropertyState(f.db, f.state).entities.find((e) => e.id === f.id(h))!.curve;
  if (inquiry?.type !== 'POLYLINE') throw new Error('Polyline missing');
  expect(inquiry.vertices[0]).toMatchObject({
    position: { x: 1, y: 12, z: 7 },
    startWidth: 8,
    endWidth: 4,
  });
});

it('edits old-style 3D polyline vertices in WCS without applying the extrusion plane', () => {
  const f = fixture(),
    h = f.add('POLYLINE', { flags: 8, extrusion: [0, 1, 0] }),
    vertex = f.add('VERTEX', { position: [1, 2, 3], flags: 32 }, h);
  f.add('VERTEX', { position: [4, 5, 6], flags: 32 }, h);
  f.ready();
  f.edit([h], [['curve.vertices.0.position.z', '20+5']]);
  expect(f.db.get(vertex)?.fields.position).toEqual([1, 2, 25]);
  expect(
    entityProperties(nativePropertyState(f.db, f.state).entities).some(
      (p) => p.key === 'curve.elevation',
    ),
  ).toBe(false);
});

it('edits SPLINE fit data by refitting and control data by purging fits, with exact DXF array counts', () => {
  const f = fixture(),
    h = f.add('SPLINE', {
      flags: 8,
      degree: 3,
      fitTolerance: 1e-10,
      fitPoints: [
        [0, 0, 0],
        [10, 5, 0],
        [20, 0, 0],
        [30, 10, 0],
      ],
      startTangent: [1, 0, 0],
      endTangent: [1, 0, 0],
    });
  f.ready();
  f.edit([h], [['curve.fitPoints.1.y', '3*4']]);
  let object = f.db.get(h)!;
  expect((object.fields.fitPoints as number[][])[1]).toEqual([10, 12, 0]);
  expect((object.fields.controlPoints as number[][]).length).toBeGreaterThan(3);
  expect(decodeDxfFields('SPLINE', object.groups)).toMatchObject({
    fitPointCount: 4,
    controlPointCount: (object.fields.controlPoints as number[][]).length,
    knotCount: (object.fields.knots as number[]).length,
  });
  f.edit(
    [h],
    [
      ['curve.controlPoints.1.z', '8'],
      ['curve.weights.1', '2'],
    ],
  );
  object = f.db.get(h)!;
  expect((object.fields.controlPoints as number[][])[1]![2]).toBe(8);
  expect(object.fields.fitPoints).toEqual([]);
  expect(object.fields.startTangent).toBeUndefined();
  expect(object.fields.endTangent).toBeUndefined();
  expect((object.fields.weights as number[])[1]).toBe(2);
  expect(Number(object.fields.flags) & 4).toBe(4);
  expect(decodeDxfFields('SPLINE', object.groups).fitPointCount).toBe(0);
  expect(object.xdata.APP).toEqual([{ code: 1000, value: 'keep' }]);
});

it('keeps native adapters ephemeral in mixed native/legacy changes and invalid geometry out of the journal', () => {
  const f = fixture(),
    h = f.add('POINT', { position: [0, 0, 0] });
  f.state.entities.push(draftLine(f.state.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'legacy'));
  f.ready();
  const first = nativePropertyState(f.db, f.state);
  expect(nativePropertyState(f.db, f.state)).toBe(first);
  f.edit([h], [['color', '5']], ['legacy']);
  const persisted = JSON.parse(String(f.db.getVariable('view'))) as LegacyCadState;
  expect(persisted.entities).toHaveLength(1);
  expect(persisted.entities[0]?.aci).toBe(5);
  expect(f.db.get(h)?.fields.color).toBe(5);
  expect(nativePropertyState(f.db, f.state)).not.toBe(first);
  const malformed = structuredClone(nativePropertyState(f.db, f.state));
  malformed.entities.find((e) => e.id === f.id(h))!.curve = {
    type: 'POINT',
    position: { x: NaN, y: 0, z: 0 },
  };
  const before = f.db.serialize(),
    count = f.db.undoCount;
  expect(() =>
    commitNativePropertyState(f.vars, 'PROPERTIES', f.state, malformed, () => undefined),
  ).toThrow();
  expect(f.db.serialize()).toBe(before);
  expect(f.db.undoCount).toBe(count);
});

it('edits tilted circles and normalized infinite geometry, and closes fitted splines', () => {
  const f = fixture(),
    circle = f.add('CIRCLE', { center: [1, 2, 3], radius: 5, extrusion: [0, 1, 0] }),
    ray = f.add('RAY', { basePoint: [1, 2, 3], direction: [1, 0, 0] }),
    spline = f.add('SPLINE', {
      flags: 8,
      degree: 3,
      fitPoints: [
        [0, 0, 0],
        [10, 10, 0],
        [20, 0, 0],
        [30, 5, 0],
      ],
    });
  f.ready();
  f.edit(
    [circle],
    [
      ['center.y', '15'],
      ['diameter', '8*2'],
    ],
  );
  expect(f.db.get(circle)?.fields).toMatchObject({
    center: [1, 2, 15],
    radius: 8,
    extrusion: [0, 1, 0],
  });
  f.edit(
    [ray],
    [
      ['curve.direction.y', '1'],
      ['curve.basePoint.z', '7'],
    ],
  );
  expect(f.db.get(ray)?.fields).toMatchObject({ basePoint: [1, 2, 7] });
  expect((f.db.get(ray)!.fields.direction as number[])[0]).toBeCloseTo(Math.SQRT1_2);
  expect((f.db.get(ray)!.fields.direction as number[])[1]).toBeCloseTo(Math.SQRT1_2);
  f.edit([spline], [['curve.closed', 'true']]);
  expect(Number(f.db.get(spline)?.fields.flags) & 1).toBe(1);
  expect(geometryFromFields('SPLINE', f.db.get(spline)!.fields).status).toBe('ok');
});

it('edits the same ARC radius across legacy and native geometry in one undo group', () => {
  const f = fixture(),
    h = f.add('ARC', { center: [20, 30, 0], radius: 5, startAngle: 0, endAngle: 90 });
  f.state.entities.push({
    ...f.state.settings,
    id: 'legacy-arc',
    type: 'arc',
    center: { x: 0, y: 0 },
    radius: 10,
    startAngle: 0,
    endAngle: -Math.PI / 2,
    clockwise: false,
  });
  f.ready();
  f.edit([h], [['radius', '2*7']], ['legacy-arc']);
  expect(f.db.get(h)?.fields.radius).toBe(14);
  const saved = JSON.parse(String(f.db.getVariable('view'))) as LegacyCadState;
  expect(saved.entities).toHaveLength(1);
  expect(saved.entities[0]).toMatchObject({ type: 'arc', radius: 14 });
});
